import { describe, expect, it } from "vitest";

import {
  savedViewLegacyFields,
  saveSavedViewSchema,
  toDashboardSavedView,
} from "@/src/lib/saved-view-contract";

describe("saved view contract", () => {
  it("round-trips the dashboard filter snapshot through the stored contract", () => {
    const filters = {
      statusFilter: "Open",
      priorityFilter: "High",
      search: "release",
      sort: "updated_asc",
      assignedToMe: true,
    };

    const view = toDashboardSavedView({
      id: "view-1",
      name: "My work",
      status: null,
      search: null,
      sortBy: "updated",
      sortOrder: "desc",
      assignedToMe: false,
      position: 2,
      updatedAt: new Date("2026-09-13T00:00:00.000Z"),
      filters,
    });

    expect(view).toMatchObject({
      id: "view-1",
      name: "My work",
      ...filters,
      position: 2,
    });
    expect(savedViewLegacyFields(filters)).toMatchObject({
      status: "Open",
      search: "release",
      sortBy: "updated",
      sortOrder: "asc",
      assignedToMe: true,
    });
  });

  it("falls back to legacy fields for views created before the migration", () => {
    expect(
      toDashboardSavedView({
        id: "legacy",
        name: "Legacy",
        status: "Closed",
        search: "bug",
        sortBy: "priority",
        sortOrder: "desc",
        assignedToMe: false,
        position: 0,
        updatedAt: new Date("2026-09-13T00:00:00.000Z"),
        filters: null,
      }),
    ).toMatchObject({
      statusFilter: "Closed",
      priorityFilter: "",
      search: "bug",
      sort: "priority",
      assignedToMe: false,
    });
  });

  it("rejects blank saved view names", () => {
    expect(
      saveSavedViewSchema.safeParse({
        name: "  ",
        filters: {
          statusFilter: "",
          priorityFilter: "",
          search: "",
          sort: "updated_desc",
          assignedToMe: false,
        },
      }).success,
    ).toBe(false);
  });
});
