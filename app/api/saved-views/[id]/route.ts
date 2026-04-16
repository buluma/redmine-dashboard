import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";

// PATCH /api/saved-views/[id] - Update a saved view
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const body = await request.json();
    
    // Verify ownership
    const existing = await prisma.savedView.findFirst({
      where: { id, userId: user.id },
    });
    
    if (!existing) {
      return jsonError("Saved view not found", 404);
    }
    
    // If setting as default, clear other defaults first
    if (body.isDefault && !existing.isDefault) {
      await prisma.savedView.updateMany({
        where: { userId: user.id, isDefault: true },
        data: { isDefault: false },
      });
    }
    
    const view = await prisma.savedView.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.project !== undefined && { project: body.project }),
        ...(body.status && { status: body.status }),
        ...(body.search !== undefined && { search: body.search }),
        ...(body.sortBy && { sortBy: body.sortBy }),
        ...(body.sortOrder && { sortOrder: body.sortOrder }),
        ...(body.statusIds && { statusIds: body.statusIds }),
        ...(body.priorityIds && { priorityIds: body.priorityIds }),
        ...(body.assignedToMe !== undefined && { assignedToMe: body.assignedToMe }),
        ...(body.dueInDays !== undefined && { dueInDays: body.dueInDays }),
        ...(body.isDefault !== undefined && { isDefault: body.isDefault }),
      },
    });
    
    return Response.json({ view });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Failed to update saved view", 500);
  }
}

// DELETE /api/saved-views/[id] - Delete a saved view
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
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