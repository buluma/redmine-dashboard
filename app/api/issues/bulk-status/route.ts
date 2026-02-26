import { requireRedmineClient } from "@/src/lib/auth";
import { jsonError, parseJson } from "@/src/lib/http";
import { isRateLimited } from "@/src/lib/rate-limit";
import { bulkStatusUpdateSchema } from "@/src/lib/schemas";
import { syncSingleIssue } from "@/src/lib/sync";
import { trackFailure, trackInfo, trackSuccess } from "@/src/lib/telemetry";

function statusFromRedmineError(message: string): number | null {
  const match = message.match(/Redmine request failed \((\d{3})\):/);
  if (!match) return null;
  return Number(match[1]);
}

function statusClass(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const payload = await parseJson(request, bulkStatusUpdateSchema);
    const issueIds = Array.from(new Set(payload.issueIds));
    const { user, client } = await requireRedmineClient();
    trackInfo("issue.bulk_status.requested", {
      userId: user.id,
      issueCount: issueIds.length,
      statusId: payload.statusId,
    });

    const limiter = isRateLimited({
      key: `${user.id}:issue-bulk-status`,
      max: 8,
      windowMs: 60_000,
    });
    if (limiter.limited) {
      trackFailure({
        event: "issue.bulk_status.rate_limited",
        error: "issue bulk status rate-limited",
        level: "warn",
        data: { userId: user.id },
        metricName: "issue_bulk_status_rate_limited",
        metricTags: { reason: "rate_limited" },
        durationMetricName: "issue_bulk_status_duration",
        durationMs: Date.now() - startedAt,
      });
      return jsonError("Rate limit exceeded. Try again shortly.", 429);
    }

    let updatedCount = 0;
    const failures: Array<{ issueId: number; error: string }> = [];

    for (const issueId of issueIds) {
      try {
        const detail = await client.getIssue(issueId, ["allowed_statuses"]);
        const issueMeta = detail.issue as { allowed_statuses?: Array<{ id: number }> };
        const allowed = (issueMeta.allowed_statuses ?? []).map((entry) => entry.id);

        if (allowed.length > 0 && !allowed.includes(payload.statusId)) {
          failures.push({ issueId, error: "Status transition is not allowed for this issue" });
          continue;
        }

        await client.updateIssueStatus(issueId, payload.statusId, payload.note);
        await syncSingleIssue(user.id, client, issueId);
        updatedCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Update failed";
        failures.push({ issueId, error: message });
      }
    }

    if (updatedCount === 0 && failures.length > 0) {
      trackFailure({
        event: "issue.bulk_status.failed_all",
        error: "bulk status update failed for all issues",
        level: "warn",
        data: {
          userId: user.id,
          issueCount: issueIds.length,
          failedCount: failures.length,
        },
        metricName: "issue_bulk_status_failed",
        metricTags: { mode: "all_failed" },
        durationMetricName: "issue_bulk_status_duration",
        durationMs: Date.now() - startedAt,
      });
      return Response.json(
        {
          error: "No issue was updated.",
          failures,
          updatedCount,
          failedCount: failures.length,
        },
        { status: 400 },
      );
    }

    trackSuccess({
      event: "issue.bulk_status.completed",
      data: {
        userId: user.id,
        issueCount: issueIds.length,
        updatedCount,
        failedCount: failures.length,
      },
      metricName: "issue_bulk_status_completed",
      metricTags: {
        partial_failure: failures.length > 0 ? "true" : "false",
      },
      durationMetricName: "issue_bulk_status_duration",
      durationMs: Date.now() - startedAt,
    });

    return Response.json({
      ok: failures.length === 0,
      updatedCount,
      failedCount: failures.length,
      failures,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to bulk update issues";
    const status = message === "Unauthorized" ? 401 : (statusFromRedmineError(message) ?? 400);
    trackFailure({
      event: "issue.bulk_status.failed",
      error,
      data: { status },
      metricName: "issue_bulk_status_failed",
      metricTags: { status_class: statusClass(status), mode: "request_error" },
      durationMetricName: "issue_bulk_status_duration",
      durationMs: Date.now() - startedAt,
    });
    return jsonError(message, status);
  }
}
