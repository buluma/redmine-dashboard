import { requireRedmineClient } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { redmineMessageFromError, redmineStatusFromError } from "@/src/lib/redmine";
import { timeEntryQuerySchema } from "@/src/lib/schemas";
import { trackFailure, trackSuccess } from "@/src/lib/telemetry";

export async function GET(request: Request) {
  const startedAt = Date.now();
  try {
    const { user, client } = await requireRedmineClient();
    const { searchParams } = new URL(request.url);
    const parsed = timeEntryQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parsed.success) {
      return jsonError("Invalid query", 400);
    }

    const query = parsed.data;
    if (query.issueId) {
      const ownedIssue = await prisma.issue.findFirst({
        where: { userId: user.id, redmineIssueId: query.issueId },
        select: { id: true },
      });
      if (!ownedIssue) {
        return jsonError("Issue not found", 404);
      }
    }

    const entries = await client.listTimeEntries({
      issueId: query.issueId,
      from: query.from,
      to: query.to,
      userId: query.user,
      offset: (query.page - 1) * query.pageSize,
      limit: query.pageSize,
    });

    trackSuccess({
      event: "time_entries.list.succeeded",
      data: { userId: user.id, issueId: query.issueId ?? null, count: entries.length },
      metricName: "time_entries_list_succeeded",
      durationMetricName: "time_entries_list_duration",
      durationMs: Date.now() - startedAt,
    });

    return Response.json({
      items: entries,
      page: query.page,
      pageSize: query.pageSize,
    });
  } catch (error) {
    const message = redmineMessageFromError(error, "Unable to list time entries");
    const status = message === "Unauthorized" ? 401 : (redmineStatusFromError(error) ?? 400);
    trackFailure({
      event: "time_entries.list.failed",
      error,
      data: { status },
      metricName: "time_entries_list_failed",
      durationMetricName: "time_entries_list_duration",
      durationMs: Date.now() - startedAt,
    });
    return jsonError(message, status);
  }
}
