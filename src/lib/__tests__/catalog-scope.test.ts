import { beforeEach, describe, expect, it, vi } from "vitest";

const { statusUpsert, enumerationUpsert, getStatuses, getActivities, getPriorities } = vi.hoisted(() => ({
  statusUpsert: vi.fn(),
  enumerationUpsert: vi.fn(),
  getStatuses: vi.fn(),
  getActivities: vi.fn(),
  getPriorities: vi.fn(),
}));

vi.mock("@/src/lib/db", () => ({
  prisma: {
    statusCatalog: { upsert: statusUpsert },
    enumerationCatalog: { upsert: enumerationUpsert },
  },
}));

import { syncEnumerationCatalog, syncStatusCatalog } from "@/src/lib/sync/catalog";
import { redmineCatalogScope } from "@/src/lib/redmine-scope";
import type { RedmineClient } from "@/src/lib/redmine";

function client(baseUrl: string): RedmineClient {
  return {
    baseUrl,
    getIssueStatuses: getStatuses,
    getTimeEntryActivities: getActivities,
    getIssuePriorities: getPriorities,
  } as unknown as RedmineClient;
}

describe("scoped Redmine catalogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statusUpsert.mockResolvedValue({});
    enumerationUpsert.mockResolvedValue({});
  });

  it("upserts statuses by account/server scope and remote ID", async () => {
    getStatuses.mockResolvedValue([{ id: 1, name: "Open", is_closed: false }]);
    const redmine = client("https://redmine.example.test/one");

    await syncStatusCatalog("user-a", redmine);

    const scope = redmineCatalogScope("user-a", redmine.baseUrl);
    expect(statusUpsert).toHaveBeenCalledWith({
      where: { scope_id: { scope, id: 1 } },
      update: { name: "Open", isClosed: false },
      create: { scope, id: 1, name: "Open", isClosed: false },
    });
  });

  it("includes scope in every activity and priority catalog key", async () => {
    getActivities.mockResolvedValue([{ id: 2, name: "Development" }]);
    getPriorities.mockResolvedValue([{ id: 3, name: "Urgent", is_default: true }]);
    const redmine = client("https://redmine.example.test/two");

    await syncEnumerationCatalog("user-b", redmine);

    const scope = redmineCatalogScope("user-b", redmine.baseUrl);
    expect(enumerationUpsert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { key: `${scope}:time_entry_activity:2` },
      create: expect.objectContaining({ scope, key: `${scope}:time_entry_activity:2` }),
    }));
    expect(enumerationUpsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { key: `${scope}:issue_priority:3` },
      create: expect.objectContaining({ scope, key: `${scope}:issue_priority:3` }),
    }));
  });
});
