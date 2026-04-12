import { requireMobileUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError, parseJson } from "@/src/lib/http";
import { syncSingleIssue } from "@/src/lib/sync";
import { z } from "zod";

const editSchema = z.object({
  subject: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().optional(),
  priority: z.string().trim().optional(),
  dueDate: z.string().date().optional(),
  startDate: z.string().date().optional(),
  estimatedHours: z.number().positive().optional(),
});

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, client } = await requireMobileUser(request);
    const { id } = await context.params;
    const issueId = parseInt(id, 10);
    const body = await parseJson(request, editSchema);

    const issue = await prisma.issue.findFirst({
      where: { userId: user.id, redmineIssueId: issueId },
      select: { id: true },
    });
    if (!issue) return jsonError("Issue not found", 404);

    // Build Redmine update payload
    const redminePayload: Record<string, unknown> = {};
    if (body.subject !== undefined) redminePayload.subject = body.subject;
    if (body.description !== undefined) redminePayload.description = body.description;
    if (body.priority !== undefined) redminePayload.priority_name = body.priority;
    if (body.dueDate !== undefined) redminePayload.due_date = body.dueDate;
    if (body.startDate !== undefined) redminePayload.start_date = body.startDate;
    if (body.estimatedHours !== undefined) redminePayload.estimated_hours = body.estimatedHours;

    if (Object.keys(redminePayload).length === 0) {
      return jsonError("No fields to update", 400);
    }

    await client.request(`/issues/${issueId}.json`, {
      method: "PUT",
      body: JSON.stringify({ issue: redminePayload }),
    });

    await syncSingleIssue(user.id, client, issueId);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update issue";
    return jsonError(message, 500);
  }
}
