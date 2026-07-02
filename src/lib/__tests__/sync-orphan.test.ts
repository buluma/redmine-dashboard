import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  mockSyncJobFindFirst,
  mockSyncJobFindUnique,
  mockSyncJobCreate,
  mockSyncJobUpdate,
  mockSyncStateUpsert,
} = vi.hoisted(() => ({
  mockSyncJobFindFirst: vi.fn(),
  mockSyncJobFindUnique: vi.fn(),
  mockSyncJobCreate: vi.fn(),
  mockSyncJobUpdate: vi.fn(),
  mockSyncStateUpsert: vi.fn(),
}));

vi.mock("@/src/lib/db", () => ({
  prisma: {
    syncJob: {
      findFirst: mockSyncJobFindFirst,
      findUnique: mockSyncJobFindUnique,
      create: mockSyncJobCreate,
      update: mockSyncJobUpdate,
    },
    syncState: { upsert: mockSyncStateUpsert },
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
