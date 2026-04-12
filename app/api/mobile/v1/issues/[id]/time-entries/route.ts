import { requireRedmineClient } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError, parseJson } from "@/src/lib/http";
import { syncSingleIssue } from "@/src/lib/sync";
import { z } from "zod";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const issueId = parseInt(id, 10);
    const { user } = await requireRedmineClient();

    const issue = await prisma.issue.findFirst({
      where: { userId: user.id, redmineIssueId: issueId },
      select: { id: true },
    });
    if (!issue) return jsonError("Issue not found", 404);

    const entries = await prisma.timeEntry.findMany({
      where: { issueId: issue.id },
      orderBy: { spentOn: "desc" },
      take: 50,
    });

    return Response.json({
      items: entries.map(e => ({
        id: e.id,
        redmineTimeEntryId: e.redmineTimeEntryId,
        hours: e.hours,
        activityId: e.activityId,
        activityName: e.activityName,
        authorName: e.authorName,
        comments: e.comments,
        spentOn: e.spentOn.toISOString().slice(0, 10),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch time entries";
    return jsonError(message, 500);
  }
}

const createTimeEntrySchema = z.object({
  hours: z.number().positive().max(24),
  activityId: z.number().int().positive(),
  comment: z.string().trim().max(255).optional(),
  spentOn: z.string().date().optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const issueId = parseInt(id, 10);
    const body = await parseJson(request, createTimeEntrySchema);
    const { user, client } = await requireRedmineClient();

    const issue = await prisma.issue.findFirst({
      where: { userId: user.id, redmineIssueId: issueId },
      select: { id: true },
    });
    if (!issue) return jsonError("Issue not found", 404);

    await client.addTimeEntry({
      issueId,
      hours: body.hours,
      activityId: body.activityId,
      comments: body.comment,
      spentOn: body.spentOn ?? new Date().toISOString().slice(0, 10),
    });

    await syncSingleIssue(user.id, client, issueId);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create time entry";
    return jsonError(message, 500);
  }
}
