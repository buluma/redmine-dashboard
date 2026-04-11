import { requireMobileUser, requireRedmineClientForUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";
import { redmineMessageFromError, redmineStatusFromError } from "@/src/lib/redmine";
import { syncSingleIssue } from "@/src/lib/sync";

function parseIssueId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid issue id");
  }
  return n;
}

function parseRelationId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid relation id");
  }
  return n;
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; relationId: string }> }) {
  try {
    assertMobileApiEnabled();
    const { id, relationId } = await context.params;
    const issueId = parseIssueId(id);
    const parsedRelationId = parseRelationId(relationId);
    const { user } = await requireMobileUser(_request);
    const { client } = await requireRedmineClientForUser(user.id);

    const issue = await prisma.issue.findFirst({
      where: { userId: user.id, redmineIssueId: issueId },
      select: { id: true },
    });
    if (!issue) {
      return jsonError("Issue not found", 404);
    }

    const relation = await prisma.issueRelation.findFirst({
      where: { issueId: issue.id, redmineRelationId: parsedRelationId },
    });
    if (!relation) {
      return jsonError("Relation not found", 404);
    }

    await client.deleteIssueRelation(parsedRelationId);
    await prisma.issueRelation.delete({ where: { id: relation.id } });

    await syncSingleIssue(user.id, client, issueId, {
      pruneAttachments: true,
      pruneRelations: true,
      pruneTimeEntries: false,
    });

    return Response.json({ ok: true });
  } catch (error) {
    const message = redmineMessageFromError(error, "Unable to delete relation");
    const status =
      message === "Mobile API is disabled"
        ? 404
        : message === "Unauthorized"
          ? 401
          : message === "Issue not found" || message === "Relation not found"
            ? 404
            : (redmineStatusFromError(error) ?? 400);
    return jsonError(message, status);
  }
}
