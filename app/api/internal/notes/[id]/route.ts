import { requireCurrentUser } from "@/src/lib/auth";
import { recomputeIssueActivityIndex, recordIssueActivityEvent } from "@/src/lib/activity-index";
import { prisma } from "@/src/lib/db";
import { jsonError, parseJson } from "@/src/lib/http";
import { z } from "zod";

const updateNoteSchema = z.object({
  content: z.string().trim().min(1).max(10000),
});

// PATCH /api/internal/notes/[id]
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const body = await parseJson(request, updateNoteSchema);

    const note = await prisma.internalNote.findUnique({
      where: { id },
    });

    if (!note) {
      return jsonError("Note not found", 404);
    }

    if (note.userId !== user.id) {
      return jsonError("You can only edit your own notes", 403);
    }

    const updated = await prisma.internalNote.update({
      where: { id },
      data: { content: body.content },
      include: {
        user: { select: { id: true, displayName: true } },
      },
    });
    await recordIssueActivityEvent({
      issueId: updated.issueId,
      eventType: "internal_note",
      source: "local",
      sourceRemoteId: updated.id,
      eventAt: updated.updatedAt,
      summary: updated.content,
    });
    await recomputeIssueActivityIndex(updated.issueId);

    return Response.json({
      note: {
        id: updated.id,
        issueId: updated.issueId,
        content: updated.content,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        authorId: updated.userId,
        authorName: updated.user.displayName,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Failed to update note", 500);
  }
}

// DELETE /api/internal/notes/[id]
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;

    const note = await prisma.internalNote.findUnique({
      where: { id },
    });

    if (!note) {
      return jsonError("Note not found", 404);
    }

    if (note.userId !== user.id) {
      return jsonError("You can only delete your own notes", 403);
    }

    await prisma.internalNote.delete({ where: { id } });
    await recordIssueActivityEvent({
      issueId: note.issueId,
      eventType: "internal_note",
      source: "local",
      sourceRemoteId: `${note.id}:deleted`,
      eventAt: new Date(),
      summary: "Internal note deleted",
    });
    await recomputeIssueActivityIndex(note.issueId);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Failed to delete note", 500);
  }
}
