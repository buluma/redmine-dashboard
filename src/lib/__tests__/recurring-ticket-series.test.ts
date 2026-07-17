import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  mockSeriesFindMany,
  mockSeriesFindFirst,
  mockSeriesCreate,
  mockSeriesUpdate,
  mockInstanceFindMany,
  mockAuditLog,
} = vi.hoisted(() => ({
  mockSeriesFindMany: vi.fn(),
  mockSeriesFindFirst: vi.fn(),
  mockSeriesCreate: vi.fn(),
  mockSeriesUpdate: vi.fn(),
  mockInstanceFindMany: vi.fn(),
  mockAuditLog: vi.fn(),
}));

vi.mock("@/src/lib/db", () => ({
  prisma: {
    recurringTicketSeries: {
      findMany: mockSeriesFindMany,
      findFirst: mockSeriesFindFirst,
      create: mockSeriesCreate,
      update: mockSeriesUpdate,
    },
    recurringTicketInstance: { findMany: mockInstanceFindMany },
  },
}));

vi.mock("@/src/lib/audit", () => ({
  getAuditService: () => ({ log: mockAuditLog }),
}));

import {
  listSeries,
  getSeries,
  createSeries,
  updateSeries,
  toggleSeries,
  listRecentInstances,
} from "@/src/lib/recurring-ticket-series";

const USER_ID = "user-1";

function seriesInput() {
  return {
    key: "drc-support",
    name: "DRC Support",
    redmineProjectId: 10,
    parentIssueId: 113554,
    trackerId: 3,
    priorityId: 2,
    subjectTemplate: "Week {{week}} DRC Support",
    cadence: "weekly" as const,
    createWeekday: 1,
    closeWeekday: 7,
    createDayOfMonth: 1,
    wakatimeProjectName: "drc-support",
    defaultActivityId: 9,
    defaultActivityName: "Development",
    expectsTime: false,
  };
}

describe("listSeries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("flattens the instance _count into instanceCount", async () => {
    mockSeriesFindMany.mockResolvedValue([
      { id: "s1", key: "drc-support", _count: { instances: 3 } },
    ]);

    const result = await listSeries(USER_ID);

    expect(result).toEqual([{ id: "s1", key: "drc-support", instanceCount: 3 }]);
    expect(mockSeriesFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID } }),
    );
  });
});

describe("getSeries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes the lookup to the owning user", async () => {
    mockSeriesFindFirst.mockResolvedValue({ id: "s1", key: "drc-support" });

    const result = await getSeries("s1", USER_ID);

    expect(mockSeriesFindFirst).toHaveBeenCalledWith({ where: { id: "s1", userId: USER_ID } });
    expect(result).toEqual({ id: "s1", key: "drc-support" });
  });

  it("returns null when no series matches", async () => {
    mockSeriesFindFirst.mockResolvedValue(null);
    expect(await getSeries("missing", USER_ID)).toBeNull();
  });
});

describe("createSeries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates the series and writes an audit log entry", async () => {
    mockSeriesCreate.mockResolvedValue({ id: "s1", key: "drc-support", name: "DRC Support" });

    const result = await createSeries(USER_ID, seriesInput());

    expect(mockSeriesCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        key: "drc-support",
        isActive: true,
        redmineProjectId: 10,
      }),
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CREATE", entityType: "RecurringTicketSeries", entityId: "s1" }),
    );
    expect(result.id).toBe("s1");
  });
});

describe("updateSeries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("only includes defined fields in the update payload", async () => {
    mockSeriesUpdate.mockResolvedValue({ id: "s1", name: "Renamed" });

    await updateSeries("s1", USER_ID, { name: "Renamed" });

    expect(mockSeriesUpdate).toHaveBeenCalledWith({
      where: { id: "s1", userId: USER_ID },
      data: { name: "Renamed" },
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "UPDATE", entityId: "s1", metadata: { updatedFields: ["name"] } }),
    );
  });
});

describe("toggleSeries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("flips isActive and logs the change", async () => {
    await toggleSeries("s1", USER_ID, false);

    expect(mockSeriesUpdate).toHaveBeenCalledWith({
      where: { id: "s1", userId: USER_ID },
      data: { isActive: false },
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "UPDATE", entityId: "s1", metadata: { isActive: false } }),
    );
  });
});

describe("listRecentInstances", () => {
  beforeEach(() => vi.clearAllMocks());

  it("flattens the joined series key/name onto each row", async () => {
    mockInstanceFindMany.mockResolvedValue([
      {
        id: "i1",
        periodKey: "2026-W29",
        subject: "Week 29 DRC Support",
        issueId: "issue-1",
        redmineIssueId: 9001,
        status: "closed",
        closeAttempts: 1,
        lastError: null,
        finalHoursApplied: 4.5,
        scheduledCreateDate: new Date("2026-07-13T00:00:00Z"),
        scheduledCloseDate: new Date("2026-07-19T00:00:00Z"),
        closedAt: new Date("2026-07-19T00:00:00Z"),
        createdAt: new Date("2026-07-13T00:00:00Z"),
        series: { key: "drc-support", name: "DRC Support" },
      },
    ]);

    const result = await listRecentInstances(USER_ID);

    expect(result[0]).toMatchObject({ id: "i1", seriesKey: "drc-support", seriesName: "DRC Support", status: "closed" });
    expect(mockInstanceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID }, take: 50 }),
    );
  });
});
