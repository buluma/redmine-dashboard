import { requireMobileUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { toIssueView } from "@/src/lib/issue-shape";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";

function parseIssueId(id: string): number | null {
  const n = Number(id);
  if (Number.isInteger(n) && n > 0) return n;
  return null; // string cuid for local issues
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertMobileApiEnabled();
    const { id } = await context.params;
    const redmineIssueId = parseIssueId(id);
    const { user } = await requireMobileUser(request);

    const issue = await prisma.issue.findFirst({
      where: redmineIssueId
        ? { userId: user.id, redmineIssueId }
        : { userId: user.id, id },
      include: {
        journals: {
          orderBy: { createdOnRemote: "desc" },
          take: 40,
        },
        timeEntries: {
          orderBy: { spentOn: "desc" },
          take: 40,
        },
        githubLinks: {
          orderBy: { createdAt: "desc" },
          take: 40,
        },
        attachments: {
          orderBy: { createdOnRemote: "desc" },
          take: 40,
        },
        relations: {
          orderBy: { createdAt: "desc" },
          take: 40,
        },
      },
    });

    if (!issue) {
      return jsonError("Issue not found", 404);
    }

    let isFavorited = false;
    if (issue.redmineIssueId) {
      const favorite = await prisma.favorite.findUnique({
        where: {
          userId_issueId: {
            userId: user.id,
            issueId: issue.redmineIssueId,
          },
        },
        select: { id: true },
      });
      isFavorited = Boolean(favorite);
    }

    return Response.json({
      issue: {
        ...toIssueView(issue),
        isFavorited,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch issue detail";
    const status = message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
