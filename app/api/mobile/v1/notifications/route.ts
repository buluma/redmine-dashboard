import { requireMobileUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";

type MobileNotification = {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  timestamp: string;
  issueId?: number | null;
};

export async function GET(request: Request) {
  try {
    assertMobileApiEnabled();
    const { user } = await requireMobileUser(request);
    const notifications: MobileNotification[] = [];
    const now = new Date();

    const syncState = await prisma.syncState.findUnique({
      where: { userId: user.id },
    });

    if (syncState?.lastSyncStatus === "failed") {
      notifications.push({
        id: "sync-failed",
        type: "error",
        title: "Sync Failed",
        message: syncState.lastError || "Unknown error during sync",
        timestamp: syncState.updatedAt.toISOString(),
      });
    } else if (syncState?.lastSyncStatus === "succeeded") {
      const minsAgo = Math.floor((now.getTime() - syncState.updatedAt.getTime()) / 60000);
      if (minsAgo > 30) {
        notifications.push({
          id: "sync-stale",
          type: "warning",
          title: "Sync Stale",
          message: `Last sync was ${minsAgo} minutes ago`,
          timestamp: syncState.updatedAt.toISOString(),
        });
      }
    }

    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentIssues = await prisma.issue.findMany({
      where: {
        userId: user.id,
        updatedOnRemote: { gte: since },
      },
      orderBy: [{ updatedOnRemote: "desc" }],
      take: 20,
      select: {
        id: true,
        redmineIssueId: true,
        subject: true,
        statusName: true,
        updatedOnRemote: true,
      },
    });

    for (const issue of recentIssues) {
      const issueLabel = issue.redmineIssueId ? `#${issue.redmineIssueId}` : issue.id.slice(0, 8);
      notifications.push({
        id: `issue-update-${issue.id}`,
        type: "info",
        title: "Issue Updated",
        message: `${issueLabel}: ${issue.subject.slice(0, 72)}${issue.subject.length > 72 ? "..." : ""}`,
        timestamp: issue.updatedOnRemote?.toISOString() || now.toISOString(),
        issueId: issue.redmineIssueId,
      });
    }

    notifications.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return Response.json({
      notifications,
      unreadCount: notifications.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch mobile notifications";
    const status = message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
