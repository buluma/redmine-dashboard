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
  a: { updatedOnRemote: Date; dueDate: Date | null; priority: string | null },
  b: { updatedOnRemote: Date; dueDate: Date | null; priority: string | null },
  sort: SortMode,
): number {
  if (sort === "updated_asc") {
    return a.updatedOnRemote.getTime() - b.updatedOnRemote.getTime();
  }
  if (sort === "priority") {
    const byPriority = comparePriorityAsc(a.priority, b.priority);
    if (byPriority !== 0) return byPriority;
    return b.updatedOnRemote.getTime() - a.updatedOnRemote.getTime();
  }
  if (sort === "due_date") {
    const byDueDate = compareNullableDateAsc(a.dueDate, b.dueDate);
    if (byDueDate !== 0) return byDueDate;
    return b.updatedOnRemote.getTime() - a.updatedOnRemote.getTime();
  }
  return b.updatedOnRemote.getTime() - a.updatedOnRemote.getTime();
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
          byRemote.set(issue.redmineIssueId, issue);
        }
        merged = Array.from(byRemote.values()).sort((a, b) => compareIssuesBySort(a, b, q.sort));
      }
      hybridTotal = Math.max(total, remote.total_count);
    }

    const favoritedIssueIds = new Set<number>(
      (
        await prisma.favorite.findMany({
          where: {
            userId: user.id,
            issueId: { in: merged.map((issue) => issue.redmineIssueId) },
          },
          select: { issueId: true },
        })
      ).map((item) => item.issueId),
    );

    return Response.json({
      items: merged.map((issue) => ({
        ...toIssueView(issue),
        isFavorited: favoritedIssueIds.has(issue.redmineIssueId),
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
