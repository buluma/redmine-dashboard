import { requireMobileUser, requireRedmineClientForUser } from "@/src/lib/auth";
import { jsonError, parseJson } from "@/src/lib/http";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";
import { isRateLimited, rateLimitHeaders } from "@/src/lib/rate-limit";
import { redmineMessageFromError, redmineStatusFromError } from "@/src/lib/redmine";
import { commentSchema } from "@/src/lib/schemas";
import { syncSingleIssue } from "@/src/lib/sync";
import { trackFailure, trackInfo, trackSuccess } from "@/src/lib/telemetry";

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
    assertMobileApiEnabled();
    const { id } = await context.params;
    const issueId = parseIssueId(id);
    const body = await parseJson(request, commentSchema);
    const { user } = await requireMobileUser(request);
    const { client } = await requireRedmineClientForUser(user.id);
    trackInfo("mobile.issue.comment.requested", {
      userId: user.id,
      issueId,
    });

    const limiter = isRateLimited({
      key: `${user.id}:mobile-issue-comment`,
      max: 20,
      windowMs: 60_000,
    });
    if (limiter.limited) {
      trackFailure({
        event: "mobile.issue.comment.rate_limited",
        error: "mobile issue comment rate-limited",
        level: "warn",
        data: { userId: user.id, issueId },
        metricName: "mobile_issue_comment_rate_limited",
        metricTags: { reason: "rate_limited" },
        durationMetricName: "mobile_issue_comment_duration",
        durationMs: Date.now() - startedAt,
      });
      return jsonError("Rate limit exceeded. Try again shortly.", 429, rateLimitHeaders(limiter));
    }

    await client.addComment(issueId, body.comment);
    const issue = await syncSingleIssue(user.id, client, issueId);
    trackSuccess({
      event: "mobile.issue.comment.succeeded",
      data: {
        userId: user.id,
        issueId,
        commentLength: body.comment.length,
      },
      metricName: "mobile_issue_comment_succeeded",
      durationMetricName: "mobile_issue_comment_duration",
      durationMs: Date.now() - startedAt,
    });

    return Response.json({ ok: true, issue });
  } catch (error) {
    const message = redmineMessageFromError(error, "Unable to post comment");
    const status =
      message === "Mobile API is disabled"
        ? 404
        : message === "Unauthorized"
          ? 401
          : (redmineStatusFromError(error) ?? 400);
    trackFailure({
      event: "mobile.issue.comment.failed",
      error,
      data: { status },
      metricName: "mobile_issue_comment_failed",
      metricTags: { status_class: statusClass(status) },
      durationMetricName: "mobile_issue_comment_duration",
      durationMs: Date.now() - startedAt,
    });
    return jsonError(message, status);
  }
}
