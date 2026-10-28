import { requireCurrentUser, requireRedmineClient } from "@/src/lib/auth";
import { jsonError, parseJson } from "@/src/lib/http";
import { isRateLimited, rateLimitHeaders } from "@/src/lib/rate-limit";
import { redmineMessageFromError, redmineStatusFromError } from "@/src/lib/redmine";
import { commentSchema } from "@/src/lib/schemas";
import { syncSingleIssue } from "@/src/lib/sync";
import { trackFailure, trackInfo, trackSuccess } from "@/src/lib/telemetry";
import { hasOfflineActionScopeHeaders, offlineActionScopeError, offlineActionScopeErrorForUser } from "@/src/lib/redmine-scope";

function parseIssueId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid issue id");
  }
  return n;
}

function statusClass(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  try {
    const { id } = await context.params;
    const issueId = parseIssueId(id);
    const body = await parseJson(request, commentSchema);
    if (hasOfflineActionScopeHeaders(request)) {
      const currentUser = await requireCurrentUser();
      const queuedScopeError = await offlineActionScopeErrorForUser(request, currentUser.id);
      if (queuedScopeError) return queuedScopeError;
    }
    const { user, cred, client } = await requireRedmineClient();
    const scopeError = offlineActionScopeError(request, user.id, cred.baseUrl);
    if (scopeError) return scopeError;
    trackInfo("issue.comment.post.requested", {
      userId: user.id,
      issueId,
    });
    const limiter = isRateLimited({
      key: `${user.id}:issue-comment`,
      max: 20,
      windowMs: 60_000,
    });
    if (limiter.limited) {
      trackFailure({
        event: "issue.comment.post.rate_limited",
        error: "issue comment rate-limited",
        level: "warn",
        data: { userId: user.id, issueId },
        metricName: "issue_comment_post_rate_limited",
        metricTags: { reason: "rate_limited" },
        durationMetricName: "issue_comment_post_duration",
        durationMs: Date.now() - startedAt,
      });
      return jsonError(
        "Rate limit exceeded. Try again shortly.",
        429,
        rateLimitHeaders(limiter),
      );
    }

    await client.addComment(issueId, body.comment);
    const issue = await syncSingleIssue(user.id, client, issueId);
    trackSuccess({
      event: "issue.comment.post.succeeded",
      data: {
        userId: user.id,
        issueId,
        commentLength: body.comment.length,
      },
      metricName: "issue_comment_post_succeeded",
      durationMetricName: "issue_comment_post_duration",
      durationMs: Date.now() - startedAt,
    });

    return Response.json({ ok: true, issue });
  } catch (error) {
    const message = redmineMessageFromError(error, "Unable to post comment");
    const status = message === "Unauthorized" ? 401 : (redmineStatusFromError(error) ?? 400);
    trackFailure({
      event: "issue.comment.post.failed",
      error,
      data: { status },
      metricName: "issue_comment_post_failed",
      metricTags: { status_class: statusClass(status) },
      durationMetricName: "issue_comment_post_duration",
      durationMs: Date.now() - startedAt,
    });
    return jsonError(message, status);
  }
}
