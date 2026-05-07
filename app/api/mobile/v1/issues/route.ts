import { Prisma } from "@prisma/client";
import { requireMobileUser, requireRedmineClientForUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { toIssueView } from "@/src/lib/issue-shape";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";
import { issueQuerySchema } from "@/src/lib/schemas";
import { syncSingleIssue } from "@/src/lib/sync";

type SortMode = "updated_desc" | "updated_asc" | "priority" | "due_date";

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
    assertMobileApiEnabled();
    const { user } = await requireMobileUser(request);
    const { searchParams } = new URL(request.url);
    const parsed = issueQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parsed.success) {
      return jsonError("Invalid query", 400);
    }

    const q = parsed.data;

    let favoritedFilter: Prisma.IssueWhereInput = {};
    if (q.favoritedOnly) {
      const favs = await prisma.favorite.findMany({
        where: { userId: user.id },
        select: { issueId: true },
      });
      favoritedFilter = { redmineIssueId: { in: favs.map((f) => f.issueId) } };
    }

    const baseWhere: Prisma.IssueWhereInput = {
      userId: user.id,
      ...favoritedFilter,
      ...(q.status ? { statusName: q.status } : {}),
      ...(q.priority ? { priority: q.priority } : {}),
      ...(q.project ? { projectName: q.project } : {}),
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

    const [total, items] = await Promise.all([
      prisma.issue.count({ where }),
      prisma.issue.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          journals: {
            orderBy: { createdOnRemote: "desc" },
            take: 10,
          },
          timeEntries: {
            orderBy: { spentOn: "desc" },
            take: 10,
          },
          githubLinks: {
            orderBy: { createdAt: "desc" },
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
    ]);

    let merged = items;
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
        if (!merged.some((i) => i.redmineIssueId === remoteId)) {
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
            journals: { orderBy: { createdOnRemote: "desc" }, take: 10 },
            timeEntries: { orderBy: { spentOn: "desc" }, take: 10 },
            githubLinks: { orderBy: { createdAt: "desc" }, take: 20 },
            attachments: { orderBy: { createdOnRemote: "desc" }, take: 20 },
            relations: { orderBy: { createdAt: "desc" }, take: 20 },
          },
        });

        const byRemote = new Map<number, (typeof hydrated)[number]>();
        for (const issue of [...items, ...hydrated]) {
          if (issue.redmineIssueId) {
            byRemote.set(issue.redmineIssueId, issue);
          }
        }
        merged = Array.from(byRemote.values()).sort((a, b) => compareIssuesBySort(a, b, q.sort));
      }
      hybridTotal = Math.max(total, remote.total_count);
    }

    let favoritedIssueIds = new Set<number>();
    if (merged.length > 0) {
      try {
        const favorites = await prisma.favorite.findMany({
          where: {
            userId: user.id,
            issueId: { in: merged.map((issue) => issue.redmineIssueId).filter((id): id is number => id !== null) },
          },
          select: { issueId: true },
        });
        favoritedIssueIds = new Set<number>(favorites.map((item) => item.issueId));
      } catch {
        // Keep listing issues even if favorite lookup fails.
      }
    }

    return Response.json({
      items: merged.map((issue) => ({
        ...toIssueView(issue),
        isFavorited: issue.redmineIssueId ? favoritedIssueIds.has(issue.redmineIssueId) : false,
      })),
      total: q.searchMode === "local" ? total : hybridTotal,
      page: q.page,
      pageSize: q.pageSize,
      source: q.searchMode === "local" ? "local_cache" : "hybrid",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch mobile issues";
    const status = message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
export async function POST(request: Request) {
  try {
    assertMobileApiEnabled();
    const { user } = await requireMobileUser(request);
    const { client } = await requireRedmineClientForUser(user.id);
    const body = await request.json();

    const { subject, description, projectId, priorityId, assignedToId, dueDate } = body;

    if (!subject || !projectId) {
      return jsonError("Subject and Project are required", 400);
    }

    // Create in Redmine
    const created = await client.createIssue({
      subject,
      description,
      projectId,
      priorityId: priorityId ? Number(priorityId) : undefined,
      assignedToId: assignedToId ? Number(assignedToId) : undefined,
      dueDate,
    });

    // Sync back to local DB
    const issue = await syncSingleIssue(user.id, client, created.id, {
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
    const message = error instanceof Error ? error.message : "Unable to create mobile issue";
    const status = message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
