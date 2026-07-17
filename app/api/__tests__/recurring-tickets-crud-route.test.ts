import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRole = vi.fn();
const mockGetAuthenticatedUserId = vi.fn();
const mockRequireRedmineClientForUser = vi.fn();
const mockListSeries = vi.fn();
const mockCreateSeries = vi.fn();
const mockGetSeries = vi.fn();
const mockUpdateSeries = vi.fn();
const mockToggleSeries = vi.fn();
const mockListRecentInstances = vi.fn();

vi.mock("@/src/lib/rbac", () => ({ requireRole: mockRequireRole }));
vi.mock("@/src/lib/auth", () => ({
  getAuthenticatedUserId: mockGetAuthenticatedUserId,
  requireRedmineClientForUser: mockRequireRedmineClientForUser,
}));
vi.mock("@/src/lib/recurring-ticket-series", () => ({
  listSeries: mockListSeries,
  createSeries: mockCreateSeries,
  getSeries: mockGetSeries,
  updateSeries: mockUpdateSeries,
  toggleSeries: mockToggleSeries,
  listRecentInstances: mockListRecentInstances,
}));
vi.mock("@/src/lib/telemetry", () => ({ trackFailure: vi.fn() }));

function req(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/recurring-tickets", {
    method,
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function validSeriesInput() {
  return {
    key: "drc-support",
    name: "DRC Support",
    redmineProjectId: 10,
    parentIssueId: 113554,
    trackerId: 3,
    priorityId: 2,
    subjectTemplate: "Week {{week}} DRC Support",
    cadence: "weekly",
    createWeekday: 1,
    closeWeekday: 7,
    createDayOfMonth: 1,
    wakatimeProjectName: "drc-support",
    defaultActivityId: 9,
    defaultActivityName: "Development",
    expectsTime: false,
  };
}

describe("GET/POST /api/recurring-tickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(undefined);
    mockGetAuthenticatedUserId.mockResolvedValue("user-1");
  });

  it("GET returns 401 for a non-admin", async () => {
    mockRequireRole.mockRejectedValue(new Error("Role requirement not met"));
    const { GET } = await import("@/app/api/recurring-tickets/route");
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockListSeries).not.toHaveBeenCalled();
  });

  it("GET returns the series list", async () => {
    mockListSeries.mockResolvedValue([{ id: "s1", key: "drc-support" }]);
    const { GET } = await import("@/app/api/recurring-tickets/route");
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.items).toEqual([{ id: "s1", key: "drc-support" }]);
  });

  it("POST rejects an invalid key format", async () => {
    const { POST } = await import("@/app/api/recurring-tickets/route");
    const res = await POST(req("POST", { ...validSeriesInput(), key: "DRC Support!" }));
    expect(res.status).toBe(400);
    expect(mockCreateSeries).not.toHaveBeenCalled();
  });

  it("POST creates a series on valid input", async () => {
    mockCreateSeries.mockResolvedValue({ id: "s1", ...validSeriesInput() });
    const { POST } = await import("@/app/api/recurring-tickets/route");
    const res = await POST(req("POST", validSeriesInput()));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.series.id).toBe("s1");
    expect(mockCreateSeries).toHaveBeenCalledWith("user-1", expect.objectContaining({ key: "drc-support" }));
  });

  it("POST returns 409 when the key already exists", async () => {
    mockCreateSeries.mockRejectedValue({ code: "P2002" });
    const { POST } = await import("@/app/api/recurring-tickets/route");
    const res = await POST(req("POST", validSeriesInput()));
    expect(res.status).toBe(409);
  });

  it("POST derives redmineProjectId from the parent issue's project when omitted", async () => {
    const { redmineProjectId: _omit, ...withoutProjectId } = validSeriesInput();
    mockRequireRedmineClientForUser.mockResolvedValue({
      client: { getIssue: vi.fn().mockResolvedValue({ issue: { project: { id: 7, name: "Streamline" } } }) },
    });
    mockCreateSeries.mockResolvedValue({ id: "s1", ...validSeriesInput() });

    const { POST } = await import("@/app/api/recurring-tickets/route");
    const res = await POST(req("POST", withoutProjectId));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.series.id).toBe("s1");
    expect(mockCreateSeries).toHaveBeenCalledWith("user-1", expect.objectContaining({ redmineProjectId: 7 }));
  });

  it("POST returns 400 when the parent issue has no resolvable project", async () => {
    const { redmineProjectId: _omit, ...withoutProjectId } = validSeriesInput();
    mockRequireRedmineClientForUser.mockResolvedValue({
      client: { getIssue: vi.fn().mockResolvedValue({ issue: {} }) },
    });

    const { POST } = await import("@/app/api/recurring-tickets/route");
    const res = await POST(req("POST", withoutProjectId));
    expect(res.status).toBe(400);
    expect(mockCreateSeries).not.toHaveBeenCalled();
  });

  it("POST returns 400 when the parent issue lookup itself fails", async () => {
    const { redmineProjectId: _omit, ...withoutProjectId } = validSeriesInput();
    mockRequireRedmineClientForUser.mockRejectedValue(new Error("Redmine account not connected"));

    const { POST } = await import("@/app/api/recurring-tickets/route");
    const res = await POST(req("POST", withoutProjectId));
    expect(res.status).toBe(400);
    expect(mockCreateSeries).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/recurring-tickets/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(undefined);
    mockGetAuthenticatedUserId.mockResolvedValue("user-1");
    mockGetSeries.mockResolvedValue({ id: "s1", key: "drc-support" });
  });

  function params(id = "s1") {
    return { params: Promise.resolve({ id }) };
  }

  it("returns 404 when the series doesn't belong to the user", async () => {
    mockGetSeries.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/recurring-tickets/[id]/route");
    const res = await PATCH(req("PATCH", { name: "x" }), params());
    expect(res.status).toBe(404);
  });

  it("toggles isActive when that's the only field sent", async () => {
    const { PATCH } = await import("@/app/api/recurring-tickets/[id]/route");
    const res = await PATCH(req("PATCH", { isActive: false }), params());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, isActive: false });
    expect(mockToggleSeries).toHaveBeenCalledWith("s1", "user-1", false);
    expect(mockUpdateSeries).not.toHaveBeenCalled();
  });

  it("runs a full update for multi-field bodies", async () => {
    mockUpdateSeries.mockResolvedValue({ id: "s1", name: "Renamed" });
    const { PATCH } = await import("@/app/api/recurring-tickets/[id]/route");
    const res = await PATCH(req("PATCH", { name: "Renamed", priorityId: 3 }), params());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.series.name).toBe("Renamed");
    expect(mockUpdateSeries).toHaveBeenCalledWith("s1", "user-1", { name: "Renamed", priorityId: 3 });
  });

  it("rejects an invalid cadence value", async () => {
    const { PATCH } = await import("@/app/api/recurring-tickets/[id]/route");
    const res = await PATCH(req("PATCH", { cadence: "daily", name: "x" }), params());
    expect(res.status).toBe(400);
    expect(mockUpdateSeries).not.toHaveBeenCalled();
  });
});

describe("GET /api/recurring-tickets/instances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(undefined);
    mockGetAuthenticatedUserId.mockResolvedValue("user-1");
  });

  it("returns 401 for a non-admin", async () => {
    mockRequireRole.mockRejectedValue(new Error("Role requirement not met"));
    const { GET } = await import("@/app/api/recurring-tickets/instances/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the instance history", async () => {
    mockListRecentInstances.mockResolvedValue([{ id: "i1", seriesKey: "drc-support" }]);
    const { GET } = await import("@/app/api/recurring-tickets/instances/route");
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.items).toEqual([{ id: "i1", seriesKey: "drc-support" }]);
  });
});
