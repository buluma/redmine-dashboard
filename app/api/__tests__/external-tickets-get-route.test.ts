import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockIssueFindMany = vi.fn();
const mockIssueCount = vi.fn();
const mockGetSessionUserId = vi.fn();

vi.mock("@/src/lib/db", () => ({
  prisma: {
    issue: {
      findMany: mockIssueFindMany,
      count: mockIssueCount,
    },
  },
}));

vi.mock("@/src/lib/telemetry", () => ({
  trackFailure: vi.fn(),
}));

vi.mock("@/src/lib/session", () => ({
  getSessionUserId: mockGetSessionUserId,
}));

function getRequest(query: string, apiKey?: string) {
  const url = new URL(`http://localhost/api/external/tickets${query}`);
  return new NextRequest(url, {
    headers: apiKey ? { "x-api-key": apiKey } : undefined,
  });
}

describe("GET /api/external/tickets authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("EXTERNAL_API_KEYS", "external-key");
    vi.stubEnv("AI_SUMMARY_API_KEY", "");
    mockIssueFindMany.mockResolvedValue([]);
    mockIssueCount.mockResolvedValue(0);
    mockGetSessionUserId.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects anonymous search when the AI key is unset", async () => {
    const { GET } = await import("@/app/api/external/tickets/route");
    const response = await GET(getRequest("?search=login"));

    expect(response.status).toBe(401);
    expect(mockIssueFindMany).not.toHaveBeenCalled();
  });

  it("rejects an invalid supplied key when the AI key is unset", async () => {
    const { GET } = await import("@/app/api/external/tickets/route");
    const response = await GET(getRequest("?search=login", "invalid-key"));

    expect(response.status).toBe(401);
    expect(mockIssueFindMany).not.toHaveBeenCalled();
  });

  it("rejects an invalid key when the AI key is still the placeholder", async () => {
    vi.stubEnv("AI_SUMMARY_API_KEY", "your-ai-summary-api-key");
    const { GET } = await import("@/app/api/external/tickets/route");
    const response = await GET(getRequest("?search=login", "invalid-key"));

    expect(response.status).toBe(401);
    expect(mockIssueFindMany).not.toHaveBeenCalled();
  });

  it("accepts a configured external API key for search", async () => {
    const { GET } = await import("@/app/api/external/tickets/route");
    const response = await GET(getRequest("?search=login", "external-key"));

    expect(response.status).toBe(200);
    expect(mockIssueFindMany).toHaveBeenCalledOnce();
  });

  it("accepts the configured AI summary key for search", async () => {
    vi.stubEnv("AI_SUMMARY_API_KEY", "ai-search-key");
    const { GET } = await import("@/app/api/external/tickets/route");
    const response = await GET(getRequest("?search=login", "ai-search-key"));

    expect(response.status).toBe(200);
    expect(mockIssueFindMany).toHaveBeenCalledOnce();
  });

  it("accepts an authenticated session when no API key is supplied", async () => {
    vi.stubEnv("AI_SUMMARY_API_KEY", "ai-search-key");
    mockGetSessionUserId.mockResolvedValue("user-1");
    const { GET } = await import("@/app/api/external/tickets/route");
    const response = await GET(getRequest("?search=login"));

    expect(response.status).toBe(200);
    expect(mockIssueFindMany).toHaveBeenCalledOnce();
  });
});
