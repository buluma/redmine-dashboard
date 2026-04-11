import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { toIssueView } from "@/src/lib/issue-shape";
import { buildBreadcrumbChain } from "@/src/lib/sync";
import { requireRedmineClient } from "@/src/lib/auth";

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

    // Build breadcrumbs from parent chain
    let breadcrumbs: Array<{ id: number; subject: string; tracker?: string }> = [];
    try {
      const { client } = await requireRedmineClient();
      breadcrumbs = await buildBreadcrumbChain(client, issueId);
    } catch {
      // If Redmine is unavailable, skip breadcrumbs
    }

    const issueView = toIssueView(issue);

    return Response.json({
      issue: { ...issueView, breadcrumbs },
      statuses,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load issue";
    const status = message === "Unauthorized" ? 401 : message === "Invalid issue id" ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
