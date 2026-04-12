import { requireCurrentUser } from "@/src/lib/auth";
import { recomputeIssueActivityIndex, recordIssueActivityEvent } from "@/src/lib/activity-index";
import { prisma } from "@/src/lib/db";
import { jsonError, parseJson } from "@/src/lib/http";
import { z } from "zod";

const createNoteSchema = z.object({
  issueId: z.string().min(1),
  content: z.string().trim().min(1).max(10000),
});

// GET /api/internal/notes?issueId=xxx
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const issueId = searchParams.get("issueId");

    if (!issueId) {
      return jsonError("issueId query param is required", 400);
    }

    const issue = await prisma.issue.findFirst({
      where: { id: issueId, userId: user.id },
      select: { id: true },
    });

    if (!issue) {
      return jsonError("Issue not found", 404);
    }

    const notes = await prisma.internalNote.findMany({
      where: { issueId: issue.id },
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
    const user = await requireCurrentUser();
    const body = await parseJson(request, createNoteSchema);

    const issue = await prisma.issue.findFirst({
      where: { id: body.issueId, userId: user.id },
      select: { id: true },
    });

    if (!issue) {
      return jsonError("Issue not found", 404);
    }

    const note = await prisma.internalNote.create({
      data: {
        issueId: issue.id,
        userId: user.id,
        content: body.content,
      },
      include: {
        user: { select: { id: true, displayName: true } },
      },
    });
    await recordIssueActivityEvent({
      issueId: issue.id,
      eventType: "internal_note",
      source: "local",
      sourceRemoteId: note.id,
      eventAt: note.updatedAt,
      summary: note.content,
    });
    await recomputeIssueActivityIndex(issue.id);

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
