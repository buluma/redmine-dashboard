import { prisma } from "@/src/lib/db";
import { env } from "@/src/lib/env";
import { RedmineClient } from "@/src/lib/redmine";

const POLLER_LOCK_NAME = "sync-poller";

type CheckResult = {
  ok: boolean;
  latencyMs?: number;
  error?: string | null;
};

type RedmineCheckResult = CheckResult & {
  mode: "skipped" | "env_probe";
  user?: string;
};

export async function GET() {
  const now = new Date();
  let dbCheck: CheckResult = { ok: false };
  let redmineCheck: RedmineCheckResult = { ok: true, mode: "skipped" };

  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbCheck = { ok: true, latencyMs: Date.now() - dbStart };
  } catch (error) {
    dbCheck = {
      ok: false,
      latencyMs: Date.now() - dbStart,
      error: error instanceof Error ? error.message : "Database check failed",
    };
  }

  if (env.redmineBaseUrl && env.redmineApiKey) {
    const redmineStart = Date.now();
    try {
      const client = new RedmineClient(env.redmineBaseUrl, env.redmineApiKey);
      const current = await client.getCurrentUser();
      redmineCheck = {
        ok: true,
        mode: "env_probe",
        latencyMs: Date.now() - redmineStart,
        error: null,
        user: current.login,
      };
    } catch (error) {
      redmineCheck = {
        ok: false,
        mode: "env_probe",
        latencyMs: Date.now() - redmineStart,
        error: error instanceof Error ? error.message : "Redmine probe failed",
      };
    }
  }

  const lock = await prisma.leaderLock.findUnique({ where: { name: POLLER_LOCK_NAME } });
  const staleRunningJobs = await prisma.syncJob.count({
    where: {
      status: { in: ["pending", "running"] },
      createdAt: {
        lt: new Date(now.getTime() - env.syncJobStaleMs),
      },
    },
  });

  const degraded = !dbCheck.ok || !redmineCheck.ok;
  const status = degraded ? "degraded" : "ok";

  return Response.json(
    {
      status,
      timestamp: now.toISOString(),
      checks: {
        database: dbCheck,
        redmine: redmineCheck,
        scheduler: {
          lock: lock
            ? {
                ownerId: lock.ownerId,
                heartbeatAt: lock.heartbeatAt,
                expiresAt: lock.expiresAt,
              }
            : null,
          staleRunningJobs,
        },
      },
    },
    { status: degraded ? 503 : 200 },
  );
}
