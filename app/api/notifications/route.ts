import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";

interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  link?: string;
}

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const notifications: Notification[] = [];
    const now = new Date();

    // Get sync state
    const syncState = await prisma.syncState.findUnique({
      where: { userId: user.id },
    });

    if (syncState) {
      // Check last sync status
      if (syncState.lastSyncStatus === "failed") {
        notifications.push({
          id: "sync-failed",
          type: "error",
          title: "Sync Failed",
          message: syncState.lastError || "Unknown error during sync",
          timestamp: syncState.updatedAt.toISOString(),
          read: false,
          link: "/ops",
        });
      } else if (syncState.lastSyncStatus === "succeeded") {
        const lastSync = new Date(syncState.updatedAt);
        const minsAgo = Math.floor((now.getTime() - lastSync.getTime()) / 60000);
        
        if (minsAgo > 30) {
          notifications.push({
            id: "sync-stale",
            type: "warning",
            title: "Sync Stale",
            message: `Last sync was ${minsAgo} minutes ago`,
            timestamp: syncState.updatedAt.toISOString(),
            read: false,
            link: "/ops",
          });
        }
      }
    }

    // Check for recent activity in the last 24h
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentIssues = await prisma.issue.findMany({
      where: {
        userId: user.id,
        updatedOnRemote: { gte: since },
      },
      orderBy: [{ updatedOnRemote: "desc" }],
      take: 10,
      select: { 
        id: true,
        redmineIssueId: true,
        subject: true,
        statusName: true,
      },
    });

    if (recentIssues.length > 0) {
      // Build issue list string
      const issueList = recentIssues
        .map(i => i.redmineIssueId ? `#${i.redmineIssueId}` : i.id.substring(0, 8))
        .join(", ");
      
      notifications.push({
        id: "recent-updates",
        type: "info",
        title: "Recent Activity",
        message: `${recentIssues.length} issue(s) updated: ${issueList}`,
        timestamp: now.toISOString(),
        read: false,
        link: "/",
      });
    }

    // Sort by timestamp (newest first)
    notifications.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return NextResponse.json({ 
      notifications,
      unreadCount: notifications.filter(n => !n.read).length,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    // Return empty notifications if not authenticated
    return NextResponse.json({ 
      notifications: [],
      unreadCount: 0,
    });
  }
}
