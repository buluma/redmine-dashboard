import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuthenticatedUserId = vi.fn();
const mockPrisma = {
  issue: { findMany: vi.fn() },
};
const mockEnv = {
  enableAiFeatures: true,
  aiSearchEnabled: true,
};
const mockGetLLMProviderManager = vi.fn();

vi.mock("@/src/lib/auth", () => ({
  getAuthenticatedUserId: mockGetAuthenticatedUserId,
}));

vi.mock("@/src/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/src/lib/env", () => ({
  env: mockEnv,
}));

vi.mock("@/src/lib/llm-provider", () => ({
  getLLMProviderManager: mockGetLLMProviderManager,
}));

vi.mock("@/src/lib/http", () => ({
  jsonError: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status }),
}));

describe("POST /api/ai/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.enableAiFeatures = true;
    mockEnv.aiSearchEnabled = true;
  });

  it("returns 403 when AI search is disabled", async () => {
    mockEnv.aiSearchEnabled = false;
    const { POST } = await import("@/app/api/ai/search/route");
    const request = new Request("http://localhost/api/ai/search", {
      method: "POST",
      body: JSON.stringify({ query: "bug" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("returns 401 when no authenticated user", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue(null);
    const { POST } = await import("@/app/api/ai/search/route");
    const request = new Request("http://localhost/api/ai/search", {
      method: "POST",
      body: JSON.stringify({ query: "bug" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(mockPrisma.issue.findMany).not.toHaveBeenCalled();
  });

  it("routes search through the configured provider", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue("real_user");
    mockPrisma.issue.findMany.mockResolvedValue([{ id: "1", subject: "Bug", updatedOnRemote: new Date() }]);
    const chat = vi.fn().mockResolvedValue({ content: JSON.stringify({ results: [], insights: "done" }), model: "proxy-model", provider: "cliproxyapi" });
    mockGetLLMProviderManager.mockReturnValue({ chat, getProvider: () => "cliproxyapi" });
    const { POST } = await import("@/app/api/ai/search/route");
    const response = await POST(new Request("http://localhost/api/ai/search", { method: "POST", body: JSON.stringify({ query: "bug" }) }));
    expect(response.status).toBe(200);
    expect(chat).toHaveBeenCalledOnce();
    expect(await response.json()).toMatchObject({ modelUsed: "proxy-model", usedFallback: false });
  });

  it("scopes the issue query to the authenticated user, ignoring any body userId", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue("real_user");
    mockPrisma.issue.findMany.mockResolvedValue([]);

    const { POST } = await import("@/app/api/ai/search/route");
    const request = new Request("http://localhost/api/ai/search", {
      method: "POST",
      body: JSON.stringify({ query: "bug", userId: "attacker_target" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);

    const whereArg = mockPrisma.issue.findMany.mock.calls[0][0].where;
    expect(whereArg).toEqual({ userId: "real_user" });
  });
});
