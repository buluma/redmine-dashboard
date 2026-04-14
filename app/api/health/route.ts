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

interface Metrics {
  issues: number;
  users: number;
  syncJobs: number;
  auditLogs24h: number;
  webLogs24h: number;
  internalNotes: number;
  activeUsers: number;
}

export async function GET() {
  let status: HealthStatus = "ok";

  const checks: {
    database: CheckResult;
    redmine: ({ mode: "skipped" } | ({ mode: "env_probe" } & CheckResult & { login?: string }));
    scheduler: CheckResult & { staleRunningJobs: number; leaderLockOwnerId?: string | null };
    logPoller: CheckResult & { enabled: boolean; leaderLockOwnerId?: string | null; heartbeatAt?: string; expiresAt?: string };
    metrics: Metrics;
  } = {
    database: { ok: true },
    redmine: { mode: "skipped" },
    scheduler: { ok: true, staleRunningJobs: 0 },
    logPoller: { ok: true, enabled: env.enableStreamlineLogPoller },
    metrics: {
      issues: 0,
      users: 0,
      syncJobs: 0,
      auditLogs24h: 0,
      webLogs24h: 0,
      internalNotes: 0,
      activeUsers: 0,
    },
  };

  // Database health check
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    status = "degraded";
    checks.database = { ok: false, error: errorMessage(error) };
  }

  // Scheduler & poller checks
  try {
    const staleBefore = new Date(Date.now() - env.syncJobStaleMs);
    const [staleRunningJobs, syncLock, logLock, metrics] = await Promise.all([
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
      getMetrics(),
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
    checks.metrics = metrics;
  } catch (error) {
    status = "degraded";
    checks.scheduler = {
      ok: false,
      staleRunningJobs: 0,
      error: errorMessage(error),
    };
  }

  // Redmine health check
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
      version: process.env.npm_package_version ?? "1.0.0",
      environment: process.env.NODE_ENV ?? "development",
      checks,
    },
    { status: status === "ok" ? 200 : 503 },
  );
}

async function getMetrics(): Promise<Metrics> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  try {
    const [issues, users, syncJobs, auditLogs24h, webLogs24h, internalNotes] = await Promise.all([
      prisma.issue.count(),
      prisma.user.count(),
      prisma.syncJob.count({
        where: { createdAt: { gte: twentyFourHoursAgo } },
      }),
      prisma.auditLog.count({
        where: { createdAt: { gte: twentyFourHoursAgo } },
      }),
      prisma.webLog.count({
        where: { createdAt: { gte: twentyFourHoursAgo } },
      }),
      prisma.internalNote.count(),
    ]);

    // Count active users (logged in within last 24h via audit logs)
    const activeUserCount = await prisma.auditLog.groupBy({
      by: ["userId"],
      where: {
        createdAt: { gte: twentyFourHoursAgo },
        userId: { not: null },
      },
    });

    return {
      issues,
      users,
      syncJobs,
      auditLogs24h,
      webLogs24h,
      internalNotes,
      activeUsers: activeUserCount.length,
    };
  } catch {
    return {
      issues: 0,
      users: 0,
      syncJobs: 0,
      auditLogs24h: 0,
      webLogs24h: 0,
      internalNotes: 0,
      activeUsers: 0,
    };
  }
}
