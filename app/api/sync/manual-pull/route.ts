import { requireCurrentUser } from "@/src/lib/auth";
import { jsonError } from "@/src/lib/http";
import { isRateLimited } from "@/src/lib/rate-limit";
import { runSyncJob } from "@/src/lib/sync";
import { trackFailure, trackInfo, trackSuccess } from "@/src/lib/telemetry";

function statusClass(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}

export async function POST() {
  const startedAt = Date.now();
  try {
    const user = await requireCurrentUser();
    trackInfo("sync.manual_pull.requested", { userId: user.id });
    const limiter = isRateLimited({
      key: `${user.id}:manual-pull`,
      max: 3,
      windowMs: 60_000,
    });
    if (limiter.limited) {
      trackFailure({
        event: "sync.manual_pull.rate_limited",
        error: "manual pull rate-limited",
        level: "warn",
        data: { userId: user.id },
        metricName: "sync_manual_pull_rate_limited",
        metricTags: { reason: "rate_limited" },
        durationMetricName: "sync_manual_pull_duration",
        durationMs: Date.now() - startedAt,
      });
      return jsonError("Manual pull is rate-limited. Please wait a minute.", 429);
    }
    const job = await runSyncJob(user.id, "full_manual");
    trackSuccess({
      event: "sync.manual_pull.enqueued",
      data: { userId: user.id, jobId: job.jobId },
      metricName: "sync_manual_pull_enqueued",
      metricTags: { source: "full_manual" },
      durationMetricName: "sync_manual_pull_duration",
      durationMs: Date.now() - startedAt,
    });
    return Response.json({ ok: true, jobId: job.jobId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start manual sync";
    const status = message === "Unauthorized" ? 401 : 400;
    trackFailure({
      event: "sync.manual_pull.failed",
      error,
      data: { status },
      metricName: "sync_manual_pull_failed",
      metricTags: { status_class: statusClass(status) },
      durationMetricName: "sync_manual_pull_duration",
      durationMs: Date.now() - startedAt,
    });
    return jsonError(message, status);
  }
}
