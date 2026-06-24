import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindUnique = vi.fn();
const mockDecryptText = vi.fn();
const mockVerifyMobileToken = vi.fn();
const mockGetSessionUserId = vi.fn();
const mockHeadersGet = vi.fn();
const mockRequireCsrf = vi.fn();

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

vi.mock("@/src/lib/mobile-auth", () => ({
  verifyMobileToken: mockVerifyMobileToken,
}));

vi.mock("@/src/lib/session", () => ({
  getSessionUserId: mockGetSessionUserId,
  requireCsrf: mockRequireCsrf,
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

describe("requireCurrentUser Bearer token fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authenticates via Bearer token when no session cookie", async () => {
    mockGetSessionUserId.mockResolvedValue(null);
    mockHeadersGet.mockReturnValue("Bearer mrt_testtoken123");
    mockVerifyMobileToken.mockResolvedValue({
      userId: "user_456",
      tokenRecordId: "tok_rec_1",
    });
    mockFindUnique.mockResolvedValue({
      id: "user_456",
      emailOrUsername: "cli_user",
      displayName: "CLI User",
    });

    const { requireCurrentUser } = await import("@/src/lib/auth");
    const result = await requireCurrentUser();

    expect(mockVerifyMobileToken).toHaveBeenCalledWith("Bearer mrt_testtoken123");
    expect(result).toEqual({
      id: "user_456",
      emailOrUsername: "cli_user",
      displayName: "CLI User",
    });
  });

  it("throws Unauthorized when no cookie and invalid Bearer token", async () => {
    mockGetSessionUserId.mockResolvedValue(null);
    mockHeadersGet.mockReturnValue("Bearer mrt_garbage");
    mockVerifyMobileToken.mockResolvedValue(null);

    const { requireCurrentUser } = await import("@/src/lib/auth");
    await expect(requireCurrentUser()).rejects.toThrow("Unauthorized");
  });

  it("throws Unauthorized when no cookie and no Authorization header", async () => {
    mockGetSessionUserId.mockResolvedValue(null);
    mockHeadersGet.mockReturnValue(null);

    const { requireCurrentUser } = await import("@/src/lib/auth");
    await expect(requireCurrentUser()).rejects.toThrow("Unauthorized");
  });

  it("prefers cookie session over Bearer token when both present", async () => {
    mockGetSessionUserId.mockResolvedValue("user_123");
    mockHeadersGet.mockReturnValue("Bearer mrt_sometoken");
    mockFindUnique.mockResolvedValue({
      id: "user_123",
      emailOrUsername: "cookie_user",
      displayName: "Cookie User",
    });

    const { requireCurrentUser } = await import("@/src/lib/auth");
    const result = await requireCurrentUser();

    expect(result.id).toBe("user_123");
    expect(mockVerifyMobileToken).not.toHaveBeenCalled();
  });

  it("skips CSRF validation on Bearer-authenticated requests", async () => {
    mockGetSessionUserId.mockResolvedValue(null);
    mockHeadersGet.mockReturnValue("Bearer mrt_testtoken123");
    mockVerifyMobileToken.mockResolvedValue({
      userId: "user_456",
      tokenRecordId: "tok_rec_1",
    });
    mockFindUnique.mockResolvedValue({
      id: "user_456",
      emailOrUsername: "cli_user",
      displayName: "CLI User",
    });

    const { requireCurrentUser } = await import("@/src/lib/auth");
    await requireCurrentUser(true);

    expect(mockRequireCsrf).not.toHaveBeenCalled();
  });

  it("enforces CSRF validation on cookie-authenticated requests when requested", async () => {
    mockGetSessionUserId.mockResolvedValue("user_123");
    mockRequireCsrf.mockResolvedValue(undefined);
    mockFindUnique.mockResolvedValue({
      id: "user_123",
      emailOrUsername: "web_user",
      displayName: "Web User",
    });

    const { requireCurrentUser } = await import("@/src/lib/auth");
    await requireCurrentUser(true);

    expect(mockRequireCsrf).toHaveBeenCalled();
  });

  it("throws Unauthorized when Bearer user not found in database", async () => {
    mockGetSessionUserId.mockResolvedValue(null);
    mockHeadersGet.mockReturnValue("Bearer mrt_validtoken");
    mockVerifyMobileToken.mockResolvedValue({
      userId: "user_gone",
      tokenRecordId: "tok_rec_2",
    });
    mockFindUnique.mockResolvedValue(null);

    const { requireCurrentUser } = await import("@/src/lib/auth");
    await expect(requireCurrentUser()).rejects.toThrow("Unauthorized");
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

describe("requireMobileUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns user and token record when token is valid", async () => {
    mockVerifyMobileToken.mockResolvedValue({
      userId: "user_123",
      tokenRecordId: "token_456",
    });
    mockFindUnique.mockResolvedValue({
      id: "user_123",
      emailOrUsername: "mobile_user",
      displayName: "Mobile User",
    });

    const { requireMobileUser } = await import("@/src/lib/auth");
    const mockRequest = {
      headers: {
        get: vi.fn().mockReturnValue("Bearer mrt_token"),
      },
    };
    const result = await requireMobileUser(mockRequest as any);

    expect(result.user.id).toBe("user_123");
    expect(result.tokenRecordId).toBe("token_456");
  });

  it("throws when token verification fails", async () => {
    mockVerifyMobileToken.mockResolvedValue(null);

    const { requireMobileUser } = await import("@/src/lib/auth");
    const mockRequest = {
      headers: {
        get: vi.fn().mockReturnValue("Bearer invalid_token"),
      },
    };
    await expect(requireMobileUser(mockRequest as any)).rejects.toThrow(
      "Unauthorized"
    );
  });

  it("throws when user not found after token verification", async () => {
    mockVerifyMobileToken.mockResolvedValue({
      userId: "user_123",
      tokenRecordId: "token_456",
    });
    mockFindUnique.mockResolvedValue(null);

    const { requireMobileUser } = await import("@/src/lib/auth");
    const mockRequest = {
      headers: {
        get: vi.fn().mockReturnValue("Bearer mrt_valid_token"),
      },
    };
    await expect(requireMobileUser(mockRequest as any)).rejects.toThrow(
      "Unauthorized"
    );
  });

  it("throws when no authorization header provided", async () => {
    mockVerifyMobileToken.mockResolvedValue(null);

    const { requireMobileUser } = await import("@/src/lib/auth");
    const mockRequest = {
      headers: {
        get: vi.fn().mockReturnValue(null),
      },
    };
    await expect(requireMobileUser(mockRequest as any)).rejects.toThrow(
      "Unauthorized"
    );
  });
});
