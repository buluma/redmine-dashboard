import { z } from "zod";

import type { SavedView } from "@/src/types/dashboard";

export const savedViewFiltersSchema = z.object({
  statusFilter: z.string(),
  priorityFilter: z.string(),
  search: z.string(),
  sort: z.string(),
  assignedToMe: z.boolean(),
});

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
  views: z.array(saveSavedViewSchema).min(1).max(12),
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
