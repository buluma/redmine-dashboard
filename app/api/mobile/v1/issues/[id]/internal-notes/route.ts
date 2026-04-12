import { requireMobileUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError, parseJson } from "@/src/lib/http";
import { z } from "zod";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireMobileUser(request);
    const { id } = await context.params;
    const issueId = parseInt(id, 10);

    const issue = await prisma.issue.findFirst({
      where: { userId: user.id, redmineIssueId: issueId },
      select: { id: true },
    });
    if (!issue) return jsonError("Issue not found", 404);

    const notes = await prisma.internalNote.findMany({
      where: { issueId: issue.id },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { displayName: true } } },
    });

    return Response.json({
      notes: notes.map(n => ({
        id: n.id,
        content: n.content,
        createdAt: n.createdAt.toISOString(),
        authorName: n.user.displayName,
      })),
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to fetch notes", 500);
  }
}

const createNoteSchema = z.object({
  content: z.string().trim().min(1).max(10000),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireMobileUser(request);
    const { id } = await context.params;
    const issueId = parseInt(id, 10);
    const body = await parseJson(request, createNoteSchema);

    const issue = await prisma.issue.findFirst({
      where: { userId: user.id, redmineIssueId: issueId },
      select: { id: true },
    });
    if (!issue) return jsonError("Issue not found", 404);

    const note = await prisma.internalNote.create({
      data: { issueId: issue.id, userId: user.id, content: body.content },
      include: { user: { select: { displayName: true } } },
    });

    return Response.json({
      note: {
        id: note.id,
        content: note.content,
        createdAt: note.createdAt.toISOString(),
        authorName: note.user.displayName,
      },
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to create note", 500);
  }
}
