import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearRateLimitState } from "@/src/lib/rate-limit";

const mockRequireRedmineClient = vi.fn();
const mockRequireCurrentUser = vi.fn();
const mockSyncSingleIssue = vi.fn();
const mockRunSyncJob = vi.fn();

vi.mock("@/src/lib/auth", () => ({
  requireRedmineClient: mockRequireRedmineClient,
  requireCurrentUser: mockRequireCurrentUser,
}));

vi.mock("@/src/lib/sync", () => ({
  syncSingleIssue: mockSyncSingleIssue,
  runSyncJob: mockRunSyncJob,
}));

describe("API mutation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimitState();
  });

  it("returns allowed statuses for an issue", async () => {
    const client = {
      getIssue: vi.fn().mockResolvedValue({
        issue: {
          allowed_statuses: [
            { id: 1, name: "New" },
            { id: 2, name: "In Progress" },
          ],
        },
      }),
    };

    mockRequireRedmineClient.mockResolvedValue({ user: { id: "u1" }, client });

    const { GET } = await import("@/app/api/issues/[id]/status/route");
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "123" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.allowedStatusIds).toEqual([1, 2]);
  });

  it("rejects disallowed status transition", async () => {
    const client = {
      getIssue: vi.fn().mockResolvedValue({
        issue: {
          allowed_statuses: [{ id: 2, name: "In Progress" }],
        },
      }),
      updateIssueStatus: vi.fn(),
    };

    mockRequireRedmineClient.mockResolvedValue({ user: { id: "u1" }, client });

    const { POST } = await import("@/app/api/issues/[id]/status/route");
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId: 5 }),
      }),
      { params: Promise.resolve({ id: "123" }) },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/not allowed/i);
  });

  it("posts comment and syncs issue", async () => {
    const client = {
      addComment: vi.fn().mockResolvedValue(undefined),
    };

    mockRequireRedmineClient.mockResolvedValue({ user: { id: "u1" }, client });
    mockSyncSingleIssue.mockResolvedValue({ id: "i1" });

    const { POST } = await import("@/app/api/issues/[id]/comment/route");
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: "Looks good" }),
      }),
      { params: Promise.resolve({ id: "123" }) },
    );

    expect(response.status).toBe(200);
    expect(client.addComment).toHaveBeenCalledWith(123, "Looks good");
    expect(mockSyncSingleIssue).toHaveBeenCalled();
  });

  it("adds timelog and triggers issue resync", async () => {
    const client = {
      addTimeEntry: vi.fn().mockResolvedValue({ time_entry: { id: 999 } }),
    };

    mockRequireRedmineClient.mockResolvedValue({ user: { id: "u1" }, client });
    mockSyncSingleIssue.mockResolvedValue({ id: "local-issue-1" });

    const { POST } = await import("@/app/api/issues/[id]/timelog/route");
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hours: 1.5,
          activityId: 9,
          comment: "Worked on API",
          spentOn: "2026-02-25",
        }),
      }),
      { params: Promise.resolve({ id: "123" }) },
    );

    expect(response.status).toBe(200);
    expect(client.addTimeEntry).toHaveBeenCalled();
    expect(mockSyncSingleIssue).toHaveBeenCalledWith("u1", client, 123);
  });

  it("rate limits manual pull after three requests per minute", async () => {
    mockRequireCurrentUser.mockResolvedValue({ id: "u1" });
    mockRunSyncJob.mockResolvedValue({ jobId: "j1" });

    const { POST } = await import("@/app/api/sync/manual-pull/route");

    const first = await POST();
    const second = await POST();
    const third = await POST();
    const fourth = await POST();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(200);
    expect(fourth.status).toBe(429);
  });
});
