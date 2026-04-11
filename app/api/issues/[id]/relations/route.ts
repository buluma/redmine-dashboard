import { requireRedmineClient } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError, parseJson } from "@/src/lib/http";
import { redmineMessageFromError, redmineStatusFromError } from "@/src/lib/redmine";
import { relationCreateSchema } from "@/src/lib/schemas";
import { syncSingleIssue } from "@/src/lib/sync";
import { trackFailure, trackSuccess } from "@/src/lib/telemetry";

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
    const body = await parseJson(request, relationCreateSchema);
    if (issueId === body.issueToId) {
      return jsonError("Cannot relate an issue to itself", 400);
    }

    const { user, client } = await requireRedmineClient();
    const issue = await prisma.issue.findFirst({
      where: { userId: user.id, redmineIssueId: issueId },
      select: { id: true },
    });
    if (!issue) {
      return jsonError("Issue not found", 404);
    }

    await client.createIssueRelation(issueId, {
      issue_to_id: body.issueToId,
      relation_type: body.relationType,
      ...(body.delay !== undefined ? { delay: body.delay } : {}),
    });

    await syncSingleIssue(user.id, client, issueId, {
      pruneAttachments: true,
      pruneRelations: true,
      pruneTimeEntries: false,
    });

    const items = await prisma.issueRelation.findMany({
      where: { issueId: issue.id },
      orderBy: { createdAt: "desc" },
    });

    trackSuccess({
      event: "issue.relation.create.succeeded",
      data: { userId: user.id, issueId, relationType: body.relationType },
      metricName: "issue_relation_create_succeeded",
      durationMetricName: "issue_relation_create_duration",
      durationMs: Date.now() - startedAt,
    });

    return Response.json({ ok: true, items });
  } catch (error) {
    const message = redmineMessageFromError(error, "Unable to create relation");
    const status =
      message === "Unauthorized"
        ? 401
        : message === "Issue not found"
          ? 404
          : (redmineStatusFromError(error) ?? 400);
    trackFailure({
      event: "issue.relation.create.failed",
      error,
      data: { status },
      metricName: "issue_relation_create_failed",
      durationMetricName: "issue_relation_create_duration",
      durationMs: Date.now() - startedAt,
    });
    return jsonError(message, status);
  }
}
