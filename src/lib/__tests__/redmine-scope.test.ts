import { beforeEach, describe, expect, it, vi } from "vitest";

const { findCredential } = vi.hoisted(() => ({ findCredential: vi.fn() }));

vi.mock("@/src/lib/db", () => ({
  prisma: { userRedmineCredential: { findUnique: findCredential } },
}));

import {
  getRedmineCatalogScopeForUser,
  offlineActionScopeError,
  redmineCatalogScope,
} from "@/src/lib/redmine-scope";

describe("Redmine account scope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps catalog scopes separate by account and canonical base URL", () => {
    expect(redmineCatalogScope("user-a", "https://redmine.example.test/root/"))
      .toBe(redmineCatalogScope("user-a", "https://redmine.example.test/root"));
    expect(redmineCatalogScope("user-a", "https://redmine.example.test/root"))
      .not.toBe(redmineCatalogScope("user-b", "https://redmine.example.test/root"));
    expect(redmineCatalogScope("user-a", "https://redmine.example.test/root"))
      .not.toBe(redmineCatalogScope("user-a", "https://other.example.test/root"));
  });

  it("loads the current active account's catalog scope only", async () => {
    findCredential.mockResolvedValue({ baseUrl: "https://redmine.example.test/root/", isActive: true });
    const scope = await getRedmineCatalogScopeForUser("user-a");
    expect(scope).toBe(redmineCatalogScope("user-a", "https://redmine.example.test/root"));
    expect(findCredential).toHaveBeenCalledWith({
      where: { userId: "user-a" },
      select: { baseUrl: true, isActive: true },
    });
  });

  it("rejects queued mutations for another account or Redmine base URL", () => {
    const request = new Request("https://dashboard.test/api/issues/1/comment", {
      headers: {
        "x-converge-offline-account-id": "user-a",
        "x-converge-offline-redmine-base-url": "https://redmine.example.test/root/",
      },
    });

    expect(offlineActionScopeError(request, "user-a", "https://redmine.example.test/root")
      ).toBeNull();
    const error = offlineActionScopeError(request, "user-b", "https://redmine.example.test/root");
    expect(error?.status).toBe(409);
    expect(error?.headers.get("x-converge-offline-scope-mismatch")).toBe("true");
    expect(offlineActionScopeError(request, "user-a", "https://other.example.test/root")
      ?.status).toBe(409);
  });

  it("keeps ordinary online mutations compatible when they have no queue scope", () => {
    const request = new Request("https://dashboard.test/api/issues/1/comment");
    expect(offlineActionScopeError(request, "user-a", "https://redmine.example.test/root")).toBeNull();
  });
});
