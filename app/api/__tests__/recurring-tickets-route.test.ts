import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockUserFindFirst = vi.fn();
const mockGetDueSeriesForCreate = vi.fn();
const mockGetInstancesDueForClose = vi.fn();
const mockRunRecurringTicketsTick = vi.fn();
const mockAcquireLeaderLock = vi.fn();
const mockRequireRedmineClientForUser = vi.fn();

vi.mock("@/src/lib/db", () => ({
  prisma: { user: { findFirst: mockUserFindFirst } },
}));

vi.mock("@/src/lib/recurring-tickets", () => ({
  computePeriodKey: vi.fn(() => "2026-W29"),
  computeScheduledWindow: vi.fn(() => ({
    createDate: new Date("2026-07-13T00:00:00Z"),
    closeDate: new Date("2026-07-19T00:00:00Z"),
  })),
  getDueSeriesForCreate: mockGetDueSeriesForCreate,
  getInstancesDueForClose: mockGetInstancesDueForClose,
  runRecurringTicketsTick: mockRunRecurringTicketsTick,
}));

vi.mock("@/src/lib/leader-lock", () => ({
  acquireLeaderLock: mockAcquireLeaderLock,
}));

vi.mock("@/src/lib/auth", () => ({
  requireRedmineClientForUser: mockRequireRedmineClientForUser,
}));

vi.mock("@/src/lib/telemetry", () => ({
  trackFailure: vi.fn(),
}));

function withKey(method: string) {
  return new NextRequest("http://localhost/api/external/recurring-tickets", {
    method,
    headers: { "x-api-key": "test-key" },
  });
}

function withoutKey(method: string) {
  return new NextRequest("http://localhost/api/external/recurring-tickets", { method });
}

describe("GET /api/external/recurring-tickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("EXTERNAL_API_KEYS", "test-key");
    mockUserFindFirst.mockResolvedValue({ id: "user-1" });
  });

  it("requires a valid API key", async () => {
    const { GET } = await import("@/app/api/external/recurring-tickets/route");
    const res = await GET(withoutKey("GET"));
    expect(res.status).toBe(401);
    expect(mockGetDueSeriesForCreate).not.toHaveBeenCalled();
  });

  it("returns a dry preview of what would be created and closed", async () => {
    mockGetDueSeriesForCreate.mockResolvedValue([
      { key: "drc-support", name: "DRC Support", cadence: "weekly" },
    ]);
    mockGetInstancesDueForClose.mockResolvedValue([
      {
        id: "instance-1",
        seriesId: "series-1",
        periodKey: "2026-W28",
        subject: "Week 28 DRC Support",
        scheduledCloseDate: new Date("2026-07-12T00:00:00Z"),
        status: "open",
        closeAttempts: 0,
      },
    ]);

    const { GET } = await import("@/app/api/external/recurring-tickets/route");
    const res = await GET(withKey("GET"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.dueToCreate).toEqual([
      expect.objectContaining({ seriesKey: "drc-support", periodKey: "2026-W29" }),
    ]);
    expect(body.dueToClose).toEqual([
      expect.objectContaining({ instanceId: "instance-1", status: "open" }),
    ]);
  });

  it("returns 503 when there's no user", async () => {
    mockUserFindFirst.mockResolvedValue(null);
    const { GET } = await import("@/app/api/external/recurring-tickets/route");
    const res = await GET(withKey("GET"));
    expect(res.status).toBe(503);
  });
});

describe("POST /api/external/recurring-tickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("EXTERNAL_API_KEYS", "test-key");
    mockUserFindFirst.mockResolvedValue({ id: "user-1" });
    mockAcquireLeaderLock.mockResolvedValue(true);
    mockRequireRedmineClientForUser.mockResolvedValue({ client: {} });
    mockRunRecurringTicketsTick.mockResolvedValue({
      created: [],
      createFailures: [],
      closed: [],
      closeFailures: [],
    });
  });

  it("requires a valid API key", async () => {
    const { POST } = await import("@/app/api/external/recurring-tickets/route");
    const res = await POST(withoutKey("POST"));
    expect(res.status).toBe(401);
    expect(mockAcquireLeaderLock).not.toHaveBeenCalled();
  });

  it("returns locked:true and skips the tick when another run holds the lock", async () => {
    mockAcquireLeaderLock.mockResolvedValue(false);

    const { POST } = await import("@/app/api/external/recurring-tickets/route");
    const res = await POST(withKey("POST"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.locked).toBe(true);
    expect(mockRequireRedmineClientForUser).not.toHaveBeenCalled();
    expect(mockRunRecurringTicketsTick).not.toHaveBeenCalled();
  });

  it("runs the tick and returns its result when it acquires the lock", async () => {
    mockRunRecurringTicketsTick.mockResolvedValue({
      created: [{ seriesKey: "drc-support", periodKey: "2026-W29", issueId: "issue-1", redmineIssueId: 9001 }],
      createFailures: [],
      closed: [],
      closeFailures: [],
    });

    const { POST } = await import("@/app/api/external/recurring-tickets/route");
    const res = await POST(withKey("POST"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.locked).toBe(false);
    expect(body.created).toHaveLength(1);
    expect(mockRunRecurringTicketsTick).toHaveBeenCalledWith("user-1", {});
  });

  it("returns 503 when there's no user", async () => {
    mockUserFindFirst.mockResolvedValue(null);
    const { POST } = await import("@/app/api/external/recurring-tickets/route");
    const res = await POST(withKey("POST"));
    expect(res.status).toBe(503);
  });

  it("returns 500 with the error message when the Redmine credential is missing", async () => {
    mockRequireRedmineClientForUser.mockRejectedValue(new Error("Redmine account not connected"));

    const { POST } = await import("@/app/api/external/recurring-tickets/route");
    const res = await POST(withKey("POST"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Redmine account not connected");
  });
});
