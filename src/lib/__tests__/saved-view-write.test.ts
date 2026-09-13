import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTransaction = vi.fn();

vi.mock("@/src/lib/db", () => ({
  prisma: { $transaction: mockTransaction },
}));

describe("withSavedViewWrite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries a serializable write conflict so the callback can observe the winner", async () => {
    mockTransaction
      .mockRejectedValueOnce({ code: "P2034" })
      .mockImplementationOnce(async (callback: () => Promise<string>) => callback());
    const { withSavedViewWrite } = await import("@/src/lib/saved-view-write");
    const callback = vi.fn().mockResolvedValue("created");

    await expect(withSavedViewWrite(callback)).resolves.toBe("created");

    expect(callback).toHaveBeenCalledTimes(1);
    expect(mockTransaction).toHaveBeenCalledTimes(2);
    expect(mockTransaction).toHaveBeenLastCalledWith(
      callback,
      expect.objectContaining({ isolationLevel: "Serializable" }),
    );
  });

  it("gives up with a distinguishable error once retries are exhausted, instead of leaking the raw Prisma code", async () => {
    mockTransaction.mockRejectedValue({ code: "P2034" });
    const { withSavedViewWrite, SavedViewWriteConflictError } = await import("@/src/lib/saved-view-write");

    await expect(withSavedViewWrite(vi.fn())).rejects.toBeInstanceOf(SavedViewWriteConflictError);
    // 3 total attempts: the initial try plus two retries.
    expect(mockTransaction).toHaveBeenCalledTimes(3);
  });

  it("rethrows a non-conflict error immediately without retrying", async () => {
    const dbError = { code: "P2002", message: "unique constraint" };
    mockTransaction.mockRejectedValue(dbError);
    const { withSavedViewWrite } = await import("@/src/lib/saved-view-write");

    await expect(withSavedViewWrite(vi.fn())).rejects.toBe(dbError);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});
