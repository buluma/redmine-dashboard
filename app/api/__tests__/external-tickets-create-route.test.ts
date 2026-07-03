import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ── shared mocks ──────────────────────────────────────────────────

const mockUserFindFirst = vi.fn();
const mockIssueAggregate = vi.fn();
const mockIssueCreate = vi.fn();

vi.mock("@/src/lib/db", () => ({
  prisma: {
    user: { findFirst: mockUserFindFirst },
    issue: { aggregate: mockIssueAggregate, create: mockIssueCreate },
  },
}));

vi.mock("@/src/lib/telemetry", () => ({
  trackFailure: vi.fn(),
}));

function withKey(body: unknown) {
  return new NextRequest("http://localhost/api/external/tickets", {
    method: "POST",
    headers: { "x-api-key": "test-key", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function withoutKey(body: unknown) {
  return new NextRequest("http://localhost/api/external/tickets", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ── POST /api/external/tickets ─────────────────────────────────────

describe("POST /api/external/tickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("EXTERNAL_API_KEYS", "test-key");
    mockUserFindFirst.mockResolvedValue({ id: "user-1" });
    mockIssueAggregate.mockResolvedValue({ _max: { localIssueNumber: 5 } });
  });

  it("requires a valid API key", async () => {
    const { POST } = await import("@/app/api/external/tickets/route");
    const res = await POST(withoutKey({ subject: "x" }));
    expect(res.status).toBe(401);
    expect(mockIssueCreate).not.toHaveBeenCalled();
  });

  it("creates a local ticket with an auto-incremented localIssueNumber", async () => {
    mockIssueCreate.mockResolvedValue({
      id: "issue-1",
      redmineIssueId: null,
      subject: "Misc / Unlinked",
      description: "Catch-all for unlinked WakaTime activity",
      projectName: null,
      tracker: undefined,
      statusName: "New",
      priority: undefined,
      assignedToName: undefined,
      authorName: undefined,
      dueDate: null,
      doneRatio: null,
      createdAt: new Date("2026-07-03T00:00:00Z"),
      updatedAt: new Date("2026-07-03T00:00:00Z"),
    });

    const { POST } = await import("@/app/api/external/tickets/route");
    const res = await POST(
      withKey({ subject: "Misc / Unlinked", description: "Catch-all for unlinked WakaTime activity" })
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.ticket.id).toBe("issue-1");
    expect(json.ticket.subject).toBe("Misc / Unlinked");
    expect(mockIssueCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        source: "local",
        localIssueNumber: 6, // max(5) + 1
        subject: "Misc / Unlinked",
        description: "Catch-all for unlinked WakaTime activity",
        statusId: 1,
        statusName: "New",
      }),
    });
  });

  it("rejects a missing subject", async () => {
    const { POST } = await import("@/app/api/external/tickets/route");
    const res = await POST(withKey({ description: "no subject" }));
    expect(res.status).toBe(400);
    expect(mockIssueCreate).not.toHaveBeenCalled();
  });

  it("returns 503 when there's no user to attach the ticket to", async () => {
    mockUserFindFirst.mockResolvedValue(null);
    const { POST } = await import("@/app/api/external/tickets/route");
    const res = await POST(withKey({ subject: "x" }));
    expect(res.status).toBe(503);
    expect(mockIssueCreate).not.toHaveBeenCalled();
  });
});
