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
});
