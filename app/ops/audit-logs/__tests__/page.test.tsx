import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSessionUserId = vi.fn();
const mockRequirePermission = vi.fn();
const mockHasPermission = vi.fn();
const mockUserFindUnique = vi.fn();
const mockAuditLogFindMany = vi.fn();

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/src/lib/session", () => ({ getSessionUserId: mockGetSessionUserId }));
vi.mock("@/src/lib/rbac", () => ({
  requirePermission: mockRequirePermission,
  hasPermission: mockHasPermission,
}));
vi.mock("@/src/lib/db", () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    auditLog: { findMany: mockAuditLogFindMany },
  },
}));
vi.mock("@/app/ops/audit-logs/audit-logs-view", () => ({ AuditLogsView: () => null }));
vi.mock("@/app/ops/audit-logs/access-denied", () => ({ AuditLogsAccessDenied: () => null }));

const noteLog = {
  id: "log-1",
  userId: "user-2",
  userEmail: "user2@example.test",
  action: "CREATE",
  entityType: "InternalNote",
  entityId: "note-1",
  changes: { content: { old: null, new: "private note body" }, issueId: { old: null, new: "issue-1" } },
  metadata: { issueId: "issue-1" },
  createdAt: new Date("2026-10-27T00:00:00.000Z"),
};

describe("audit log access control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionUserId.mockResolvedValue("user-1");
    mockRequirePermission.mockResolvedValue(undefined);
    mockUserFindUnique.mockResolvedValue({ id: "user-1" });
    mockHasPermission.mockResolvedValue(false);
    mockAuditLogFindMany.mockResolvedValue([noteLog]);
  });

  it("scopes ordinary users to their own audit events and removes note bodies", async () => {
    const { default: AuditLogsPage } = await import("@/app/ops/audit-logs/page");

    const page = await AuditLogsPage();

    expect(mockAuditLogFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-1" } }));
    expect(page.props.auditLogs[0].changes).toEqual({ issueId: { old: null, new: "issue-1" } });
  });

  it("allows operators to read global audit metadata without private note bodies", async () => {
    mockHasPermission.mockImplementation(async (_userId: string, permission: string) => permission === "ops:view");
    const { default: AuditLogsPage } = await import("@/app/ops/audit-logs/page");

    const page = await AuditLogsPage();

    expect(mockAuditLogFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
    expect(page.props.auditLogs[0].changes).not.toHaveProperty("content");
  });

  it("allows administrators to read the complete global audit record", async () => {
    mockHasPermission.mockImplementation(async (_userId: string, permission: string) => permission === "ops:view" || permission === "users:manage");
    const { default: AuditLogsPage } = await import("@/app/ops/audit-logs/page");

    const page = await AuditLogsPage();

    expect(mockAuditLogFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
    expect(page.props.auditLogs[0].changes.content.new).toBe("private note body");
  });
});
