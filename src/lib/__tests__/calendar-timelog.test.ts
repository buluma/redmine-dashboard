import { describe, expect, it, vi, beforeEach } from "vitest";
import type { RecurringTicketSeries } from "@prisma/client";

const {
  mockSeriesFindMany,
  mockInstanceFindFirst,
  mockTimeEntryCreate,
  mockIssueUpdate,
  mockTransaction,
} = vi.hoisted(() => ({
  mockSeriesFindMany: vi.fn(),
  mockInstanceFindFirst: vi.fn(),
  mockTimeEntryCreate: vi.fn(),
  mockIssueUpdate: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@/src/lib/db", () => ({
  prisma: {
    recurringTicketSeries: { findMany: mockSeriesFindMany },
    recurringTicketInstance: { findFirst: mockInstanceFindFirst },
    timeEntry: { create: mockTimeEntryCreate },
    issue: { update: mockIssueUpdate },
    $transaction: mockTransaction,
  },
}));

vi.mock("@/src/lib/telemetry", () => ({
  trackInfo: vi.fn(),
  trackFailure: vi.fn(),
}));

import { matchScore, syncCalendarMeetings } from "@/src/lib/calendar-timelog";
import type { OdysseusCalendarClient, OdysseusCalendarEvent } from "@/src/lib/odysseus-calendar";

function series(overrides: Partial<RecurringTicketSeries> = {}): RecurringTicketSeries {
  return {
    id: "series-1",
    userId: "user-1",
    key: "drc-support",
    name: "DRC Support",
    isActive: true,
    redmineProjectId: 1,
    parentIssueId: 113554,
    trackerId: 1,
    priorityId: 1,
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
    ...overrides,
  } as RecurringTicketSeries;
}

function event(overrides: Partial<OdysseusCalendarEvent> = {}): OdysseusCalendarEvent {
  return {
    uid: "meeting-1",
    summary: "Weekly DRC Support Sync",
    dtstart: "2026-09-04T09:00:00.000Z",
    dtend: "2026-09-04T09:30:00.000Z",
    ...overrides,
  };
}

function makeClient(events: OdysseusCalendarEvent[]): OdysseusCalendarClient {
  return { listEvents: vi.fn().mockResolvedValue(events) } as unknown as OdysseusCalendarClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTransaction.mockImplementation(async (ops: unknown[]) => ops);
});

describe("matchScore", () => {
  it("matches a superset summary against a shorter series name", () => {
    expect(matchScore("Weekly DRC Support Sync", "DRC Support")).toBe(1);
  });

  it("scores unrelated strings low", () => {
    expect(matchScore("1:1 with manager", "DRC Support")).toBeLessThan(0.6);
  });

  it("returns 0 for empty input", () => {
    expect(matchScore("", "DRC Support")).toBe(0);
  });
});

describe("syncCalendarMeetings", () => {
  it("returns zero result when no events in window", async () => {
    const client = makeClient([]);
    const result = await syncCalendarMeetings("user-1", client, { start: "a", end: "b" });
    expect(result).toEqual({ eventCount: 0, matched: 0, logged: 0, skipped: 0, unmatched: 0 });
    expect(mockSeriesFindMany).not.toHaveBeenCalled();
  });

  it("counts every event unmatched when there are no active series", async () => {
    mockSeriesFindMany.mockResolvedValue([]);
    const client = makeClient([event()]);
    const result = await syncCalendarMeetings("user-1", client, { start: "a", end: "b" });
    expect(result.unmatched).toBe(1);
    expect(result.logged).toBe(0);
  });

  it("logs a TimeEntry against the fuzzy-matched series' open instance", async () => {
    mockSeriesFindMany.mockResolvedValue([series()]);
    mockInstanceFindFirst.mockResolvedValue({ id: "instance-1", issueId: "issue-1", status: "open" });
    const client = makeClient([event()]);

    const result = await syncCalendarMeetings("user-1", client, { start: "a", end: "b" });

    expect(result).toEqual({ eventCount: 1, matched: 1, logged: 1, skipped: 0, unmatched: 0 });
    expect(mockTimeEntryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        issueId: "issue-1",
        userId: "user-1",
        hours: 0.5,
        activityId: 31,
        activityName: "Development",
        source: "calendar",
        calendarEventUid: "meeting-1",
      }),
    });
    expect(mockIssueUpdate).toHaveBeenCalledWith({
      where: { id: "issue-1" },
      data: expect.objectContaining({ lastActivityType: "calendar_meeting_logged", spentHours: { increment: 0.5 } }),
    });
  });

  it("skips a matched meeting when the series has no open instance", async () => {
    mockSeriesFindMany.mockResolvedValue([series()]);
    mockInstanceFindFirst.mockResolvedValue(null);
    const client = makeClient([event()]);

    const result = await syncCalendarMeetings("user-1", client, { start: "a", end: "b" });

    expect(result.matched).toBe(1);
    expect(result.skipped).toBe(1);
    expect(mockTimeEntryCreate).not.toHaveBeenCalled();
  });

  it("does not match an unrelated meeting", async () => {
    mockSeriesFindMany.mockResolvedValue([series()]);
    const client = makeClient([event({ summary: "1:1 with manager" })]);

    const result = await syncCalendarMeetings("user-1", client, { start: "a", end: "b" });

    expect(result.unmatched).toBe(1);
    expect(result.matched).toBe(0);
    expect(mockInstanceFindFirst).not.toHaveBeenCalled();
  });

  it("skips a zero/negative-length event without touching the database", async () => {
    mockSeriesFindMany.mockResolvedValue([series()]);
    const client = makeClient([event({ dtstart: "2026-09-04T09:30:00.000Z", dtend: "2026-09-04T09:00:00.000Z" })]);

    const result = await syncCalendarMeetings("user-1", client, { start: "a", end: "b" });

    expect(result.skipped).toBe(1);
    expect(result.matched).toBe(0);
    expect(mockSeriesFindMany).toHaveBeenCalled();
  });

  it("dedups a re-poll of the same meeting via the unique-constraint P2002 path", async () => {
    mockSeriesFindMany.mockResolvedValue([series()]);
    mockInstanceFindFirst.mockResolvedValue({ id: "instance-1", issueId: "issue-1", status: "open" });
    mockTransaction.mockRejectedValueOnce({ code: "P2002" });
    const client = makeClient([event()]);

    const result = await syncCalendarMeetings("user-1", client, { start: "a", end: "b" });

    expect(result.logged).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("re-throws a non-P2002 transaction error", async () => {
    mockSeriesFindMany.mockResolvedValue([series()]);
    mockInstanceFindFirst.mockResolvedValue({ id: "instance-1", issueId: "issue-1", status: "open" });
    mockTransaction.mockRejectedValueOnce(new Error("db down"));
    const client = makeClient([event()]);

    await expect(syncCalendarMeetings("user-1", client, { start: "a", end: "b" })).rejects.toThrow("db down");
  });
});
