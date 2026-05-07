import { requireMobileUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertMobileApiEnabled();
    const { user } = await requireMobileUser(request);
    const { id } = await context.params;
    const redmineIssueId = Number(id);
    if (!Number.isInteger(redmineIssueId) || redmineIssueId <= 0) {
      return jsonError("Invalid issue id", 400);
    }

    const issue = await prisma.issue.findFirst({
      where: { userId: user.id, redmineIssueId },
      select: { id: true },
    });
    if (!issue) return jsonError("Issue not found", 404);

    const journals = await prisma.issueJournal.findMany({
      where: { issueId: issue.id },
      orderBy: { createdOnRemote: "asc" },
    });

    return Response.json({
      journals: journals.map((j) => ({
        id: j.id,
        redmineJournalId: j.redmineJournalId,
        author: j.author,
        notes: j.notes,
        details: Array.isArray(j.detailsJson) ? j.detailsJson : [],
        createdOnRemote: j.createdOnRemote.toISOString(),
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to fetch journals";
    const status =
      message === "Mobile API is disabled"
        ? 404
        : message === "Unauthorized"
          ? 401
          : 400;
    return jsonError(message, status);
  }
}
