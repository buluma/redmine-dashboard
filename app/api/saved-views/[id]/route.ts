import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import {
  savedViewLegacyFields,
  toDashboardSavedView,
  updateSavedViewSchema,
} from "@/src/lib/saved-view-contract";

// PATCH /api/saved-views/[id] - Update a saved view
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const parsed = updateSavedViewSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonError("Invalid saved view", 400);
    }

    // Verify ownership
    const existing = await prisma.savedView.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return jsonError("Saved view not found", 404);
    }

    const view = await prisma.savedView.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.filters !== undefined && {
          filters: parsed.data.filters,
          ...savedViewLegacyFields(parsed.data.filters),
        }),
      },
    });

    return Response.json({ view: toDashboardSavedView(view) });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Failed to update saved view", 500);
  }
}

// DELETE /api/saved-views/[id] - Delete a saved view
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;

    // Verify ownership
    const existing = await prisma.savedView.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return jsonError("Saved view not found", 404);
    }

    await prisma.savedView.delete({
      where: { id },
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Failed to delete saved view", 500);
  }
}
