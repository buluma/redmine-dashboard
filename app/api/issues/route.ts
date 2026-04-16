import { Prisma } from "@prisma/client";
import { requireCurrentUser, requireRedmineClientForUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { toIssueView } from "@/src/lib/issue-shape";
import { issueQuerySchema } from "@/src/lib/schemas";
import { syncSingleIssue } from "@/src/lib/sync";

type SortMode = "updated_desc" | "updated_asc" | "priority" | "due_date";
const RELATION_PREVIEW_LIMIT = 5;

function isDbStatementTimeout(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("statement timeout") || message.includes("code: \"57014\"") || message.includes("P2024");
}

function compareNullableDateAsc(a: Date | null, b: Date | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.getTime() - b.getTime();
}

function comparePriorityAsc(a: string | null, b: string | null): number {
  return (a ?? "").localeCompare(b ?? "", undefined, { sensitivity: "base" });
}

function compareIssuesBySort(
  a: { lastActivityAt: Date | null; updatedOnRemote: Date; dueDate: Date | null; priority: string | null },
  b: { lastActivityAt: Date | null; updatedOnRemote: Date; dueDate: Date | null; priority: string | null },
  sort: SortMode,
): number {
  const leftTs = (a.lastActivityAt ?? a.updatedOnRemote).getTime();
  const rightTs = (b.lastActivityAt ?? b.updatedOnRemote).getTime();
  if (sort === "updated_asc") {
    return leftTs - rightTs;
  }
  if (sort === "priority") {
    const byPriority = comparePriorityAsc(a.priority, b.priority);
    if (byPriority !== 0) return byPriority;
    return rightTs - leftTs;
  }
  if (sort === "due_date") {
    const byDueDate = compareNullableDateAsc(a.dueDate, b.dueDate);
    if (byDueDate !== 0) return byDueDate;
    return rightTs - leftTs;
  }
  return rightTs - leftTs;
}

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
      ...(q.source === "redmine" ? { source: "redmine" } : {}),
      ...(q.source === "local" ? { source: "local" } : {}),
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
            take: RELATION_PREVIEW_LIMIT,
          },
          githubLinks: {
            orderBy: { createdAt: "desc" },
            take: RELATION_PREVIEW_LIMIT,
          },
          timeEntries: {
            orderBy: { spentOn: "desc" },
            take: RELATION_PREVIEW_LIMIT,
          },
          attachments: {
            orderBy: { createdOnRemote: "desc" },
            take: RELATION_PREVIEW_LIMIT,
          },
          relations: {
            orderBy: { createdAt: "desc" },
            take: RELATION_PREVIEW_LIMIT,
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
    let hybridTotal = total;
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
            journals: { orderBy: { createdOnRemote: "desc" }, take: RELATION_PREVIEW_LIMIT },
            githubLinks: { orderBy: { createdAt: "desc" }, take: RELATION_PREVIEW_LIMIT },
            timeEntries: { orderBy: { spentOn: "desc" }, take: RELATION_PREVIEW_LIMIT },
            attachments: { orderBy: { createdOnRemote: "desc" }, take: RELATION_PREVIEW_LIMIT },
            relations: { orderBy: { createdAt: "desc" }, take: RELATION_PREVIEW_LIMIT },
          },
        });
        const byRemote = new Map<number, (typeof hydrated)[number]>();
        for (const issue of [...issues, ...hydrated]) {
          if (issue.redmineIssueId) {
            byRemote.set(issue.redmineIssueId, issue);
          }
        }
        merged = Array.from(byRemote.values()).sort((a, b) => compareIssuesBySort(a, b, q.sort));
      }
      // remote.total_count is the full result count across pages, while local `total` covers cached matches.
      // Use the larger value to avoid under-reporting pagination totals in hybrid mode.
      hybridTotal = Math.max(total, remote.total_count);
    }

    return Response.json({
      items: merged.map((issue) => toIssueView(issue)),
      total: q.searchMode === "local" ? total : hybridTotal,
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
    if (isDbStatementTimeout(error)) {
      return Response.json({
        items: [],
        total: 0,
        page: 1,
        pageSize: 25,
        filters: { statuses: [], priorities: [] },
        source: "local_cache",
        degraded: true,
      });
    }
    const status = error instanceof Error && error.message === "Unauthorized" ? 401 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Server error" }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { client } = await requireRedmineClientForUser(user.id);
    const body = await request.json();

    const { subject, description, projectId, priorityId, assignedToId, dueDate, trackerId } = body;

    if (!subject || !projectId) {
      return Response.json({ error: "Subject and Project are required" }, { status: 400 });
    }

    // Create in Redmine
    const created = await client.createIssue({
      subject,
      description,
      projectId,
      priorityId,
      assignedToId,
      dueDate,
    });

    const remote = { issue: { id: created.id } };

    // Sync back to local DB
    const issue = await syncSingleIssue(user.id, client, remote.issue.id, {
      pruneAttachments: true,
      pruneRelations: true,
      pruneTimeEntries: false,
    });

    if (!issue) {
      return Response.json({ error: "Failed to sync issue after creation" }, { status: 500 });
    }

    return Response.json({
      issue: toIssueView(issue),
    });
  } catch (error) {
    console.error("Issue creation failed:", error);
    const status = error instanceof Error && error.message === "Unauthorized" ? 401 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Server error" }, { status });
  }
}
