import { requireRedmineClient } from "@/src/lib/auth";
import { jsonError, parseJson } from "@/src/lib/http";
import { isRateLimited } from "@/src/lib/rate-limit";
import { redmineMessageFromError, redmineStatusFromError } from "@/src/lib/redmine";
import { bulkIssueUpdateSchema } from "@/src/lib/schemas";
import { syncSingleIssue } from "@/src/lib/sync";
import { trackFailure, trackInfo, trackSuccess } from "@/src/lib/telemetry";

function statusClass(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const payload = await parseJson(request, bulkIssueUpdateSchema);
    const issueIds = Array.from(new Set(payload.issueIds));
    const { user, client } = await requireRedmineClient();

    const fields = {
      priorityId: payload.priorityId,
      assignedToId: payload.assignedToId,
      doneRatio: payload.doneRatio,
    };

    trackInfo("issue.bulk_update.requested", {
      userId: user.id,
      issueCount: issueIds.length,
      fields: Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v !== undefined),
      ),
    });

    const limiter = isRateLimited({
      key: `${user.id}:issue-bulk-update`,
      max: 8,
      windowMs: 60_000,
    });
    if (limiter.limited) {
      trackFailure({
        event: "issue.bulk_update.rate_limited",
        error: "issue bulk update rate-limited",
        level: "warn",
        data: { userId: user.id },
        metricName: "issue_bulk_update_rate_limited",
        metricTags: { reason: "rate_limited" },
        durationMetricName: "issue_bulk_update_duration",
        durationMs: Date.now() - startedAt,
      });
      return jsonError("Rate limit exceeded. Try again shortly.", 429);
    }

    let updatedCount = 0;
    const failures: Array<{ issueId: number; error: string }> = [];

    for (const issueId of issueIds) {
      try {
        await client.updateIssue(issueId, {
          ...(payload.priorityId !== undefined ? { priorityId: payload.priorityId } : {}),
          ...(payload.assignedToId !== undefined ? { assignedToId: payload.assignedToId } : {}),
          ...(payload.doneRatio !== undefined ? { doneRatio: payload.doneRatio } : {}),
          ...(payload.note !== undefined ? { notes: payload.note } : {}),
        });
        await syncSingleIssue(user.id, client, issueId);
        updatedCount += 1;
      } catch (error) {
        const message = redmineMessageFromError(error, "Update failed");
        failures.push({ issueId, error: message });
      }
    }

    if (updatedCount === 0 && failures.length > 0) {
      trackFailure({
        event: "issue.bulk_update.failed_all",
        error: "bulk update failed for all issues",
        level: "warn",
        data: {
          userId: user.id,
          issueCount: issueIds.length,
          failedCount: failures.length,
        },
        metricName: "issue_bulk_update_failed",
        metricTags: { mode: "all_failed" },
        durationMetricName: "issue_bulk_update_duration",
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
      event: "issue.bulk_update.completed",
      data: {
        userId: user.id,
        issueCount: issueIds.length,
        updatedCount,
        failedCount: failures.length,
      },
      metricName: "issue_bulk_update_completed",
      metricTags: {
        partial_failure: failures.length > 0 ? "true" : "false",
      },
      durationMetricName: "issue_bulk_update_duration",
      durationMs: Date.now() - startedAt,
    });

    return Response.json({
      ok: failures.length === 0,
      updatedCount,
      failedCount: failures.length,
      failures,
    });
  } catch (error) {
    const message = redmineMessageFromError(error, "Unable to bulk update issues");
    const status = message === "Unauthorized" ? 401 : (redmineStatusFromError(error) ?? 400);
    trackFailure({
      event: "issue.bulk_update.failed",
      error,
      data: { status },
      metricName: "issue_bulk_update_failed",
      metricTags: { status_class: statusClass(status), mode: "request_error" },
      durationMetricName: "issue_bulk_update_duration",
      durationMs: Date.now() - startedAt,
    });
    return jsonError(message, status);
  }
}
