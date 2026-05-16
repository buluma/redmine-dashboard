import { randomUUID } from "node:crypto";
import { prisma } from "@/src/lib/db";
import { env } from "@/src/lib/env";
import { logEvent } from "@/src/lib/log";
import { acquireLeaderLock } from "@/src/lib/leader-lock";
import { runSyncJob } from "@/src/lib/sync";

declare global {
  var __poller_started__: boolean | undefined;
}

const LOCK_NAME = "sync-poller";
const ownerId = randomUUID();
let intervalRef: NodeJS.Timeout | null = null;
let tickInFlight = false;

async function pollTick(): Promise<void> {
  if (tickInFlight) {
    return;
  }

  tickInFlight = true;
  try {
    const isLeader = await acquireLeaderLock(LOCK_NAME, ownerId, env.leaderLockTtlMs);
    if (!isLeader) {
      return;
    }

    const users = await prisma.userRedmineCredential.findMany({
      where: { isActive: true },
      select: { userId: true },
    });
    logEvent("poller.tick.started", { ownerId, activeUserCount: users.length });

    for (const u of users) {
      await runSyncJob(u.userId, "incremental");
    }
    logEvent("poller.tick.completed", { ownerId, activeUserCount: users.length });
  } catch (error) {
    logEvent("poller.tick.failed", { ownerId, error }, "error");
  } finally {
    tickInFlight = false;
  }
}

export function ensurePollerStarted(): void {
  if (!env.enableSyncPoller) {
    return;
  }

  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build"
  ) {
    return;
  }

  if (global.__poller_started__) {
    return;
  }

  global.__poller_started__ = true;
  intervalRef = setInterval(() => {
    void pollTick();
  }, env.pollIntervalMs);

  if (intervalRef.unref) {
    intervalRef.unref();
  }

  void pollTick();
}
