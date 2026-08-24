import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  mockSyncJobFindFirst,
  mockSyncJobFindUnique,
  mockSyncJobCreate,
  mockSyncJobUpdate,
  mockSyncStateUpsert,
  mockSyncStateUpdateMany,
  mockSyncStateFindUnique,
  mockSyncStateCreate,
} = vi.hoisted(() => ({
  mockSyncJobFindFirst: vi.fn(),
  mockSyncJobFindUnique: vi.fn(),
  mockSyncJobCreate: vi.fn(),
  mockSyncJobUpdate: vi.fn(),
  mockSyncStateUpsert: vi.fn(),
  mockSyncStateUpdateMany: vi.fn(),
  mockSyncStateFindUnique: vi.fn(),
  mockSyncStateCreate: vi.fn(),
}));

vi.mock("@/src/lib/db", () => ({
  prisma: {
    syncJob: {
      findFirst: mockSyncJobFindFirst,
      findUnique: mockSyncJobFindUnique,
      create: mockSyncJobCreate,
      update: mockSyncJobUpdate,
    },
    syncState: {
      upsert: mockSyncStateUpsert,
      // getOrCreateSyncJob's atomic claim (SyncState.userId is a real
      // unique key) — always "wins" the claim in these tests so the
      // existing reuse/reset assertions below aren't affected by it.
      updateMany: mockSyncStateUpdateMany,
      findUnique: mockSyncStateFindUnique,
      create: mockSyncStateCreate,
    },
  },
}));

vi.mock("@/src/lib/env", () => ({
  env: {
    syncJobStaleMs: 10 * 60 * 1000,
    syncJobRunningStaleMs: 2 * 60 * 60 * 1000,
  },
}));

vi.mock("@/src/lib/log", () => ({ logEvent: vi.fn() }));
vi.mock("@/src/lib/event-bus", () => ({ emitEvent: vi.fn() }));
vi.mock("@/src/lib/telemetry", () => ({ trackFailure: vi.fn() }));
vi.mock("@/src/lib/redmine", () => ({ RedmineClient: vi.fn() }));
vi.mock("@/src/lib/activity-index", () => ({
  recordIssueActivityEvent: vi.fn(),
  recomputeIssueActivityIndex: vi.fn(),
}));

import { runSyncJob } from "@/src/lib/sync";

const USER_ID = "user-1";

describe("runSyncJob orphaned running jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // executeSyncJob (fired via void) bails out when the job is not found
    mockSyncJobFindUnique.mockResolvedValue(null);
    mockSyncJobUpdate.mockResolvedValue({});
    mockSyncStateUpsert.mockResolvedValue({});
    mockSyncStateUpdateMany.mockResolvedValue({ count: 1 }); // always wins the atomic claim
    mockSyncJobCreate.mockResolvedValue({
      id: "job-new",
      userId: USER_ID,
      jobType: "incremental",
      status: "pending",
    });
  });

  it("resets a running job whose process died and starts a new one", async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    mockSyncJobFindFirst.mockResolvedValue({
      id: "job-orphan",
      userId: USER_ID,
      status: "running",
      createdAt: threeHoursAgo,
      startedAt: threeHoursAgo,
    });

    const result = await runSyncJob(USER_ID, "incremental");

    expect(mockSyncJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-orphan" },
        data: expect.objectContaining({ status: "failed" }),
      }),
    );
    expect(mockSyncStateUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          lastSyncStatus: "failed",
          runningJobId: null,
        }),
      }),
    );
    expect(mockSyncJobCreate).toHaveBeenCalled();
    expect(result.jobId).toBe("job-new");
  });

  it("reuses a running job that is still within the running-stale window", async () => {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    mockSyncJobFindFirst.mockResolvedValue({
      id: "job-live",
      userId: USER_ID,
      status: "running",
      createdAt: oneMinuteAgo,
      startedAt: oneMinuteAgo,
    });

    const result = await runSyncJob(USER_ID, "incremental");

    expect(result.jobId).toBe("job-live");
    expect(mockSyncJobCreate).not.toHaveBeenCalled();
    expect(mockSyncJobUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed" }),
      }),
    );
  });
});

describe("runSyncJob concurrent-caller dedup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSyncJobFindUnique.mockResolvedValue(null);
    mockSyncJobUpdate.mockResolvedValue({});
    mockSyncStateUpsert.mockResolvedValue({});
    // Both callers' findFirst races before either has created a job yet.
    mockSyncJobFindFirst.mockResolvedValue(null);
  });

  it("only creates one SyncJob when two callers race findFirst→create with nothing existing yet", async () => {
    // Both callers' very first findFirst — before either has created
    // anything — sees no job at all. This is the actual race: without the
    // atomic claim, both would fall straight through to create().
    // Call order (A runs to completion before B starts, so it's
    // deterministic): 1) A's initial findFirst, 2) B's initial findFirst,
    // 3) B's fallback lookup after it loses the claim — by which point A's
    // job genuinely exists.
    const winnerJob = { id: "job-winner", userId: USER_ID, status: "pending", createdAt: new Date() };
    mockSyncJobFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winnerJob);

    // Simulates the real DB: userId is SyncState's unique key, so only the
    // first updateMany actually matches a row (or, for a first-ever sync,
    // only the first create succeeds and the second hits SyncState's real
    // unique constraint) — here that's the first call in program order.
    mockSyncStateUpdateMany
      .mockResolvedValueOnce({ count: 1 }) // caller A claims it
      .mockResolvedValueOnce({ count: 0 }); // caller B loses the claim
    mockSyncStateFindUnique.mockResolvedValue({ userId: USER_ID, lastSyncStatus: "pending" });
    mockSyncJobCreate.mockResolvedValue({ id: "job-winner", userId: USER_ID, jobType: "incremental", status: "pending" });

    const resultA = await runSyncJob(USER_ID, "incremental");
    const resultB = await runSyncJob(USER_ID, "incremental");

    expect(mockSyncJobCreate).toHaveBeenCalledTimes(1);
    expect(resultA.jobId).toBe("job-winner");
    expect(resultB.jobId).toBe("job-winner");
  });
});
