import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindUnique, mockGetSessionUserId } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockGetSessionUserId: vi.fn(),
}));

vi.mock("@/src/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
    },
  },
}));

vi.mock("@/src/lib/session", () => ({
  getSessionUserId: mockGetSessionUserId,
}));

vi.mock("@/src/lib/log", () => ({ logEvent: vi.fn() }));

import {
  getUserRole,
  hasPermission,
  requireRole,
  canAccessEntity,
  isFeatureEnabled,
  getRoleDisplayName,
} from "@/src/lib/rbac";

function mockUser(role: string) {
  mockGetSessionUserId.mockResolvedValue("user-1");
  mockFindUnique.mockResolvedValue({ id: "user-1", role });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getUserRole", () => {
  it("returns the user's role", async () => {
    mockFindUnique.mockResolvedValue({ id: "user-1", role: "EDITOR" });
    expect(await getUserRole("user-1")).toBe("EDITOR");
  });

  it("defaults to USER when record missing", async () => {
    mockFindUnique.mockResolvedValue(null);
    expect(await getUserRole("unknown")).toBe("USER");
  });
});

describe("hasPermission", () => {
  it("ADMIN has all permissions", async () => {
    mockFindUnique.mockResolvedValue({ id: "u", role: "ADMIN" });
    expect(await hasPermission("u", "users:manage")).toBe(true);
    expect(await hasPermission("u", "issues:delete")).toBe(true);
  });

  it("VIEWER lacks write permissions", async () => {
    mockFindUnique.mockResolvedValue({ id: "u", role: "VIEWER" });
    expect(await hasPermission("u", "issues:write")).toBe(false);
    expect(await hasPermission("u", "notes:write")).toBe(false);
  });

  it("USER has issues:write but not users:manage", async () => {
    mockFindUnique.mockResolvedValue({ id: "u", role: "USER" });
    expect(await hasPermission("u", "issues:write")).toBe(true);
    expect(await hasPermission("u", "users:manage")).toBe(false);
  });
});

describe("requireRole", () => {
  it("allows ADMIN when EDITOR is required (hierarchy)", async () => {
    mockUser("ADMIN");
    await expect(requireRole("EDITOR")).resolves.toBeUndefined();
  });

  it("allows ADMIN when ADMIN is required", async () => {
    mockUser("ADMIN");
    await expect(requireRole("ADMIN")).resolves.toBeUndefined();
  });

  it("allows EDITOR when EDITOR is required", async () => {
    mockUser("EDITOR");
    await expect(requireRole("EDITOR")).resolves.toBeUndefined();
  });

  it("rejects USER when EDITOR is required", async () => {
    mockUser("USER");
    await expect(requireRole("EDITOR")).rejects.toThrow("Role requirement not met");
  });

  it("rejects VIEWER when ADMIN is required", async () => {
    mockUser("VIEWER");
    await expect(requireRole("ADMIN")).rejects.toThrow("Role requirement not met");
  });

  it("allows explicit additionalRoles regardless of hierarchy", async () => {
    mockUser("USER");
    await expect(requireRole("ADMIN", "USER")).resolves.toBeUndefined();
  });

  it("rejects when user is below minRole and not in additionalRoles", async () => {
    mockUser("VIEWER");
    await expect(requireRole("ADMIN", "USER")).rejects.toThrow("Role requirement not met");
  });
});

describe("canAccessEntity", () => {
  it("ADMIN can access any entity", async () => {
    mockFindUnique.mockResolvedValue({ id: "admin", role: "ADMIN" });
    expect(await canAccessEntity("admin", "InternalNote", "other-user")).toBe(true);
  });

  it("EDITOR can access any Issue", async () => {
    mockFindUnique.mockResolvedValue({ id: "ed", role: "EDITOR" });
    expect(await canAccessEntity("ed", "Issue", "other-user")).toBe(true);
  });

  it("EDITOR cannot access another user's note", async () => {
    mockFindUnique.mockResolvedValue({ id: "ed", role: "EDITOR" });
    expect(await canAccessEntity("ed", "InternalNote", "other-user")).toBe(false);
  });

  it("EDITOR can access own note", async () => {
    mockFindUnique.mockResolvedValue({ id: "ed", role: "EDITOR" });
    expect(await canAccessEntity("ed", "InternalNote", "ed")).toBe(true);
  });

  it("USER can only access own data", async () => {
    mockFindUnique.mockResolvedValue({ id: "u", role: "USER" });
    expect(await canAccessEntity("u", "Issue", "u")).toBe(true);
    expect(await canAccessEntity("u", "Issue", "other")).toBe(false);
  });
});

describe("isFeatureEnabled", () => {
  it("returns true for unknown feature (no required permissions)", async () => {
    mockFindUnique.mockResolvedValue({ id: "u", role: "VIEWER" });
    expect(await isFeatureEnabled("u", "nonexistent-feature")).toBe(true);
  });

  it("VIEWER cannot use bulk-actions (requires issues:write)", async () => {
    mockFindUnique.mockResolvedValue({ id: "u", role: "VIEWER" });
    expect(await isFeatureEnabled("u", "bulk-actions")).toBe(false);
  });

  it("USER can use bulk-actions", async () => {
    mockFindUnique.mockResolvedValue({ id: "u", role: "USER" });
    expect(await isFeatureEnabled("u", "bulk-actions")).toBe(true);
  });

  it("ADMIN can use ops-console", async () => {
    mockFindUnique.mockResolvedValue({ id: "u", role: "ADMIN" });
    expect(await isFeatureEnabled("u", "ops-console")).toBe(true);
  });

  it("VIEWER cannot use ops-console", async () => {
    mockFindUnique.mockResolvedValue({ id: "u", role: "VIEWER" });
    expect(await isFeatureEnabled("u", "ops-console")).toBe(false);
  });
});

describe("getRoleDisplayName", () => {
  it.each([
    ["ADMIN", "Administrator"],
    ["EDITOR", "Editor"],
    ["USER", "User"],
    ["VIEWER", "Viewer"],
  ] as const)("%s → %s", (role, name) => {
    expect(getRoleDisplayName(role)).toBe(name);
  });
});
