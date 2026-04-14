import { requireMobileUser } from "@/src/lib/auth";
import { recomputeIssueActivityIndex, recordIssueActivityEvent } from "@/src/lib/activity-index";
import { prisma } from "@/src/lib/db";
import { jsonError, parseJson } from "@/src/lib/http";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";
import { getSlackNotificationService } from "@/src/lib/slack-notification-service";
import { z } from "zod";

function parseIssueId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid issue id");
  }
  return n;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertMobileApiEnabled();
    const { user } = await requireMobileUser(request);
    const { id } = await context.params;
    const issueId = parseIssueId(id);

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
      notes: notes.map((n) => ({
        id: n.id,
        content: n.content,
        createdAt: n.createdAt.toISOString(),
        authorName: n.user.displayName,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch notes";
    const status = message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}

const createNoteSchema = z.object({
  content: z.string().trim().min(1).max(10000),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertMobileApiEnabled();
    const { user } = await requireMobileUser(request);
    const { id } = await context.params;
    const issueId = parseIssueId(id);
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
    await recordIssueActivityEvent({
      issueId: issue.id,
      eventType: "internal_note",
      source: "local",
      sourceRemoteId: note.id,
      eventAt: note.updatedAt,
      summary: note.content,
    });
    await recomputeIssueActivityIndex(issue.id);

    // Send Slack notification for internal note
    void getSlackNotificationService().notifyInternalNoteAdded(
      issue.id,
      note.content,
      user.displayName
    );

    return Response.json({
      note: {
        id: note.id,
        content: note.content,
        createdAt: note.createdAt.toISOString(),
        authorName: note.user.displayName,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create note";
    const status = message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
