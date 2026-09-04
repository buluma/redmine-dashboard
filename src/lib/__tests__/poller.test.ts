import { describe, expect, it, vi, beforeEach } from "vitest";

import { emitEvent, subscribe, type ConvergeEvent } from "@/src/lib/event-bus";

const findManyMock = vi.fn();
const acquireLeaderLockMock = vi.fn();
const runSyncJobAndWaitMock = vi.fn();
const syncWakaTimeSummariesMock = vi.fn();
const syncCalendarMeetingsMock = vi.fn();

vi.mock("@/src/lib/db", () => ({
  prisma: { userRedmineCredential: { findMany: (...args: unknown[]) => findManyMock(...args) } },
}));
vi.mock("@/src/lib/env", () => ({
  env: { leaderLockTtlMs: 30_000, enableSyncPoller: true, pollIntervalMs: 60_000 },
}));
vi.mock("@/src/lib/log", () => ({ logEvent: vi.fn() }));
vi.mock("@/src/lib/leader-lock", () => ({
  acquireLeaderLock: (...args: unknown[]) => acquireLeaderLockMock(...args),
}));
vi.mock("@/src/lib/wakatime-sync", () => ({
  syncWakaTimeSummaries: (...args: unknown[]) => syncWakaTimeSummariesMock(...args),
}));
// Mocked (rather than letting the real module load) so this test doesn't
// pull in the real telemetry.ts/Sentry chain that odysseus-calendar.ts
// imports — same reason wakatime-sync is mocked instead of loaded for real.
vi.mock("@/src/lib/odysseus-calendar", () => ({
  OdysseusCalendarClient: class {},
}));
vi.mock("@/src/lib/calendar-timelog", () => ({
  syncCalendarMeetings: (...args: unknown[]) => syncCalendarMeetingsMock(...args),
}));
vi.mock("@/src/lib/sync", () => ({
  runSyncJobAndWait: (...args: unknown[]) => runSyncJobAndWaitMock(...args),
}));

// Real event-bus — pollTick's issue-count tracking subscribes to it directly,
// so the test verifies the actual wiring rather than a mock of it.

describe("pollTick", () => {
  beforeEach(() => {
    // resetAllMocks (not clearAllMocks) — clearAllMocks only clears call
    // history, not a mock's implementation, so a mockImplementation set by
    // an earlier test (e.g. runSyncJobAndWaitMock's fake-timers one below)
    // would otherwise leak into every later test that doesn't override it.
    vi.resetAllMocks();
    acquireLeaderLockMock.mockResolvedValue(true);
    syncWakaTimeSummariesMock.mockResolvedValue(undefined);
    syncCalendarMeetingsMock.mockResolvedValue({ eventCount: 0, matched: 0, logged: 0, skipped: 0, unmatched: 0 });
    delete process.env.WAKATIME_API_KEY;
    delete process.env.ODYSSEUS_BASE_URL;
    delete process.env.ODYSSEUS_API_TOKEN;
  });

  it("emits a single sync.tick.completed counting the issue events runSyncJob fired", async () => {
    findManyMock.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }]);
    // Simulate what sync.ts really does: emit one issue.* event per issue
    // upserted while a sync job runs.
    runSyncJobAndWaitMock.mockImplementation(async (userId: string) => {
      emitEvent({ type: "issue.updated", userId, redmineIssueId: 1, issueId: "i1" });
      emitEvent({ type: "issue.created", userId, redmineIssueId: 2, issueId: "i2" });
      return { jobId: `job-${userId}` };
    });

    const received: ConvergeEvent[] = [];
    const unsubscribe = subscribe((event) => {
      if (event.type === "sync.tick.completed") received.push(event);
    });

    const { pollTick } = await import("@/src/lib/poller");
    await pollTick();
    unsubscribe();

    expect(runSyncJobAndWaitMock).toHaveBeenCalledTimes(2);
    expect(received).toHaveLength(1);
    // 2 users × 2 events each = 4 issue.* events counted into the one tick.
    expect(received[0]).toMatchObject({ type: "sync.tick.completed", issueCount: 4 });
    expect(typeof (received[0] as { durationMs: number }).durationMs).toBe("number");
  });

  it("does not emit sync.tick.completed when this process is not the leader", async () => {
    findManyMock.mockResolvedValue([{ userId: "u1" }]);
    acquireLeaderLockMock.mockResolvedValue(false);

    const received: ConvergeEvent[] = [];
    const unsubscribe = subscribe((event) => {
      if (event.type === "sync.tick.completed") received.push(event);
    });

    const { pollTick } = await import("@/src/lib/poller");
    await pollTick();
    unsubscribe();

    expect(runSyncJobAndWaitMock).not.toHaveBeenCalled();
    expect(received).toHaveLength(0);
  });

  it("unsubscribes its issue-event counter after the tick so later syncs aren't double-counted", async () => {
    findManyMock.mockResolvedValue([{ userId: "u1" }]);
    runSyncJobAndWaitMock.mockImplementation(async (userId: string) => {
      emitEvent({ type: "issue.updated", userId, redmineIssueId: 1, issueId: "i1" });
      return { jobId: "job-1" };
    });

    const { pollTick } = await import("@/src/lib/poller");
    await pollTick();

    // An issue event emitted well after the tick finished must not be
    // attributed to a future tick's count via a leaked subscription.
    const received: ConvergeEvent[] = [];
    const unsubscribe = subscribe((event) => {
      if (event.type === "sync.tick.completed") received.push(event);
    });
    emitEvent({ type: "issue.updated", userId: "u1", redmineIssueId: 99, issueId: "i99" });

    findManyMock.mockResolvedValue([]);
    await pollTick();
    unsubscribe();

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ issueCount: 0 });
  });

  it("renews the leader lock periodically while a long sync is running", async () => {
    findManyMock.mockResolvedValue([{ userId: "u1" }]);
    vi.useFakeTimers();
    // leaderLockTtlMs is 30_000 in the mocked env → renewal interval is 10_000ms.
    // A sync that takes 25s should renew at least once before it's done.
    runSyncJobAndWaitMock.mockImplementation(async () => {
      await vi.advanceTimersByTimeAsync(25_000);
      return { jobId: "job-1" };
    });

    const { pollTick } = await import("@/src/lib/poller");
    await pollTick();
    vi.useRealTimers();

    // Once for the initial acquire, at least once more for renewal.
    expect(acquireLeaderLockMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("skips calendar-meeting sync when Odysseus env vars aren't configured", async () => {
    findManyMock.mockResolvedValue([{ userId: "u1" }]);

    const { pollTick } = await import("@/src/lib/poller");
    await pollTick();

    expect(syncCalendarMeetingsMock).not.toHaveBeenCalled();
  });

  it("syncs calendar meetings for the first active user when Odysseus is configured", async () => {
    process.env.ODYSSEUS_BASE_URL = "http://odysseus.local";
    process.env.ODYSSEUS_API_TOKEN = "tok";
    findManyMock.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }]);

    const { pollTick } = await import("@/src/lib/poller");
    await pollTick();

    expect(syncCalendarMeetingsMock).toHaveBeenCalledTimes(1);
    expect(syncCalendarMeetingsMock.mock.calls[0][0]).toBe("u1");
    const window = syncCalendarMeetingsMock.mock.calls[0][2];
    expect(new Date(window.start).getTime()).toBeLessThan(new Date(window.end).getTime());
  });

  it("does not throw the tick when calendar-meeting sync fails", async () => {
    process.env.ODYSSEUS_BASE_URL = "http://odysseus.local";
    process.env.ODYSSEUS_API_TOKEN = "tok";
    findManyMock.mockResolvedValue([{ userId: "u1" }]);
    syncCalendarMeetingsMock.mockRejectedValue(new Error("bridge unreachable"));

    const { pollTick } = await import("@/src/lib/poller");
    await expect(pollTick()).resolves.toBeUndefined();
  });
});
