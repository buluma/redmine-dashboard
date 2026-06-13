import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { runSyncJob } from "@/src/lib/sync";
import { trackFailure, trackInfo } from "@/src/lib/telemetry";

export const runtime = "nodejs";

// POST /api/external/sync  — trigger a full sync for the system user
// GET  /api/external/sync  — return latest sync job status
// Requires: X-API-Key header matching EXTERNAL_API_KEYS env var.

function getApiKey(request: NextRequest): string | null {
  const headerKey = request.headers.get("x-api-key");
  if (headerKey) return headerKey;
  const sp = (request as any).nextUrl?.searchParams ?? new URL(request.url).searchParams;
  return sp.get("api_key");
}

function validateApiKey(key: string): boolean {
  const validKeys = (process.env.EXTERNAL_API_KEYS || "").split(",").filter(Boolean);
  return validKeys.includes(key);
}

function checkAuth(request: NextRequest): NextResponse | null {
  const apiKey = getApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "API key required" }, { status: 401 });
  }
  const validKeys = (process.env.EXTERNAL_API_KEYS || "").split(",").filter(Boolean);
  if (validKeys.length > 0 && !validateApiKey(apiKey)) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }
  return null;
}

function formatJob(job: { id: string; jobType: string; status: string; startedAt: Date | null; endedAt: Date | null; error: string | null; createdAt: Date }) {
  const durationMs = job.startedAt && job.endedAt
    ? job.endedAt.getTime() - job.startedAt.getTime()
    : null;
  return {
    id: job.id,
    job_type: job.jobType,
    status: job.status,
    started_at: job.startedAt?.toISOString() ?? null,
    ended_at: job.endedAt?.toISOString() ?? null,
    duration_ms: durationMs,
    error: job.error ?? null,
    created_at: job.createdAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const authError = checkAuth(request);
  if (authError) return authError;

  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) {
      return NextResponse.json({ error: "No users found" }, { status: 503 });
    }

    const [latestJob, state] = await Promise.all([
      prisma.syncJob.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.syncState.findUnique({ where: { userId: user.id } }),
    ]);

    return NextResponse.json({
      latest_job: latestJob ? formatJob(latestJob) : null,
      state: state ? {
        last_incremental_sync_at: state.lastIncrementalSyncAt?.toISOString() ?? null,
        last_full_sync_at: state.lastFullSyncAt?.toISOString() ?? null,
        last_sync_status: state.lastSyncStatus,
        last_error: state.lastError ?? null,
        running_job_id: state.runningJobId ?? null,
      } : null,
    });
  } catch (error) {
    trackFailure({ event: "external.sync.status.failed", error, metricName: "external_sync_status_failed" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authError = checkAuth(request);
  if (authError) return authError;

  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) {
      return NextResponse.json({ error: "No users found — cannot trigger sync" }, { status: 503 });
    }

    trackInfo("external.sync.triggered", { userId: user.id });
    const { jobId } = await runSyncJob(user.id, "full_manual");
    const job = await prisma.syncJob.findUnique({ where: { id: jobId } });

    return NextResponse.json({
      ok: true,
      job_id: jobId,
      job: job ? formatJob(job) : null,
    });
  } catch (error) {
    trackFailure({ event: "external.sync.trigger.failed", error, metricName: "external_sync_trigger_failed" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
