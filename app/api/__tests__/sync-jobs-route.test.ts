import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireCurrentUser = vi.fn();
const mockFindMany = vi.fn();

vi.mock("@/src/lib/auth", () => ({
  requireCurrentUser: mockRequireCurrentUser,
}));

vi.mock("@/src/lib/db", () => ({
  prisma: {
    syncJob: {
      findMany: mockFindMany,
    },
  },
}));

describe("GET /api/sync/jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns jobs with computed duration", async () => {
    mockRequireCurrentUser.mockResolvedValue({ id: "u1" });
    mockFindMany.mockResolvedValue([
      {
        id: "j1",
        userId: "u1",
        jobType: "incremental",
        status: "success",
        startedAt: new Date("2026-02-26T00:00:00.000Z"),
        endedAt: new Date("2026-02-26T00:00:30.000Z"),
        error: null,
        createdAt: new Date("2026-02-26T00:00:00.000Z"),
      },
      {
        id: "j2",
        userId: "u1",
        jobType: "full_manual",
        status: "running",
        startedAt: new Date("2026-02-26T00:10:00.000Z"),
        endedAt: null,
        error: null,
        createdAt: new Date("2026-02-26T00:10:00.000Z"),
      },
    ]);

    const { GET } = await import("@/app/api/sync/jobs/route");
    const response = await GET(
      new Request("http://localhost/api/sync/jobs?limit=10&status=success&jobType=incremental"),
    );

    expect(response.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: "u1", status: "success", jobType: "incremental" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const body = await response.json();
    expect(body.total).toBe(2);
    expect(body.limit).toBe(10);
    expect(body.items[0].durationMs).toBe(30000);
    expect(body.items[1].durationMs).toBeNull();
  });

  it("clamps limit and uses default for invalid values", async () => {
    mockRequireCurrentUser.mockResolvedValue({ id: "u1" });
    mockFindMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/sync/jobs/route");

    await GET(new Request("http://localhost/api/sync/jobs?limit=999"));
    expect(mockFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        take: 100,
      }),
    );

    await GET(new Request("http://localhost/api/sync/jobs?limit=not-a-number"));
    expect(mockFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        take: 30,
      }),
    );
  });

  it("returns 401 when user is not authenticated", async () => {
    mockRequireCurrentUser.mockRejectedValue(new Error("Unauthorized"));

    const { GET } = await import("@/app/api/sync/jobs/route");
    const response = await GET(new Request("http://localhost/api/sync/jobs"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });
});
