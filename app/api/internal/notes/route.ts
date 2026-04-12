import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError, parseJson } from "@/src/lib/http";
import { z } from "zod";

const createNoteSchema = z.object({
  issueId: z.string().min(1),
  content: z.string().trim().min(1).max(10000),
});

const updateNoteSchema = z.object({
  content: z.string().trim().min(1).max(10000),
});

// GET /api/internal/notes?issueId=xxx
export async function GET(request: Request) {
  try {
    const { user } = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const issueId = searchParams.get("issueId");

    if (!issueId) {
      return jsonError("issueId query param is required", 400);
    }

    const notes = await prisma.internalNote.findMany({
      where: { issueId },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, displayName: true } },
      },
    });

    return Response.json({
      notes: notes.map((n) => ({
        id: n.id,
        issueId: n.issueId,
        content: n.content,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
        authorId: n.userId,
        authorName: n.user.displayName,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Failed to fetch notes", 500);
  }
}

// POST /api/internal/notes
export async function POST(request: Request) {
  try {
    const { user } = await requireCurrentUser();
    const body = await parseJson(request, createNoteSchema);

    const note = await prisma.internalNote.create({
      data: {
        issueId: body.issueId,
        userId: user.id,
        content: body.content,
      },
      include: {
        user: { select: { id: true, displayName: true } },
      },
    });

    return Response.json({
      note: {
        id: note.id,
        issueId: note.issueId,
        content: note.content,
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
        authorId: note.userId,
        authorName: note.user.displayName,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Failed to create note", 500);
  }
}

// PATCH /api/internal/notes/[id]
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireCurrentUser();
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
    const { user } = await requireCurrentUser();
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
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Failed to delete note", 500);
  }
}
