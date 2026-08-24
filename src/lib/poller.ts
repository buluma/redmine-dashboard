import { randomUUID } from "node:crypto";
import { prisma } from "@/src/lib/db";
import { env } from "@/src/lib/env";
import { logEvent } from "@/src/lib/log";
import { acquireLeaderLock } from "@/src/lib/leader-lock";
import { emitEvent, subscribe } from "@/src/lib/event-bus";
import { runSyncJob } from "@/src/lib/sync";
import { syncWakaTimeSummaries } from "@/src/lib/wakatime-sync";

declare global {
  var __poller_started__: boolean | undefined;
}

const LOCK_NAME = "sync-poller";
const ownerId = randomUUID();
let intervalRef: NodeJS.Timeout | null = null;
let tickInFlight = false;

// Exported for tests only — production code drives this via ensurePollerStarted's interval.
export async function pollTick(): Promise<void> {
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

    // A sync run emits one issue.created/issue.updated event per issue
    // touched, which is too chatty for the dashboard to refresh on directly
    // (see sync.tick.completed below). Count them here so the single
    // completion event tells the client how much actually changed.
    const tickStartedAt = Date.now();
    let issueEventCount = 0;
    const unsubscribe = subscribe((event) => {
      if (event.type === "issue.created" || event.type === "issue.updated") {
        issueEventCount += 1;
      }
    });

    try {
      for (const u of users) {
        await runSyncJob(u.userId, "incremental");
      }
    } finally {
      unsubscribe();
    }

    const wakaKey = process.env.WAKATIME_API_KEY;
    if (wakaKey && users.length > 0) {
      try {
        await syncWakaTimeSummaries(users[0].userId, wakaKey, { days: 2 });
      } catch (err) {
        logEvent("poller.wakatime.failed", { error: err }, "warn");
      }
    }

    // Single authoritative "the batch is done" signal — the dashboard
    // refreshes on this instead of on every individual issue event.
    emitEvent({
      type: "sync.tick.completed",
      durationMs: Date.now() - tickStartedAt,
      issueCount: issueEventCount,
    });

    logEvent("poller.tick.completed", { ownerId, activeUserCount: users.length, issueEventCount });
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
