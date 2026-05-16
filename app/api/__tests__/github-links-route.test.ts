import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearRateLimitState } from "@/src/lib/rate-limit";

const {
  mockRequireCurrentUser,
  mockIssueFindFirst,
  mockIssueFindUnique,
  mockIssueUpdate,
  mockLinkFindMany,
  mockLinkUpsert,
  mockLinkDeleteMany,
  mockIssueActivityEventUpsert,
  mockIssueActivityEventFindFirst,
} = vi.hoisted(() => ({
  mockRequireCurrentUser: vi.fn(),
  mockIssueFindFirst: vi.fn(),
  mockIssueFindUnique: vi.fn(),
  mockIssueUpdate: vi.fn(),
  mockLinkFindMany: vi.fn(),
  mockLinkUpsert: vi.fn(),
  mockLinkDeleteMany: vi.fn(),
  mockIssueActivityEventUpsert: vi.fn(),
  mockIssueActivityEventFindFirst: vi.fn(),
}));

vi.mock("@/src/lib/auth", () => ({
  requireCurrentUser: mockRequireCurrentUser,
}));

vi.mock("@/src/lib/db", () => ({
  prisma: {
    issue: {
      findFirst: mockIssueFindFirst,
      findUnique: mockIssueFindUnique,
      update: mockIssueUpdate,
    },
    issueGithubLink: {
      findMany: mockLinkFindMany,
      upsert: mockLinkUpsert,
      deleteMany: mockLinkDeleteMany,
    },
    issueActivityEvent: {
      upsert: mockIssueActivityEventUpsert,
      findFirst: mockIssueActivityEventFindFirst,
    },
  },
}));

describe("GitHub links issue routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimitState();
    mockIssueFindUnique.mockResolvedValue({
      id: "issue-local-1",
      updatedOnRemote: new Date("2026-04-11T00:00:00.000Z"),
    });
    mockIssueActivityEventFindFirst.mockResolvedValue(null);
    mockIssueUpdate.mockResolvedValue(null);
  });

  it("creates github issue link using derived url", async () => {
    mockRequireCurrentUser.mockResolvedValue({ id: "u1" });
    mockIssueFindFirst.mockResolvedValue({ id: "issue-local-1" });
    mockLinkUpsert.mockResolvedValue({ id: "link-1" });

    const { POST } = await import("@/app/api/issues/[id]/github-links/route");
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repositoryFullName: "acme/platform",
          githubIssueNumber: 42,
          title: "Fix timeout",
        }),
      }),
      { params: Promise.resolve({ id: "123" }) },
    );

    expect(response.status).toBe(200);
    expect(mockLinkUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          issueId_url: {
            issueId: "issue-local-1",
            url: "https://github.com/acme/platform/issues/42",
          },
        },
      }),
    );
  });

  it("lists github links for the selected issue", async () => {
    mockRequireCurrentUser.mockResolvedValue({ id: "u1" });
    mockIssueFindFirst.mockResolvedValue({ id: "issue-local-1" });
    mockLinkFindMany.mockResolvedValue([{ id: "l1" }]);

    const { GET } = await import("@/app/api/issues/[id]/github-links/route");
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "123" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toEqual([{ id: "l1" }]);
  });

  it("deletes link when it belongs to the current issue and user", async () => {
    mockRequireCurrentUser.mockResolvedValue({ id: "u1" });
    mockIssueFindFirst.mockResolvedValue({ id: "issue-local-1" });
    mockLinkDeleteMany.mockResolvedValue({ count: 1 });

    const { DELETE } = await import("@/app/api/issues/[id]/github-links/[linkId]/route");
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ id: "123", linkId: "link-1" }),
    });

    expect(response.status).toBe(200);
    expect(mockLinkDeleteMany).toHaveBeenCalledWith({
      where: {
        id: "link-1",
        issueId: "issue-local-1",
        userId: "u1",
      },
    });
  });
});
