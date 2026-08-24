import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  mockSyncJobFindUnique,
  mockSyncJobUpdate,
  mockSyncStateUpsert,
  mockSyncStateFindUnique,
  mockCredentialFindUnique,
  mockStatusCatalogUpsert,
  mockEnumerationCatalogUpsert,
  mockIssueFindMany,
  mockIssueFindFirst,
} = vi.hoisted(() => ({
  mockSyncJobFindUnique: vi.fn(),
  mockSyncJobUpdate: vi.fn(),
  mockSyncStateUpsert: vi.fn(),
  mockSyncStateFindUnique: vi.fn(),
  mockCredentialFindUnique: vi.fn(),
  mockStatusCatalogUpsert: vi.fn(),
  mockEnumerationCatalogUpsert: vi.fn(),
  mockIssueFindMany: vi.fn(),
  mockIssueFindFirst: vi.fn(),
}));

vi.mock("@/src/lib/db", () => ({
  prisma: {
    syncJob: { findUnique: mockSyncJobFindUnique, update: mockSyncJobUpdate },
    syncState: { upsert: mockSyncStateUpsert, findUnique: mockSyncStateFindUnique },
    userRedmineCredential: { findUnique: mockCredentialFindUnique },
    statusCatalog: { upsert: mockStatusCatalogUpsert },
    enumerationCatalog: { upsert: mockEnumerationCatalogUpsert },
    issue: { findMany: mockIssueFindMany, findFirst: mockIssueFindFirst },
  },
}));

vi.mock("@/src/lib/env", () => ({
  env: { redmineSyncIssueScope: "open", slackNotifyEnabled: false },
}));
vi.mock("@/src/lib/log", () => ({ logEvent: vi.fn() }));
vi.mock("@/src/lib/event-bus", () => ({ emitEvent: vi.fn() }));
vi.mock("@/src/lib/telemetry", () => ({ trackFailure: vi.fn() }));
vi.mock("@/src/lib/crypto", () => ({ decryptText: vi.fn().mockReturnValue("fake-api-key") }));
vi.mock("@/src/lib/activity-index", () => ({
  recordIssueActivityEvent: vi.fn(),
  recomputeIssueActivityIndex: vi.fn(),
}));

const listIssuesMock = vi.fn().mockResolvedValue([]); // no issues — isolates the watermark timing
const getIssueMock = vi.fn();
vi.mock("@/src/lib/redmine", () => ({
  RedmineClient: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.normalizedBaseUrl = "https://redmine.example.com";
    this.getIssueStatuses = vi.fn().mockResolvedValue([]);
    this.getTimeEntryActivities = vi.fn().mockResolvedValue([]);
    this.getIssuePriorities = vi.fn().mockResolvedValue([]);
    this.listIssues = listIssuesMock;
    this.getIssue = getIssueMock;
  }),
}));

import { executeSyncJob, isUnchangedSinceLastSync } from "@/src/lib/sync";

const USER_ID = "user-1";
const JOB_ID = "job-1";

describe("isUnchangedSinceLastSync", () => {
  it("is unchanged when both timestamps are present and equal", () => {
    const t = new Date("2026-06-20T10:00:00Z");
    expect(isUnchangedSinceLastSync(new Date(t), new Date(t))).toBe(true);
  });

  it("is changed when the remote timestamp is newer", () => {
    expect(
      isUnchangedSinceLastSync(new Date("2026-06-20T11:00:00Z"), new Date("2026-06-20T10:00:00Z"))
    ).toBe(false);
  });

  it("is changed when there's nothing cached yet (first sync)", () => {
    expect(isUnchangedSinceLastSync(new Date("2026-06-20T10:00:00Z"), undefined)).toBe(false);
  });

  it("is changed when the remote timestamp is missing/unparseable", () => {
    expect(isUnchangedSinceLastSync(null, new Date("2026-06-20T10:00:00Z"))).toBe(false);
  });
});

describe("executeSyncJob incremental watermark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listIssuesMock.mockResolvedValue([]);
    mockIssueFindMany.mockResolvedValue([]);
    mockSyncJobFindUnique.mockResolvedValue({
      id: JOB_ID,
      userId: USER_ID,
      jobType: "incremental",
      status: "pending",
    });
    mockSyncJobUpdate.mockResolvedValue({});
    mockSyncStateUpsert.mockResolvedValue({});
    mockCredentialFindUnique.mockResolvedValue({
      userId: USER_ID,
      isActive: true,
      baseUrl: "https://redmine.example.com",
      apiKeyEncrypted: "enc",
      apiKeyIv: "iv",
    });
  });

  it("stamps lastIncrementalSyncAt with the time the fetch started, not the time the job finished", async () => {
    mockSyncStateFindUnique.mockResolvedValue({ lastIncrementalSyncAt: null });

    const beforeFetch = Date.now();
    // Redmine's listIssues call is where "the fetch" happens — simulate work
    // taking real time after that point so start-time and completion-time
    // would produce visibly different stamps if the bug were still present.
    listIssuesMock.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return [];
    });

    await executeSyncJob(JOB_ID);
    const afterFetch = Date.now();

    const successCall = mockSyncStateUpsert.mock.calls.find(
      (call) => call[0]?.update?.lastSyncStatus === "success"
    );
    expect(successCall).toBeDefined();
    const stampedAt = (successCall![0].update.lastIncrementalSyncAt as Date).getTime();

    // Must be pinned to before listIssues() ran, not after.
    expect(stampedAt).toBeGreaterThanOrEqual(beforeFetch);
    expect(stampedAt).toBeLessThan(afterFetch);
  });
});

describe("executeSyncJob skips unchanged issues on incremental ticks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSyncJobUpdate.mockResolvedValue({});
    mockSyncStateUpsert.mockResolvedValue({});
    mockSyncStateFindUnique.mockResolvedValue({ lastIncrementalSyncAt: null });
    mockCredentialFindUnique.mockResolvedValue({
      userId: USER_ID,
      isActive: true,
      baseUrl: "https://redmine.example.com",
      apiKeyEncrypted: "enc",
      apiKeyIv: "iv",
    });
  });

  it("never fetches full detail for an issue whose updated_on matches the cached value (incremental)", async () => {
    mockSyncJobFindUnique.mockResolvedValue({
      id: JOB_ID, userId: USER_ID, jobType: "incremental", status: "pending",
    });
    const updatedOn = "2026-06-20T10:00:00Z";
    listIssuesMock.mockResolvedValue([{ id: 42, updated_on: updatedOn }]);
    mockIssueFindMany.mockResolvedValue([{ redmineIssueId: 42, updatedOnRemote: new Date(updatedOn) }]);
    mockIssueFindFirst.mockResolvedValue(null); // not a hybrid mirror — only reached if the skip fails

    await executeSyncJob(JOB_ID);

    expect(mockIssueFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: USER_ID,
          redmineBaseUrl: "https://redmine.example.com",
          redmineIssueId: { in: [42] },
        }),
      })
    );
    expect(getIssueMock).not.toHaveBeenCalled();
  });

  it("never attempts the cached-lookup shortcut on a full_manual job", async () => {
    mockSyncJobFindUnique.mockResolvedValue({
      id: JOB_ID, userId: USER_ID, jobType: "full_manual", status: "pending",
    });
    listIssuesMock.mockResolvedValue([]);

    await executeSyncJob(JOB_ID);

    expect(mockIssueFindMany).not.toHaveBeenCalled();
  });
});
