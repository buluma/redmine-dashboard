import { requireRedmineClient } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError, parseJson } from "@/src/lib/http";
import { syncSingleIssue } from "@/src/lib/sync";
import { z } from "zod";

const statusSchema = z.object({ statusId: z.number().int().positive() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const issueId = parseInt(id, 10);
    const body = await parseJson(request, statusSchema);
    const { user, client } = await requireRedmineClient();

    const issue = await prisma.issue.findFirst({
      where: { userId: user.id, redmineIssueId: issueId },
      select: { id: true },
    });
    if (!issue) return jsonError("Issue not found", 404);

    await client.updateIssueStatus(issueId, body.statusId);
    await syncSingleIssue(user.id, client, issueId);

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update status";
    return jsonError(message, 500);
  }
}
