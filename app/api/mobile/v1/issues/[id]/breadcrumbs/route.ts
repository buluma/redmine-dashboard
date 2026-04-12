import { requireMobileUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireMobileUser(request);
    const { id } = await context.params;
    const issueId = parseInt(id, 10);

    if (isNaN(issueId)) return jsonError("Invalid issue ID", 400);

    const breadcrumbs: Array<{ id: number; subject: string }> = [];
    let currentId: number | null = issueId;
    const visited = new Set<number>();

    while (currentId !== null && !visited.has(currentId)) {
      visited.add(currentId);
      const found: { parentIssueId: number | null } | null = await prisma.issue.findFirst({
        where: { userId: user.id, redmineIssueId: currentId },
        select: { parentIssueId: true },
      }) as { parentIssueId: number | null } | null;

      if (!found || found.parentIssueId == null) break;
      currentId = found.parentIssueId;

      const parent: { redmineIssueId: number; subject: string } | null = await prisma.issue.findFirst({
        where: { userId: user.id, redmineIssueId: currentId },
        select: { redmineIssueId: true, subject: true },
      }) as { redmineIssueId: number; subject: string } | null;

      if (parent) {
        breadcrumbs.unshift({ id: parent.redmineIssueId, subject: parent.subject });
      }
    }

    return Response.json({ breadcrumbs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch breadcrumbs";
    return jsonError(message, 500);
  }
}
