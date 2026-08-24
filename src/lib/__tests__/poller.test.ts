import { describe, expect, it, vi, beforeEach } from "vitest";

import { emitEvent, subscribe, type ConvergeEvent } from "@/src/lib/event-bus";

const findManyMock = vi.fn();
const acquireLeaderLockMock = vi.fn();
const runSyncJobMock = vi.fn();
const syncWakaTimeSummariesMock = vi.fn();

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
vi.mock("@/src/lib/sync", () => ({
  runSyncJob: (...args: unknown[]) => runSyncJobMock(...args),
}));

// Real event-bus — pollTick's issue-count tracking subscribes to it directly,
// so the test verifies the actual wiring rather than a mock of it.

describe("pollTick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acquireLeaderLockMock.mockResolvedValue(true);
    syncWakaTimeSummariesMock.mockResolvedValue(undefined);
    delete process.env.WAKATIME_API_KEY;
  });

  it("emits a single sync.tick.completed counting the issue events runSyncJob fired", async () => {
    findManyMock.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }]);
    // Simulate what sync.ts really does: emit one issue.* event per issue
    // upserted while a sync job runs.
    runSyncJobMock.mockImplementation(async (userId: string) => {
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

    expect(runSyncJobMock).toHaveBeenCalledTimes(2);
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

    expect(runSyncJobMock).not.toHaveBeenCalled();
    expect(received).toHaveLength(0);
  });

  it("unsubscribes its issue-event counter after the tick so later syncs aren't double-counted", async () => {
    findManyMock.mockResolvedValue([{ userId: "u1" }]);
    runSyncJobMock.mockImplementation(async (userId: string) => {
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
});
