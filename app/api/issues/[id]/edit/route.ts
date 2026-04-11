import { requireRedmineClient } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError, parseJson } from "@/src/lib/http";
import { redmineMessageFromError, redmineStatusFromError } from "@/src/lib/redmine";
import { syncSingleIssue } from "@/src/lib/sync";
import { trackFailure, trackSuccess } from "@/src/lib/telemetry";
import { z } from "zod";

const editIssueSchema = z.object({
  subject: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().optional(),
  priority: z.string().trim().optional(),
  dueDate: z.string().date().optional(),
  startDate: z.string().date().optional(),
  estimatedHours: z.number().positive().optional(),
  customFields: z.array(z.object({
    id: z.number().int().positive(),
    value: z.string(),
  })).optional(),
});

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

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  try {
    const { id } = await context.params;
    const issueId = parseIssueId(id);
    const body = await parseJson(request, editIssueSchema);
    const { user, client } = await requireRedmineClient();

    // Verify issue belongs to user
    const issue = await prisma.issue.findFirst({
      where: { userId: user.id, redmineIssueId: issueId },
      select: { id: true },
    });

    if (!issue) {
      return jsonError("Issue not found", 404);
    }

    // Build the update payload for Redmine
    const redminePayload: Record<string, unknown> = {};

    if (body.subject !== undefined) {
      redminePayload.subject = body.subject;
    }
    if (body.description !== undefined) {
      redminePayload.description = body.description;
    }
    if (body.priority !== undefined) {
      redminePayload.priority_name = body.priority;
    }
    if (body.dueDate !== undefined) {
      redminePayload.due_date = body.dueDate;
    }
    if (body.startDate !== undefined) {
      redminePayload.start_date = body.startDate;
    }
    if (body.estimatedHours !== undefined) {
      redminePayload.estimated_hours = body.estimatedHours;
    }
    if (body.customFields && body.customFields.length > 0) {
      redminePayload.custom_fields = body.customFields.map((cf) => ({
        id: cf.id,
        value: cf.value,
      }));
    }

    if (Object.keys(redminePayload).length === 0) {
      return jsonError("No fields to update", 400);
    }

    // Update in Redmine via direct PUT
    await client.request(`/issues/${issueId}.json`, {
      method: "PUT",
      body: JSON.stringify({ issue: redminePayload }),
    });

    // Re-sync the issue to get updated data
    await syncSingleIssue(user.id, client, issueId);

    trackSuccess({
      event: "issues.edit.succeeded",
      data: {
        userId: user.id,
        issueId,
        fieldsUpdated: Object.keys(redminePayload),
      },
      metricName: "issue_edit_succeeded",
      durationMetricName: "issue_edit_duration",
      durationMs: Date.now() - startedAt,
    });

    return Response.json({ ok: true });
  } catch (error) {
    const message = redmineMessageFromError(error, "Unable to update issue");
    const status = message === "Unauthorized" ? 401 : (redmineStatusFromError(error) ?? 400);

    trackFailure({
      event: "issues.edit.failed",
      error,
      data: { status },
      metricName: "issue_edit_failed",
      metricTags: { status_class: statusClass(status) },
      durationMetricName: "issue_edit_duration",
      durationMs: Date.now() - startedAt,
    });

    return jsonError(message, status);
  }
}
