import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { toIssueView } from "@/src/lib/issue-shape";

function parseIssueId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid issue id");
  }
  return n;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const issueId = parseIssueId(id);

    const [issue, statuses] = await Promise.all([
      prisma.issue.findFirst({
        where: { userId: user.id, redmineIssueId: issueId },
        include: {
          journals: { orderBy: { createdOnRemote: "desc" }, take: 50 },
          githubLinks: { orderBy: { createdAt: "desc" }, take: 50 },
          timeEntries: { orderBy: { spentOn: "desc" }, take: 50 },
          attachments: { orderBy: { createdOnRemote: "desc" }, take: 50 },
          relations: { orderBy: { createdAt: "desc" }, take: 50 },
        },
      }),
      prisma.statusCatalog.findMany({ orderBy: { name: "asc" } }),
    ]);

    if (!issue) {
      return Response.json({ error: "Issue not found" }, { status: 404 });
    }

    return Response.json({
      issue: toIssueView(issue),
      statuses,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load issue";
    const status = message === "Unauthorized" ? 401 : message === "Invalid issue id" ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
