import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = {
  slackBotToken: "xoxb-test-token",
  slackNotifyChannelId: "C123456",
  slackDefaultChannelId: "C789012",
  slackNotifyOnCreate: true,
  slackNotifyOnUpdate: true,
  slackNotifyOnStatusChange: true,
  slackNotifyOnAssignment: true,
  slackNotifyFormat: "compact",
  slackRefreshIntervalMs: 30000,
  redmineBaseUrl: "https://redmine.example.com",
};

const mockSlackNotificationService = {
  testNotification: vi.fn().mockResolvedValue({ success: true, message: "Test sent" }),
  notifyIssueChanges: vi.fn().mockResolvedValue({ success: true }),
};

const MockSlackNotifier = class {
  static createDefaultConfig = vi.fn().mockReturnValue({ channelId: "C123456" });
  testNotification = vi.fn().mockResolvedValue(true);
};

class MockSlackClient {
  getThreadReplies = vi.fn().mockResolvedValue([
    { user: "U123", text: "Hello", ts: "1234567890.123" },
    { user: "U456", text: "World", ts: "1234567890.456" },
  ]);
  getUsers = vi.fn().mockResolvedValue(
    new Map([
      ["U123", "Alice"],
      ["U456", "Bob"],
    ])
  );
}

vi.mock("@/src/lib/env", () => ({
  env: mockEnv,
}));

vi.mock("@/src/lib/slack-notification-service", () => ({
  getSlackNotificationService: () => mockSlackNotificationService,
}));

vi.mock("@/src/lib/slack-notifier", () => ({
  SlackNotifier: MockSlackNotifier,
}));

vi.mock("@/src/lib/slack", () => ({
  SlackClient: MockSlackClient,
}));

vi.mock("@/src/lib/log", () => ({
  logEvent: vi.fn(),
}));

describe("Slack test route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/slack/test", () => {
    it("returns 500 when slack bot token not configured", async () => {
      mockEnv.slackBotToken = undefined as any;

      const { POST } = await import("@/app/api/slack/test/route");
      const response = await POST();
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toContain("Slack bot token not configured");
    });

    it("returns 400 when no slack channel configured", async () => {
      mockEnv.slackBotToken = "xoxb-test-token";
      mockEnv.slackNotifyChannelId = undefined as any;
      mockEnv.slackDefaultChannelId = undefined as any;

      const { POST } = await import("@/app/api/slack/test/route");
      const response = await POST();
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("No Slack channel configured");
    });

    it("sends test notification successfully", async () => {
      mockEnv.slackBotToken = "xoxb-test-token";
      mockEnv.slackNotifyChannelId = "C123456";
      mockEnv.slackDefaultChannelId = "C789012";

      const { POST } = await import("@/app/api/slack/test/route");
      const response = await POST();
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });
  });
});

describe("Slack thread route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/slack/thread", () => {
    const createNextRequest = (url: string) => {
      const req = new Request(url) as any;
      req.nextUrl = new URL(url);
      return req;
    };

    it("returns 500 when slack bot token not configured", async () => {
      mockEnv.slackBotToken = undefined as any;

      const { GET } = await import("@/app/api/slack/thread/route");
      const request = createNextRequest("http://localhost/api/slack/thread?channelId=C123&threadTs=123");
      const response = await GET(request);
      expect(response.status).toBe(500);
    });

    it("returns 400 when channel ID not provided", async () => {
      mockEnv.slackBotToken = "xoxb-test-token";

      const { GET } = await import("@/app/api/slack/thread/route");
      const request = createNextRequest("http://localhost/api/slack/thread?threadTs=123");
      const response = await GET(request);
      expect(response.status).toBe(400);
    });

    it("returns 400 when thread timestamp not provided", async () => {
      mockEnv.slackBotToken = "xoxb-test-token";

      const { GET } = await import("@/app/api/slack/thread/route");
      const request = createNextRequest("http://localhost/api/slack/thread?channelId=C123");
      const response = await GET(request);
      expect(response.status).toBe(400);
    });

    it("returns thread messages successfully", async () => {
      mockEnv.slackBotToken = "xoxb-test-token";

      const { GET } = await import("@/app/api/slack/thread/route");
      const request = createNextRequest("http://localhost/api/slack/thread?channelId=C123&threadTs=1234567890.123");
      const response = await GET(request);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.messages).toHaveLength(2);
      expect(body.users).toEqual({
        U123: "Alice",
        U456: "Bob",
      });
    });
  });
});

describe("Slack notify route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSlackNotificationService.notifyIssueChanges = vi.fn().mockResolvedValue({ success: true });
  });

  describe("POST /api/slack/notify", () => {
    it("returns 400 when payload is invalid", async () => {
      const { POST } = await import("@/app/api/slack/notify/route");
      const request = new Request("http://localhost/api/slack/notify", {
        method: "POST",
        body: JSON.stringify({ invalid: "payload" }),
      });
      const response = await POST(request as any);
      expect(response.status).toBe(400);
    });

    it("handles test action", async () => {
      mockSlackNotificationService.testNotification.mockResolvedValue({
        success: true,
        message: "Test sent",
      });

      const { POST } = await import("@/app/api/slack/notify/route");
      const request = new Request("http://localhost/api/slack/notify", {
        method: "POST",
        body: JSON.stringify({
          action: "test",
          issue: {
            id: "1",
            redmineIssueId: 123,
            subject: "Test Issue",
            projectName: "Test",
            statusName: "New",
            priorityName: "Normal",
            assignedToName: "John",
            updatedAt: new Date().toISOString(),
          },
        }),
      });
      const response = await POST(request as any);
      expect(response.status).toBe(200);
    });

    it("handles create action", async () => {
      mockSlackNotificationService.notifyIssueChanges.mockResolvedValue({
        success: true,
      });

      const { POST } = await import("@/app/api/slack/notify/route");
      const request = new Request("http://localhost/api/slack/notify", {
        method: "POST",
        body: JSON.stringify({
          action: "create",
          issue: {
            id: "1",
            redmineIssueId: 123,
            subject: "New Issue",
            projectName: "Test",
            statusName: "New",
            priorityName: "High",
            assignedToName: "John",
            updatedAt: new Date().toISOString(),
          },
        }),
      });
      const response = await POST(request as any);
      expect(response.status).toBe(200);
    });

    it("handles update action with changes", async () => {
      mockSlackNotificationService.notifyIssueChanges.mockResolvedValue({
        success: true,
      });

      const { POST } = await import("@/app/api/slack/notify/route");
      const request = new Request("http://localhost/api/slack/notify", {
        method: "POST",
        body: JSON.stringify({
          action: "update",
          issue: {
            id: "1",
            redmineIssueId: 123,
            subject: "Updated Issue",
            projectName: "Test",
            statusName: "In Progress",
            priorityName: "High",
            assignedToName: "John",
            updatedAt: new Date().toISOString(),
          },
          changes: [
            { field: "status", oldValue: "New", newValue: "In Progress" },
            { field: "priority", oldValue: "Normal", newValue: "High" },
          ],
        }),
      });
      const response = await POST(request as any);
      expect(response.status).toBe(200);
    });
  });
});
