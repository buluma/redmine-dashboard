import { z } from "zod";

import type { SavedView, SavedViewColumnKey } from "@/src/types/dashboard";

export const SAVED_VIEW_DEFAULT_COLUMNS: SavedViewColumnKey[] = ["priority", "due", "progress", "updated"];
const savedViewColumnKeySchema = z.enum(["priority", "due", "progress", "updated"]);

export const savedViewFiltersSchema = z.object({
  statusFilter: z.string(),
  priorityFilter: z.string(),
  search: z.string(),
  sort: z.string(),
  assignedToMe: z.boolean(),
  visibleColumns: z.array(savedViewColumnKeySchema).max(4).optional(),
  statusIds: z.array(z.number().int().positive()).max(100).optional(),
  priorityIds: z.array(z.number().int().positive()).max(100).optional(),
  hasGithubLinks: z.boolean().optional(),
  hasAttachments: z.boolean().optional(),
  dueInDays: z.union([z.number().int().nonnegative(), z.literal("overdue")]).optional(),
  updatedAfter: z.string().date().optional(),
  selectedProject: z.string().min(1).max(255).nullable().optional(),
  showFavoritesOnly: z.boolean().optional(),
});

// Cap on saved views per user — was previously enforced only client-side
// (a `.slice(0, MAX_VIEWS)` on the optimistic array) before views moved to
// the server; enforce it here too so a direct API call can't exceed it.
export const MAX_SAVED_VIEWS = 12;

export const saveSavedViewSchema = z.object({
  name: z.string().trim().min(1).max(100),
  filters: savedViewFiltersSchema,
});

export const updateSavedViewSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    filters: savedViewFiltersSchema.optional(),
  })
  .refine((value) => value.name !== undefined || value.filters !== undefined, {
    message: "name or filters is required",
  });

export const importSavedViewsSchema = z.object({
  views: z.array(saveSavedViewSchema).min(1).max(MAX_SAVED_VIEWS),
});

export type SavedViewFilters = z.infer<typeof savedViewFiltersSchema>;

type StoredSavedView = {
  id: string;
  name: string;
  status: string | null;
  search: string | null;
  sortBy: string | null;
  sortOrder: string;
  assignedToMe: boolean;
  position: number;
  updatedAt: Date;
  filters: unknown;
};

function legacyFilters(
  view: Omit<StoredSavedView, "filters">,
): SavedViewFilters {
  const sort =
    view.sortBy === "updated"
      ? `updated_${view.sortOrder}`
      : (view.sortBy ?? "updated_desc");

  return {
    statusFilter: view.status ?? "",
    priorityFilter: "",
    search: view.search ?? "",
    sort,
    assignedToMe: view.assignedToMe,
  };
}

export function toDashboardSavedView(view: StoredSavedView): SavedView {
  const parsed = savedViewFiltersSchema.safeParse(view.filters);
  const filters = parsed.success ? parsed.data : legacyFilters(view);

  return {
    id: view.id,
    name: view.name,
    ...filters,
    visibleColumns: filters.visibleColumns ?? SAVED_VIEW_DEFAULT_COLUMNS,
    statusIds: filters.statusIds ?? [],
    priorityIds: filters.priorityIds ?? [],
    hasGithubLinks: filters.hasGithubLinks ?? false,
    hasAttachments: filters.hasAttachments ?? false,
    dueInDays: filters.dueInDays,
    updatedAfter: filters.updatedAfter,
    selectedProject: filters.selectedProject ?? null,
    showFavoritesOnly: filters.showFavoritesOnly ?? false,
    position: view.position,
    updatedAt: view.updatedAt.toISOString(),
  };
}

export function savedViewLegacyFields(filters: SavedViewFilters) {
  const [sortBy, sortOrder] = filters.sort
    .match(/^(.*)_(asc|desc)$/)
    ?.slice(1) ?? [filters.sort, "desc"];

  return {
    status: filters.statusFilter || null,
    search: filters.search || null,
    sortBy: sortBy || "updated",
    sortOrder,
    assignedToMe: filters.assignedToMe,
  };
}
