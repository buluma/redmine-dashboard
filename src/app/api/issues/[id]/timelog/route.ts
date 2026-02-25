import { prisma } from "@/src/lib/db";
import { requireRedmineClient } from "@/src/lib/auth";
import { jsonError, parseJson } from "@/src/lib/http";
import { timeLogSchema } from "@/src/lib/schemas";
import { syncSingleIssue } from "@/src/lib/sync";

function parseIssueId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid issue id");
  }
  return n;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const issueId = parseIssueId(id);
    const body = await parseJson(request, timeLogSchema);
    const { user, client } = await requireRedmineClient();

    const spentOn = body.spentOn ?? new Date().toISOString().slice(0, 10);
    const res = await client.addTimeEntry({
      issueId,
      hours: body.hours,
      activityId: body.activityId,
      comments: body.comment,
      spentOn,
    });

    const issue = await syncSingleIssue(user.id, client, issueId);
    const localIssue = await prisma.issue.findUnique({ where: { id: issue.id } });

    if (localIssue) {
      await prisma.timeEntry.create({
        data: {
          redmineTimeEntryId: res.time_entry.id,
          issueId: localIssue.id,
          userId: user.id,
          hours: body.hours,
          activityId: body.activityId,
          activityName: null,
          comments: body.comment,
          spentOn: new Date(spentOn),
        },
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to add timelog";
    const status = message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
