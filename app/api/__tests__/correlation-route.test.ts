import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearRateLimitState } from "@/src/lib/rate-limit";

const {
  mockGetSessionUserId,
  mockIssueFindMany,
  mockIssueUpdate,
  mockWakaFindMany,
  mockTimeEntryFindMany,
  mockTimeEntryCreate,
} = vi.hoisted(() => ({
  mockGetSessionUserId: vi.fn(),
  mockIssueFindMany: vi.fn(),
  mockIssueUpdate: vi.fn(),
  mockWakaFindMany: vi.fn(),
  mockTimeEntryFindMany: vi.fn(),
  mockTimeEntryCreate: vi.fn(),
}));

vi.mock("@/src/lib/session", () => ({
  getSessionUserId: mockGetSessionUserId,
}));

vi.mock("@/src/lib/db", () => ({
  prisma: {
    issue: { findMany: mockIssueFindMany, update: mockIssueUpdate },
    wakaTimeDailySummary: { findMany: mockWakaFindMany },
    timeEntry: { findMany: mockTimeEntryFindMany, create: mockTimeEntryCreate },
  },
}));

function setupData() {
  mockIssueFindMany.mockResolvedValue([
    {
      id: "t1",
      localIssueNumber: 1,
      subject: "SL2 Cleanup",
      source: "local",
      projectName: "SL2",
      spentHours: 0,
      githubLinks: [
        { id: "link-1", repositoryFullName: "buluma/SL2", url: "https://github.com/buluma/SL2" },
      ],
    },
  ]);
  mockWakaFindMany.mockResolvedValue([
    {
      id: "w1",
      userId: "u1",
      date: "2026-06-20",
      totalSeconds: 7200,
      projectsJson: [{ name: "SL2", total_seconds: 7200, percent: 100, text: "2 hrs" }],
    },
  ]);
  mockTimeEntryFindMany.mockResolvedValue([]);
  mockTimeEntryCreate.mockResolvedValue({ id: "te-1" });
  mockIssueUpdate.mockResolvedValue({});
}

describe("Correlation API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimitState();
    mockGetSessionUserId.mockResolvedValue("u1");
  });

  describe("GET /api/correlation", () => {
    it("returns matched and unmatched arrays", async () => {
      setupData();

      const { GET } = await import("@/app/api/correlation/route");
      const response = await GET(
        new Request("http://localhost/api/correlation?range=Last_7_Days"),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.matched).toBeDefined();
      expect(body.unmatched).toBeDefined();
      expect(Array.isArray(body.matched)).toBe(true);
    });

    it("returns 401 when unauthenticated", async () => {
      mockGetSessionUserId.mockResolvedValue(null);

      const { GET } = await import("@/app/api/correlation/route");
      const response = await GET(new Request("http://localhost/api/correlation"));

      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/correlation/apply", () => {
    it("creates time entries and returns summary", async () => {
      setupData();

      const { POST } = await import("@/app/api/correlation/apply/route");
      const response = await POST(
        new Request("http://localhost/api/correlation/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ start: "2026-06-20", end: "2026-06-20" }),
        }),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.created).toBe(1);
      expect(body.skipped).toBe(0);
      expect(mockTimeEntryCreate).toHaveBeenCalled();
    });

    it("skips already-logged entries on double POST", async () => {
      setupData();
      // First apply
      mockTimeEntryFindMany.mockResolvedValue([]);

      const { POST } = await import("@/app/api/correlation/apply/route");
      await POST(
        new Request("http://localhost/api/correlation/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ start: "2026-06-20", end: "2026-06-20" }),
        }),
      );

      // Second apply — now the entry exists
      mockTimeEntryFindMany.mockResolvedValue([
        { issueId: "t1", wakaTimeDate: "2026-06-20" },
      ]);
      mockTimeEntryCreate.mockClear();

      const response2 = await POST(
        new Request("http://localhost/api/correlation/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ start: "2026-06-20", end: "2026-06-20" }),
        }),
      );

      const body2 = await response2.json();
      expect(body2.created).toBe(0);
      expect(body2.skipped).toBe(1);
      expect(mockTimeEntryCreate).not.toHaveBeenCalled();
    });

    it("dryRun returns summary without writing", async () => {
      setupData();

      const { POST } = await import("@/app/api/correlation/apply/route");
      const response = await POST(
        new Request("http://localhost/api/correlation/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ start: "2026-06-20", end: "2026-06-20", dryRun: true }),
        }),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.created).toBe(1);
      expect(mockTimeEntryCreate).not.toHaveBeenCalled();
      expect(mockIssueUpdate).not.toHaveBeenCalled();
    });

    it("returns 400 on invalid body", async () => {
      const { POST } = await import("@/app/api/correlation/apply/route");
      const response = await POST(
        new Request("http://localhost/api/correlation/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ start: "bad" }),
        }),
      );

      expect(response.status).toBe(400);
    });
  });
});
