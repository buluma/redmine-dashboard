import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockEnv, mockLinkCreate, mockLinkUpdate, mockLinkDelete, mockLinkFindMany, mockLinkUpdateMany, mockGithubLinkFindMany } = vi.hoisted(() => ({
  mockEnv: {
    gr8rUrl: "http://gr8r.test:8787" as string | undefined,
    gr8rToken: "test-token" as string | undefined,
    gr8rAgent: "Converge",
    gr8rAssignee: "m1" as string | undefined,
    gr8rFallbackProject: "STR" as string | undefined,
  },
  mockLinkCreate: vi.fn(),
  mockLinkUpdate: vi.fn(),
  mockLinkDelete: vi.fn(),
  mockLinkFindMany: vi.fn(),
  mockLinkUpdateMany: vi.fn(),
  mockGithubLinkFindMany: vi.fn(),
}));

vi.mock("@/src/lib/env", () => ({ env: mockEnv }));
vi.mock("@/src/lib/db", () => ({
  prisma: {
    gr8rTaskLink: {
      create: mockLinkCreate,
      update: mockLinkUpdate,
      delete: mockLinkDelete,
      findMany: mockLinkFindMany,
      updateMany: mockLinkUpdateMany,
    },
    issueGithubLink: { findMany: mockGithubLinkFindMany },
  },
}));
vi.mock("@/src/lib/telemetry", () => ({ trackInfo: vi.fn(), trackSuccess: vi.fn(), trackFailure: vi.fn() }));

import {
  resolveGr8rProject,
  shouldPushToGr8r,
  gr8rEstimate,
  gr8rPriority,
  pushIssueToGr8r,
  retryFailedGr8rPushes,
  resetGr8rCurrentUserCache,
} from "@/src/lib/gr8r-task-push";

const NOW = new Date("2026-11-21T10:00:00Z");
const ME = 194;

const PROJECTS = [
  { key: "STR", name: "Streamline", repo: null },
  { key: "CON", name: "Converge", repo: "buluma/redmine-dashboard" },
  { key: "FON", name: "FON POC", repo: "buluma/SL2" },
  { key: "DFIB", name: "Dev Fiber", repo: "buluma/SL2" },
];

describe("resolveGr8rProject", () => {
  it("routes by a GitHub repo link first, matching repo names the way correlation does", () => {
    expect(resolveGr8rProject({ repos: ["someone-else/Redmine_Dashboard"], redmineProjectName: "Streamline" }, PROJECTS, "STR"))
      .toEqual({ key: "CON", via: "repo" });
  });

  it("skips a repo two gr8r projects share and falls through to the Redmine project name", () => {
    expect(resolveGr8rProject({ repos: ["buluma/SL2"], redmineProjectName: "Streamline" }, PROJECTS, undefined))
      .toEqual({ key: "STR", via: "name" });
  });

  it("matches the Redmine project name to a gr8r project name, ignoring case and punctuation", () => {
    expect(resolveGr8rProject({ repos: [], redmineProjectName: "fon-poc" }, PROJECTS, undefined))
      .toEqual({ key: "FON", via: "name" });
  });

  it("uses the fallback project when nothing else places the ticket", () => {
    expect(resolveGr8rProject({ repos: [], redmineProjectName: "Seacom" }, PROJECTS, "str"))
      .toEqual({ key: "STR", via: "fallback" });
  });

  it("returns null when nothing matches and the fallback is unset or unknown", () => {
    expect(resolveGr8rProject({ repos: [], redmineProjectName: "Seacom" }, PROJECTS, undefined)).toBeNull();
    expect(resolveGr8rProject({ repos: [], redmineProjectName: "Seacom" }, PROJECTS, "NOPE")).toBeNull();
  });
});

describe("shouldPushToGr8r", () => {
  const base = { meId: ME, assignedToId: ME, updatedOnRemote: new Date("2026-11-21T09:00:00Z"), now: NOW };

  it("pushes a ticket first seen already assigned to me", () => {
    expect(shouldPushToGr8r({ ...base, wasCreated: true, previousAssignedToId: null })).toBe(true);
  });

  it("pushes a cached ticket that has just been reassigned to me", () => {
    expect(shouldPushToGr8r({ ...base, wasCreated: false, previousAssignedToId: 210 })).toBe(true);
  });

  it("does not push a ticket that was already mine (an ordinary update)", () => {
    expect(shouldPushToGr8r({ ...base, wasCreated: false, previousAssignedToId: ME })).toBe(false);
  });

  it("does not push a ticket assigned to someone else", () => {
    expect(shouldPushToGr8r({ ...base, assignedToId: 210, wasCreated: true, previousAssignedToId: null })).toBe(false);
  });

  it("does not push a ticket untouched in Redmine for over a week, so a rebuilt cache doesn't flood gr8r", () => {
    expect(
      shouldPushToGr8r({ ...base, updatedOnRemote: new Date("2026-11-10T00:00:00Z"), wasCreated: true, previousAssignedToId: null }),
    ).toBe(false);
  });
});

describe("gr8rPriority / gr8rEstimate", () => {
  it("maps Redmine priority names onto gr8r's default scale", () => {
    expect(gr8rPriority("Immediate")).toBe("urgent");
    expect(gr8rPriority("Urgent")).toBe("urgent");
    expect(gr8rPriority("High")).toBe("high");
    expect(gr8rPriority("Normal")).toBe("medium");
    expect(gr8rPriority("Low")).toBe("low");
    expect(gr8rPriority("Whatever")).toBeUndefined();
    expect(gr8rPriority(null)).toBeUndefined();
  });

  it("rounds estimated hours up to the app's picker values", () => {
    expect(gr8rEstimate(0.25)).toBe("30m");
    expect(gr8rEstimate(1)).toBe("1h");
    expect(gr8rEstimate(3)).toBe("4h");
    expect(gr8rEstimate(8)).toBe("1d");
    expect(gr8rEstimate(20)).toBe("3d");
    expect(gr8rEstimate(100)).toBe("8d");
    expect(gr8rEstimate(null)).toBeUndefined();
    expect(gr8rEstimate(0)).toBeUndefined();
  });
});

describe("pushIssueToGr8r", () => {
  const fetchMock = vi.fn();

  const issue = {
    id: "issue-1",
    redmineIssueId: 4321,
    subject: "Fix the DRC export",
    description: "Export fails on Mondays.",
    projectName: "Streamline",
    tracker: "Bug",
    priority: "High",
    statusName: "New",
    assignedToId: ME,
    dueDate: new Date("2026-11-25T00:00:00Z"),
    startDate: null,
    estimatedHours: 3,
    updatedOnRemote: new Date("2026-11-21T09:00:00Z"),
  };

  function client() {
    return {
      normalizedBaseUrl: "https://redmine.example.com",
      getCurrentUser: vi.fn().mockResolvedValue({ id: ME }),
    };
  }

  function respond(status: number, body: unknown) {
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    resetGr8rCurrentUserCache();
    mockEnv.gr8rUrl = "http://gr8r.test:8787";
    mockEnv.gr8rToken = "test-token";
    mockEnv.gr8rAssignee = "m1";
    mockEnv.gr8rFallbackProject = "STR";
    mockLinkCreate.mockResolvedValue({ id: "link-1" });
    mockLinkUpdate.mockResolvedValue({});
    mockLinkDelete.mockResolvedValue({});
    mockGithubLinkFindMany.mockResolvedValue([]);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/api/projects")) return respond(200, { projects: PROJECTS });
      if (url.endsWith("/api/tasks") && init?.method === "POST") return respond(201, { task: { key: "STR-9" } });
      return respond(404, { error: "not found" });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing when gr8r isn't configured", async () => {
    mockEnv.gr8rToken = undefined;
    const result = await pushIssueToGr8r({ userId: "u1", client: client(), issue, wasCreated: true, previousAssignedToId: null, now: NOW });
    expect(result).toEqual({ pushed: false, reason: "disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockLinkCreate).not.toHaveBeenCalled();
  });

  it("creates the task as the agent, in the routed project, and records its key", async () => {
    const result = await pushIssueToGr8r({ userId: "u1", client: client(), issue, wasCreated: true, previousAssignedToId: null, now: NOW });

    expect(result).toEqual({ pushed: true, taskKey: "STR-9", project: "STR", via: "name" });
    expect(mockLinkCreate).toHaveBeenCalledWith({ data: { issueId: "issue-1" } });

    const [url, init] = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/api/tasks"))!;
    expect(url).toBe("http://gr8r.test:8787/api/tasks");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      authorization: "Bearer test-token",
      "content-type": "application/json",
      "x-gr8r-agent": "Converge",
    });
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      title: "Redmine #4321: Fix the DRC export",
      project: "STR",
      status: "todo",
      priority: "high",
      due: "2026-11-25",
      estimate: "4h",
      assignee: "m1",
    });
    expect(body.start).toBeUndefined();
    expect(body.desc).toContain("https://redmine.example.com/issues/4321");
    expect(body.desc).toContain("Export fails on Mondays.");

    expect(mockLinkUpdate).toHaveBeenCalledWith({ where: { id: "link-1" }, data: { taskKey: "STR-9" } });
  });

  it("sends due: null when Redmine has no due date, so gr8r doesn't invent one", async () => {
    await pushIssueToGr8r({ userId: "u1", client: client(), issue: { ...issue, dueDate: null }, wasCreated: true, previousAssignedToId: null, now: NOW });
    const [, init] = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/api/tasks"))!;
    expect(JSON.parse(init.body).due).toBeNull();
  });

  it("routes by the ticket's GitHub links", async () => {
    mockGithubLinkFindMany.mockResolvedValue([{ repositoryFullName: "buluma/redmine-dashboard" }]);
    const result = await pushIssueToGr8r({ userId: "u1", client: client(), issue, wasCreated: true, previousAssignedToId: null, now: NOW });
    expect(result).toMatchObject({ pushed: true, project: "CON", via: "repo" });
  });

  it("never creates a second task for a ticket that already has one", async () => {
    mockLinkCreate.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    const result = await pushIssueToGr8r({ userId: "u1", client: client(), issue, wasCreated: false, previousAssignedToId: 210, now: NOW });
    expect(result).toEqual({ pushed: false, reason: "already-linked" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips tickets that aren't newly mine without touching the database or gr8r", async () => {
    const result = await pushIssueToGr8r({ userId: "u1", client: client(), issue, wasCreated: false, previousAssignedToId: ME, now: NOW });
    expect(result).toEqual({ pushed: false, reason: "not-newly-assigned" });
    expect(mockLinkCreate).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps its claim with the error for a later retry, without throwing, when gr8r refuses the task", async () => {
    fetchMock.mockImplementation((url: string) =>
      url.endsWith("/api/projects") ? respond(200, { projects: PROJECTS }) : respond(400, { error: "unknown agent: Converge" }),
    );
    const result = await pushIssueToGr8r({ userId: "u1", client: client(), issue, wasCreated: true, previousAssignedToId: null, now: NOW });
    expect(result).toMatchObject({ pushed: false, reason: "failed" });
    expect((result as { error: string }).error).toContain("unknown agent: Converge");
    expect((result as { error: string }).error).not.toContain("test-token");
    expect(mockLinkDelete).not.toHaveBeenCalled();
    expect(mockLinkUpdate).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { attempts: { increment: 1 }, lastError: expect.stringContaining("unknown agent: Converge") },
    });
  });

  it("releases its claim when no gr8r project fits and there is no fallback", async () => {
    mockEnv.gr8rFallbackProject = undefined;
    const result = await pushIssueToGr8r({
      userId: "u1",
      client: client(),
      issue: { ...issue, projectName: "Seacom" },
      wasCreated: true,
      previousAssignedToId: null,
      now: NOW,
    });
    expect(result).toEqual({ pushed: false, reason: "no-project" });
    expect(mockLinkDelete).toHaveBeenCalledWith({ where: { id: "link-1" } });
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/api/tasks"))).toBe(false);
  });

  it("looks up the Redmine user once and reuses it", async () => {
    const c = client();
    await pushIssueToGr8r({ userId: "u1", client: c, issue, wasCreated: false, previousAssignedToId: ME, now: NOW });
    await pushIssueToGr8r({ userId: "u1", client: c, issue, wasCreated: false, previousAssignedToId: ME, now: NOW });
    expect(c.getCurrentUser).toHaveBeenCalledTimes(1);
  });
});

describe("retryFailedGr8rPushes", () => {
  const fetchMock = vi.fn();
  const STALE = new Date("2026-11-21T09:30:00Z");

  const ticket = {
    id: "issue-1",
    userId: "u1",
    redmineIssueId: 4321,
    subject: "Fix the DRC export",
    description: null,
    projectName: "Streamline",
    tracker: "Bug",
    priority: "High",
    statusName: "New",
    assignedToId: ME,
    dueDate: null,
    startDate: null,
    estimatedHours: null,
    updatedOnRemote: new Date("2026-11-20T09:00:00Z"),
  };

  function failedLink(overrides: Record<string, unknown> = {}) {
    return { id: "link-1", issueId: "issue-1", taskKey: null, attempts: 1, lastError: "HTTP 503", updatedAt: STALE, issue: ticket, ...overrides };
  }

  function client() {
    return { normalizedBaseUrl: "https://redmine.example.com", getCurrentUser: vi.fn().mockResolvedValue({ id: ME }) };
  }

  function respond(status: number, body: unknown) {
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  }

  function routes(existing: Array<{ key: string; title: string }> = []) {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/api/projects")) return respond(200, { projects: PROJECTS });
      if (url.includes("/api/tasks?")) return respond(200, { tasks: existing });
      if (url.endsWith("/api/tasks") && init?.method === "POST") return respond(201, { task: { key: "STR-9" } });
      return respond(404, { error: "not found" });
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    resetGr8rCurrentUserCache();
    mockEnv.gr8rUrl = "http://gr8r.test:8787";
    mockEnv.gr8rToken = "test-token";
    mockEnv.gr8rFallbackProject = "STR";
    mockLinkFindMany.mockResolvedValue([failedLink()]);
    mockLinkUpdateMany.mockResolvedValue({ count: 1 });
    mockLinkUpdate.mockResolvedValue({});
    mockLinkDelete.mockResolvedValue({});
    mockGithubLinkFindMany.mockResolvedValue([]);
    routes();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing when gr8r isn't configured", async () => {
    mockEnv.gr8rToken = undefined;
    expect(await retryFailedGr8rPushes({ userId: "u1", client: client(), now: NOW })).toEqual({ retried: 0, pushed: 0, recovered: 0, dropped: 0, failed: 0 });
    expect(mockLinkFindMany).not.toHaveBeenCalled();
  });

  it("only picks up this user's unfinished pushes that are old enough and still have attempts left", async () => {
    await retryFailedGr8rPushes({ userId: "u1", client: client(), now: NOW });
    expect(mockLinkFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          taskKey: null,
          attempts: { lt: 5 },
          updatedAt: { lt: new Date("2026-11-21T09:50:00Z") },
          issue: { userId: "u1" },
        },
      }),
    );
  });

  it("creates the task it failed to create before, and records the key", async () => {
    const result = await retryFailedGr8rPushes({ userId: "u1", client: client(), now: NOW });
    expect(result).toEqual({ retried: 1, pushed: 1, recovered: 0, dropped: 0, failed: 0 });
    expect(mockLinkUpdateMany).toHaveBeenCalledWith({
      where: { id: "link-1", taskKey: null, updatedAt: STALE },
      data: { attempts: { increment: 1 } },
    });
    const post = fetchMock.mock.calls.find(([u, i]) => String(u).endsWith("/api/tasks") && i?.method === "POST");
    expect(JSON.parse(post![1].body)).toMatchObject({ title: "Redmine #4321: Fix the DRC export", project: "STR" });
    expect(mockLinkUpdate).toHaveBeenCalledWith({ where: { id: "link-1" }, data: { taskKey: "STR-9", lastError: null } });
  });

  it("adopts a task gr8r already created (a lost response) instead of making a second one", async () => {
    routes([
      { key: "STR-3", title: "Redmine #43210: Another ticket" },
      { key: "STR-7", title: "Redmine #4321: Fix the DRC export" },
    ]);
    const result = await retryFailedGr8rPushes({ userId: "u1", client: client(), now: NOW });
    expect(result).toMatchObject({ retried: 1, pushed: 0, recovered: 1 });
    const search = fetchMock.mock.calls.find(([u]) => String(u).includes("/api/tasks?"));
    expect(String(search![0])).toContain("archived=1");
    expect(fetchMock.mock.calls.some(([u, i]) => String(u).endsWith("/api/tasks") && i?.method === "POST")).toBe(false);
    expect(mockLinkUpdate).toHaveBeenCalledWith({ where: { id: "link-1" }, data: { taskKey: "STR-7", lastError: null } });
  });

  it("drops the push when the ticket is no longer assigned to me", async () => {
    mockLinkFindMany.mockResolvedValue([failedLink({ issue: { ...ticket, assignedToId: 210 } })]);
    const result = await retryFailedGr8rPushes({ userId: "u1", client: client(), now: NOW });
    expect(result).toMatchObject({ retried: 1, dropped: 1, pushed: 0 });
    expect(mockLinkDelete).toHaveBeenCalledWith({ where: { id: "link-1" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves a row another run has already taken alone", async () => {
    mockLinkUpdateMany.mockResolvedValue({ count: 0 });
    const result = await retryFailedGr8rPushes({ userId: "u1", client: client(), now: NOW });
    expect(result).toEqual({ retried: 0, pushed: 0, recovered: 0, dropped: 0, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records the error again when the retry fails, and never throws", async () => {
    fetchMock.mockImplementation(() => respond(503, { error: "down" }));
    const result = await retryFailedGr8rPushes({ userId: "u1", client: client(), now: NOW });
    expect(result).toMatchObject({ retried: 1, failed: 1 });
    expect(mockLinkUpdate).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { lastError: expect.stringContaining("HTTP 503") },
    });
  });

  it("gives up quietly when nothing to retry", async () => {
    mockLinkFindMany.mockResolvedValue([]);
    const c = client();
    expect(await retryFailedGr8rPushes({ userId: "u1", client: c, now: NOW })).toMatchObject({ retried: 0 });
    expect(c.getCurrentUser).not.toHaveBeenCalled();
  });
});
