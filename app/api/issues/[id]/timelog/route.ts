import { requireRedmineClient } from "@/src/lib/auth";
import { jsonError, parseJson } from "@/src/lib/http";
import { isRateLimited } from "@/src/lib/rate-limit";
import { timeLogSchema } from "@/src/lib/schemas";
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
    const body = await parseJson(request, timeLogSchema);
    const { user, client } = await requireRedmineClient();
    trackInfo("issue.timelog.add.requested", {
      userId: user.id,
      issueId,
      hours: body.hours,
      activityId: body.activityId,
    });
    const limiter = isRateLimited({
      key: `${user.id}:issue-timelog`,
      max: 20,
      windowMs: 60_000,
    });
    if (limiter.limited) {
      trackFailure({
        event: "issue.timelog.add.rate_limited",
        error: "issue timelog add rate-limited",
        level: "warn",
        data: { userId: user.id, issueId },
        metricName: "issue_timelog_add_rate_limited",
        metricTags: { reason: "rate_limited" },
        durationMetricName: "issue_timelog_add_duration",
        durationMs: Date.now() - startedAt,
      });
      return jsonError("Rate limit exceeded. Try again shortly.", 429);
    }

    const spentOn = body.spentOn ?? new Date().toISOString().slice(0, 10);
    const res = await client.addTimeEntry({
      issueId,
      hours: body.hours,
      activityId: body.activityId,
      comments: body.comment,
      spentOn,
    });

    await syncSingleIssue(user.id, client, issueId);
    trackSuccess({
      event: "issue.timelog.add.succeeded",
      data: {
        userId: user.id,
        issueId,
        redmineTimeEntryId: res?.time_entry?.id ?? null,
      },
      metricName: "issue_timelog_add_succeeded",
      durationMetricName: "issue_timelog_add_duration",
      durationMs: Date.now() - startedAt,
    });

    return Response.json({ ok: true, timeEntryId: res?.time_entry?.id ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to add timelog";
    const status = message === "Unauthorized" ? 401 : (statusFromRedmineError(message) ?? 400);
    trackFailure({
      event: "issue.timelog.add.failed",
      error,
      data: { status },
      metricName: "issue_timelog_add_failed",
      metricTags: { status_class: statusClass(status) },
      durationMetricName: "issue_timelog_add_duration",
      durationMs: Date.now() - startedAt,
    });
    return jsonError(message, status);
  }
}
