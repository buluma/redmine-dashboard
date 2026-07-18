import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockIssueFindFirst,
  mockIssueFindUnique,
  mockIssueUpsert,
  mockIssueJournalUpsert,
  mockIssueAttachmentDeleteMany,
  mockIssueRelationDeleteMany,
  mockTimeEntryUpsert,
  mockTimeEntryDeleteMany,
  mockTimeEntryAggregate,
  mockIssueActivityEventUpsert,
  mockIssueActivityEventFindFirst,
  mockIssueUpdate,
} = vi.hoisted(() => ({
  mockIssueFindFirst: vi.fn(),
  mockIssueFindUnique: vi.fn(),
  mockIssueUpsert: vi.fn(),
  mockIssueJournalUpsert: vi.fn(),
  mockIssueAttachmentDeleteMany: vi.fn(),
  mockIssueRelationDeleteMany: vi.fn(),
  mockTimeEntryUpsert: vi.fn(),
  mockTimeEntryDeleteMany: vi.fn(),
  mockTimeEntryAggregate: vi.fn(),
  mockIssueActivityEventUpsert: vi.fn(),
  mockIssueActivityEventFindFirst: vi.fn(),
  mockIssueUpdate: vi.fn(),
}));

vi.mock("@/src/lib/db", () => ({
  prisma: {
    issue: {
      findFirst: mockIssueFindFirst,
      findUnique: mockIssueFindUnique,
      upsert: mockIssueUpsert,
      update: mockIssueUpdate,
    },
    issueJournal: { upsert: mockIssueJournalUpsert },
    issueAttachment: { deleteMany: mockIssueAttachmentDeleteMany },
    issueRelation: { deleteMany: mockIssueRelationDeleteMany },
    timeEntry: { upsert: mockTimeEntryUpsert, deleteMany: mockTimeEntryDeleteMany, aggregate: mockTimeEntryAggregate },
    issueActivityEvent: { upsert: mockIssueActivityEventUpsert, findFirst: mockIssueActivityEventFindFirst },
  },
}));

vi.mock("@/src/lib/log", () => ({ logEvent: vi.fn() }));
vi.mock("@/src/lib/telemetry", () => ({ trackFailure: vi.fn() }));

import { syncSingleIssue } from "@/src/lib/sync";

const USER_ID = "user-1";
const REMOTE_ISSUE_ID = 115882;

function fakeIssueDetail(overrides: Record<string, unknown> = {}) {
  return {
    issue: {
      id: REMOTE_ISSUE_ID,
      subject: "Week 29 DRC Support",
      status: { id: 1, name: "New" },
      priority: { id: 5, name: "High" },
      project: { id: 7, name: "Streamline" },
      tracker: { id: 10, name: "Subtask" },
      spent_hours: 0,
      updated_on: "2026-07-17T00:00:00Z",
      ...overrides,
    },
  };
}

function fakeClient(overrides: Partial<{ getIssue: unknown; listIssueTimeEntries: unknown }> = {}) {
  return {
    normalizedBaseUrl: "https://redmine.example.com",
    getIssue: vi.fn().mockResolvedValue(fakeIssueDetail()),
    listIssueTimeEntries: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as Parameters<typeof syncSingleIssue>[1];
}

describe("syncSingleIssue — hybrid local mirror (recurring tickets)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIssueFindUnique.mockResolvedValue({ id: "local-issue-1" });
    mockIssueUpsert.mockResolvedValue({
      id: "local-issue-1",
      redmineIssueId: REMOTE_ISSUE_ID,
      subject: "Week 29 DRC Support",
      statusName: "New",
      priority: "High",
      projectName: "Streamline",
      createdAt: new Date(),
    });
    mockIssueActivityEventFindFirst.mockResolvedValue(null);
    mockTimeEntryAggregate.mockResolvedValue({ _sum: { hours: 0 } });
  });

  it("skips the time-entry pull for a source:local row with a real redmineIssueId, but still syncs issue fields", async () => {
    mockIssueFindFirst.mockResolvedValue({ id: "local-issue-1", source: "local" });
    const client = fakeClient();

    await syncSingleIssue(USER_ID, client, REMOTE_ISSUE_ID);

    // Issue fields (status, subject, priority, etc.) DO sync normally.
    expect(mockIssueUpsert).toHaveBeenCalled();
    // But the time-entry pull — which would prune unpushed WakaTime hours — is skipped.
    expect(client.listIssueTimeEntries).not.toHaveBeenCalled();
    expect(mockTimeEntryUpsert).not.toHaveBeenCalled();
    expect(mockTimeEntryDeleteMany).not.toHaveBeenCalled();
  });

  it("recomputes spentHours from local TimeEntry rows instead of leaving Redmine's (possibly lower) value", async () => {
    mockIssueFindFirst.mockResolvedValue({ id: "local-issue-1", source: "local" });
    // Local TimeEntry rows sum to 4.25h, but Redmine only knows about what's
    // been pushed so far — the mirror's spentHours must reflect the local total.
    mockTimeEntryAggregate.mockResolvedValue({ _sum: { hours: 4.25 } });
    const client = fakeClient();

    await syncSingleIssue(USER_ID, client, REMOTE_ISSUE_ID);

    expect(mockTimeEntryAggregate).toHaveBeenCalledWith({
      where: { issueId: "local-issue-1" },
      _sum: { hours: true },
    });
    expect(mockIssueUpdate).toHaveBeenCalledWith({
      where: { id: "local-issue-1" },
      data: { spentHours: 4.25 },
    });
  });

  it("does NOT recompute spentHours for an ordinary source:redmine issue", async () => {
    mockIssueFindFirst.mockResolvedValue(null);
    const client = fakeClient();

    await syncSingleIssue(USER_ID, client, REMOTE_ISSUE_ID);

    expect(mockTimeEntryAggregate).not.toHaveBeenCalled();
  });

  it("still never sends source in the upsert payload, so the row stays source:local", async () => {
    mockIssueFindFirst.mockResolvedValue({ id: "local-issue-1", source: "local" });
    const client = fakeClient();

    await syncSingleIssue(USER_ID, client, REMOTE_ISSUE_ID);

    const [upsertCall] = mockIssueUpsert.mock.calls;
    expect(upsertCall[0].update).not.toHaveProperty("source");
    expect(upsertCall[0].create).not.toHaveProperty("source");
  });

  it("runs the normal time-entry pull for an ordinary source:redmine issue", async () => {
    mockIssueFindFirst.mockResolvedValue(null);
    const client = fakeClient();

    await syncSingleIssue(USER_ID, client, REMOTE_ISSUE_ID);

    expect(client.listIssueTimeEntries).toHaveBeenCalledWith(REMOTE_ISSUE_ID);
  });
});
