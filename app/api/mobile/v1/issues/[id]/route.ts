import { requireMobileUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";

function parseIssueId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid issue id");
  }
  return n;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertMobileApiEnabled();
    const { id } = await context.params;
    const redmineIssueId = parseIssueId(id);
    const { user } = await requireMobileUser(request);

    const issue = await prisma.issue.findFirst({
      where: {
        userId: user.id,
        redmineIssueId,
      },
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
      },
    });

    if (!issue) {
      return jsonError("Issue not found", 404);
    }

    return Response.json({ issue });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch issue detail";
    const status = message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
