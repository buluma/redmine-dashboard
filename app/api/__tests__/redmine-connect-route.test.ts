import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearRateLimitState } from "@/src/lib/rate-limit";

const mockConnectRedmineAccount = vi.fn();
const mockSetSessionCookie = vi.fn();
const mockRunSyncJob = vi.fn();

vi.mock("@/src/lib/redmine-connect", () => ({
  connectRedmineAccount: mockConnectRedmineAccount,
}));

vi.mock("@/src/lib/session", () => ({
  setSessionCookie: mockSetSessionCookie,
}));

vi.mock("@/src/lib/sync", () => ({
  runSyncJob: mockRunSyncJob,
}));

vi.mock("@/src/lib/log", () => ({
  logEvent: vi.fn(),
}));

function connectRequest(ip: string) {
  return new Request("http://localhost/api/redmine/connect", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ baseUrl: "https://redmine.example.com", apiKey: "abc123def456" }),
  });
}

describe("POST /api/redmine/connect rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimitState();
    mockConnectRedmineAccount.mockResolvedValue({ id: "u1", emailOrUsername: "alice", displayName: "Alice" });
    mockRunSyncJob.mockResolvedValue({ jobId: "job1" });
  });

  it("throttles a single IP after 10 attempts in the window", async () => {
    const { POST } = await import("@/app/api/redmine/connect/route");

    for (let i = 0; i < 10; i++) {
      const res = await POST(connectRequest("203.0.113.5"));
      expect(res.status).not.toBe(429);
    }

    const blocked = await POST(connectRequest("203.0.113.5"));
    expect(blocked.status).toBe(429);
  });

  it("does not throttle a different IP", async () => {
    const { POST } = await import("@/app/api/redmine/connect/route");

    for (let i = 0; i < 10; i++) {
      await POST(connectRequest("203.0.113.5"));
    }

    const other = await POST(connectRequest("198.51.100.9"));
    expect(other.status).not.toBe(429);
  });
});
