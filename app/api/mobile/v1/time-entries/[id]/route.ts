import { requireMobileUser, requireRedmineClientForUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError, parseJson } from "@/src/lib/http";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";
import { redmineMessageFromError, redmineStatusFromError } from "@/src/lib/redmine";
import { timeEntryUpdateSchema } from "@/src/lib/schemas";
import { syncSingleIssue } from "@/src/lib/sync";

function parseTimeEntryId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid time entry id");
  }
  return n;
}

async function assertTimeEntryOwnership(userId: string, redmineTimeEntryId: number) {
  const entry = await prisma.timeEntry.findFirst({
    where: {
      redmineTimeEntryId,
      issue: { userId },
    },
    include: { issue: { select: { redmineIssueId: true } } },
  });

  if (!entry) {
    throw new Error("Time entry not found");
  }

  return entry;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertMobileApiEnabled();
    const { id } = await context.params;
    const redmineTimeEntryId = parseTimeEntryId(id);
    const body = await parseJson(request, timeEntryUpdateSchema);
    const { user } = await requireMobileUser(request);
    const { client } = await requireRedmineClientForUser(user.id);

    const entry = await assertTimeEntryOwnership(user.id, redmineTimeEntryId);

    await client.updateTimeEntry(redmineTimeEntryId, {
      ...(body.hours !== undefined ? { hours: body.hours } : {}),
      ...(body.activityId !== undefined ? { activityId: body.activityId } : {}),
      ...(body.comment !== undefined ? { comments: body.comment } : {}),
      ...(body.spentOn !== undefined ? { spentOn: body.spentOn } : {}),
    });

    await syncSingleIssue(user.id, client, entry.issue.redmineIssueId);

    return Response.json({ ok: true });
  } catch (error) {
    const message = redmineMessageFromError(error, "Unable to update time entry");
    const status =
      message === "Mobile API is disabled"
        ? 404
        : message === "Unauthorized"
          ? 401
          : message === "Time entry not found"
            ? 404
            : (redmineStatusFromError(error) ?? 400);
    return jsonError(message, status);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertMobileApiEnabled();
    const { id } = await context.params;
    const redmineTimeEntryId = parseTimeEntryId(id);
    const { user } = await requireMobileUser(request);
    const { client } = await requireRedmineClientForUser(user.id);

    const entry = await assertTimeEntryOwnership(user.id, redmineTimeEntryId);

    await client.deleteTimeEntry(redmineTimeEntryId);

    await prisma.timeEntry.deleteMany({
      where: {
        issueId: entry.issueId,
        redmineTimeEntryId,
      },
    });

    await syncSingleIssue(user.id, client, entry.issue.redmineIssueId);

    return Response.json({ ok: true });
  } catch (error) {
    const message = redmineMessageFromError(error, "Unable to delete time entry");
    const status =
      message === "Mobile API is disabled"
        ? 404
        : message === "Unauthorized"
          ? 401
          : message === "Time entry not found"
            ? 404
            : (redmineStatusFromError(error) ?? 400);
    return jsonError(message, status);
  }
}
