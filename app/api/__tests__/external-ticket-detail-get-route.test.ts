import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockIssueFindFirst = vi.fn();
const mockGetSessionUserId = vi.fn();

vi.mock("@/src/lib/db", () => ({
  prisma: { issue: { findFirst: mockIssueFindFirst } },
}));

vi.mock("@/src/lib/session", () => ({
  getSessionUserId: mockGetSessionUserId,
}));

vi.mock("@/src/lib/auth", () => ({
  requireRedmineClientForUser: vi.fn(),
}));

vi.mock("@/src/lib/sync", () => ({
  syncSingleIssue: vi.fn(),
}));

vi.mock("@/src/lib/telemetry", () => ({
  trackFailure: vi.fn(),
  trackInfo: vi.fn(),
}));

function getRequest(apiKey?: string) {
  return new NextRequest("http://localhost/api/external/tickets/unused", {
    headers: apiKey ? { "x-api-key": apiKey } : undefined,
  });
}

describe("GET /api/external/tickets/[id] ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("EXTERNAL_API_KEYS", "external-key");
    mockIssueFindFirst.mockResolvedValue(null);
    mockGetSessionUserId.mockResolvedValue("user-1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["cuid-foreign", [{ id: "cuid-foreign" }]],
    ["42", [{ id: "42" }, { redmineIssueId: 42 }]],
    ["L-7", [{ id: "L-7" }, { source: "local", localIssueNumber: 7 }]],
  ])("scopes session lookup for %s to its owner", async (id, alternatives) => {
    const { GET } = await import("@/app/api/external/tickets/[id]/route");
    const response = await GET(getRequest(), { params: Promise.resolve({ id }) });

    expect(response.status).toBe(404);
    expect(mockIssueFindFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", OR: alternatives },
    });
  });

  it("keeps valid API-key reads global", async () => {
    const { GET } = await import("@/app/api/external/tickets/[id]/route");
    const response = await GET(getRequest("external-key"), {
      params: Promise.resolve({ id: "cuid-foreign" }),
    });

    expect(response.status).toBe(404);
    expect(mockIssueFindFirst.mock.calls[0][0].where).not.toHaveProperty("userId");
    expect(mockGetSessionUserId).not.toHaveBeenCalled();
  });
});
