import { requireCurrentUser } from "@/src/lib/auth";
import { jsonError } from "@/src/lib/http";
import { SavedViewWriteConflictError, withSavedViewWrite } from "@/src/lib/saved-view-write";
import { trackFailure } from "@/src/lib/telemetry";
import { z } from "zod";

const reorderSchema = z.object({
  viewIds: z.array(z.string()),
});

class SavedViewsNotFoundError extends Error {}

/**
 * PATCH /api/saved-views/reorder
 *
 * Reorder saved views by updating their position
 * The order in the array determines the new position (0 = first)
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();

    const parsed = reorderSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid request body", 400);
    }

    const { viewIds } = parsed.data;

    if (viewIds.length === 0) {
      return Response.json({ success: true, views: [] });
    }

    // Same isolation as create/import — a create landing between this
    // route's read of existingViews and its position writes could otherwise
    // race with this reorder for the position values it doesn't yet know
    // about.
    const reorderedViews = await withSavedViewWrite(async (tx) => {
      // Verify all views belong to user
      const existingViews = await tx.savedView.findMany({
        where: {
          id: { in: viewIds },
          userId: user.id,
        },
        select: { id: true },
      });

      if (existingViews.length !== viewIds.length) {
        throw new SavedViewsNotFoundError("One or more views not found");
      }

      // Update positions in a single transaction
      await Promise.all(
        viewIds.map((id, index) =>
          tx.savedView.update({
            where: { id },
            data: { position: index },
          })
        )
      );

      // Return reordered views
      return tx.savedView.findMany({
        where: { userId: user.id },
        orderBy: { position: "asc" },
        select: {
          id: true,
          name: true,
          position: true,
        },
      });
    });

    return Response.json({
      success: true,
      views: reorderedViews,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    if (error instanceof SavedViewsNotFoundError) {
      return jsonError(error.message, 404);
    }
    if (error instanceof SavedViewWriteConflictError) {
      return jsonError(error.message, 503);
    }
    trackFailure({ event: "saved_views.reorder.failed", error, metricName: "saved_views_reorder_failed" });
    return jsonError("Failed to reorder views", 500);
  }
}
