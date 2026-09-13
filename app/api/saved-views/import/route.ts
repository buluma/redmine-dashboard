import { requireCurrentUser } from "@/src/lib/auth";
import { jsonError } from "@/src/lib/http";
import {
  importSavedViewsSchema,
  savedViewLegacyFields,
  toDashboardSavedView,
} from "@/src/lib/saved-view-contract";
import { withSavedViewWrite } from "@/src/lib/saved-view-write";

// POST /api/saved-views/import - Atomically import a legacy browser-only list.
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const parsed = importSavedViewsSchema.safeParse(await request.json());
    if (!parsed.success) return jsonError("Invalid saved view import", 400);

    const views = await withSavedViewWrite(async (tx) => {
      const existingCount = await tx.savedView.count({
        where: { userId: user.id },
      });
      if (existingCount > 0) return null;

      return Promise.all(
        parsed.data.views.map((view, position) =>
          tx.savedView.create({
            data: {
              userId: user.id,
              name: view.name,
              filters: view.filters,
              ...savedViewLegacyFields(view.filters),
              statusIds: [],
              priorityIds: [],
              position,
            },
          }),
        ),
      );
    });

    if (!views) return jsonError("Saved views already exist", 409);
    return Response.json(
      { views: views.map(toDashboardSavedView) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Failed to import saved views", 500);
  }
}
