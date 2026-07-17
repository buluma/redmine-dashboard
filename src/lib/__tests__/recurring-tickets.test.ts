import { describe, expect, it, vi, beforeEach } from "vitest";
import type { RedmineClient } from "@/src/lib/redmine";
import type { RecurringTicketInstance, RecurringTicketSeries } from "@prisma/client";

const {
  mockSeriesFindMany,
  mockInstanceFindUnique,
  mockInstanceFindMany,
  mockInstanceCreate,
  mockInstanceUpdate,
  mockIssueAggregate,
  mockIssueCreate,
  mockIssueFindUnique,
  mockIssueUpdate,
  mockGithubLinkDeleteMany,
  mockGithubLinkCreate,
  mockTimeEntryFindMany,
  mockTimeEntryUpdate,
  mockApplyTimeEntries,
} = vi.hoisted(() => ({
  mockSeriesFindMany: vi.fn(),
  mockInstanceFindUnique: vi.fn(),
  mockInstanceFindMany: vi.fn(),
  mockInstanceCreate: vi.fn(),
  mockInstanceUpdate: vi.fn(),
  mockIssueAggregate: vi.fn(),
  mockIssueCreate: vi.fn(),
  mockIssueFindUnique: vi.fn(),
  mockIssueUpdate: vi.fn(),
  mockGithubLinkDeleteMany: vi.fn(),
  mockGithubLinkCreate: vi.fn(),
  mockTimeEntryFindMany: vi.fn(),
  mockTimeEntryUpdate: vi.fn(),
  mockApplyTimeEntries: vi.fn(),
}));

vi.mock("@/src/lib/db", () => ({
  prisma: {
    recurringTicketSeries: { findMany: mockSeriesFindMany },
    recurringTicketInstance: {
      findUnique: mockInstanceFindUnique,
      findMany: mockInstanceFindMany,
      create: mockInstanceCreate,
      update: mockInstanceUpdate,
    },
    issue: {
      aggregate: mockIssueAggregate,
      create: mockIssueCreate,
      findUnique: mockIssueFindUnique,
      update: mockIssueUpdate,
    },
    issueGithubLink: { deleteMany: mockGithubLinkDeleteMany, create: mockGithubLinkCreate },
    timeEntry: { findMany: mockTimeEntryFindMany, update: mockTimeEntryUpdate },
  },
}));

vi.mock("@/src/lib/activity-index", () => ({
  recordIssueActivityEvent: vi.fn(),
  recomputeIssueActivityIndex: vi.fn(),
}));

vi.mock("@/src/lib/correlation", () => ({
  applyTimeEntries: mockApplyTimeEntries,
}));

import {
  computeIsoWeek,
  computePeriodKey,
  computeScheduledWindow,
  renderSubject,
  getDueSeriesForCreate,
  createInstance,
  getInstancesDueForClose,
  pushPendingWakaTimeEntriesToRedmine,
  closeInstance,
  runRecurringTicketsTick,
} from "@/src/lib/recurring-tickets";

const USER_ID = "user-1";

function fakeSeries(overrides: Partial<RecurringTicketSeries> = {}): RecurringTicketSeries {
  return {
    id: "series-1",
    userId: USER_ID,
    key: "drc-support",
    name: "DRC Support",
    isActive: true,
    redmineProjectId: 10,
    parentIssueId: 113554,
    trackerId: 3,
    priorityId: 2,
    categoryId: null,
    assignedToId: null,
    subjectTemplate: "Week {{week}} DRC Support",
    descriptionTemplate: null,
    estimatedHours: null,
    customFieldsJson: null,
    cadence: "weekly",
    createWeekday: 1,
    closeWeekday: 7,
    createDayOfMonth: 1,
    closeDayOfMonth: null,
    wakatimeProjectName: "drc-support",
    defaultActivityId: 9,
    defaultActivityName: "Development",
    expectsTime: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  } as RecurringTicketSeries;
}

function fakeInstance(overrides: Partial<RecurringTicketInstance> = {}): RecurringTicketInstance {
  return {
    id: "instance-1",
    seriesId: "series-1",
    userId: USER_ID,
    periodKey: "2026-W29",
    redmineIssueId: 9001,
    issueId: "issue-1",
    githubLinkId: "link-1",
    subject: "Week 29 DRC Support",
    scheduledCreateDate: new Date(Date.UTC(2026, 6, 13)),
    scheduledCloseDate: new Date(Date.UTC(2026, 6, 19)),
    status: "open",
    closeAttempts: 0,
    lastError: null,
    finalHoursApplied: null,
    createdAt: new Date("2026-07-13T00:00:00Z"),
    closedAt: null,
    ...overrides,
  } as RecurringTicketInstance;
}

function fakeClient(overrides: Partial<RedmineClient> = {}): RedmineClient {
  return {
    normalizedBaseUrl: "https://redmine.example.com",
    createIssue: vi.fn().mockResolvedValue({ id: 9001, url: "https://redmine.example.com/issues/9001" }),
    getCurrentUser: vi.fn().mockResolvedValue({ id: 194, login: "mbu", firstname: "M", lastname: "B" }),
    addTimeEntry: vi.fn().mockResolvedValue({ time_entry: { id: 555 } }),
    updateIssueStatus: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as RedmineClient;
}

describe("computeIsoWeek", () => {
  it("matches the known ISO week for 2026-07-17", () => {
    expect(computeIsoWeek(new Date("2026-07-17T00:00:00Z"))).toEqual({ isoYear: 2026, isoWeek: 29 });
  });

  it("matches the known ISO week for 2026-05-11 (Monday of week 20)", () => {
    expect(computeIsoWeek(new Date("2026-05-11T00:00:00Z"))).toEqual({ isoYear: 2026, isoWeek: 20 });
  });

  it("handles the year-boundary case where late-Dec dates fall in week 1 of the next year", () => {
    // 2025-12-29 is a Monday and belongs to ISO week 1 of 2026.
    expect(computeIsoWeek(new Date("2025-12-29T00:00:00Z"))).toEqual({ isoYear: 2026, isoWeek: 1 });
  });
});

describe("computePeriodKey", () => {
  it("returns an ISO week key for weekly cadence", () => {
    expect(computePeriodKey({ cadence: "weekly" }, new Date("2026-07-17T12:00:00Z"))).toBe("2026-W29");
  });

  it("returns a year-month key for monthly cadence", () => {
    expect(computePeriodKey({ cadence: "monthly" }, new Date("2026-07-17T12:00:00Z"))).toBe("2026-07");
  });

  it("uses the Nairobi calendar day, not UTC, near a day boundary", () => {
    // 22:30 UTC on 2026-07-19 (Sunday) is already 01:30 on 2026-07-20 (Monday) in Nairobi (UTC+3).
    expect(computePeriodKey({ cadence: "weekly" }, new Date("2026-07-19T22:30:00Z"))).toBe("2026-W30");
  });
});

describe("computeScheduledWindow", () => {
  it("computes Monday-create/Sunday-close dates for a weekly series", () => {
    const window = computeScheduledWindow(
      { cadence: "weekly", createWeekday: 1, closeWeekday: 7, createDayOfMonth: 1, closeDayOfMonth: null },
      "2026-W29",
    );
    expect(window.createDate.toISOString()).toBe("2026-07-13T00:00:00.000Z");
    expect(window.closeDate.toISOString()).toBe("2026-07-19T00:00:00.000Z");
  });

  it("defaults closeDayOfMonth to the last day of the month for a monthly series", () => {
    const window = computeScheduledWindow(
      { cadence: "monthly", createWeekday: 1, closeWeekday: 7, createDayOfMonth: 1, closeDayOfMonth: null },
      "2026-07",
    );
    expect(window.createDate.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(window.closeDate.toISOString()).toBe("2026-07-31T00:00:00.000Z");
  });

  it("clamps createDayOfMonth/closeDayOfMonth to shorter months", () => {
    const window = computeScheduledWindow(
      { cadence: "monthly", createWeekday: 1, closeWeekday: 7, createDayOfMonth: 31, closeDayOfMonth: 31 },
      "2026-02",
    );
    expect(window.createDate.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(window.closeDate.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });
});

describe("renderSubject", () => {
  it("renders the real DRC series subject", () => {
    expect(renderSubject("Week {{week}} DRC Support", { year: 2026, week: 29 })).toBe("Week 29 DRC Support");
  });

  it("renders the real Vodacom SL series subject", () => {
    expect(
      renderSubject("Week {{week}}: Support for Vodacom SL Users (MBU)", { year: 2026, week: 20 }),
    ).toBe("Week 20: Support for Vodacom SL Users (MBU)");
  });

  it("renders a monthly subject with monthName", () => {
    expect(
      renderSubject("{{monthName}} {{year}} Support", { year: 2026, month: 7, monthName: "July" }),
    ).toBe("July 2026 Support");
  });
});

describe("getDueSeriesForCreate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("includes a series whose scheduled create date has arrived and has no instance yet", async () => {
    mockSeriesFindMany.mockResolvedValue([fakeSeries()]);
    mockInstanceFindUnique.mockResolvedValue(null);

    const due = await getDueSeriesForCreate(USER_ID, new Date("2026-07-17T12:00:00Z"));

    expect(due).toHaveLength(1);
    expect(due[0].key).toBe("drc-support");
  });

  it("excludes a series that already has an instance for the current period", async () => {
    mockSeriesFindMany.mockResolvedValue([fakeSeries()]);
    mockInstanceFindUnique.mockResolvedValue(fakeInstance());

    const due = await getDueSeriesForCreate(USER_ID, new Date("2026-07-17T12:00:00Z"));

    expect(due).toHaveLength(0);
  });

  it("excludes a series whose scheduled create date hasn't arrived yet", async () => {
    // Today is Sunday 2026-07-19 in Nairobi terms but the current ISO week's
    // create day (Monday 2026-07-13) is already past — use next week's Monday
    // via a series with createWeekday pinned mid-week ahead of "today".
    mockSeriesFindMany.mockResolvedValue([fakeSeries({ createWeekday: 1 })]);
    mockInstanceFindUnique.mockResolvedValue(null);

    // 2026-07-12 (Sunday) is still within ISO week 28, whose Monday create
    // date (2026-07-06) has already passed — so instead exercise the
    // not-yet-due branch with a reference date that lands before its own
    // week's Monday: not reachable since Monday is the first day of the
    // week. Use createWeekday=7 (Sunday) with a Monday reference instead.
    mockSeriesFindMany.mockResolvedValue([fakeSeries({ createWeekday: 7 })]);
    const due = await getDueSeriesForCreate(USER_ID, new Date("2026-07-13T12:00:00Z")); // Monday of W29

    expect(due).toHaveLength(0);
  });
});

describe("createInstance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates the Redmine issue, local mirror issue, github link, and instance row", async () => {
    const client = fakeClient();
    mockIssueAggregate.mockResolvedValue({ _max: { localIssueNumber: 5 } });
    mockIssueCreate.mockResolvedValue({
      id: "issue-1",
      createdAt: new Date("2026-07-13T00:00:00Z"),
    });
    mockGithubLinkCreate.mockResolvedValue({ id: "link-1" });
    mockInstanceCreate.mockResolvedValue(fakeInstance());

    const series = fakeSeries({ customFieldsJson: [{ id: 20, value: "Major" }] });
    const instance = await createInstance(series, "2026-W29", client);

    expect(client.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Week 29 DRC Support",
        projectId: 10,
        priorityId: 2,
        trackerId: 3,
        customFields: [{ id: 20, value: "Major" }],
        parentIssueId: 113554,
        startDate: "2026-07-13",
        dueDate: "2026-07-19",
      }),
    );
    expect(mockIssueCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        source: "local",
        localIssueNumber: 6,
        redmineIssueId: 9001,
        subject: "Week 29 DRC Support",
      }),
    });
    expect(mockGithubLinkDeleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, repositoryFullName: "drc-support" },
    });
    expect(mockInstanceCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        seriesId: "series-1",
        periodKey: "2026-W29",
        redmineIssueId: 9001,
        issueId: "issue-1",
        status: "open",
      }),
    });
    expect(instance).toEqual(fakeInstance());
  });

  it("retries localIssueNumber allocation on a P2002 unique-constraint race", async () => {
    const client = fakeClient();
    mockIssueAggregate
      .mockResolvedValueOnce({ _max: { localIssueNumber: 5 } })
      .mockResolvedValueOnce({ _max: { localIssueNumber: 6 } });
    mockIssueCreate
      .mockRejectedValueOnce({ code: "P2002" })
      .mockResolvedValueOnce({ id: "issue-1", createdAt: new Date("2026-07-13T00:00:00Z") });
    mockGithubLinkCreate.mockResolvedValue({ id: "link-1" });
    mockInstanceCreate.mockResolvedValue(fakeInstance());

    await createInstance(fakeSeries(), "2026-W29", client);

    expect(mockIssueCreate).toHaveBeenCalledTimes(2);
    expect(mockIssueCreate).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ localIssueNumber: 7 }),
    });
  });
});

describe("getInstancesDueForClose", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queries open/close_failed instances due on or before the reference date", async () => {
    mockInstanceFindMany.mockResolvedValue([fakeInstance()]);

    const due = await getInstancesDueForClose(USER_ID, new Date("2026-07-19T12:00:00Z"));

    expect(mockInstanceFindMany).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        status: { in: ["open", "close_failed"] },
        scheduledCloseDate: { lte: new Date(Date.UTC(2026, 6, 19)) },
      },
      include: { series: true },
    });
    expect(due).toHaveLength(1);
  });
});

describe("pushPendingWakaTimeEntriesToRedmine", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pushes pending wakatime entries and stamps back the redmineTimeEntryId", async () => {
    const client = fakeClient();
    mockIssueFindUnique.mockResolvedValue({ redmineIssueId: 9001 });
    mockTimeEntryFindMany.mockResolvedValue([
      { id: "te-1", hours: 1.5, activityId: 9, comments: "WakaTime: drc-support 2026-07-13", spentOn: new Date("2026-07-13T00:00:00Z") },
    ]);

    const result = await pushPendingWakaTimeEntriesToRedmine("issue-1", client);

    expect(result).toEqual({ pushed: 1, hours: 1.5 });
    expect(client.addTimeEntry).toHaveBeenCalledWith({
      issueId: 9001,
      hours: 1.5,
      activityId: 9,
      comments: "WakaTime: drc-support 2026-07-13",
      spentOn: "2026-07-13",
    });
    expect(mockTimeEntryUpdate).toHaveBeenCalledWith({
      where: { id: "te-1" },
      data: { redmineTimeEntryId: 555 },
    });
  });

  it("returns zero when the local issue has no real Redmine id", async () => {
    mockIssueFindUnique.mockResolvedValue({ redmineIssueId: null });

    const result = await pushPendingWakaTimeEntriesToRedmine("issue-1", fakeClient());

    expect(result).toEqual({ pushed: 0, hours: 0 });
    expect(mockTimeEntryFindMany).not.toHaveBeenCalled();
  });
});

describe("closeInstance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApplyTimeEntries.mockResolvedValue({ created: 0, skipped: 0, totalHours: 0, entries: [] });
    mockIssueFindUnique.mockResolvedValue({ redmineIssueId: 9001 });
    mockTimeEntryFindMany.mockResolvedValue([]);
  });

  it("closes the Redmine ticket and marks the instance closed on success", async () => {
    const client = fakeClient();

    await closeInstance(fakeInstance(), client);

    expect(client.updateIssueStatus).toHaveBeenCalledWith(9001, 5, expect.any(String));
    expect(mockInstanceUpdate).toHaveBeenCalledWith({
      where: { id: "instance-1" },
      data: expect.objectContaining({ status: "closed", finalHoursApplied: 0 }),
    });
    expect(mockIssueUpdate).toHaveBeenCalledWith({
      where: { id: "issue-1" },
      data: expect.objectContaining({ statusId: 5, statusName: "Closed" }),
    });
  });

  it("falls back to Resolved and records lastError when Close fails", async () => {
    const client = fakeClient({
      updateIssueStatus: vi
        .fn()
        .mockRejectedValueOnce(new Error("only the author can close"))
        .mockResolvedValueOnce(undefined),
    });

    await closeInstance(fakeInstance(), client);

    expect(client.updateIssueStatus).toHaveBeenNthCalledWith(1, 9001, 5, expect.any(String));
    expect(client.updateIssueStatus).toHaveBeenNthCalledWith(2, 9001, 3, expect.stringContaining("only the author can close"));
    expect(mockInstanceUpdate).toHaveBeenCalledWith({
      where: { id: "instance-1" },
      data: expect.objectContaining({ status: "resolved_not_closed", lastError: "only the author can close" }),
    });
    expect(mockIssueUpdate).toHaveBeenCalledWith({
      where: { id: "issue-1" },
      data: expect.objectContaining({ statusId: 3, statusName: "Resolved" }),
    });
  });

  it("throws when the instance has no linked local issue", async () => {
    await expect(closeInstance(fakeInstance({ issueId: null }), fakeClient())).rejects.toThrow();
  });
});

describe("runRecurringTicketsTick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApplyTimeEntries.mockResolvedValue({ created: 0, skipped: 0, totalHours: 0, entries: [] });
  });

  it("aggregates a create and a close in one tick", async () => {
    const client = fakeClient();
    mockSeriesFindMany.mockResolvedValue([fakeSeries()]);
    mockInstanceFindUnique
      .mockResolvedValueOnce(null) // getDueSeriesForCreate's existence check
      .mockResolvedValueOnce(fakeInstance({ status: "closed", finalHoursApplied: 0 })); // post-close re-fetch
    mockIssueAggregate.mockResolvedValue({ _max: { localIssueNumber: 5 } });
    mockIssueCreate.mockResolvedValue({ id: "issue-1", createdAt: new Date("2026-07-13T00:00:00Z") });
    mockGithubLinkCreate.mockResolvedValue({ id: "link-1" });
    mockInstanceCreate.mockResolvedValue(fakeInstance());
    mockInstanceFindMany.mockResolvedValue([{ ...fakeInstance(), series: fakeSeries() }]);
    mockIssueFindUnique.mockResolvedValue({ redmineIssueId: 9001 });
    mockTimeEntryFindMany.mockResolvedValue([]);

    const result = await runRecurringTicketsTick(USER_ID, client, new Date("2026-07-19T12:00:00Z"));

    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toMatchObject({ seriesKey: "drc-support", redmineIssueId: 9001 });
    expect(result.closed).toHaveLength(1);
    expect(result.closed[0]).toMatchObject({ instanceId: "instance-1", seriesKey: "drc-support", status: "closed" });
    expect(result.createFailures).toHaveLength(0);
    expect(result.closeFailures).toHaveLength(0);
  });

  it("records a create failure without aborting the tick", async () => {
    const client = fakeClient({
      createIssue: vi.fn().mockRejectedValue(new Error("redmine unreachable")),
    });
    mockSeriesFindMany.mockResolvedValue([fakeSeries()]);
    mockInstanceFindUnique.mockResolvedValue(null);
    mockInstanceFindMany.mockResolvedValue([]);

    const result = await runRecurringTicketsTick(USER_ID, client, new Date("2026-07-19T12:00:00Z"));

    expect(result.created).toHaveLength(0);
    expect(result.createFailures).toHaveLength(1);
    expect(result.createFailures[0]).toMatchObject({ seriesKey: "drc-support", error: "redmine unreachable" });
  });

  it("logs a warning but doesn't throw when the Redmine current user id doesn't match the expected author", async () => {
    const client = fakeClient({
      getCurrentUser: vi.fn().mockResolvedValue({ id: 1, login: "someone-else", firstname: "S", lastname: "E" }),
    });
    mockSeriesFindMany.mockResolvedValue([]);
    mockInstanceFindMany.mockResolvedValue([]);

    await expect(runRecurringTicketsTick(USER_ID, client, new Date("2026-07-19T12:00:00Z"))).resolves.toMatchObject({
      created: [],
      closed: [],
    });
  });
});
