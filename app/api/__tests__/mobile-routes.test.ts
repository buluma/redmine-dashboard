import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearRateLimitState } from "@/src/lib/rate-limit";

const {
  mockConnectRedmineAccount,
  mockCreateMobileToken,
  mockRunSyncJob,
  mockRequireMobileUser,
  mockRevokeMobileToken,
  mockRequireRedmineClientForUser,
  mockSyncSingleIssue,
  mockIssueCount,
  mockIssueFindMany,
  mockIssueFindFirst,
  mockTokenFindUnique,
} = vi.hoisted(() => ({
  mockConnectRedmineAccount: vi.fn(),
  mockCreateMobileToken: vi.fn(),
  mockRunSyncJob: vi.fn(),
  mockRequireMobileUser: vi.fn(),
  mockRevokeMobileToken: vi.fn(),
  mockRequireRedmineClientForUser: vi.fn(),
  mockSyncSingleIssue: vi.fn(),
  mockIssueCount: vi.fn(),
  mockIssueFindMany: vi.fn(),
  mockIssueFindFirst: vi.fn(),
  mockTokenFindUnique: vi.fn(),
}));

vi.mock("@/src/lib/mobile-api", () => ({
  assertMobileApiEnabled: vi.fn(),
}));

vi.mock("@/src/lib/redmine-connect", () => ({
  connectRedmineAccount: mockConnectRedmineAccount,
}));

vi.mock("@/src/lib/mobile-auth", () => ({
  createMobileToken: mockCreateMobileToken,
  revokeMobileToken: mockRevokeMobileToken,
}));

vi.mock("@/src/lib/sync", () => ({
  runSyncJob: mockRunSyncJob,
  syncSingleIssue: mockSyncSingleIssue,
}));

vi.mock("@/src/lib/auth", () => ({
  requireMobileUser: mockRequireMobileUser,
  requireRedmineClientForUser: mockRequireRedmineClientForUser,
}));

vi.mock("@/src/lib/db", () => ({
  prisma: {
    issue: {
      count: mockIssueCount,
      findMany: mockIssueFindMany,
      findFirst: mockIssueFindFirst,
    },
    mobileApiToken: {
      findUnique: mockTokenFindUnique,
    },
  },
}));

describe("mobile v1 routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimitState();
  });

  it("pairs device and returns mobile token", async () => {
    mockConnectRedmineAccount.mockResolvedValue({
      id: "u1",
      emailOrUsername: "alice",
      displayName: "Alice",
    });
    mockCreateMobileToken.mockResolvedValue({
      token: "mrt_abc",
      tokenRecordId: "mt1",
      expiresAt: null,
    });
    mockRunSyncJob.mockResolvedValue({ jobId: "j1" });

    const { POST } = await import("@/app/api/mobile/v1/pair/connect/route");
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: "https://redmine.example.com",
          apiKey: "abcdef123456",
          deviceName: "Pixel",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.token).toBe("mrt_abc");
    expect(body.user.username).toBe("alice");
  });

  it("returns profile for bearer-authenticated mobile user", async () => {
    mockRequireMobileUser.mockResolvedValue({
      user: { id: "u1", emailOrUsername: "alice", displayName: "Alice" },
      tokenRecordId: "mt1",
    });
    mockTokenFindUnique.mockResolvedValue({
      id: "mt1",
      name: "Pixel 9",
      tokenPrefix: "mrt_prefix",
      lastUsedAt: null,
      createdAt: new Date("2026-02-26T00:00:00.000Z"),
      expiresAt: null,
    });

    const { GET } = await import("@/app/api/mobile/v1/me/route");
    const response = await GET(new Request("http://localhost"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user.username).toBe("alice");
    expect(body.token.id).toBe("mt1");
  });

  it("lists issues for mobile user", async () => {
    mockRequireMobileUser.mockResolvedValue({
      user: { id: "u1", emailOrUsername: "alice", displayName: "Alice" },
      tokenRecordId: "mt1",
    });
    mockIssueCount.mockResolvedValue(1);
    mockIssueFindMany.mockResolvedValue([{ id: "i1", redmineIssueId: 101 }]);

    const { GET } = await import("@/app/api/mobile/v1/issues/route");
    const response = await GET(new Request("http://localhost?sort=updated_desc&page=1&pageSize=20"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.total).toBe(1);
    expect(body.items[0].redmineIssueId).toBe(101);
  });

  it("creates issue via mobile route", async () => {
    const client = {
      createIssue: vi.fn().mockResolvedValue({ id: 999 }),
    };
    mockRequireMobileUser.mockResolvedValue({
      user: { id: "u1", emailOrUsername: "alice", displayName: "Alice" },
      tokenRecordId: "mt1",
    });
    mockRequireRedmineClientForUser.mockResolvedValue({ client });
    mockSyncSingleIssue.mockResolvedValue({ id: "i999" });

    const { POST } = await import("@/app/api/mobile/v1/issues/route");
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "Mobile Bug",
          projectId: 1,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(client.createIssue).toHaveBeenCalledWith({
      subject: "Mobile Bug",
      projectId: 1,
      description: undefined,
      priorityId: undefined,
      assignedToId: undefined,
      dueDate: undefined,
    });
    expect(mockSyncSingleIssue).toHaveBeenCalledWith("u1", client, 999, expect.anything());
    const body = await response.json();
    expect(body.issue.id).toBe("i999");
  });

  it("uses remote totals and requested sort mode for mobile hybrid search", async () => {
    const client = {
      search: vi.fn().mockResolvedValue({
        results: [{ id: 202, type: "issue" }],
        total_count: 5,
        offset: 0,
        limit: 20,
      }),
    };
    const localIssue = {
      id: "i-local",
      redmineIssueId: 101,
      subject: "Local",
      priority: "Zulu",
      dueDate: null,
      updatedOnRemote: new Date("2026-04-10T00:00:00.000Z"),
      allowedStatusesJson: null,
      childrenJson: null,
    };
    const remoteIssue = {
      id: "i-remote",
      redmineIssueId: 202,
      subject: "Remote",
      priority: "Alpha",
      dueDate: null,
      updatedOnRemote: new Date("2026-04-11T00:00:00.000Z"),
      allowedStatusesJson: null,
      childrenJson: null,
    };
    mockRequireMobileUser.mockResolvedValue({
      user: { id: "u1", emailOrUsername: "alice", displayName: "Alice" },
      tokenRecordId: "mt1",
    });
    mockRequireRedmineClientForUser.mockResolvedValue({ client });
    mockIssueCount.mockResolvedValue(1);
    mockIssueFindMany.mockResolvedValueOnce([localIssue]).mockResolvedValueOnce([remoteIssue]);
    mockSyncSingleIssue.mockResolvedValue({ id: "i-remote" });

    const { GET } = await import("@/app/api/mobile/v1/issues/route");
    const response = await GET(
      new Request("http://localhost?search=bug&searchMode=hybrid&sort=priority&page=1&pageSize=20"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.total).toBe(5);
    expect(body.items.map((item: { redmineIssueId: number }) => item.redmineIssueId)).toEqual([202, 101]);
    expect(mockSyncSingleIssue).toHaveBeenCalledWith("u1", client, 202, {
      pruneAttachments: true,
      pruneRelations: true,
      pruneTimeEntries: false,
    });
  });

  it("posts comment from mobile route and syncs issue", async () => {
    const client = {
      addComment: vi.fn().mockResolvedValue(undefined),
    };
    mockRequireMobileUser.mockResolvedValue({
      user: { id: "u1", emailOrUsername: "alice", displayName: "Alice" },
      tokenRecordId: "mt1",
    });
    mockRequireRedmineClientForUser.mockResolvedValue({ client });
    mockSyncSingleIssue.mockResolvedValue({ id: "i1" });

    const { POST } = await import("@/app/api/mobile/v1/issues/[id]/comment/route");
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: "From android" }),
      }),
      { params: Promise.resolve({ id: "123" }) },
    );

    expect(response.status).toBe(200);
    expect(client.addComment).toHaveBeenCalledWith(123, "From android");
    expect(mockSyncSingleIssue).toHaveBeenCalledWith("u1", client, 123);
  });

  it("rotates current token", async () => {
    mockRequireMobileUser.mockResolvedValue({
      user: { id: "u1", emailOrUsername: "alice", displayName: "Alice" },
      tokenRecordId: "old-token-id",
    });
    mockCreateMobileToken.mockResolvedValue({
      token: "mrt_new",
      tokenRecordId: "new-token-id",
      expiresAt: null,
    });

    const { POST } = await import("@/app/api/mobile/v1/tokens/rotate/route");
    const response = await POST(new Request("http://localhost", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(mockRevokeMobileToken).toHaveBeenCalledWith("old-token-id");
    const body = await response.json();
    expect(body.token).toBe("mrt_new");
  });
});
