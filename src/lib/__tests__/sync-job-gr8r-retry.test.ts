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

const { mockEnv, mockRetryFailedGr8rPushes } = vi.hoisted(() => ({
  mockEnv: {
    redmineSyncIssueScope: "open",
    slackNotifyEnabled: false,
    gr8rUrl: "http://gr8r.test:8787" as string | undefined,
    gr8rToken: "t" as string | undefined,
  },
  mockRetryFailedGr8rPushes: vi.fn(),
}));
vi.mock("@/src/lib/env", () => ({ env: mockEnv }));
vi.mock("@/src/lib/gr8r-task-push", () => ({ retryFailedGr8rPushes: mockRetryFailedGr8rPushes }));
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
    this.baseUrl = "https://redmine.example.com";
    this.getIssueStatuses = vi.fn().mockResolvedValue([]);
    this.getTimeEntryActivities = vi.fn().mockResolvedValue([]);
    this.getIssuePriorities = vi.fn().mockResolvedValue([]);
    this.listIssues = listIssuesMock;
    this.getIssue = getIssueMock;
    this.listIssueTimeEntries = vi.fn().mockResolvedValue([]);
  }),
}));

import { executeSyncJob } from "@/src/lib/sync";

const USER_ID = "user-1";
const JOB_ID = "job-1";

describe("executeSyncJob retries failed gr8r pushes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.gr8rToken = "t";
    listIssuesMock.mockResolvedValue([]);
    mockIssueFindMany.mockResolvedValue([]);
    mockSyncJobFindUnique.mockResolvedValue({ id: JOB_ID, userId: USER_ID, jobType: "incremental", status: "pending" });
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
    mockRetryFailedGr8rPushes.mockResolvedValue({ retried: 0, pushed: 0, recovered: 0, dropped: 0, failed: 0 });
  });

  it("runs the retry sweep for the job's user with its Redmine client", async () => {
    await executeSyncJob(JOB_ID);
    expect(mockRetryFailedGr8rPushes).toHaveBeenCalledTimes(1);
    expect(mockRetryFailedGr8rPushes).toHaveBeenCalledWith({
      userId: USER_ID,
      client: expect.objectContaining({ normalizedBaseUrl: "https://redmine.example.com" }),
    });
    expect(mockSyncJobUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "success" }) }));
  });

  it("skips the sweep when gr8r isn't configured", async () => {
    mockEnv.gr8rToken = undefined;
    await executeSyncJob(JOB_ID);
    expect(mockRetryFailedGr8rPushes).not.toHaveBeenCalled();
  });
});
