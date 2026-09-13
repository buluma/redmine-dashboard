import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireCurrentUser = vi.fn();
const mockPrisma: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {
  savedView: { count: vi.fn(), create: vi.fn(), findMany: vi.fn() },
};

vi.mock("@/src/lib/auth", () => ({
  requireCurrentUser: mockRequireCurrentUser,
}));

vi.mock("@/src/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/src/lib/http", () => ({
  jsonError: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status }),
}));

function filters() {
  return {
    statusFilter: "",
    priorityFilter: "",
    search: "",
    sort: "updated_desc",
    assignedToMe: false,
  };
}

describe("POST /api/saved-views", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue({ id: "user-1" });
  });

  it("creates a view when under the cap", async () => {
    mockPrisma.savedView.count.mockResolvedValue(3);
    mockPrisma.savedView.create.mockResolvedValue({
      id: "view-1",
      name: "My view",
      filters: filters(),
      position: 3,
      updatedAt: new Date("2026-09-13T00:00:00.000Z"),
    });

    const { POST } = await import("@/app/api/saved-views/route");
    const response = await POST(
      new Request("http://localhost/api/saved-views", {
        method: "POST",
        body: JSON.stringify({ name: "My view", filters: filters() }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mockPrisma.savedView.create).toHaveBeenCalled();
  });

  it("rejects creation at the saved-view cap without ever calling create", async () => {
    mockPrisma.savedView.count.mockResolvedValue(12);

    const { POST } = await import("@/app/api/saved-views/route");
    const response = await POST(
      new Request("http://localhost/api/saved-views", {
        method: "POST",
        body: JSON.stringify({ name: "One too many", filters: filters() }),
      }),
    );

    expect(response.status).toBe(409);
    expect(mockPrisma.savedView.create).not.toHaveBeenCalled();
  });
});
