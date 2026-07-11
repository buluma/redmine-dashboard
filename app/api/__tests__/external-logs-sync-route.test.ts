import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// ── shared mocks ──────────────────────────────────────────────────

const mockMbuLogCount = vi.fn();
const mockMbuLogGroupBy = vi.fn();
const mockMbuLogFindMany = vi.fn();
const mockMbuLogFindFirst = vi.fn();
const mockSsrCount = vi.fn();
const mockSsrGroupBy = vi.fn();
const mockSsrFindMany = vi.fn();
const mockSsrFindFirst = vi.fn();
const mockUserFindFirst = vi.fn();
const mockSyncJobFindFirst = vi.fn();
const mockSyncJobFindUnique = vi.fn();
const mockSyncStateFindUnique = vi.fn();
const mockRunSyncJob = vi.fn();

vi.mock("@/src/lib/db", () => ({
  prisma: {
    mbuLog: {
      count: mockMbuLogCount,
      groupBy: mockMbuLogGroupBy,
      findMany: mockMbuLogFindMany,
      findFirst: mockMbuLogFindFirst,
    },
    serverSideRulesLog: {
      count: mockSsrCount,
      groupBy: mockSsrGroupBy,
      findMany: mockSsrFindMany,
      findFirst: mockSsrFindFirst,
    },
    user: { findFirst: mockUserFindFirst },
    syncJob: { findFirst: mockSyncJobFindFirst, findUnique: mockSyncJobFindUnique },
    syncState: { findUnique: mockSyncStateFindUnique },
  },
}));

vi.mock("@/src/lib/sync", () => ({ runSyncJob: mockRunSyncJob }));
vi.mock("@/src/lib/telemetry", () => ({
  trackFailure: vi.fn(),
  trackInfo: vi.fn(),
  trackSuccess: vi.fn(),
}));

// ── helpers ───────────────────────────────────────────────────────

function withKey(url: string, opts: RequestInit = {}): NextRequest {
  return new Request(url, {
    ...opts,
    headers: { "x-api-key": "test-key", ...(opts.headers as Record<string, string> || {}) },
  }) as unknown as NextRequest;
}

// ── GET /api/external/logs/digest ─────────────────────────────────

describe("GET /api/external/logs/digest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("EXTERNAL_API_KEYS", "test-key");

    mockMbuLogCount.mockResolvedValue(127);
    mockMbuLogGroupBy.mockResolvedValue([
      { logLevel: "INFO", _count: { id: 76 } },
      { logLevel: "TRACE", _count: { id: 51 } },
    ]);
    mockMbuLogFindMany.mockResolvedValue([]);
    mockMbuLogFindFirst.mockResolvedValue({ ingestedAt: new Date("2026-06-13T12:00:00Z") });
    mockSsrCount.mockResolvedValue(103);
    mockSsrGroupBy.mockResolvedValue([
      { status: "completed", _count: { id: 97 } },
      { status: "error", _count: { id: 6 } },
    ]);
    mockSsrFindMany.mockResolvedValue([
      {
        id: BigInt(1),
        scriptName: "118. Smartsheet Pull",
        status: "error",
        duration: 2.222,
        errorDescr: "TypeError: Cannot read property",
        createdAt: new Date("2026-06-13T11:00:00Z"),
        host: "streamline.staging.vodacomsa-battery.nasctech.com",
        environment: "staging",
      },
    ]);
    mockSsrFindFirst.mockResolvedValue({ ingestedAt: new Date("2026-06-13T12:00:00Z") });
  });

  it("returns 401 without API key", async () => {
    const { GET } = await import("@/app/api/external/logs/route");
    const resp = await GET(new Request("http://localhost/api/external/logs/digest") as unknown as NextRequest);
    expect(resp.status).toBe(401);
  });

  it("returns 401 with invalid API key", async () => {
    const { GET } = await import("@/app/api/external/logs/route");
    const resp = await GET(new Request("http://localhost/api/external/logs/digest", {
      headers: { "x-api-key": "wrong-key" },
    }) as unknown as NextRequest);
    expect(resp.status).toBe(401);
  });

  it("returns digest with counts by level and status", async () => {
    const { GET } = await import("@/app/api/external/logs/route");
    const resp = await GET(withKey("http://localhost/api/external/logs/digest"));
    expect(resp.status).toBe(200);

    const body = await resp.json();
    expect(body.mbu_logs.total).toBe(127);
    expect(body.mbu_logs.by_level.INFO).toBe(76);
    expect(body.mbu_logs.by_level.TRACE).toBe(51);
    expect(body.mbu_logs.last_ingested_at).toBe("2026-06-13T12:00:00.000Z");

    expect(body.server_side_rules_log.total).toBe(103);
    expect(body.server_side_rules_log.by_status.completed).toBe(97);
    expect(body.server_side_rules_log.by_status.error).toBe(6);
    expect(body.server_side_rules_log.recent_errors).toHaveLength(1);
    expect(body.server_side_rules_log.recent_errors[0].script_name).toBe("118. Smartsheet Pull");
  });

  it("truncates backtrace to 500 chars", async () => {
    const longTrace = "x".repeat(1000);
    mockMbuLogFindMany.mockResolvedValue([{
      id: BigInt(1),
      logLevel: "ERROR",
      traceType: "exception",
      backtrace: longTrace,
      createdAt: new Date(),
      host: "host",
      environment: "staging",
    }]);

    const { GET } = await import("@/app/api/external/logs/route");
    const resp = await GET(withKey("http://localhost/api/external/logs/digest"));
    const body = await resp.json();
    expect(body.mbu_logs.recent_errors[0].backtrace.length).toBe(500);
  });

  it("returns null last_ingested_at when table is empty", async () => {
    mockMbuLogFindFirst.mockResolvedValue(null);
    const { GET } = await import("@/app/api/external/logs/route");
    const resp = await GET(withKey("http://localhost/api/external/logs/digest"));
    const body = await resp.json();
    expect(body.mbu_logs.last_ingested_at).toBeNull();
  });
});

// ── GET /api/external/sync ────────────────────────────────────────

describe("GET /api/external/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("EXTERNAL_API_KEYS", "test-key");

    mockUserFindFirst.mockResolvedValue({ id: "u1", createdAt: new Date() });
    mockSyncJobFindFirst.mockResolvedValue({
      id: "job-1",
      jobType: "full_manual",
      status: "success",
      startedAt: new Date("2026-06-13T10:00:00Z"),
      endedAt: new Date("2026-06-13T10:00:30Z"),
      error: null,
      createdAt: new Date("2026-06-13T10:00:00Z"),
    });
    mockSyncStateFindUnique.mockResolvedValue({
      lastIncrementalSyncAt: new Date("2026-06-13T10:00:30Z"),
      lastFullSyncAt: new Date("2026-06-13T10:00:30Z"),
      lastSyncStatus: "success",
      lastError: null,
      runningJobId: null,
    });
  });

  it("returns 401 without API key", async () => {
    const { GET } = await import("@/app/api/external/sync/route");
    const resp = await GET(new Request("http://localhost/api/external/sync") as unknown as NextRequest);
    expect(resp.status).toBe(401);
  });

  it("returns latest job and state", async () => {
    const { GET } = await import("@/app/api/external/sync/route");
    const resp = await GET(withKey("http://localhost/api/external/sync"));
    expect(resp.status).toBe(200);

    const body = await resp.json();
    expect(body.latest_job.id).toBe("job-1");
    expect(body.latest_job.status).toBe("success");
    expect(body.latest_job.duration_ms).toBe(30000);
    expect(body.state.last_sync_status).toBe("success");
  });

  it("returns null job and state when no data", async () => {
    mockSyncJobFindFirst.mockResolvedValue(null);
    mockSyncStateFindUnique.mockResolvedValue(null);

    const { GET } = await import("@/app/api/external/sync/route");
    const resp = await GET(withKey("http://localhost/api/external/sync"));
    const body = await resp.json();
    expect(body.latest_job).toBeNull();
    expect(body.state).toBeNull();
  });
});

// ── POST /api/external/sync ───────────────────────────────────────

describe("POST /api/external/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("EXTERNAL_API_KEYS", "test-key");

    mockUserFindFirst.mockResolvedValue({ id: "u1", createdAt: new Date() });
    mockRunSyncJob.mockResolvedValue({ jobId: "new-job-1" });
    mockSyncJobFindUnique.mockResolvedValue({
      id: "new-job-1",
      jobType: "full_manual",
      status: "pending",
      startedAt: null,
      endedAt: null,
      error: null,
      createdAt: new Date("2026-06-13T13:00:00Z"),
    });
  });

  it("returns 401 without API key", async () => {
    const { POST } = await import("@/app/api/external/sync/route");
    const resp = await POST(new Request("http://localhost/api/external/sync", { method: "POST" }) as unknown as NextRequest);
    expect(resp.status).toBe(401);
  });

  it("triggers sync and returns job id", async () => {
    const { POST } = await import("@/app/api/external/sync/route");
    const resp = await POST(withKey("http://localhost/api/external/sync", { method: "POST" }));
    expect(resp.status).toBe(200);

    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.job_id).toBe("new-job-1");
    expect(body.job.status).toBe("pending");
    expect(mockRunSyncJob).toHaveBeenCalledWith("u1", "full_manual");
  });

  it("returns 503 when no users exist", async () => {
    mockUserFindFirst.mockResolvedValue(null);

    const { POST } = await import("@/app/api/external/sync/route");
    const resp = await POST(withKey("http://localhost/api/external/sync", { method: "POST" }));
    expect(resp.status).toBe(503);
  });
});
