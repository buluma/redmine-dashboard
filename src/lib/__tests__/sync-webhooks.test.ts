import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockIssueFindFirst,
  mockIssueFindUnique,
  mockIssueUpsert,
  mockTimeEntryAggregate,
  mockIssueActivityEventFindFirst,
  mockDispatchWebhook,
  mockSendPushNotification,
  mockNotifyIssueChanges,
} = vi.hoisted(() => ({
  mockIssueFindFirst: vi.fn(),
  mockIssueFindUnique: vi.fn(),
  mockIssueUpsert: vi.fn(),
  mockTimeEntryAggregate: vi.fn(),
  mockIssueActivityEventFindFirst: vi.fn(),
  mockDispatchWebhook: vi.fn(),
  mockSendPushNotification: vi.fn(),
  mockNotifyIssueChanges: vi.fn(),
}));

vi.mock("@/src/lib/db", () => ({
  prisma: {
    issue: { findFirst: mockIssueFindFirst, findUnique: mockIssueFindUnique, upsert: mockIssueUpsert, update: vi.fn() },
    issueJournal: { upsert: vi.fn() },
    issueAttachment: { deleteMany: vi.fn() },
    issueRelation: { deleteMany: vi.fn() },
    timeEntry: { upsert: vi.fn(), deleteMany: vi.fn(), aggregate: mockTimeEntryAggregate },
    issueActivityEvent: { upsert: vi.fn(), findFirst: mockIssueActivityEventFindFirst },
  },
}));

vi.mock("@/src/lib/webhook-subscription", () => ({ dispatchWebhook: mockDispatchWebhook }));
vi.mock("@/src/lib/push", () => ({ sendPushNotification: mockSendPushNotification }));
vi.mock("@/src/lib/slack-notification-service", () => ({
  getSlackNotificationService: () => ({ toIssueState: (i: unknown) => i, notifyIssueChanges: mockNotifyIssueChanges }),
}));
vi.mock("@/src/lib/log", () => ({ logEvent: vi.fn() }));
vi.mock("@/src/lib/telemetry", () => ({ trackFailure: vi.fn() }));

import { syncSingleIssue } from "@/src/lib/sync/single-issue";

const USER_ID = "user-1";
const REMOTE_ISSUE_ID = 4321;

function fakeClient(statusName = "New") {
  return {
    normalizedBaseUrl: "https://redmine.example.com",
    getIssue: vi.fn().mockResolvedValue({
      issue: {
        id: REMOTE_ISSUE_ID,
        subject: "Fix the DRC export",
        status: { id: 2, name: statusName },
        priority: { id: 5, name: "High" },
        project: { id: 7, name: "Streamline" },
        updated_on: "2026-11-21T09:00:00Z",
      },
    }),
    listIssueTimeEntries: vi.fn().mockResolvedValue([]),
  } as unknown as Parameters<typeof syncSingleIssue>[1];
}

function syncedIssue(statusName: string) {
  return {
    id: "issue-1",
    redmineIssueId: REMOTE_ISSUE_ID,
    subject: "Fix the DRC export",
    statusName,
    priority: "High",
    projectName: "Streamline",
    assignedToName: "MBU",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("syncSingleIssue → outbound webhooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIssueFindFirst.mockResolvedValue(null);
    mockIssueActivityEventFindFirst.mockResolvedValue(null);
    mockTimeEntryAggregate.mockResolvedValue({ _sum: { hours: 0 } });
  });

  it("dispatches ticket.created with Slack notifications off", async () => {
    mockIssueFindUnique.mockResolvedValue(null);
    mockIssueUpsert.mockResolvedValue(syncedIssue("New"));

    await syncSingleIssue(USER_ID, fakeClient(), REMOTE_ISSUE_ID, { sendNotifications: false, sendWebhooks: true });

    expect(mockDispatchWebhook).toHaveBeenCalledWith(
      "ticket.created",
      expect.objectContaining({ redmineIssueId: REMOTE_ISSUE_ID }),
      undefined,
      USER_ID,
    );
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(mockNotifyIssueChanges).not.toHaveBeenCalled();
  });

  it("still detects what changed for ticket.status_changed with Slack notifications off", async () => {
    mockIssueFindUnique.mockResolvedValue({
      id: "issue-1",
      statusName: "New",
      priority: "High",
      assignedToName: "MBU",
      subject: "Fix the DRC export",
      dueDate: null,
      doneRatio: 0,
    });
    mockIssueUpsert.mockResolvedValue(syncedIssue("In Progress"));

    await syncSingleIssue(USER_ID, fakeClient("In Progress"), REMOTE_ISSUE_ID, { sendNotifications: false, sendWebhooks: true });

    expect(mockDispatchWebhook).toHaveBeenCalledWith(
      "ticket.status_changed",
      expect.anything(),
      [{ field: "status", oldValue: "New", newValue: "In Progress" }],
      USER_ID,
    );
  });

  it("sends no webhooks when the caller doesn't ask for them, even with notifications on", async () => {
    mockIssueFindUnique.mockResolvedValue(null);
    mockIssueUpsert.mockResolvedValue(syncedIssue("New"));
    mockNotifyIssueChanges.mockResolvedValue(null);

    await syncSingleIssue(USER_ID, fakeClient(), REMOTE_ISSUE_ID, { sendNotifications: true });

    expect(mockDispatchWebhook).not.toHaveBeenCalled();
    expect(mockNotifyIssueChanges).toHaveBeenCalled();
  });
});
