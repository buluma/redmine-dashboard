import { requireRedmineClient } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError, parseJson } from "@/src/lib/http";
import { redmineMessageFromError, redmineStatusFromError } from "@/src/lib/redmine";
import { timeEntryUpdateSchema } from "@/src/lib/schemas";
import { syncSingleIssue } from "@/src/lib/sync";
import { trackFailure, trackSuccess } from "@/src/lib/telemetry";

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
  const startedAt = Date.now();
  try {
    const { id } = await context.params;
    const redmineTimeEntryId = parseTimeEntryId(id);
    const body = await parseJson(request, timeEntryUpdateSchema);
    const { user, client } = await requireRedmineClient();

    const entry = await assertTimeEntryOwnership(user.id, redmineTimeEntryId);

    await client.updateTimeEntry(redmineTimeEntryId, {
      ...(body.hours !== undefined ? { hours: body.hours } : {}),
      ...(body.activityId !== undefined ? { activityId: body.activityId } : {}),
      ...(body.comment !== undefined ? { comments: body.comment } : {}),
      ...(body.spentOn !== undefined ? { spentOn: body.spentOn } : {}),
    });

    await syncSingleIssue(user.id, client, entry.issue.redmineIssueId);

    trackSuccess({
      event: "time_entries.update.succeeded",
      data: { userId: user.id, redmineTimeEntryId },
      metricName: "time_entries_update_succeeded",
      durationMetricName: "time_entries_update_duration",
      durationMs: Date.now() - startedAt,
    });

    return Response.json({ ok: true });
  } catch (error) {
    const message = redmineMessageFromError(error, "Unable to update time entry");
    const status =
      message === "Unauthorized"
        ? 401
        : message === "Time entry not found"
          ? 404
          : (redmineStatusFromError(error) ?? 400);

    trackFailure({
      event: "time_entries.update.failed",
      error,
      data: { status },
      metricName: "time_entries_update_failed",
      durationMetricName: "time_entries_update_duration",
      durationMs: Date.now() - startedAt,
    });

    return jsonError(message, status);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  try {
    const { id } = await context.params;
    const redmineTimeEntryId = parseTimeEntryId(id);
    const { user, client } = await requireRedmineClient();

    const entry = await assertTimeEntryOwnership(user.id, redmineTimeEntryId);

    await client.deleteTimeEntry(redmineTimeEntryId);

    await prisma.timeEntry.deleteMany({
      where: {
        issueId: entry.issueId,
        redmineTimeEntryId,
      },
    });

    await syncSingleIssue(user.id, client, entry.issue.redmineIssueId);

    trackSuccess({
      event: "time_entries.delete.succeeded",
      data: { userId: user.id, redmineTimeEntryId },
      metricName: "time_entries_delete_succeeded",
      durationMetricName: "time_entries_delete_duration",
      durationMs: Date.now() - startedAt,
    });

    return Response.json({ ok: true });
  } catch (error) {
    const message = redmineMessageFromError(error, "Unable to delete time entry");
    const status =
      message === "Unauthorized"
        ? 401
        : message === "Time entry not found"
          ? 404
          : (redmineStatusFromError(error) ?? 400);

    trackFailure({
      event: "time_entries.delete.failed",
      error,
      data: { status },
      metricName: "time_entries_delete_failed",
      durationMetricName: "time_entries_delete_duration",
      durationMs: Date.now() - startedAt,
    });

    return jsonError(message, status);
  }
}
