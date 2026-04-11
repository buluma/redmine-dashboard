import { requireRedmineClient } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError, parseJson } from "@/src/lib/http";
import { redmineMessageFromError, redmineStatusFromError } from "@/src/lib/redmine";
import { syncSingleIssue } from "@/src/lib/sync";
import { trackFailure, trackSuccess } from "@/src/lib/telemetry";
import { z } from "zod";

const assignSchema = z.object({
  userId: z.number().int().positive(),
});

function parseIssueId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid issue id");
  }
  return n;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  try {
    const { id } = await context.params;
    const issueId = parseIssueId(id);
    const body = await parseJson(request, assignSchema);
    const { user, client } = await requireRedmineClient();

    // Verify issue belongs to user
    const issue = await prisma.issue.findFirst({
      where: { userId: user.id, redmineIssueId: issueId },
      select: { id: true },
    });

    if (!issue) {
      return jsonError("Issue not found", 404);
    }

    // Update issue assignee in Redmine
    await client.updateIssue(issueId, {
      assignedToId: body.userId,
    });

    // Re-sync the issue to get updated data
    await syncSingleIssue(user.id, client, issueId);

    trackSuccess({
      event: "issues.assign.succeeded",
      data: { userId: user.id, issueId, assignedToId: body.userId },
      metricName: "issue_assign_succeeded",
      durationMetricName: "issue_assign_duration",
      durationMs: Date.now() - startedAt,
    });

    return Response.json({ ok: true });
  } catch (error) {
    const message = redmineMessageFromError(error, "Unable to assign issue");
    const status = message === "Unauthorized" ? 401 : (redmineStatusFromError(error) ?? 400);

    trackFailure({
      event: "issues.assign.failed",
      error,
      data: { status },
      metricName: "issue_assign_failed",
      durationMetricName: "issue_assign_duration",
      durationMs: Date.now() - startedAt,
    });

    return jsonError(message, status);
  }
}
