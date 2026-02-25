import { requireCurrentUser } from "@/src/lib/auth";
import { jsonError } from "@/src/lib/http";
import { isRateLimited } from "@/src/lib/rate-limit";
import { runSyncJob } from "@/src/lib/sync";

export async function POST() {
  try {
    const user = await requireCurrentUser();
    const limiter = isRateLimited({
      key: `${user.id}:manual-pull`,
      max: 3,
      windowMs: 60_000,
    });
    if (limiter.limited) {
      return jsonError("Manual pull is rate-limited. Please wait a minute.", 429);
    }
    const job = await runSyncJob(user.id, "full_manual");
    return Response.json({ ok: true, jobId: job.jobId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start manual sync";
    const status = message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
