import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const {
  mockIssueFindMany,
  mockIssueFindFirst,
  mockIssueUpdate,
  mockIssueAggregate,
  mockIssueCreate,
  mockIssueFindUnique,
  mockWakaFindMany,
  mockTimeEntryFindMany,
  mockTimeEntryCreate,
  mockUserFindUnique,
  mockGithubLinkFindFirst,
  mockGithubLinkCreate,
  mockTransaction,
} = vi.hoisted(() => ({
  mockIssueFindMany: vi.fn(),
  mockIssueFindFirst: vi.fn(),
  mockIssueUpdate: vi.fn(),
  mockIssueAggregate: vi.fn(),
  mockIssueCreate: vi.fn(),
  mockIssueFindUnique: vi.fn(),
  mockWakaFindMany: vi.fn(),
  mockTimeEntryFindMany: vi.fn(),
  mockTimeEntryCreate: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockGithubLinkFindFirst: vi.fn(),
  mockGithubLinkCreate: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@/src/lib/db", () => ({
  prisma: {
    issue: {
      findMany: mockIssueFindMany,
      findFirst: mockIssueFindFirst,
      update: mockIssueUpdate,
      aggregate: mockIssueAggregate,
      create: mockIssueCreate,
      findUnique: mockIssueFindUnique,
    },
    wakaTimeDailySummary: { findMany: mockWakaFindMany },
    timeEntry: { findMany: mockTimeEntryFindMany, create: mockTimeEntryCreate },
    user: { findUnique: mockUserFindUnique },
    issueGithubLink: { findFirst: mockGithubLinkFindFirst, create: mockGithubLinkCreate },
    // applyTimeEntries batches the TimeEntry insert + spentHours increment in a
    // $transaction([...]); default behaviour just resolves the built ops so the
    // underlying create/update mocks still record their calls.
    $transaction: mockTransaction,
  },
}));

vi.mock("@/src/lib/activity-index", () => ({
  recordIssueActivityEvent: vi.fn(),
  recomputeIssueActivityIndex: vi.fn(),
}));

import {
  normalizeProjectName,
  buildProjectTicketIndex,
  correlateWakaTime,
  applyTimeEntries,
  autoCreateTicketsForUnmatched,
  getAutoCreateOptionsFromEnv,
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

  it("routes unmatched projects to the catch-all ticket when configured", async () => {
    mockIssueFindMany.mockResolvedValue([]);
    mockIssueFindFirst.mockResolvedValue({
      id: "misc-1",
      localIssueNumber: 999,
      subject: "Misc / Unlinked",
      projectName: "Misc",
      spentHours: 0,
    });
    mockWakaFindMany.mockResolvedValue([
      wakaRow("2026-06-20", [{ name: "unknown", total_seconds: 1800 }]),
    ]);
    mockTimeEntryFindMany.mockResolvedValue([]);

    const result = await correlateWakaTime(USER_ID, {
      start: "2026-06-20",
      end: "2026-06-20",
      catchAllIssueId: "misc-1",
    });

    expect(result.unmatched).toHaveLength(0);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].ticketId).toBe("misc-1");
    expect(result.matched[0].repo).toBe("unknown"); // original project name preserved for traceability
    expect(result.matched[0].totalSeconds).toBe(1800);
  });

  it("still prefers a real match over the catch-all when both are available", async () => {
    mockIssueFindMany.mockResolvedValue([
      localIssue("t1", 1, "SL2", ["buluma/SL2"]),
    ]);
    mockIssueFindFirst.mockResolvedValue({
      id: "misc-1",
      localIssueNumber: 999,
      subject: "Misc / Unlinked",
      projectName: "Misc",
      spentHours: 0,
    });
    mockWakaFindMany.mockResolvedValue([
      wakaRow("2026-06-20", [{ name: "SL2", total_seconds: 3600 }]),
    ]);
    mockTimeEntryFindMany.mockResolvedValue([]);

    const result = await correlateWakaTime(USER_ID, {
      start: "2026-06-20",
      end: "2026-06-20",
      catchAllIssueId: "misc-1",
    });

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].ticketId).toBe("t1"); // not swept into misc-1
  });

  it("falls back to unmatched when catchAllIssueId doesn't resolve to a real ticket", async () => {
    mockIssueFindMany.mockResolvedValue([]);
    mockIssueFindFirst.mockResolvedValue(null); // deleted ticket, wrong user, etc.
    mockWakaFindMany.mockResolvedValue([
      wakaRow("2026-06-20", [{ name: "unknown", total_seconds: 1800 }]),
    ]);
    mockTimeEntryFindMany.mockResolvedValue([]);

    const result = await correlateWakaTime(USER_ID, {
      start: "2026-06-20",
      end: "2026-06-20",
      catchAllIssueId: "does-not-exist",
    });

    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
  });

  it("without catchAllIssueId, behaves exactly as before (no prisma.issue.findFirst call)", async () => {
    mockIssueFindMany.mockResolvedValue([]);
    mockWakaFindMany.mockResolvedValue([
      wakaRow("2026-06-20", [{ name: "unknown", total_seconds: 1800 }]),
    ]);
    mockTimeEntryFindMany.mockResolvedValue([]);

    const result = await correlateWakaTime(USER_ID, { start: "2026-06-20", end: "2026-06-20" });

    expect(result.unmatched).toHaveLength(1);
    expect(mockIssueFindFirst).not.toHaveBeenCalled();
  });

  it("merges multiple distinct unmatched projects on the same day into one catch-all entry", async () => {
    mockIssueFindMany.mockResolvedValue([]);
    mockIssueFindFirst.mockResolvedValue({
      id: "misc-1",
      localIssueNumber: 999,
      subject: "Misc / Unlinked",
      projectName: "Misc",
      spentHours: 0,
    });
    mockWakaFindMany.mockResolvedValue([
      wakaRow("2026-06-20", [
        { name: "unknown", total_seconds: 1800 },
        { name: ".pi", total_seconds: 900 },
      ]),
    ]);
    mockTimeEntryFindMany.mockResolvedValue([]);

    const result = await correlateWakaTime(USER_ID, {
      start: "2026-06-20",
      end: "2026-06-20",
      catchAllIssueId: "misc-1",
    });

    // Same (issueId, date) constraint as any other ticket — one merged entry,
    // not two, same simplification already accepted for multi-repo tickets.
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].ticketId).toBe("misc-1");
    expect(result.matched[0].totalSeconds).toBe(2700);
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
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
  });

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
        activityId: 31,
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

  it("treats a P2002 unique-violation (concurrent run logged the same date) as skipped, not an error", async () => {
    setupCorrelation();
    // A parallel apply/cron already wrote this issueId+wakaTimeDate between our
    // correlate read and our write — the transaction rejects with P2002.
    mockTransaction.mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));

    const result = await applyTimeEntries(USER_ID, { start: "2026-06-20", end: "2026-06-20" });

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.entries).toHaveLength(0);
  });

  it("still throws on a non-P2002 write failure", async () => {
    setupCorrelation();
    mockTransaction.mockRejectedValueOnce(Object.assign(new Error("connection reset"), { code: "P1001" }));

    await expect(
      applyTimeEntries(USER_ID, { start: "2026-06-20", end: "2026-06-20" }),
    ).rejects.toThrow("connection reset");
  });
});

describe("autoCreateTicketsForUnmatched", () => {
  beforeEach(() => vi.clearAllMocks());

  function unmatchedProject(project: string, totalSeconds: number) {
    return { project, totalSeconds, perDay: [{ date: "2026-06-20", seconds: totalSeconds }] };
  }

  it("creates a ticket + github link for a project over threshold", async () => {
    mockUserFindUnique.mockResolvedValue({ displayName: "Michael Buluma" });
    mockGithubLinkFindFirst.mockResolvedValue(null);
    mockIssueAggregate.mockResolvedValue({ _max: { localIssueNumber: 4 } });
    mockIssueCreate.mockResolvedValue({ id: "new-issue-1" });
    mockGithubLinkCreate.mockResolvedValue({ id: "link-1", url: "https://github.com/buluma/sweeper", createdAt: new Date() });

    const created = await autoCreateTicketsForUnmatched(
      USER_ID,
      [unmatchedProject("sweeper", 7200)],
      { thresholdSeconds: 7200, defaultOwner: "buluma" },
    );

    expect(created).toEqual([
      { issueId: "new-issue-1", localIssueNumber: 5, project: "sweeper", repositoryFullName: "buluma/sweeper" },
    ]);
    expect(mockIssueCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: USER_ID,
          source: "local",
          localIssueNumber: 5,
          subject: "sweeper",
          statusId: 1,
          statusName: "New",
          assignedToName: "Michael Buluma",
        }),
      }),
    );
    expect(mockGithubLinkCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          issueId: "new-issue-1",
          repositoryFullName: "buluma/sweeper",
          url: "https://github.com/buluma/sweeper",
        }),
      }),
    );
  });

  it("skips projects below threshold", async () => {
    const created = await autoCreateTicketsForUnmatched(
      USER_ID,
      [unmatchedProject("tiny-script", 60)],
      { thresholdSeconds: 7200, defaultOwner: "buluma" },
    );

    expect(created).toEqual([]);
    expect(mockIssueCreate).not.toHaveBeenCalled();
  });

  it("skips a project that already has a matching link (idempotent)", async () => {
    mockGithubLinkFindFirst.mockResolvedValue({ id: "existing-link" });

    const created = await autoCreateTicketsForUnmatched(
      USER_ID,
      [unmatchedProject("sweeper", 7200)],
      { thresholdSeconds: 7200, defaultOwner: "buluma" },
    );

    expect(created).toEqual([]);
    expect(mockIssueCreate).not.toHaveBeenCalled();
  });

  it("preserves an explicit owner/repo project name instead of prefixing defaultOwner", async () => {
    mockUserFindUnique.mockResolvedValue({ displayName: "Michael Buluma" });
    mockGithubLinkFindFirst.mockResolvedValue(null);
    mockIssueAggregate.mockResolvedValue({ _max: { localIssueNumber: null } });
    mockIssueCreate.mockResolvedValue({ id: "new-issue-2" });
    mockGithubLinkCreate.mockResolvedValue({ id: "link-2", url: "https://github.com/other-owner/tool", createdAt: new Date() });

    const created = await autoCreateTicketsForUnmatched(
      USER_ID,
      [unmatchedProject("other-owner/tool", 7200)],
      { thresholdSeconds: 7200, defaultOwner: "buluma" },
    );

    expect(created[0].repositoryFullName).toBe("other-owner/tool");
  });
});

describe("applyTimeEntries with autoCreate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
  });

  it("auto-creates a ticket for unmatched activity, then logs it as matched in the same call", async () => {
    // First correlateWakaTime pass (no catchAll) sees "sweeper" as unmatched.
    // After auto-create inserts its github link, the index rebuild for the
    // second pass must reflect the new ticket — simulate that by having
    // issue.findMany return it only once a link has been "created".
    let linkCreated = false;
    mockIssueFindMany.mockImplementation(async () => {
      if (!linkCreated) return [];
      return [localIssue("new-issue-1", 5, "sweeper", ["buluma/sweeper"])];
    });
    mockWakaFindMany.mockResolvedValue([
      wakaRow("2026-06-20", [{ name: "sweeper", total_seconds: 7200 }]),
    ]);
    mockTimeEntryFindMany.mockResolvedValue([]);
    mockUserFindUnique.mockResolvedValue({ displayName: "Michael Buluma" });
    mockGithubLinkFindFirst.mockResolvedValue(null);
    mockIssueAggregate.mockResolvedValue({ _max: { localIssueNumber: 4 } });
    mockIssueCreate.mockResolvedValue({ id: "new-issue-1" });
    mockGithubLinkCreate.mockImplementation(async () => {
      linkCreated = true;
      return { id: "link-1", url: "https://github.com/buluma/sweeper", createdAt: new Date() };
    });
    mockTimeEntryCreate.mockResolvedValue({ id: "te-1" });
    mockIssueUpdate.mockResolvedValue({});

    const result = await applyTimeEntries(USER_ID, {
      start: "2026-06-20",
      end: "2026-06-20",
      autoCreate: { thresholdSeconds: 7200, defaultOwner: "buluma" },
    });

    expect(mockIssueCreate).toHaveBeenCalledTimes(1);
    expect(result.autoCreatedTickets).toEqual([
      { issueId: "new-issue-1", localIssueNumber: 5, project: "sweeper", repositoryFullName: "buluma/sweeper" },
    ]);
    expect(result.created).toBe(1);
    expect(mockTimeEntryCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ issueId: "new-issue-1" }) }),
    );
  });

  it("does not auto-create anything on dryRun", async () => {
    mockIssueFindMany.mockResolvedValue([]);
    mockWakaFindMany.mockResolvedValue([
      wakaRow("2026-06-20", [{ name: "sweeper", total_seconds: 7200 }]),
    ]);
    mockTimeEntryFindMany.mockResolvedValue([]);

    const result = await applyTimeEntries(USER_ID, {
      start: "2026-06-20",
      end: "2026-06-20",
      dryRun: true,
      autoCreate: { thresholdSeconds: 7200, defaultOwner: "buluma" },
    });

    expect(mockIssueCreate).not.toHaveBeenCalled();
    expect(result.autoCreatedTickets).toBeUndefined();
  });
});

describe("getAutoCreateOptionsFromEnv", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns undefined when GITHUB_DEFAULT_OWNER is not set", () => {
    delete process.env.GITHUB_DEFAULT_OWNER;
    expect(getAutoCreateOptionsFromEnv()).toBeUndefined();
  });

  it("returns undefined when explicitly disabled", () => {
    process.env.GITHUB_DEFAULT_OWNER = "buluma";
    process.env.AUTO_CREATE_UNMATCHED_TICKETS = "false";
    expect(getAutoCreateOptionsFromEnv()).toBeUndefined();
  });

  it("returns options with defaults when owner is set and not disabled", () => {
    process.env.GITHUB_DEFAULT_OWNER = "buluma";
    delete process.env.AUTO_CREATE_UNMATCHED_TICKETS;
    delete process.env.AUTO_CREATE_TICKET_THRESHOLD_SECONDS;
    expect(getAutoCreateOptionsFromEnv()).toEqual({ thresholdSeconds: 7200, defaultOwner: "buluma" });
  });

  it("respects a custom threshold", () => {
    process.env.GITHUB_DEFAULT_OWNER = "buluma";
    process.env.AUTO_CREATE_TICKET_THRESHOLD_SECONDS = "3600";
    expect(getAutoCreateOptionsFromEnv()).toEqual({ thresholdSeconds: 3600, defaultOwner: "buluma" });
  });
});
