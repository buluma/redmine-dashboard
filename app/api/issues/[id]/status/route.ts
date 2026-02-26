import { requireRedmineClient } from "@/src/lib/auth";
import { jsonError, parseJson } from "@/src/lib/http";
import { isRateLimited } from "@/src/lib/rate-limit";
import { statusUpdateSchema } from "@/src/lib/schemas";
import { syncSingleIssue } from "@/src/lib/sync";
import { trackFailure, trackInfo, trackSuccess } from "@/src/lib/telemetry";

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

function statusClass(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  try {
    const { id } = await context.params;
    const issueId = parseIssueId(id);
    const body = await parseJson(request, statusUpdateSchema);
    const { user, client } = await requireRedmineClient();
    trackInfo("issue.status.update.requested", {
      userId: user.id,
      issueId,
      statusId: body.statusId,
    });
    const limiter = isRateLimited({
      key: `${user.id}:issue-status`,
      max: 30,
      windowMs: 60_000,
    });
    if (limiter.limited) {
      trackFailure({
        event: "issue.status.update.rate_limited",
        error: "issue status update rate-limited",
        level: "warn",
        data: { userId: user.id, issueId },
        metricName: "issue_status_update_rate_limited",
        metricTags: { reason: "rate_limited" },
        durationMetricName: "issue_status_update_duration",
        durationMs: Date.now() - startedAt,
      });
      return jsonError("Rate limit exceeded. Try again shortly.", 429);
    }

    const detail = await client.getIssue(issueId, ["allowed_statuses"]);
    const issueMeta = detail.issue as { allowed_statuses?: Array<{ id: number }> };
    const allowed = (issueMeta.allowed_statuses ?? []).map((x) => x.id);

    if (allowed.length > 0 && !allowed.includes(body.statusId)) {
      return jsonError("Status transition is not allowed for this issue", 400);
    }

    await client.updateIssueStatus(issueId, body.statusId, body.note);
    const issue = await syncSingleIssue(user.id, client, issueId);
    trackSuccess({
      event: "issue.status.update.succeeded",
      data: {
        userId: user.id,
        issueId,
        statusId: body.statusId,
      },
      metricName: "issue_status_update_succeeded",
      durationMetricName: "issue_status_update_duration",
      durationMs: Date.now() - startedAt,
    });

    return Response.json({ ok: true, issue });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update status";
    const status = message === "Unauthorized" ? 401 : (statusFromRedmineError(message) ?? 400);
    trackFailure({
      event: "issue.status.update.failed",
      error,
      data: { status },
      metricName: "issue_status_update_failed",
      metricTags: { status_class: statusClass(status) },
      durationMetricName: "issue_status_update_duration",
      durationMs: Date.now() - startedAt,
    });
    return jsonError(message, status);
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const issueId = parseIssueId(id);
    const { client } = await requireRedmineClient();

    const detail = await client.getIssue(issueId, ["allowed_statuses"]);
    const issueMeta = detail.issue as { allowed_statuses?: Array<{ id: number; name: string }> };
    const allowedStatuses = issueMeta.allowed_statuses ?? [];

    return Response.json({
      issueId,
      allowedStatuses,
      allowedStatusIds: allowedStatuses.map((s) => s.id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch allowed statuses";
    const status = message === "Unauthorized" ? 401 : (statusFromRedmineError(message) ?? 400);
    return jsonError(message, status);
  }
}
