import { requireRedmineClient } from "@/src/lib/auth";
import { jsonError } from "@/src/lib/http";
import { redmineMessageFromError, redmineStatusFromError } from "@/src/lib/redmine";
import { syncSingleIssue } from "@/src/lib/sync";
import { trackFailure, trackSuccess } from "@/src/lib/telemetry";

function parseIssueId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid issue id");
  }
  return n;
}

function statusClass(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  try {
    const { id } = await context.params;
    const issueId = parseIssueId(id);
    const { user, client } = await requireRedmineClient();

    await syncSingleIssue(user.id, client, issueId, {
      pruneAttachments: true,
      pruneRelations: true,
      pruneTimeEntries: true,
    });

    trackSuccess({
      event: "issue.refresh.succeeded",
      data: { userId: user.id, issueId },
      metricName: "issue_refresh_succeeded",
      durationMetricName: "issue_refresh_duration",
      durationMs: Date.now() - startedAt,
    });

    return Response.json({ ok: true });
  } catch (error) {
    const message = redmineMessageFromError(error, "Unable to refresh issue");
    const status = message === "Unauthorized" ? 401 : (redmineStatusFromError(error) ?? 400);

    trackFailure({
      event: "issue.refresh.failed",
      error,
      data: { status },
      metricName: "issue_refresh_failed",
      metricTags: { status_class: statusClass(status) },
      durationMetricName: "issue_refresh_duration",
      durationMs: Date.now() - startedAt,
    });

    return jsonError(message, status);
  }
}
