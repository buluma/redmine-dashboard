/**
 * Streamline Log Poller
 *
 * Dedicated poller for auto-fetching logs from Streamline API into the database.
 * Uses leader lock pattern to ensure only one instance runs at a time.
 *
 * Architecture:
 * 1. Leader election via PostgreSQL lock (same as sync poller)
 * 2. Periodic fetch from Streamline API
 * 3. Upsert into DB (skips duplicates by id + environment + host)
 */

import { randomUUID } from "node:crypto";
import { prisma } from "@/src/lib/db";
import { env } from "@/src/lib/env";
import { logEvent } from "@/src/lib/log";
import {
  fetchStreamlineLogsFromAPI,
  upsertMbuLog,
  upsertServerSideRulesLog,
  upsertTrace,
} from "@/src/lib/streamline-import";

declare global {
  var __streamline_log_poller_started__: boolean | undefined;
}

const LOCK_NAME = "streamline-log-poller";
const ownerId = randomUUID();
let intervalRef: NodeJS.Timeout | null = null;
let tickInFlight = false;

async function acquireLeaderLock(): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.streamlineLogLockTtlMs);
  const current = await prisma.leaderLock.findUnique({ where: { name: LOCK_NAME } });

  if (!current) {
    await prisma.leaderLock.create({
      data: {
        name: LOCK_NAME,
        ownerId,
        heartbeatAt: now,
        expiresAt,
      },
    });
    return true;
  }

  const lockExpired = current.expiresAt.getTime() < Date.now();
  if (current.ownerId === ownerId || lockExpired) {
    await prisma.leaderLock.update({
      where: { name: LOCK_NAME },
      data: {
        ownerId,
        heartbeatAt: now,
        expiresAt,
      },
    });
    return true;
  }

  return false;
}

async function pollTick(): Promise<void> {
  if (tickInFlight) {
    return;
  }

  tickInFlight = true;
  const startTime = Date.now();

  try {
    const isLeader = await acquireLeaderLock();
    if (!isLeader) {
      logEvent("streamline_log_poller.tick.skipped_not_leader", { ownerId });
      return;
    }

    logEvent("streamline_log_poller.tick.started", {
      ownerId,
      environment: env.streamlineEnvironment,
      limit: env.streamlineLogFetchLimit,
    });

    // Fetch logs from Streamline API
    const apiResult = await fetchStreamlineLogsFromAPI({
      environment: env.streamlineEnvironment,
      limit: env.streamlineLogFetchLimit,
    });

    let totalImported = 0;
    const stats = {
      mbuLogs: { created: 0, skipped: 0 },
      serverSideRules: { created: 0, skipped: 0 },
      traces: { created: 0, skipped: 0 },
    };

    // Import each log type
    const host = apiResult.host || `streamline.${env.streamlineEnvironment}.vodacomsa-battery.nasctech.com`;

    if (apiResult.mbuLogs.length > 0) {
      for (const record of apiResult.mbuLogs) {
        const result = await upsertMbuLog(prisma, record, env.streamlineEnvironment, host);
        if (result.created) stats.mbuLogs.created++;
        else stats.mbuLogs.skipped++;
      }
      totalImported += apiResult.mbuLogs.length;
    }

    if (apiResult.serverSideRules.length > 0) {
      for (const record of apiResult.serverSideRules) {
        const result = await upsertServerSideRulesLog(prisma, record, env.streamlineEnvironment, host);
        if (result.created) stats.serverSideRules.created++;
        else stats.serverSideRules.skipped++;
      }
      totalImported += apiResult.serverSideRules.length;
    }

    if (apiResult.traces.length > 0) {
      for (const record of apiResult.traces) {
        const result = await upsertTrace(prisma, record, env.streamlineEnvironment, host);
        if (result.created) stats.traces.created++;
        else stats.traces.skipped++;
      }
      totalImported += apiResult.traces.length;
    }

    const durationMs = Date.now() - startTime;

    logEvent("streamline_log_poller.tick.completed", {
      ownerId,
      durationMs,
      totalRecords: totalImported,
      ...stats,
      errors: apiResult.errors,
    });
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    logEvent("streamline_log_poller.tick.failed", { ownerId, error: err }, "error");
  } finally {
    tickInFlight = false;
  }
}

export function ensureStreamlineLogPollerStarted(): void {
  if (!env.enableStreamlineLogPoller) {
    logEvent("streamline_log_poller.disabled", { ownerId });
    return;
  }

  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build"
  ) {
    return;
  }

  if (global.__streamline_log_poller_started__) {
    return;
  }

  global.__streamline_log_poller_started__ = true;

  logEvent("streamline_log_poller.starting", {
    ownerId,
    intervalMs: env.streamlineLogPollIntervalMs,
    lockTtlMs: env.streamlineLogLockTtlMs,
    environment: env.streamlineEnvironment,
    fetchLimit: env.streamlineLogFetchLimit,
  });

  intervalRef = setInterval(() => {
    void pollTick();
  }, env.streamlineLogPollIntervalMs);

  if (intervalRef.unref) {
    intervalRef.unref();
  }

  // Run immediately on start
  void pollTick();
}
