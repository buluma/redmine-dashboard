import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { toIssueView } from "@/src/lib/issue-shape";
import { buildBreadcrumbChain, syncSingleIssue } from "@/src/lib/sync";
import { requireRedmineClient } from "@/src/lib/auth";

const ISSUE_DETAIL_CACHE_TTL_MS = 90_000;
const ISSUE_DETAIL_CACHE_LIMIT = 1000;
type IssueDetailPayload = {
  issue: unknown;
  statuses: unknown;
};
const issueDetailCache = new Map<string, { expiresAt: number; payload: IssueDetailPayload }>();

function pruneIssueDetailCache(nowMs: number) {
  for (const [key, entry] of issueDetailCache.entries()) {
    if (entry.expiresAt <= nowMs) {
      issueDetailCache.delete(key);
    }
  }
  if (issueDetailCache.size <= ISSUE_DETAIL_CACHE_LIMIT) {
    return;
  }
  const overflow = issueDetailCache.size - ISSUE_DETAIL_CACHE_LIMIT;
  const keys = issueDetailCache.keys();
  for (let i = 0; i < overflow; i += 1) {
    const next = keys.next();
    if (next.done) break;
    issueDetailCache.delete(next.value);
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const cacheKey = `${user.id}:${id}`;
    const nowMs = Date.now();
    const forceFresh = new URL(request.url).searchParams.get("fresh") === "1";

    const cached = issueDetailCache.get(cacheKey);
    if (!forceFresh && cached && cached.expiresAt > nowMs) {
      return Response.json(cached.payload);
    }

    // Check if id is a Prisma string ID (for local issues) or a numeric Redmine ID
    const isNumericId = /^\d+$/.test(id);

    const readIssue = async () => {
      if (!isNumericId) {
        // String ID → local issue lookup
        return prisma.issue.findFirst({
          where: { userId: user.id, id },
          include: {
            journals: { orderBy: { createdOnRemote: "desc" }, take: 50 },
            githubLinks: { orderBy: { createdAt: "desc" }, take: 50 },
            timeEntries: { orderBy: { spentOn: "desc" }, take: 50 },
            attachments: { orderBy: { createdOnRemote: "desc" }, take: 50 },
            relations: { orderBy: { createdAt: "desc" }, take: 50 },
            aiSummaries: { orderBy: { generatedAt: "desc" }, take: 10 },
          },
        });
      }
      // Numeric ID → redmine issue lookup
      const issueId = Number(id);
      return prisma.issue.findFirst({
        where: { userId: user.id, redmineIssueId: issueId },
        include: {
          journals: { orderBy: { createdOnRemote: "desc" }, take: 50 },
          githubLinks: { orderBy: { createdAt: "desc" }, take: 50 },
          timeEntries: { orderBy: { spentOn: "desc" }, take: 50 },
          attachments: { orderBy: { createdOnRemote: "desc" }, take: 50 },
          relations: { orderBy: { createdAt: "desc" }, take: 50 },
          aiSummaries: { orderBy: { generatedAt: "desc" }, take: 10 },
        },
      });
    };

    const [initialIssue, statuses] = await Promise.all([
      readIssue(),
      prisma.statusCatalog.findMany({ orderBy: { name: "asc" } }),
    ]);

    let issue = initialIssue;
    if (!issue && isNumericId) {
      // Only try to sync from Redmine for numeric IDs
      try {
        const { client } = await requireRedmineClient();
        const issueId = Number(id);
        await syncSingleIssue(user.id, client, issueId, {
          pruneAttachments: false,
          pruneRelations: false,
          pruneTimeEntries: false,
        });
        issue = await readIssue();
      } catch {
        // If direct hydration fails, keep default 404 behavior below.
      }
    }

    if (!issue) {
      return Response.json({ error: "Issue not found" }, { status: 404 });
    }

    // Build breadcrumbs from parent chain
    let breadcrumbs: Array<{ id: number; subject: string; tracker?: string; isCached?: boolean }> = [];
    if (isNumericId && issue.redmineIssueId) {
      try {
        const { client } = await requireRedmineClient();
        const chain = await buildBreadcrumbChain(client, issue.redmineIssueId);
        const chainIds = chain.map((crumb) => crumb.id);
        const cached = chainIds.length === 0
          ? []
          : await prisma.issue.findMany({
            where: {
              userId: user.id,
              redmineIssueId: { in: chainIds },
            },
            select: { redmineIssueId: true },
          });
        const cachedIds = new Set(cached.map((row) => row.redmineIssueId));
        breadcrumbs = chain.map((crumb) => ({ ...crumb, isCached: cachedIds.has(crumb.id) }));
      } catch {
        // If Redmine is unavailable, skip breadcrumbs
      }
    }

    const issueView = toIssueView(issue);

    // Serialize BigInt fields to strings for JSON compatibility
    const serializeBigInts = (obj: unknown): unknown => {
      if (obj === null || obj === undefined) return obj;
      if (typeof obj === "bigint") return obj.toString();
      if (obj instanceof Date) return obj.toISOString();
      if (Array.isArray(obj)) return obj.map(serializeBigInts);
      if (typeof obj === "object") {
        const result: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(obj)) {
          result[key] = serializeBigInts(val);
        }
        return result;
      }
      return obj;
    };

    const payload: IssueDetailPayload = {
      issue: serializeBigInts({ ...issueView, breadcrumbs }),
      statuses,
    };
    issueDetailCache.set(cacheKey, {
      expiresAt: nowMs + ISSUE_DETAIL_CACHE_TTL_MS,
      payload,
    });
    pruneIssueDetailCache(nowMs);

    return Response.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load issue";
    const status = message === "Unauthorized" ? 401 : message === "Invalid issue id" ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
