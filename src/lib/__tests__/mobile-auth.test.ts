import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();
const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/src/lib/db", () => ({
  prisma: {
    mobileApiToken: {
      create: mockCreate,
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
  },
}));

describe("mobile auth token helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a token and stores only hashed value", async () => {
    mockCreate.mockImplementation(async ({ data }) => ({
      id: "token-record-1",
      tokenPrefix: data.tokenPrefix,
      expiresAt: null,
    }));

    const { createMobileToken } = await import("@/src/lib/mobile-auth");
    const out = await createMobileToken("u1", "Pixel 9");

    expect(out.token.startsWith("mrt_")).toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const arg = mockCreate.mock.calls[0][0];
    expect(arg.data.userId).toBe("u1");
    expect(arg.data.name).toBe("Pixel 9");
    expect(arg.data.tokenHash).not.toBe(out.token);
  });

  it("verifies bearer token and throttles last-used updates", async () => {
    const nowMinus = new Date(Date.now() - 16 * 60 * 1000);
    mockFindUnique.mockResolvedValue({
      id: "token-record-1",
      userId: "u1",
      revokedAt: null,
      expiresAt: null,
      lastUsedAt: nowMinus,
    });
    mockUpdate.mockResolvedValue({});

    const { verifyMobileToken } = await import("@/src/lib/mobile-auth");
    const out = await verifyMobileToken("Bearer mrt_any");

    expect(out?.userId).toBe("u1");
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("rejects missing bearer token", async () => {
    const { verifyMobileToken } = await import("@/src/lib/mobile-auth");
    const out = await verifyMobileToken(null);
    expect(out).toBeNull();
  });
});
