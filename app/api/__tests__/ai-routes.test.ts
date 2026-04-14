import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireCurrentUser = vi.fn();
const mockRequireMobileUser = vi.fn();
const mockRequireRedmineClientForUser = vi.fn();
const mockPrisma = {
  issue: { findFirst: vi.fn() },
  webLog: { create: vi.fn() },
  aiSummary: { findFirst: vi.fn(), upsert: vi.fn() },
};
const mockGetLLMProviderManager = vi.fn();
const mockEnv = {
  enableAiFeatures: true,
  aiSummarizeEnabled: true,
  aiCategorizeEnabled: true,
  aiSearchEnabled: true,
};

vi.mock("@/src/lib/auth", () => ({
  requireCurrentUser: mockRequireCurrentUser,
  requireMobileUser: mockRequireMobileUser,
  requireRedmineClientForUser: mockRequireRedmineClientForUser,
}));

vi.mock("@/src/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/src/lib/llm-provider", () => ({
  getLLMProviderManager: mockGetLLMProviderManager,
}));

vi.mock("@/src/lib/env", () => ({
  env: mockEnv,
}));

vi.mock("@/src/lib/attachment-ai", () => ({
  extractAttachmentSnippetsForAi: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/src/lib/http", () => ({
  jsonError: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status }),
}));

describe("AI summarize route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/ai/summarize", () => {
    it("returns 403 when AI summarization is disabled", async () => {
      mockEnv.aiSummarizeEnabled = false;
      const { POST } = await import("@/app/api/ai/summarize/route");
      const request = new Request("http://localhost/api/ai/summarize", {
        method: "POST",
        body: JSON.stringify({ issueId: "123" }),
      });
      const response = await POST(request);
      expect(response.status).toBe(403);
    });

    it("returns 401 when user is unauthorized", async () => {
      mockEnv.aiSummarizeEnabled = true;
      mockRequireCurrentUser.mockRejectedValue(new Error("Unauthorized"));
      mockRequireMobileUser.mockRejectedValue(new Error("Unauthorized"));

      const { POST } = await import("@/app/api/ai/summarize/route");
      const request = new Request("http://localhost/api/ai/summarize", {
        method: "POST",
        body: JSON.stringify({ issueId: "123" }),
      });
      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it("returns 400 when issueId is missing", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user_1" });

      const { POST } = await import("@/app/api/ai/summarize/route");
      const request = new Request("http://localhost/api/ai/summarize", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it("returns 404 when issue not found", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user_1" });
      mockPrisma.issue.findFirst.mockResolvedValue(null);

      const { POST } = await import("@/app/api/ai/summarize/route");
      const request = new Request("http://localhost/api/ai/summarize", {
        method: "POST",
        body: JSON.stringify({ issueId: "nonexistent" }),
      });
      const response = await POST(request);
      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/ai/summarize", () => {
    it("returns 400 when issueId param is missing", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user_1" });

      const { GET } = await import("@/app/api/ai/summarize/route");
      const request = new Request("http://localhost/api/ai/summarize");
      const response = await GET(request);
      expect(response.status).toBe(400);
    });

    it("returns null summary when no summary exists", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user_1" });
      mockPrisma.issue.findFirst.mockResolvedValue({ id: "issue_1" });
      mockPrisma.aiSummary.findFirst.mockResolvedValue(null);

      const { GET } = await import("@/app/api/ai/summarize/route");
      const request = new Request("http://localhost/api/ai/summarize?issueId=123");
      const response = await GET(request);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.summary).toBeNull();
    });
  });
});

describe("AI categorize route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/ai/categorize", () => {
    it("returns 403 when AI categorization is disabled", async () => {
      mockEnv.aiCategorizeEnabled = false;
      const { POST } = await import("@/app/api/ai/categorize/route");
      const request = new Request("http://localhost/api/ai/categorize", {
        method: "POST",
        body: JSON.stringify({ issueId: "123" }),
      });
      const response = await POST(request);
      expect(response.status).toBe(403);
    });

    it("returns 400 when issueId is missing", async () => {
      mockEnv.aiCategorizeEnabled = true;
      mockRequireCurrentUser.mockResolvedValue({ id: "user_1" });

      const { POST } = await import("@/app/api/ai/categorize/route");
      const request = new Request("http://localhost/api/ai/categorize", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it("returns 404 when issue not found", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user_1" });
      mockPrisma.issue.findFirst.mockResolvedValue(null);

      const { POST } = await import("@/app/api/ai/categorize/route");
      const request = new Request("http://localhost/api/ai/categorize", {
        method: "POST",
        body: JSON.stringify({ issueId: "nonexistent" }),
      });
      const response = await POST(request);
      expect(response.status).toBe(404);
    });

    it("returns raw response when LLM response cannot be parsed as JSON", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user_1" });
      mockPrisma.issue.findFirst.mockResolvedValue({
        id: "issue_1",
        redmineIssueId: 123,
        subject: "Test Issue",
        description: "Test description",
        projectName: "Test Project",
        tracker: "Bug",
        priority: "Normal",
        statusId: 1,
        statusName: "New",
        assignedToName: "John Doe",
        dueDate: null,
        doneRatio: 0,
        lastActivityAt: new Date(),
        updatedOnRemote: new Date(),
      });
      mockGetLLMProviderManager.mockReturnValue({
        chat: vi.fn().mockResolvedValue({
          content: "This is not valid JSON",
          model: "test-model",
          provider: "test",
          metrics: {},
        }),
      });

      const { POST } = await import("@/app/api/ai/categorize/route");
      const request = new Request("http://localhost/api/ai/categorize", {
        method: "POST",
        body: JSON.stringify({ issueId: "issue_1" }),
      });
      const response = await POST(request);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.rawResponse).toBe(true);
    });
  });
});

describe("AI chat route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/ai/chat", () => {
    it("returns 403 when AI features are disabled", async () => {
      mockEnv.enableAiFeatures = false;
      const { POST } = await import("@/app/api/ai/chat/route");
      const request = new Request("http://localhost/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ redmineIssueId: 123, messages: [] }),
      });
      const response = await POST(request);
      expect(response.status).toBe(403);
    });

    it("returns 401 when user is unauthorized", async () => {
      mockEnv.enableAiFeatures = true;
      mockRequireCurrentUser.mockRejectedValue(new Error("Unauthorized"));

      const { POST } = await import("@/app/api/ai/chat/route");
      const request = new Request("http://localhost/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ redmineIssueId: 123, messages: [] }),
      });
      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it("returns 400 when redmineIssueId is invalid", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user_1" });

      const { POST } = await import("@/app/api/ai/chat/route");
      const request = new Request("http://localhost/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ redmineIssueId: "invalid", messages: [{ role: "user", content: "Hi" }] }),
      });
      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it("returns 400 when messages array is empty", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user_1" });

      const { POST } = await import("@/app/api/ai/chat/route");
      const request = new Request("http://localhost/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ redmineIssueId: 123, messages: [] }),
      });
      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it("returns 404 when issue not found", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user_1" });
      mockPrisma.issue.findFirst.mockResolvedValue(null);

      const { POST } = await import("@/app/api/ai/chat/route");
      const request = new Request("http://localhost/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ redmineIssueId: 123, messages: [{ role: "user", content: "Hi" }] }),
      });
      const response = await POST(request);
      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/ai/chat", () => {
    it("returns 400 when redmineIssueId param is missing", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user_1" });

      const { GET } = await import("@/app/api/ai/chat/route");
      const request = new Request("http://localhost/api/ai/chat");
      const response = await GET(request);
      expect(response.status).toBe(400);
    });

    it("returns 404 when issue not found", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user_1" });
      mockPrisma.issue.findFirst.mockResolvedValue(null);

      const { GET } = await import("@/app/api/ai/chat/route");
      const request = new Request("http://localhost/api/ai/chat?redmineIssueId=123");
      const response = await GET(request);
      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /api/ai/chat", () => {
    it("returns 400 when redmineIssueId param is missing", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user_1" });

      const { DELETE } = await import("@/app/api/ai/chat/route");
      const request = new Request("http://localhost/api/ai/chat", { method: "DELETE" });
      const response = await DELETE(request);
      expect(response.status).toBe(400);
    });

    it("returns 404 when issue not found", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user_1" });
      mockPrisma.issue.findFirst.mockResolvedValue(null);

      const { DELETE } = await import("@/app/api/ai/chat/route");
      const request = new Request("http://localhost/api/ai/chat?redmineIssueId=123", {
        method: "DELETE",
      });
      const response = await DELETE(request);
      expect(response.status).toBe(404);
    });

    it("clears chat history successfully", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user_1" });
      mockPrisma.issue.findFirst.mockResolvedValue({ id: "issue_1" });
      mockPrisma.aiChatMessage = { deleteMany: vi.fn().mockResolvedValue({ count: 5 }) };

      const { DELETE } = await import("@/app/api/ai/chat/route");
      const request = new Request("http://localhost/api/ai/chat?redmineIssueId=123", {
        method: "DELETE",
      });
      const response = await DELETE(request);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
    });
  });
});
