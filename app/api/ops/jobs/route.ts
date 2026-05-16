import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { requireRole } from "@/src/lib/rbac";
import { trackFailure } from "@/src/lib/telemetry";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    // Only ADMIN or EDITOR can cancel jobs
    await requireRole("ADMIN", "EDITOR");
  } catch {
    return jsonError("Forbidden - Admin/Editor only", 403);
  }

  try {
    const body = await request.json();
    const { jobId, action } = body;

    if (!jobId || !action) {
      return jsonError("jobId and action are required", 400);
    }

    if (action === "cancel") {
      // Cancel a running job by marking it as failed
      const job = await prisma.syncJob.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        return jsonError("Job not found", 404);
      }

      if (job.status !== "running") {
        return jsonError(`Cannot cancel job with status: ${job.status}`, 400);
      }

      const updated = await prisma.syncJob.update({
        where: { id: jobId },
        data: {
          status: "failed",
          endedAt: new Date(),
          error: "Manually cancelled by admin",
        },
      });

      return Response.json({
        success: true,
        job: updated,
      });
    }

    if (action === "restart") {
      // Restart a failed/cancelled job by creating a new one
      const oldJob = await prisma.syncJob.findUnique({
        where: { id: jobId },
      });

      if (!oldJob) {
        return jsonError("Job not found", 404);
      }

      // Create new incremental job
      const newJob = await prisma.syncJob.create({
        data: {
          userId: oldJob.userId,
          jobType: "incremental",
          status: "pending",
        },
      });

      return Response.json({
        success: true,
        job: newJob,
        message: "New incremental job created",
      });
    }

    return jsonError(`Unknown action: ${action}`, 400);
  } catch (error) {
    trackFailure({ event: "ops.job.action.failed", error, metricName: "ops_job_action_failed" });
    return jsonError(
      `Failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      500
    );
  }
}