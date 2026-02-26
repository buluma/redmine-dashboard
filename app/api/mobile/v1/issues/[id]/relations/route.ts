import { requireMobileUser, requireRedmineClientForUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError, parseJson } from "@/src/lib/http";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";
import { relationCreateSchema } from "@/src/lib/schemas";
import { syncSingleIssue } from "@/src/lib/sync";

function parseIssueId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid issue id");
  }
  return n;
}

function statusFromRedmineError(message: string): number | null {
  const match = message.match(/Redmine request failed \((\d{3})\):/);
  if (!match) return null;
  return Number(match[1]);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertMobileApiEnabled();
    const { id } = await context.params;
    const issueId = parseIssueId(id);
    const body = await parseJson(request, relationCreateSchema);
    if (issueId === body.issueToId) {
      return jsonError("Cannot relate an issue to itself", 400);
    }

    const { user } = await requireMobileUser(request);
    const { client } = await requireRedmineClientForUser(user.id);

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

    return Response.json({ ok: true, items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create relation";
    const status =
      message === "Mobile API is disabled"
        ? 404
        : message === "Unauthorized"
          ? 401
          : message === "Issue not found"
            ? 404
            : (statusFromRedmineError(message) ?? 400);
    return jsonError(message, status);
  }
}
