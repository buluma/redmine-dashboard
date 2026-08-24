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
  mockIssueFindUnique,
  mockIssueUpsert,
  mockIssueAttachmentDeleteMany,
  mockIssueRelationDeleteMany,
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
  mockIssueFindUnique: vi.fn(),
  mockIssueUpsert: vi.fn(),
  mockIssueAttachmentDeleteMany: vi.fn(),
  mockIssueRelationDeleteMany: vi.fn(),
}));

vi.mock("@/src/lib/db", () => ({
  prisma: {
    syncJob: { findUnique: mockSyncJobFindUnique, update: mockSyncJobUpdate },
    syncState: { upsert: mockSyncStateUpsert, findUnique: mockSyncStateFindUnique },
    userRedmineCredential: { findUnique: mockCredentialFindUnique },
    statusCatalog: { upsert: mockStatusCatalogUpsert },
    enumerationCatalog: { upsert: mockEnumerationCatalogUpsert },
    issue: {
      findMany: mockIssueFindMany,
      findFirst: mockIssueFindFirst,
      findUnique: mockIssueFindUnique,
      upsert: mockIssueUpsert,
    },
    issueAttachment: { deleteMany: mockIssueAttachmentDeleteMany },
    issueRelation: { deleteMany: mockIssueRelationDeleteMany },
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
    this.listIssueTimeEntries = vi.fn().mockResolvedValue([]);
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

describe("executeSyncJob isolates a single issue's failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSyncJobUpdate.mockResolvedValue({});
    mockSyncStateUpsert.mockResolvedValue({});
    mockSyncStateFindUnique.mockResolvedValue({ lastIncrementalSyncAt: null });
    mockIssueFindMany.mockResolvedValue([]); // nothing cached — every issue is "changed"
    mockIssueFindFirst.mockResolvedValue(null); // not a hybrid mirror
    mockIssueFindUnique.mockResolvedValue(null); // existingBeforeUpsert — treat every issue as newly-created
    mockIssueUpsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
      id: `local-${create.redmineIssueId}`,
      redmineIssueId: create.redmineIssueId,
      subject: create.subject,
      statusName: create.statusName,
    }));
    mockIssueAttachmentDeleteMany.mockResolvedValue({ count: 0 });
    mockIssueRelationDeleteMany.mockResolvedValue({ count: 0 });
    mockCredentialFindUnique.mockResolvedValue({
      userId: USER_ID,
      isActive: true,
      baseUrl: "https://redmine.example.com",
      apiKeyEncrypted: "enc",
      apiKeyIv: "iv",
    });
    mockSyncJobFindUnique.mockResolvedValue({
      id: JOB_ID, userId: USER_ID, jobType: "incremental", status: "pending",
    });
  });

  it("keeps syncing the rest of the batch after one issue throws, and still ends the job as success", async () => {
    listIssuesMock.mockResolvedValue([
      { id: 1, updated_on: "2026-06-20T10:00:00Z" },
      { id: 2, updated_on: "2026-06-20T10:00:00Z" },
      { id: 3, updated_on: "2026-06-20T10:00:00Z" },
    ]);
    // Issue 2's own detail fetch fails (persistent timeout, malformed
    // payload, etc.) — issues 1 and 3 must still sync.
    getIssueMock.mockImplementation(async (remoteId: number) => {
      if (remoteId === 2) throw new Error("Redmine timeout");
      return { issue: { id: remoteId, subject: `Issue ${remoteId}`, status: { id: 1, name: "New" } } };
    });

    await executeSyncJob(JOB_ID);

    // Issue 1 and 3 both actually synced (a real DB upsert happened) — the
    // loop didn't abort when issue 2 threw partway through the batch.
    expect(mockIssueUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ redmineIssueId: 1 }) })
    );
    expect(mockIssueUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ redmineIssueId: 3 }) })
    );
    // Issue 2 never made it to upsert — it failed before that point.
    expect(mockIssueUpsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ redmineIssueId: 2 }) })
    );

    const jobUpdateCall = mockSyncJobUpdate.mock.calls.find((call) => call[0]?.data?.status === "success");
    expect(jobUpdateCall).toBeDefined();
    // The failure isn't silently discarded — it's surfaced on the otherwise-successful job.
    expect(jobUpdateCall![0].data.error).toBe("1 issue(s) failed to sync this run: 2");
    expect(mockSyncJobUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) })
    );
  });
});
