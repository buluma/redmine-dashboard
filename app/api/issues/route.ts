import { Prisma } from "@prisma/client";
import { requireCurrentUser, requireRedmineClientForUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { toIssueView } from "@/src/lib/issue-shape";
import { issueQuerySchema } from "@/src/lib/schemas";
import { syncSingleIssue } from "@/src/lib/sync";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const parsed = issueQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));

    if (!parsed.success) {
      return Response.json({ error: "Invalid query" }, { status: 400 });
    }

    const q = parsed.data;

    const baseWhere: Prisma.IssueWhereInput = {
      userId: user.id,
      ...(q.status ? { statusName: q.status } : {}),
      ...(q.priority ? { priority: q.priority } : {}),
    };
    const localSearchFilter: Prisma.IssueWhereInput = q.search
      ? {
          OR: [
            { subject: { contains: q.search } },
            { description: { contains: q.search } },
            { assignedToName: { contains: q.search } },
          ],
        }
      : {};
    const where: Prisma.IssueWhereInput = { ...baseWhere, ...localSearchFilter };

    const orderBy: Prisma.IssueOrderByWithRelationInput[] =
      q.sort === "updated_asc"
        ? [{ updatedOnRemote: "asc" }]
        : q.sort === "priority"
          ? [{ priority: "asc" }, { updatedOnRemote: "desc" }]
          : q.sort === "due_date"
            ? [{ dueDate: "asc" }, { updatedOnRemote: "desc" }]
            : [{ updatedOnRemote: "desc" }];

    const [total, issues, statusCatalog, priorities, localPriorities] = await Promise.all([
      prisma.issue.count({ where }),
      prisma.issue.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          journals: {
            orderBy: { createdOnRemote: "desc" },
            take: 20,
          },
          githubLinks: {
            orderBy: { createdAt: "desc" },
            take: 20,
          },
          timeEntries: {
            orderBy: { spentOn: "desc" },
            take: 20,
          },
          attachments: {
            orderBy: { createdOnRemote: "desc" },
            take: 20,
          },
          relations: {
            orderBy: { createdAt: "desc" },
            take: 20,
          },
        },
      }),
      prisma.statusCatalog.findMany({ orderBy: { name: "asc" } }),
      prisma.enumerationCatalog.findMany({
        where: { kind: "issue_priority", isActive: true },
        orderBy: [{ position: "asc" }, { name: "asc" }],
      }),
      prisma.issue.findMany({
        where: { userId: user.id },
        distinct: ["priority"],
        select: { priority: true },
      }),
    ]);

    let merged = issues;
    if (q.search && q.searchMode !== "local") {
      const { client } = await requireRedmineClientForUser(user.id);
      const remote = await client.search({
        q: q.search,
        scope: q.scope,
        openOnly: q.openOnly,
        offset: (q.page - 1) * q.pageSize,
        limit: q.pageSize,
      });
      const remoteIssueIds = remote.results
        .filter((r) => (r.type ?? "").toLowerCase() === "issue")
        .map((r) => r.id);

      for (const remoteId of remoteIssueIds) {
        const exists = merged.some((i) => i.redmineIssueId === remoteId);
        if (!exists) {
          await syncSingleIssue(user.id, client, remoteId, {
            pruneAttachments: true,
            pruneRelations: true,
            pruneTimeEntries: false,
          });
        }
      }

      if (remoteIssueIds.length > 0) {
        const hydrated = await prisma.issue.findMany({
          where: {
            ...baseWhere,
            redmineIssueId: { in: remoteIssueIds },
          },
          include: {
            journals: { orderBy: { createdOnRemote: "desc" }, take: 20 },
            githubLinks: { orderBy: { createdAt: "desc" }, take: 20 },
            timeEntries: { orderBy: { spentOn: "desc" }, take: 20 },
            attachments: { orderBy: { createdOnRemote: "desc" }, take: 20 },
            relations: { orderBy: { createdAt: "desc" }, take: 20 },
          },
        });
        const byRemote = new Map<number, (typeof hydrated)[number]>();
        for (const issue of [...issues, ...hydrated]) {
          byRemote.set(issue.redmineIssueId, issue);
        }
        merged = Array.from(byRemote.values()).sort(
          (a, b) => b.updatedOnRemote.getTime() - a.updatedOnRemote.getTime(),
        );
      }
    }

    return Response.json({
      items: merged.map((issue) => toIssueView(issue)),
      total: q.searchMode === "local" ? total : merged.length,
      page: q.page,
      pageSize: q.pageSize,
      filters: {
        statuses: statusCatalog,
        priorities:
          priorities.length > 0
            ? priorities.map((p) => p.name)
            : localPriorities.map((p) => p.priority).filter((v): v is string => Boolean(v)),
      },
      source: q.searchMode === "local" ? "local_cache" : "hybrid",
    });
  } catch (error) {
    const status = error instanceof Error && error.message === "Unauthorized" ? 401 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Server error" }, { status });
  }
}
