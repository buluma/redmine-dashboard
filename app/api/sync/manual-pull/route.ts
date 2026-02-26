import { requireCurrentUser } from "@/src/lib/auth";
import { jsonError } from "@/src/lib/http";
import { logEvent } from "@/src/lib/log";
import { isRateLimited } from "@/src/lib/rate-limit";
import { runSyncJob } from "@/src/lib/sync";

export async function POST() {
  try {
    const user = await requireCurrentUser();
    logEvent("sync.manual_pull.requested", { userId: user.id });
    const limiter = isRateLimited({
      key: `${user.id}:manual-pull`,
      max: 3,
      windowMs: 60_000,
    });
    if (limiter.limited) {
      logEvent("sync.manual_pull.rate_limited", { userId: user.id }, "warn");
      return jsonError("Manual pull is rate-limited. Please wait a minute.", 429);
    }
    const job = await runSyncJob(user.id, "full_manual");
    logEvent("sync.manual_pull.enqueued", { userId: user.id, jobId: job.jobId });
    return Response.json({ ok: true, jobId: job.jobId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start manual sync";
    const status = message === "Unauthorized" ? 401 : 400;
    logEvent("sync.manual_pull.failed", { status, error: message }, "error");
    return jsonError(message, status);
  }
}
