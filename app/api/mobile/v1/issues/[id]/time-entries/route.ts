import { requireMobileUser, requireRedmineClientForUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError, parseJson } from "@/src/lib/http";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";
import { redmineMessageFromError, redmineStatusFromError } from "@/src/lib/redmine";
import { syncSingleIssue } from "@/src/lib/sync";
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
    const { id } = await context.params;
    const issueId = parseIssueId(id);
    const { user } = await requireMobileUser(request);

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
      items: entries.map((e) => ({
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
    const message = redmineMessageFromError(error, "Unable to fetch time entries");
    const status =
      message === "Mobile API is disabled"
        ? 404
        : message === "Unauthorized"
          ? 401
          : message === "Issue not found"
            ? 404
            : (redmineStatusFromError(error) ?? 400);
    return jsonError(message, status);
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
    assertMobileApiEnabled();
    const { id } = await context.params;
    const issueId = parseIssueId(id);
    const body = await parseJson(request, createTimeEntrySchema);
    const { user } = await requireMobileUser(request);
    const { client } = await requireRedmineClientForUser(user.id);

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
    const message = redmineMessageFromError(error, "Unable to create time entry");
    const status =
      message === "Mobile API is disabled"
        ? 404
        : message === "Unauthorized"
          ? 401
          : message === "Issue not found"
            ? 404
            : (redmineStatusFromError(error) ?? 400);
    return jsonError(message, status);
  }
}
