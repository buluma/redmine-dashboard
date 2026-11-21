import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindUnique = vi.fn();
const mockDecryptText = vi.fn();
const mockGetSessionUserId = vi.fn();
const mockHeadersGet = vi.fn();

vi.mock("@/src/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
    },
    userRedmineCredential: {
      findUnique: mockFindUnique,
    },
  },
}));

vi.mock("@/src/lib/crypto", () => ({
  decryptText: mockDecryptText,
}));

vi.mock("@/src/lib/session", () => ({
  getSessionUserId: mockGetSessionUserId,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(() => Promise.resolve({ get: mockHeadersGet })),
  cookies: vi.fn(() => Promise.resolve({ get: vi.fn(), set: vi.fn(), delete: vi.fn() })),
}));

vi.mock("@/src/lib/log", () => ({
  logEvent: vi.fn(),
}));

vi.mock("@/src/lib/redmine", () => {
  const MockRedmineClient = class {
    baseUrl: string;
    constructor(baseUrl: string) {
      this.baseUrl = baseUrl;
    }
  };
  return {
    RedmineClient: MockRedmineClient,
  };
});

describe("requireCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns user when session is valid and user exists", async () => {
    mockGetSessionUserId.mockResolvedValue("user_123");
    mockFindUnique.mockResolvedValue({
      id: "user_123",
      emailOrUsername: "test@example.com",
      displayName: "Test User",
    });

    const { requireCurrentUser } = await import("@/src/lib/auth");
    const result = await requireCurrentUser();

    expect(result).toEqual({
      id: "user_123",
      emailOrUsername: "test@example.com",
      displayName: "Test User",
    });
  });

  it("throws Unauthorized when no session user ID", async () => {
    mockGetSessionUserId.mockResolvedValue(null);

    const { requireCurrentUser } = await import("@/src/lib/auth");
    await expect(requireCurrentUser()).rejects.toThrow("Unauthorized");
  });

  it("throws Unauthorized when user not found in database", async () => {
    mockGetSessionUserId.mockResolvedValue("user_123");
    mockFindUnique.mockResolvedValue(null);

    const { requireCurrentUser } = await import("@/src/lib/auth");
    await expect(requireCurrentUser()).rejects.toThrow("Unauthorized");
  });
});

describe("getAuthenticatedUserId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns userId from session cookie when present", async () => {
    mockGetSessionUserId.mockResolvedValue("user_123");

    const { getAuthenticatedUserId } = await import("@/src/lib/auth");
    const result = await getAuthenticatedUserId();

    expect(result).toBe("user_123");
  });

  it("returns null when no cookie, even with a Bearer token (mobile tokens were removed)", async () => {
    mockGetSessionUserId.mockResolvedValue(null);
    mockHeadersGet.mockReturnValue("Bearer mrt_test");

    const { getAuthenticatedUserId } = await import("@/src/lib/auth");
    const result = await getAuthenticatedUserId();

    expect(result).toBeNull();
  });
});

describe("requireCurrentUser ignores Bearer tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws Unauthorized when there is only a Bearer token", async () => {
    mockGetSessionUserId.mockResolvedValue(null);
    mockHeadersGet.mockReturnValue("Bearer mrt_testtoken123");
    mockFindUnique.mockResolvedValue({ id: "user_456", emailOrUsername: "cli_user", displayName: "CLI User" });

    const { requireCurrentUser } = await import("@/src/lib/auth");
    await expect(requireCurrentUser()).rejects.toThrow("Unauthorized");
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("uses the cookie session when a Bearer token is also present", async () => {
    mockGetSessionUserId.mockResolvedValue("user_123");
    mockHeadersGet.mockReturnValue("Bearer mrt_sometoken");
    mockFindUnique.mockResolvedValue({ id: "user_123", emailOrUsername: "cookie_user", displayName: "Cookie User" });

    const { requireCurrentUser } = await import("@/src/lib/auth");
    const result = await requireCurrentUser();

    expect(result.id).toBe("user_123");
  });
});

describe("requireRedmineClientForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns client and credentials when redmine account is active", async () => {
    mockFindUnique.mockResolvedValue({
      id: "cred_1",
      userId: "user_123",
      isActive: true,
      baseUrl: "https://redmine.example.com",
      apiKeyEncrypted: "encrypted_key",
      apiKeyIv: "test_iv",
    });
    mockDecryptText.mockReturnValue("api_key_123");

    const { requireRedmineClientForUser } = await import("@/src/lib/auth");
    const result = await requireRedmineClientForUser("user_123");

    expect(result.cred.isActive).toBe(true);
    expect(mockDecryptText).toHaveBeenCalledWith("encrypted_key", "test_iv");
    expect(result.client).toBeDefined();
  });

  it("throws when no redmine credentials found", async () => {
    mockFindUnique.mockResolvedValue(null);

    const { requireRedmineClientForUser } = await import("@/src/lib/auth");
    await expect(requireRedmineClientForUser("user_123")).rejects.toThrow(
      "Redmine account not connected"
    );
  });

  it("throws when redmine credential is not active", async () => {
    mockFindUnique.mockResolvedValue({
      id: "cred_1",
      userId: "user_123",
      isActive: false,
      baseUrl: "https://redmine.example.com",
      apiKeyEncrypted: "encrypted_key",
      apiKeyIv: "test_iv",
    });

    const { requireRedmineClientForUser } = await import("@/src/lib/auth");
    await expect(requireRedmineClientForUser("user_123")).rejects.toThrow(
      "Redmine account not connected"
    );
  });
});

describe("requireRedmineClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns user, credentials, and client when all conditions met", async () => {
    mockGetSessionUserId.mockResolvedValue("user_123");
    mockFindUnique
      .mockResolvedValueOnce({
        id: "user_123",
        emailOrUsername: "test@example.com",
        displayName: "Test User",
      })
      .mockResolvedValueOnce({
        id: "cred_1",
        userId: "user_123",
        isActive: true,
        baseUrl: "https://redmine.example.com",
        apiKeyEncrypted: "encrypted_key",
        apiKeyIv: "test_iv",
      });
    mockDecryptText.mockReturnValue("api_key_123");

    const { requireRedmineClient } = await import("@/src/lib/auth");
    const result = await requireRedmineClient();

    expect(result.user.id).toBe("user_123");
    expect(result.cred.isActive).toBe(true);
    expect(result.client).toBeDefined();
  });
});
