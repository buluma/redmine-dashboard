import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireCurrentUser = vi.fn();
const mockRequireRedmineClient = vi.fn();
const mockPrisma = {
  issue: { findFirst: vi.fn() },
  favorite: { findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  statusCatalog: { findMany: vi.fn().mockResolvedValue([]) },
};
const mockSyncSingleIssue = vi.fn();
const mockBuildBreadcrumbChain = vi.fn();
const mockTelemetry = {
  trackSuccess: vi.fn(),
  trackFailure: vi.fn(),
};

vi.mock("@/src/lib/auth", () => ({
  requireCurrentUser: mockRequireCurrentUser,
  requireRedmineClient: mockRequireRedmineClient,
}));

vi.mock("@/src/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/src/lib/sync", () => ({
  syncSingleIssue: mockSyncSingleIssue,
  buildBreadcrumbChain: mockBuildBreadcrumbChain,
}));

vi.mock("@/src/lib/telemetry", () => mockTelemetry);

vi.mock("@/src/lib/http", () => ({
  jsonError: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status }),
  parseJson: async (request: Request, schema: any) => {
    const body = await request.json();
    return schema.parse(body);
  },
}));

vi.mock("@/src/lib/redmine", () => ({
  redmineMessageFromError: (_: any, fallback: string) => fallback,
  redmineStatusFromError: (_: any) => 400,
}));

vi.mock("@/src/lib/issue-shape", () => ({
  toIssueView: (issue: any) => issue,
}));

describe("issue favorite route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/issues/[id]/favorite", () => {
    it("returns 400 when issue ID is invalid", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user_1" });

      const { POST } = await import("@/app/api/issues/[id]/favorite/route");
      const request = new Request("http://localhost/api/issues/abc/favorite", {
        method: "POST",
      });
      const context = { params: Promise.resolve({ id: "abc" }) };
      const response = await POST(request as any, context as any);
      expect(response.status).toBe(400);
    });

    it("creates favorite when not already favorited", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user_1" });
      mockPrisma.favorite.findUnique.mockResolvedValue(null);
      mockPrisma.favorite.create.mockResolvedValue({
        id: "fav_1",
        userId: "user_1",
        issueId: 123,
      });

      const { POST } = await import("@/app/api/issues/[id]/favorite/route");
      const request = new Request("http://localhost/api/issues/123/favorite", {
        method: "POST",
      });
      const context = { params: Promise.resolve({ id: "123" }) };
      const response = await POST(request as any, context as any);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.favorited).toBe(true);
    });

    it("returns early when already favorited", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user_1" });
      mockPrisma.favorite.findUnique.mockResolvedValue({
        id: "fav_1",
        userId: "user_1",
        issueId: 123,
      });

      const { POST } = await import("@/app/api/issues/[id]/favorite/route");
      const request = new Request("http://localhost/api/issues/123/favorite", {
        method: "POST",
      });
      const context = { params: Promise.resolve({ id: "123" }) };
      const response = await POST(request as any, context as any);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.favorited).toBe(true);
      expect(body.message).toBe("Already favorited");
    });
  });

  describe("DELETE /api/issues/[id]/favorite", () => {
    it("removes favorite successfully", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user_1" });
      mockPrisma.favorite.deleteMany.mockResolvedValue({ count: 1 });

      const { DELETE } = await import("@/app/api/issues/[id]/favorite/route");
      const request = new Request("http://localhost/api/issues/123/favorite", {
        method: "DELETE",
      });
      const context = { params: Promise.resolve({ id: "123" }) };
      const response = await DELETE(request as any, context as any);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.favorited).toBe(false);
    });

    it("returns 400 when issue ID is invalid", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user_1" });

      const { DELETE } = await import("@/app/api/issues/[id]/favorite/route");
      const request = new Request("http://localhost/api/issues/invalid/favorite", {
        method: "DELETE",
      });
      const context = { params: Promise.resolve({ id: "invalid" }) };
      const response = await DELETE(request as any, context as any);
      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/issues/[id]/favorite", () => {
    it("returns favorited: true when favorite exists", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user_1" });
      mockPrisma.favorite.findUnique.mockResolvedValue({
        id: "fav_1",
        userId: "user_1",
        issueId: 123,
      });

      const { GET } = await import("@/app/api/issues/[id]/favorite/route");
      const request = new Request("http://localhost/api/issues/123/favorite");
      const context = { params: Promise.resolve({ id: "123" }) };
      const response = await GET(request as any, context as any);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.favorited).toBe(true);
    });

    it("returns favorited: false when favorite does not exist", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user_1" });
      mockPrisma.favorite.findUnique.mockResolvedValue(null);

      const { GET } = await import("@/app/api/issues/[id]/favorite/route");
      const request = new Request("http://localhost/api/issues/123/favorite");
      const context = { params: Promise.resolve({ id: "123" }) };
      const response = await GET(request as any, context as any);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.favorited).toBe(false);
    });
  });
});

describe("issue assign route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/issues/[id]/assign", () => {
    it("returns 404 when issue not found", async () => {
      mockRequireRedmineClient.mockResolvedValue({
        user: { id: "user_1" },
        client: { updateIssue: vi.fn() },
      });
      mockPrisma.issue.findFirst.mockResolvedValue(null);

      const { POST } = await import("@/app/api/issues/[id]/assign/route");
      const request = new Request("http://localhost/api/issues/123/assign", {
        method: "POST",
        body: JSON.stringify({ userId: 456 }),
      });
      const context = { params: Promise.resolve({ id: "123" }) };
      const response = await POST(request as any, context as any);
      expect(response.status).toBe(404);
    });

    it("assigns issue successfully", async () => {
      const mockUpdateIssue = vi.fn().mockResolvedValue(undefined);
      mockRequireRedmineClient.mockResolvedValue({
        user: { id: "user_1" },
        client: { updateIssue: mockUpdateIssue },
      });
      mockPrisma.issue.findFirst.mockResolvedValue({ id: "issue_1" });
      mockSyncSingleIssue.mockResolvedValue(undefined);

      const { POST } = await import("@/app/api/issues/[id]/assign/route");
      const request = new Request("http://localhost/api/issues/123/assign", {
        method: "POST",
        body: JSON.stringify({ userId: 456 }),
      });
      const context = { params: Promise.resolve({ id: "123" }) };
      const response = await POST(request as any, context as any);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(mockUpdateIssue).toHaveBeenCalledWith(123, { assignedToId: 456 });
    });
  });
});
