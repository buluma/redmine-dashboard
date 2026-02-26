import { requireMobileUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { logEvent } from "@/src/lib/log";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";
import { isRateLimited } from "@/src/lib/rate-limit";

function parseIssueId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid issue id");
  }
  return n;
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; linkId: string }> },
) {
  try {
    assertMobileApiEnabled();
    const { id, linkId } = await context.params;
    const redmineIssueId = parseIssueId(id);
    const { user } = await requireMobileUser(request);
    logEvent("mobile.issue.github_link.delete.requested", {
      userId: user.id,
      redmineIssueId,
      linkId,
    });

    const limiter = isRateLimited({
      key: `${user.id}:mobile-issue-github-link-delete`,
      max: 30,
      windowMs: 60_000,
    });
    if (limiter.limited) {
      return jsonError("Rate limit exceeded. Try again shortly.", 429);
    }

    const issue = await prisma.issue.findFirst({
      where: {
        redmineIssueId,
        userId: user.id,
      },
      select: { id: true },
    });
    if (!issue) {
      return jsonError("Issue not found", 404);
    }

    const deleted = await prisma.issueGithubLink.deleteMany({
      where: {
        id: linkId,
        issueId: issue.id,
        userId: user.id,
      },
    });
    if (deleted.count === 0) {
      return jsonError("Link not found", 404);
    }

    logEvent("mobile.issue.github_link.delete.succeeded", {
      userId: user.id,
      redmineIssueId,
      linkId,
    });
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete GitHub link";
    const status = message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : 400;
    logEvent("mobile.issue.github_link.delete.failed", { status, error: message }, "error");
    return jsonError(message, status);
  }
}
