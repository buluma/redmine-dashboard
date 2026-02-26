import { describe, expect, it, vi } from "vitest";

type HealthTestSetup = {
  dbError?: string;
  redmineMode?: "skipped" | "env_probe_ok" | "env_probe_error";
};

async function loadRoute(setup: HealthTestSetup = {}) {
  vi.resetModules();

  const queryRaw = vi.fn();
  if (setup.dbError) {
    queryRaw.mockRejectedValue(new Error(setup.dbError));
  } else {
    queryRaw.mockResolvedValue([{ ok: 1 }]);
  }

  const findUnique = vi.fn().mockResolvedValue({
    name: "sync-poller",
    ownerId: "owner-1",
    heartbeatAt: new Date("2026-02-26T00:00:00.000Z"),
    expiresAt: new Date("2026-02-26T00:01:00.000Z"),
  });
  const count = vi.fn().mockResolvedValue(2);

  const getCurrentUser = vi.fn();
  if (setup.redmineMode === "env_probe_error") {
    getCurrentUser.mockRejectedValue(new Error("redmine down"));
  } else {
    getCurrentUser.mockResolvedValue({ login: "bot-user" });
  }

  const redmineCtor = vi.fn();
  class RedmineClient {
    constructor(baseUrl: string, apiKey: string) {
      void baseUrl;
      void apiKey;
      redmineCtor();
    }

    async getCurrentUser() {
      return getCurrentUser();
    }
  }

  vi.doMock("@/src/lib/db", () => ({
    prisma: {
      $queryRaw: queryRaw,
      leaderLock: { findUnique },
      syncJob: { count },
    },
  }));

  const redmineEnabled = setup.redmineMode && setup.redmineMode !== "skipped";
  vi.doMock("@/src/lib/env", () => ({
    env: {
      syncJobStaleMs: 10 * 60 * 1000,
      redmineBaseUrl: redmineEnabled ? "https://redmine.example.com" : undefined,
      redmineApiKey: redmineEnabled ? "apikey" : undefined,
    },
  }));

  vi.doMock("@/src/lib/redmine", () => ({
    RedmineClient,
  }));

  const route = await import("@/app/api/health/route");
  return { GET: route.GET, queryRaw, redmineCtor, getCurrentUser };
}

describe("GET /api/health", () => {
  it("returns ok and skips redmine probe when env credentials are absent", async () => {
    const { GET, redmineCtor } = await loadRoute({ redmineMode: "skipped" });
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks.database.ok).toBe(true);
    expect(body.checks.redmine.mode).toBe("skipped");
    expect(body.checks.scheduler.staleRunningJobs).toBe(2);
    expect(redmineCtor).not.toHaveBeenCalled();
  });

  it("returns degraded when database check fails", async () => {
    const { GET } = await loadRoute({ dbError: "db offline", redmineMode: "skipped" });
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.database.ok).toBe(false);
    expect(body.checks.database.error).toContain("db offline");
  });

  it("returns degraded when redmine env probe fails", async () => {
    const { GET, redmineCtor, getCurrentUser } = await loadRoute({ redmineMode: "env_probe_error" });
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.redmine.mode).toBe("env_probe");
    expect(body.checks.redmine.ok).toBe(false);
    expect(body.checks.redmine.error).toContain("redmine down");
    expect(redmineCtor).toHaveBeenCalledTimes(1);
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
  });
});
