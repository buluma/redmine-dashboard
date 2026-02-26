import { requireMobileUser, requireRedmineClientForUser } from "@/src/lib/auth";
import { jsonError, parseJson } from "@/src/lib/http";
import { logEvent } from "@/src/lib/log";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";
import { isRateLimited } from "@/src/lib/rate-limit";
import { commentSchema } from "@/src/lib/schemas";
import { syncSingleIssue } from "@/src/lib/sync";

function parseIssueId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid issue id");
  }
  return n;
}

function statusFromRedmineError(message: string): number | null {
  const match = message.match(/Redmine request failed \((\d{3})\):/);
  if (!match) return null;
  return Number(match[1]);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertMobileApiEnabled();
    const { id } = await context.params;
    const issueId = parseIssueId(id);
    const body = await parseJson(request, commentSchema);
    const { user } = await requireMobileUser(request);
    const { client } = await requireRedmineClientForUser(user.id);
    logEvent("mobile.issue.comment.requested", {
      userId: user.id,
      issueId,
    });

    const limiter = isRateLimited({
      key: `${user.id}:mobile-issue-comment`,
      max: 20,
      windowMs: 60_000,
    });
    if (limiter.limited) {
      return jsonError("Rate limit exceeded. Try again shortly.", 429);
    }

    await client.addComment(issueId, body.comment);
    const issue = await syncSingleIssue(user.id, client, issueId);
    logEvent("mobile.issue.comment.succeeded", {
      userId: user.id,
      issueId,
      commentLength: body.comment.length,
    });

    return Response.json({ ok: true, issue });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to post comment";
    const status =
      message === "Mobile API is disabled"
        ? 404
        : message === "Unauthorized"
          ? 401
          : (statusFromRedmineError(message) ?? 400);
    logEvent("mobile.issue.comment.failed", { status, error: message }, "error");
    return jsonError(message, status);
  }
}
