import { requireRedmineClient } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError, parseJson } from "@/src/lib/http";
import { syncSingleIssue } from "@/src/lib/sync";
import { z } from "zod";

const assignSchema = z.object({ userId: z.number().int().positive() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const issueId = parseInt(id, 10);
    const body = await parseJson(request, assignSchema);
    const { user, client } = await requireRedmineClient();

    const issue = await prisma.issue.findFirst({
      where: { userId: user.id, redmineIssueId: issueId },
      select: { id: true },
    });
    if (!issue) return jsonError("Issue not found", 404);

    await client.updateIssue(issueId, { assignedToId: body.userId });
    await syncSingleIssue(user.id, client, issueId);

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to assign issue";
    return jsonError(message, 500);
  }
}
