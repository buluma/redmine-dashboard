import { requireMobileUser } from "@/src/lib/auth";
import { requireRedmineClientForUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError, parseJson } from "@/src/lib/http";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";
import { redmineMessageFromError, redmineStatusFromError } from "@/src/lib/redmine";
import { syncSingleIssue } from "@/src/lib/sync";
import { z } from "zod";

const editSchema = z.object({
  subject: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().optional(),
  priorityId: z.number().int().positive().optional(),
  trackerId: z.number().int().positive().optional(),
  dueDate: z.string().date().optional(),
  startDate: z.string().date().optional(),
  estimatedHours: z.number().positive().optional(),
  customFields: z.array(z.object({ id: z.number().int().positive(), value: z.string() })).optional(),
});

function parseIssueId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid issue id");
  }
  return n;
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertMobileApiEnabled();
    const { user } = await requireMobileUser(request);
    const { client } = await requireRedmineClientForUser(user.id);
    const { id } = await context.params;
    const issueId = parseIssueId(id);
    const body = await parseJson(request, editSchema);

    const issue = await prisma.issue.findFirst({
      where: { userId: user.id, redmineIssueId: issueId },
      select: { id: true },
    });
    if (!issue) return jsonError("Issue not found", 404);

    const updates = {
      subject: body.subject,
      description: body.description,
      priorityId: body.priorityId,
      trackerId: body.trackerId,
      dueDate: body.dueDate,
      startDate: body.startDate,
      estimatedHours: body.estimatedHours,
      customFields: body.customFields,
    };

    const hasUpdates = Object.values(updates).some((v) => v !== undefined);
    if (!hasUpdates) return jsonError("No fields to update", 400);

    await client.updateIssue(issueId, updates);
    await syncSingleIssue(user.id, client, issueId);
    return Response.json({ ok: true });
  } catch (error) {
    const message = redmineMessageFromError(error, "Unable to update issue");
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
