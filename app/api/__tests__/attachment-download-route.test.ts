import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  issueFindFirst: vi.fn(),
  attachmentFindFirst: vi.fn(),
  downloadAttachment: vi.fn(),
  requireRedmineClient: vi.fn(),
  requireRedmineClientForUser: vi.fn(),
}));

vi.mock("@/src/lib/db", () => ({ prisma: {
  issue: { findFirst: mocks.issueFindFirst },
  issueAttachment: { findFirst: mocks.attachmentFindFirst },
} }));
vi.mock("@/src/lib/auth", () => ({
  requireRedmineClient: mocks.requireRedmineClient,
  requireRedmineClientForUser: mocks.requireRedmineClientForUser,
}));
vi.mock("@/src/lib/telemetry", () => ({ trackFailure: vi.fn(), trackInfo: vi.fn() }));

const client = { normalizedBaseUrl: "https://current.example.test/redmine", downloadAttachment: mocks.downloadAttachment };
const context = { params: Promise.resolve({ id: "42", attachmentId: "7" }) };

describe("attachment endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRedmineClient.mockResolvedValue({ user: { id: "user-1" }, client });
    mocks.requireRedmineClientForUser.mockResolvedValue({ client });
    mocks.issueFindFirst.mockResolvedValue({ id: "issue-1" });
    mocks.attachmentFindFirst.mockResolvedValue({ downloadUrl: "/attachments/7", filename: "test.svg", contentType: null });
  });

  async function request() {
    const route = await import("@/app/api/issues/[id]/attachments/[attachmentId]/route");
    return route.GET(new Request("http://localhost/attachment"), context);
  }

  it("selects the issue belonging to the active credential server", async () => {
    mocks.issueFindFirst.mockResolvedValue(null);
    const response = await request();
    expect(response.status).toBe(404);
    expect(mocks.issueFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1", redmineIssueId: 42, redmineBaseUrl: client.normalizedBaseUrl },
    }));
    expect(mocks.downloadAttachment).not.toHaveBeenCalled();
  });

  it.each(["text/html", "image/svg+xml"])("downloads active %s content with sandboxing", async (contentType) => {
    mocks.downloadAttachment.mockResolvedValue(new Response("body", { headers: { "content-type": contentType } }));
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
  });

  it.each(["image/png", "application/pdf"])("retains inline %s previews", async (contentType) => {
    mocks.downloadAttachment.mockResolvedValue(new Response("body", { headers: { "content-type": contentType } }));
    const response = await request();
    expect(response.headers.get("content-disposition")).toMatch(/^inline;/);
  });

  it("does not forward a compressed upstream content length", async () => {
    mocks.downloadAttachment.mockResolvedValue(new Response("decoded body", {
      headers: { "content-type": "image/png", "content-encoding": "gzip", "content-length": "5" },
    }));
    const response = await request();
    expect(response.headers.get("content-length")).toBeNull();
    expect(await response.text()).toBe("decoded body");
  });

  it("encodes an untrusted filename safely", async () => {
    mocks.attachmentFindFirst.mockResolvedValue({ downloadUrl: "/attachments/7", filename: 'bad"\r\nname.svg', contentType: null });
    mocks.downloadAttachment.mockResolvedValue(new Response("body", { headers: { "content-type": "image/svg+xml" } }));
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("filename*=UTF-8''bad%22%0D%0Aname.svg");
  });
});
