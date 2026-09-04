import { randomUUID } from "node:crypto";
import { prisma } from "@/src/lib/db";
import { env } from "@/src/lib/env";
import { logEvent } from "@/src/lib/log";
import { acquireLeaderLock } from "@/src/lib/leader-lock";
import { emitEvent, subscribe } from "@/src/lib/event-bus";
import { runSyncJobAndWait } from "@/src/lib/sync";
import { syncWakaTimeSummaries } from "@/src/lib/wakatime-sync";
import { OdysseusCalendarClient } from "@/src/lib/odysseus-calendar";
import { syncCalendarMeetings } from "@/src/lib/calendar-timelog";

declare global {
  var __poller_started__: boolean | undefined;
}

const LOCK_NAME = "sync-poller";
const ownerId = randomUUID();
let intervalRef: NodeJS.Timeout | null = null;
let tickInFlight = false;

// Cursor for the calendar-meeting poll window (SHA-172) — the end of the
// previous successful poll becomes the start of the next one, so a slow or
// delayed tick still covers every meeting that ended in between rather than
// only the last pollIntervalMs. Process-local, so it resets to null on
// every restart/failover — COLD_START_LOOKBACK_MS below bounds how far back
// that first post-restart poll looks, so a deploy or outage doesn't lose
// meetings that ended while this instance was down. TimeEntry's
// (issueId, calendarEventUid) uniqueness makes the resulting overlap with
// whatever the previous instance already covered safe to re-poll.
let lastCalendarSyncEnd: Date | null = null;
const COLD_START_LOOKBACK_MS = 24 * 60 * 60 * 1000;

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

    // acquireLeaderLock above grants a lease of leaderLockTtlMs. The sync
    // work below can outlast that TTL on a busy Redmine instance — without
    // renewal the lock would expire mid-tick and let a second instance
    // acquire it and start a concurrent duplicate sync. Renew (same ownerId
    // extends the lease, see acquireLeaderLock) well inside the TTL for as
    // long as this tick's real work is running.
    const renewalMs = Math.max(1000, Math.floor(env.leaderLockTtlMs / 3));
    const renewalRef = setInterval(() => {
      void acquireLeaderLock(LOCK_NAME, ownerId, env.leaderLockTtlMs).catch((error) => {
        logEvent("poller.lock.renew_failed", { ownerId, error }, "warn");
      });
    }, renewalMs);
    if (renewalRef.unref) {
      renewalRef.unref();
    }

    try {
      for (const u of users) {
        await runSyncJobAndWait(u.userId, "incremental");
      }
    } finally {
      clearInterval(renewalRef);
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

    const odysseusBaseUrl = process.env.ODYSSEUS_BASE_URL;
    const odysseusToken = process.env.ODYSSEUS_API_TOKEN;
    if (odysseusBaseUrl && odysseusToken && users.length > 0) {
      const windowEnd = new Date();
      const windowStart = lastCalendarSyncEnd ?? new Date(windowEnd.getTime() - COLD_START_LOOKBACK_MS);
      try {
        const client = new OdysseusCalendarClient(odysseusBaseUrl, odysseusToken);
        const calResult = await syncCalendarMeetings(users[0].userId, client, {
          start: windowStart.toISOString(),
          end: windowEnd.toISOString(),
        });
        lastCalendarSyncEnd = windowEnd;
        logEvent("poller.calendar.completed", calResult);
      } catch (err) {
        // Don't advance the cursor on failure — the next tick retries the
        // same window instead of silently skipping meetings that ended
        // during this failed poll.
        logEvent("poller.calendar.failed", { error: err }, "warn");
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
