import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { trackFailure } from "@/src/lib/telemetry";
import { z } from "zod";

const reorderSchema = z.object({
  viewIds: z.array(z.string()),
});

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
    
    // Verify all views belong to user
    const existingViews = await prisma.savedView.findMany({
      where: {
        id: { in: viewIds },
        userId: user.id,
      },
      select: { id: true },
    });
    
    if (existingViews.length !== viewIds.length) {
      return jsonError("One or more views not found", 404);
    }
    
    // Update positions in a single transaction
    await prisma.$transaction(
      viewIds.map((id, index) =>
        prisma.savedView.update({
          where: { id },
          data: { position: index },
        })
      )
    );
    
    // Return reordered views
    const reorderedViews = await prisma.savedView.findMany({
      where: { userId: user.id },
      orderBy: { position: "asc" },
      select: {
        id: true,
        name: true,
        position: true,
      },
    });
    
    return Response.json({
      success: true,
      views: reorderedViews,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    trackFailure({ event: "saved_views.reorder.failed", error, metricName: "saved_views_reorder_failed" });
    return jsonError("Failed to reorder views", 500);
  }
}