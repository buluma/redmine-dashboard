import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { env } from "@/src/lib/env";
import { RedmineClient } from "@/src/lib/redmine";

type CheckResult = {
  ok: boolean;
  error?: string;
};

type HealthStatus = "ok" | "degraded";

const startTime = Date.now();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function GET() {
  let status: HealthStatus = "ok";

  const checks: {
    database: CheckResult;
    redmine: ({ mode: "skipped" } | ({ mode: "env_probe" } & CheckResult & { login?: string }));
    scheduler: CheckResult & { staleRunningJobs: number; leaderLockOwnerId?: string | null };
    logPoller: CheckResult & { enabled: boolean; leaderLockOwnerId?: string | null; heartbeatAt?: string; expiresAt?: string };
  } = {
    database: { ok: true },
    redmine: { mode: "skipped" },
    scheduler: { ok: true, staleRunningJobs: 0 },
    logPoller: { ok: true, enabled: env.enableStreamlineLogPoller },
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    status = "degraded";
    checks.database = { ok: false, error: errorMessage(error) };
  }

  try {
    const staleBefore = new Date(Date.now() - env.syncJobStaleMs);
    const [staleRunningJobs, syncLock, logLock] = await Promise.all([
      prisma.syncJob.count({
        where: {
          status: "running",
          startedAt: { lt: staleBefore },
        },
      }),
      prisma.leaderLock.findUnique({ where: { name: "sync-poller" } }),
      env.enableStreamlineLogPoller
        ? prisma.leaderLock.findUnique({ where: { name: "streamline-log-poller" } })
        : Promise.resolve(null),
    ]);
    checks.scheduler = {
      ok: true,
      staleRunningJobs,
      leaderLockOwnerId: syncLock?.ownerId ?? null,
    };
    if (env.enableStreamlineLogPoller && logLock) {
      checks.logPoller = {
        ok: true,
        enabled: true,
        leaderLockOwnerId: logLock.ownerId,
        heartbeatAt: logLock.heartbeatAt.toISOString(),
        expiresAt: logLock.expiresAt.toISOString(),
      };
    }
  } catch (error) {
    status = "degraded";
    checks.scheduler = {
      ok: false,
      staleRunningJobs: 0,
      error: errorMessage(error),
    };
  }

  if (env.redmineBaseUrl && env.redmineApiKey) {
    try {
      const client = new RedmineClient(env.redmineBaseUrl, env.redmineApiKey, { timeoutMs: 2500 });
      const currentUser = await client.getCurrentUser();
      checks.redmine = { mode: "env_probe", ok: true, login: currentUser.login };
    } catch (error) {
      status = "degraded";
      checks.redmine = { mode: "env_probe", ok: false, error: errorMessage(error) };
    }
  }

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      checks,
    },
    { status: status === "ok" ? 200 : 503 },
  );
}
