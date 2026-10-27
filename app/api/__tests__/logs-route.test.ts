import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireCurrentUser = vi.fn();
const mockHasPermission = vi.fn();
const mockFindMany = vi.fn();
const mockDeleteMany = vi.fn();

vi.mock("@/src/lib/auth", () => ({ requireCurrentUser: mockRequireCurrentUser }));
vi.mock("@/src/lib/rbac", () => ({ hasPermission: mockHasPermission }));
vi.mock("@/src/lib/db", () => ({
  prisma: { webLog: { findMany: mockFindMany, deleteMany: mockDeleteMany } },
}));

describe("/api/logs access control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue({ id: "user-1" });
    mockHasPermission.mockImplementation(async (_userId: string, permission: string) => permission === "ops:view");
    mockFindMany.mockResolvedValue([]);
    mockDeleteMany.mockResolvedValue({ count: 0 });
  });

  it("scopes ordinary users' reads to their own logs", async () => {
    mockHasPermission.mockResolvedValue(false);
    const { GET } = await import("@/app/api/logs/route");

    const response = await GET(new Request("http://localhost/api/logs?level=error"));

    expect(response.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1", level: "error" },
    }));
  });

  it("allows operators to read global logs", async () => {
    const { GET } = await import("@/app/api/logs/route");

    const response = await GET(new Request("http://localhost/api/logs"));

    expect(response.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it("scopes ordinary users' deletes to their own logs, including date filters", async () => {
    mockHasPermission.mockResolvedValue(false);
    const { DELETE } = await import("@/app/api/logs/route");

    const response = await DELETE(new Request("http://localhost/api/logs?olderThan=2026-01-01T00:00:00.000Z", { method: "DELETE" }));

    expect(response.status).toBe(200);
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", createdAt: { lte: new Date("2026-01-01T00:00:00.000Z") } },
    });
  });

  it("allows only administrators to delete global logs", async () => {
    mockHasPermission.mockImplementation(async (_userId: string, permission: string) => permission === "users:manage");
    const { DELETE } = await import("@/app/api/logs/route");

    const response = await DELETE(new Request("http://localhost/api/logs", { method: "DELETE" }));

    expect(response.status).toBe(200);
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: {} });
  });
});
