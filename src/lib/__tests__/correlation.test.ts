import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  mockIssueFindMany,
  mockIssueUpdate,
  mockWakaFindMany,
  mockTimeEntryFindMany,
  mockTimeEntryCreate,
} = vi.hoisted(() => ({
  mockIssueFindMany: vi.fn(),
  mockIssueUpdate: vi.fn(),
  mockWakaFindMany: vi.fn(),
  mockTimeEntryFindMany: vi.fn(),
  mockTimeEntryCreate: vi.fn(),
}));

vi.mock("@/src/lib/db", () => ({
  prisma: {
    issue: { findMany: mockIssueFindMany, update: mockIssueUpdate },
    wakaTimeDailySummary: { findMany: mockWakaFindMany },
    timeEntry: { findMany: mockTimeEntryFindMany, create: mockTimeEntryCreate },
  },
}));

import {
  normalizeProjectName,
  buildProjectTicketIndex,
  correlateWakaTime,
  applyTimeEntries,
} from "@/src/lib/correlation";

const USER_ID = "user-1";

// Helper to build a minimal local issue with a github link
function localIssue(id: string, localNum: number, subject: string, repos: string[]) {
  return {
    id,
    localIssueNumber: localNum,
    subject,
    source: "local",
    projectName: subject,
    githubLinks: repos.map((r) => ({
      id: `link-${r}`,
      repositoryFullName: r,
      url: `https://github.com/${r}`,
    })),
    spentHours: 0,
  };
}

// Helper for a WakaTime daily row
function wakaRow(date: string, projects: Array<{ name: string; total_seconds: number }>) {
  return {
    id: `waka-${date}`,
    userId: USER_ID,
    date,
    totalSeconds: projects.reduce((s, p) => s + p.total_seconds, 0),
    projectsJson: projects.map((p) => ({
      name: p.name,
      total_seconds: p.total_seconds,
      percent: 100,
      text: "",
    })),
  };
}

describe("normalizeProjectName", () => {
  it("lowercases and strips non-alphanumerics", () => {
    expect(normalizeProjectName("SL2-Platform")).toBe("sl2platform");
    expect(normalizeProjectName("my_repo")).toBe("myrepo");
  });

  it("extracts repo segment from owner/repo format", () => {
    expect(normalizeProjectName("buluma/SL2")).toBe("sl2");
  });

  it("handles empty/null", () => {
    expect(normalizeProjectName("")).toBe("");
    expect(normalizeProjectName(null as unknown as string)).toBe("");
  });
});

describe("buildProjectTicketIndex", () => {
  beforeEach(() => vi.clearAllMocks());

  it("indexes tickets by normalized repo name", async () => {
    mockIssueFindMany.mockResolvedValue([
      localIssue("t1", 1, "SL2", ["buluma/SL2"]),
      localIssue("t2", 2, "Vodacom", ["buluma/Vodacom-SA"]),
    ]);

    const index = await buildProjectTicketIndex(USER_ID);

    expect(index.has("sl2")).toBe(true);
    expect(index.get("sl2")!.ticket.id).toBe("t1");
    expect(index.has("vodacomsa")).toBe(true);
  });

  it("skips issues with no github links", async () => {
    mockIssueFindMany.mockResolvedValue([
      { ...localIssue("t1", 1, "NoLink", []), githubLinks: [] },
    ]);

    const index = await buildProjectTicketIndex(USER_ID);
    expect(index.size).toBe(0);
  });
});

describe("correlateWakaTime", () => {
  beforeEach(() => vi.clearAllMocks());

  it("matches WakaTime project to ticket via github link", async () => {
    mockIssueFindMany.mockResolvedValue([
      localIssue("t1", 1, "SL2", ["buluma/SL2"]),
    ]);
    mockWakaFindMany.mockResolvedValue([
      wakaRow("2026-06-20", [{ name: "SL2", total_seconds: 3600 }]),
    ]);
    mockTimeEntryFindMany.mockResolvedValue([]);

    const result = await correlateWakaTime(USER_ID, { start: "2026-06-20", end: "2026-06-20" });

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].ticketId).toBe("t1");
    expect(result.matched[0].totalSeconds).toBe(3600);
    expect(result.matched[0].perDay).toEqual([{ date: "2026-06-20", seconds: 3600 }]);
    expect(result.unmatched).toHaveLength(0);
  });

  it("matches via bidirectional substring", async () => {
    // repo = "Streamline-Vodacom-SA-Prod-Optimization", waka = "Vodacom-SA"
    mockIssueFindMany.mockResolvedValue([
      localIssue("t2", 2, "Vodacom", ["buluma/Streamline-Vodacom-SA-Prod-Optimization"]),
    ]);
    mockWakaFindMany.mockResolvedValue([
      wakaRow("2026-06-20", [{ name: "Vodacom-SA", total_seconds: 7200 }]),
    ]);
    mockTimeEntryFindMany.mockResolvedValue([]);

    const result = await correlateWakaTime(USER_ID, { start: "2026-06-20", end: "2026-06-20" });

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].ticketId).toBe("t2");
  });

  it("puts unmatched projects in unmatched bucket", async () => {
    mockIssueFindMany.mockResolvedValue([]);
    mockWakaFindMany.mockResolvedValue([
      wakaRow("2026-06-20", [{ name: "random-project", total_seconds: 1800 }]),
    ]);
    mockTimeEntryFindMany.mockResolvedValue([]);

    const result = await correlateWakaTime(USER_ID, { start: "2026-06-20", end: "2026-06-20" });

    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0].project).toBe("random-project");
    expect(result.unmatched[0].totalSeconds).toBe(1800);
  });

  it("marks already-logged dates", async () => {
    mockIssueFindMany.mockResolvedValue([
      localIssue("t1", 1, "SL2", ["buluma/SL2"]),
    ]);
    mockWakaFindMany.mockResolvedValue([
      wakaRow("2026-06-19", [{ name: "SL2", total_seconds: 3600 }]),
      wakaRow("2026-06-20", [{ name: "SL2", total_seconds: 7200 }]),
    ]);
    mockTimeEntryFindMany.mockResolvedValue([
      { issueId: "t1", wakaTimeDate: "2026-06-19" },
    ]);

    const result = await correlateWakaTime(USER_ID, { start: "2026-06-19", end: "2026-06-20" });

    expect(result.matched[0].alreadyLoggedDates).toContain("2026-06-19");
    expect(result.matched[0].alreadyLoggedDates).not.toContain("2026-06-20");
  });

  it("aggregates multiple days for same project", async () => {
    mockIssueFindMany.mockResolvedValue([
      localIssue("t1", 1, "SL2", ["buluma/SL2"]),
    ]);
    mockWakaFindMany.mockResolvedValue([
      wakaRow("2026-06-19", [{ name: "SL2", total_seconds: 3600 }]),
      wakaRow("2026-06-20", [{ name: "SL2", total_seconds: 7200 }]),
    ]);
    mockTimeEntryFindMany.mockResolvedValue([]);

    const result = await correlateWakaTime(USER_ID, { start: "2026-06-19", end: "2026-06-20" });

    expect(result.matched[0].totalSeconds).toBe(10800);
    expect(result.matched[0].perDay).toHaveLength(2);
  });

  it("merges same-day activity when a ticket has multiple linked repos", async () => {
    mockIssueFindMany.mockResolvedValue([
      localIssue("t1", 1, "Dashboard", ["buluma/redmine-dashboard", "buluma/openclaw-config", "buluma/odysseus"]),
    ]);
    mockWakaFindMany.mockResolvedValue([
      wakaRow("2026-06-30", [
        { name: "redmine-dashboard", total_seconds: 138 },
        { name: ".openclaw", total_seconds: 141 },
        { name: "odysseus", total_seconds: 288 },
      ]),
    ]);
    mockTimeEntryFindMany.mockResolvedValue([]);

    const result = await correlateWakaTime(USER_ID, { start: "2026-06-30", end: "2026-06-30" });

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].totalSeconds).toBe(567);
    expect(result.matched[0].perDay).toEqual([{ date: "2026-06-30", seconds: 567 }]);
  });
});

describe("applyTimeEntries", () => {
  beforeEach(() => vi.clearAllMocks());

  function setupCorrelation() {
    mockIssueFindMany.mockResolvedValue([
      localIssue("t1", 1, "SL2", ["buluma/SL2"]),
    ]);
    mockWakaFindMany.mockResolvedValue([
      wakaRow("2026-06-20", [{ name: "SL2", total_seconds: 7200 }]),
    ]);
    mockTimeEntryFindMany.mockResolvedValue([]);
    mockTimeEntryCreate.mockResolvedValue({ id: "te-1" });
    mockIssueUpdate.mockResolvedValue({});
  }

  it("creates time entry for matched unlogged day", async () => {
    setupCorrelation();

    const result = await applyTimeEntries(USER_ID, { start: "2026-06-20", end: "2026-06-20" });

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.totalHours).toBeCloseTo(2.0);
    expect(mockTimeEntryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        issueId: "t1",
        userId: USER_ID,
        hours: 2,
        activityId: 9,
        activityName: "Development",
        source: "wakatime",
        wakaTimeDate: "2026-06-20",
      }),
    });
  });

  it("skips already-logged dates", async () => {
    mockIssueFindMany.mockResolvedValue([
      localIssue("t1", 1, "SL2", ["buluma/SL2"]),
    ]);
    mockWakaFindMany.mockResolvedValue([
      wakaRow("2026-06-20", [{ name: "SL2", total_seconds: 7200 }]),
    ]);
    mockTimeEntryFindMany.mockResolvedValue([
      { issueId: "t1", wakaTimeDate: "2026-06-20" },
    ]);

    const result = await applyTimeEntries(USER_ID, { start: "2026-06-20", end: "2026-06-20" });

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockTimeEntryCreate).not.toHaveBeenCalled();
  });

  it("dryRun returns summary without writing", async () => {
    setupCorrelation();

    const result = await applyTimeEntries(USER_ID, { start: "2026-06-20", end: "2026-06-20", dryRun: true });

    expect(result.created).toBe(1);
    expect(result.totalHours).toBeCloseTo(2.0);
    expect(mockTimeEntryCreate).not.toHaveBeenCalled();
    expect(mockIssueUpdate).not.toHaveBeenCalled();
  });

  it("creates one entry per day even when multiple linked repos match the same date", async () => {
    mockIssueFindMany.mockResolvedValue([
      localIssue("t1", 1, "Dashboard", ["buluma/redmine-dashboard", "buluma/odysseus"]),
    ]);
    mockWakaFindMany.mockResolvedValue([
      wakaRow("2026-06-30", [
        { name: "redmine-dashboard", total_seconds: 138 },
        { name: "odysseus", total_seconds: 288 },
      ]),
    ]);
    mockTimeEntryFindMany.mockResolvedValue([]);
    mockTimeEntryCreate.mockResolvedValue({ id: "te-1" });
    mockIssueUpdate.mockResolvedValue({});

    const result = await applyTimeEntries(USER_ID, { start: "2026-06-30", end: "2026-06-30" });

    expect(mockTimeEntryCreate).toHaveBeenCalledTimes(1);
    expect(result.created).toBe(1);
    expect(result.entries[0].hours).toBeCloseTo(0.12);
  });

  it("updates issue lastActivityAt and spentHours after logging", async () => {
    setupCorrelation();

    await applyTimeEntries(USER_ID, { start: "2026-06-20", end: "2026-06-20" });

    expect(mockIssueUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t1" },
        data: expect.objectContaining({
          lastActivityType: "wakatime_time_logged",
        }),
      }),
    );
  });
});
