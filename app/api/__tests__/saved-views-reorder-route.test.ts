import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireCurrentUser = vi.fn();
const mockPrisma: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {
  savedView: { findMany: vi.fn(), update: vi.fn() },
};
const mockTransaction = vi.fn();

vi.mock("@/src/lib/auth", () => ({
  requireCurrentUser: mockRequireCurrentUser,
}));

vi.mock("@/src/lib/db", () => ({
  prisma: { ...mockPrisma, $transaction: mockTransaction },
}));

vi.mock("@/src/lib/http", () => ({
  jsonError: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status }),
}));

vi.mock("@/src/lib/telemetry", () => ({
  trackFailure: vi.fn(),
  trackWarn: vi.fn(),
}));

function request(viewIds: string[]) {
  return new Request("http://localhost/api/saved-views/reorder", {
    method: "PATCH",
    body: JSON.stringify({ viewIds }),
  });
}

describe("PATCH /api/saved-views/reorder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue({ id: "user-1" });
    mockTransaction.mockImplementation((callback: (tx: typeof mockPrisma) => unknown) => callback(mockPrisma));
  });

  it("reorders through the same serializable helper create/import use", async () => {
    mockPrisma.savedView.findMany
      .mockResolvedValueOnce([{ id: "a" }, { id: "b" }])
      .mockResolvedValueOnce([
        { id: "b", name: "B", position: 0 },
        { id: "a", name: "A", position: 1 },
      ]);
    mockPrisma.savedView.update.mockResolvedValue({});

    const { PATCH } = await import("@/app/api/saved-views/reorder/route");
    const response = await PATCH(request(["b", "a"]));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.views.map((v: { id: string }) => v.id)).toEqual(["b", "a"]);
    expect(mockTransaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: "Serializable" }));
  });

  it("404s when a supplied id doesn't belong to the user, without writing anything", async () => {
    mockPrisma.savedView.findMany.mockResolvedValueOnce([{ id: "a" }]);

    const { PATCH } = await import("@/app/api/saved-views/reorder/route");
    const response = await PATCH(request(["a", "not-mine"]));

    expect(response.status).toBe(404);
    expect(mockPrisma.savedView.update).not.toHaveBeenCalled();
  });

  it("returns 503 (not a generic 500) when serialization retries are exhausted", async () => {
    mockTransaction.mockRejectedValue({ code: "P2034" });

    const { PATCH } = await import("@/app/api/saved-views/reorder/route");
    const response = await PATCH(request(["a", "b"]));

    expect(response.status).toBe(503);
  });
});
