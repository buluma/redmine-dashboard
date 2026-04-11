import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RedmineClient } from "@/src/lib/redmine";

const mockIssueUpsert = vi.fn();
const mockAttachmentDeleteMany = vi.fn();
const mockRelationDeleteMany = vi.fn();

vi.mock("@/src/lib/db", () => ({
  prisma: {
    issue: { upsert: mockIssueUpsert },
    issueAttachment: { deleteMany: mockAttachmentDeleteMany, upsert: vi.fn() },
    issueRelation: { deleteMany: mockRelationDeleteMany, upsert: vi.fn() },
    issueJournal: { upsert: vi.fn() },
    timeEntry: { deleteMany: vi.fn(), upsert: vi.fn() },
  },
}));

describe("syncSingleIssue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIssueUpsert.mockImplementation(({ create }) => Promise.resolve({ id: `${create.userId}:${create.redmineBaseUrl}` }));
  });

  it("keys cached issues by user and Redmine base URL as well as remote issue id", async () => {
    const { syncSingleIssue } = await import("@/src/lib/sync");
    const issue = {
      id: 123,
      subject: "Shared numeric id",
      updated_on: "2026-04-11T00:00:00Z",
      status: { id: 1, name: "New" },
    };
    const clientA = {
      normalizedBaseUrl: "https://redmine-a.example.com",
      getIssue: vi.fn().mockResolvedValue({ issue }),
      listIssueTimeEntries: vi.fn().mockResolvedValue([]),
    } as unknown as RedmineClient;
    const clientB = {
      normalizedBaseUrl: "https://redmine-b.example.com",
      getIssue: vi.fn().mockResolvedValue({ issue }),
      listIssueTimeEntries: vi.fn().mockResolvedValue([]),
    } as unknown as RedmineClient;

    await syncSingleIssue("user-a", clientA, 123);
    await syncSingleIssue("user-b", clientB, 123);

    expect(mockIssueUpsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          userId_redmineBaseUrl_redmineIssueId: {
            userId: "user-a",
            redmineBaseUrl: "https://redmine-a.example.com",
            redmineIssueId: 123,
          },
        },
      }),
    );
    expect(mockIssueUpsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          userId_redmineBaseUrl_redmineIssueId: {
            userId: "user-b",
            redmineBaseUrl: "https://redmine-b.example.com",
            redmineIssueId: 123,
          },
        },
      }),
    );
  });
});
