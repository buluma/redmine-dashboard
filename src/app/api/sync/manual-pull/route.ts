import { requireCurrentUser } from "@/src/lib/auth";
import { jsonError } from "@/src/lib/http";
import { runSyncJob } from "@/src/lib/sync";

export async function POST() {
  try {
    const user = await requireCurrentUser();
    const job = await runSyncJob(user.id, "full_manual");
    return Response.json({ ok: true, jobId: job.jobId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start manual sync";
    const status = message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
