import { requireRedmineClient } from "@/src/lib/auth";
import { jsonError, parseJson } from "@/src/lib/http";
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
  const match = message.match(/Redmine request failed \\((\\d{3})\\):/);
  if (!match) return null;
  return Number(match[1]);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const issueId = parseIssueId(id);
    const body = await parseJson(request, commentSchema);
    const { user, client } = await requireRedmineClient();
    const limiter = isRateLimited({
      key: `${user.id}:issue-comment`,
      max: 20,
      windowMs: 60_000,
    });
    if (limiter.limited) {
      return jsonError("Rate limit exceeded. Try again shortly.", 429);
    }

    await client.addComment(issueId, body.comment);
    const issue = await syncSingleIssue(user.id, client, issueId);

    return Response.json({ ok: true, issue });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to post comment";
    const status = message === "Unauthorized" ? 401 : (statusFromRedmineError(message) ?? 400);
    return jsonError(message, status);
  }
}
