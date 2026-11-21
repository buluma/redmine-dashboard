import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockIssueFindFirst,
  mockIssueFindUnique,
  mockIssueUpsert,
  mockIssueUpdate,
  mockTimeEntryAggregate,
  mockIssueActivityEventFindFirst,
  mockPushIssueToGr8r,
  mockGr8rEnv,
} = vi.hoisted(() => ({
  mockIssueFindFirst: vi.fn(),
  mockIssueFindUnique: vi.fn(),
  mockIssueUpsert: vi.fn(),
  mockIssueUpdate: vi.fn(),
  mockTimeEntryAggregate: vi.fn(),
  mockIssueActivityEventFindFirst: vi.fn(),
  mockPushIssueToGr8r: vi.fn(),
  mockGr8rEnv: { gr8rUrl: "http://gr8r.test:8787" as string | undefined, gr8rToken: "t" as string | undefined },
}));

vi.mock("@/src/lib/db", () => ({
  prisma: {
    issue: { findFirst: mockIssueFindFirst, findUnique: mockIssueFindUnique, upsert: mockIssueUpsert, update: mockIssueUpdate },
    issueJournal: { upsert: vi.fn() },
    issueAttachment: { deleteMany: vi.fn() },
    issueRelation: { deleteMany: vi.fn() },
    timeEntry: { upsert: vi.fn(), deleteMany: vi.fn(), aggregate: mockTimeEntryAggregate },
    issueActivityEvent: { upsert: vi.fn(), findFirst: mockIssueActivityEventFindFirst },
  },
}));

vi.mock("@/src/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/env")>();
  return {
    env: new Proxy(actual.env, {
      get: (target, key) => (key in mockGr8rEnv ? mockGr8rEnv[key as keyof typeof mockGr8rEnv] : Reflect.get(target, key)),
    }),
  };
});
vi.mock("@/src/lib/gr8r-task-push", () => ({ pushIssueToGr8r: mockPushIssueToGr8r }));
vi.mock("@/src/lib/log", () => ({ logEvent: vi.fn() }));
vi.mock("@/src/lib/telemetry", () => ({ trackFailure: vi.fn() }));

import { syncSingleIssue } from "@/src/lib/sync/single-issue";

const USER_ID = "user-1";
const REMOTE_ISSUE_ID = 4321;

function fakeClient() {
  return {
    normalizedBaseUrl: "https://redmine.example.com",
    getIssue: vi.fn().mockResolvedValue({
      issue: {
        id: REMOTE_ISSUE_ID,
        subject: "Fix the DRC export",
        status: { id: 1, name: "New" },
        priority: { id: 5, name: "High" },
        project: { id: 7, name: "Streamline" },
        assigned_to: { id: 194, name: "MBU" },
        updated_on: "2026-11-21T09:00:00Z",
      },
    }),
    listIssueTimeEntries: vi.fn().mockResolvedValue([]),
  } as unknown as Parameters<typeof syncSingleIssue>[1];
}

const syncedIssue = { id: "issue-1", redmineIssueId: REMOTE_ISSUE_ID, subject: "Fix the DRC export", statusName: "New", assignedToId: 194 };

describe("syncSingleIssue → gr8r push", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGr8rEnv.gr8rUrl = "http://gr8r.test:8787";
    mockGr8rEnv.gr8rToken = "t";
    mockIssueFindFirst.mockResolvedValue(null);
    mockIssueFindUnique.mockResolvedValue({ id: "issue-1", assignedToId: 210 });
    mockIssueUpsert.mockResolvedValue({ ...syncedIssue, createdAt: new Date() });
    mockIssueActivityEventFindFirst.mockResolvedValue(null);
    mockTimeEntryAggregate.mockResolvedValue({ _sum: { hours: 0 } });
    mockPushIssueToGr8r.mockResolvedValue({ pushed: false, reason: "not-newly-assigned" });
  });

  it("hands the upserted ticket and its previous assignee to the gr8r push, even with notifications off", async () => {
    const client = fakeClient();
    await syncSingleIssue(USER_ID, client, REMOTE_ISSUE_ID, { sendNotifications: false });

    expect(mockIssueFindUnique).toHaveBeenCalledWith({
      where: {
        userId_redmineBaseUrl_redmineIssueId: {
          userId: USER_ID,
          redmineBaseUrl: "https://redmine.example.com",
          redmineIssueId: REMOTE_ISSUE_ID,
        },
      },
      select: { assignedToId: true },
    });
    expect(mockPushIssueToGr8r).toHaveBeenCalledTimes(1);
    expect(mockPushIssueToGr8r).toHaveBeenCalledWith({
      userId: USER_ID,
      client,
      issue: expect.objectContaining({ id: "issue-1", assignedToId: 194 }),
      wasCreated: false,
      previousAssignedToId: 210,
    });
  });

  it("passes no previous assignee for a ticket Converge hasn't cached yet", async () => {
    mockIssueFindUnique.mockResolvedValue(null);
    await syncSingleIssue(USER_ID, fakeClient(), REMOTE_ISSUE_ID);
    expect(mockPushIssueToGr8r).toHaveBeenCalledWith(
      expect.objectContaining({ wasCreated: true, previousAssignedToId: null }),
    );
  });

  it("does not push recurring-ticket hybrid mirrors", async () => {
    mockIssueFindFirst.mockResolvedValue({ id: "issue-1", source: "local" });
    await syncSingleIssue(USER_ID, fakeClient(), REMOTE_ISSUE_ID);
    expect(mockPushIssueToGr8r).not.toHaveBeenCalled();
  });

  it("does nothing extra when gr8r isn't configured", async () => {
    mockGr8rEnv.gr8rToken = undefined;
    await syncSingleIssue(USER_ID, fakeClient(), REMOTE_ISSUE_ID);
    expect(mockPushIssueToGr8r).not.toHaveBeenCalled();
    expect(mockIssueFindUnique).not.toHaveBeenCalledWith(expect.objectContaining({ select: { assignedToId: true } }));
  });
});
