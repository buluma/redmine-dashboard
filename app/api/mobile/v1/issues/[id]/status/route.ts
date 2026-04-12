import { requireMobileUser, requireRedmineClientForUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError, parseJson } from "@/src/lib/http";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";
import { redmineMessageFromError, redmineStatusFromError } from "@/src/lib/redmine";
import { syncSingleIssue } from "@/src/lib/sync";
import { z } from "zod";

const statusSchema = z.object({ statusId: z.number().int().positive() });

function parseIssueId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid issue id");
  }
  return n;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertMobileApiEnabled();
    const { id } = await context.params;
    const issueId = parseIssueId(id);
    const body = await parseJson(request, statusSchema);
    const { user } = await requireMobileUser(request);
    const { client } = await requireRedmineClientForUser(user.id);

    const issue = await prisma.issue.findFirst({
      where: { userId: user.id, redmineIssueId: issueId },
      select: { id: true },
    });
    if (!issue) return jsonError("Issue not found", 404);

    await client.updateIssueStatus(issueId, body.statusId);
    await syncSingleIssue(user.id, client, issueId);

    return Response.json({ ok: true });
  } catch (error) {
    const message = redmineMessageFromError(error, "Unable to update status");
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
