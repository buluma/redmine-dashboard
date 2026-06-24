import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { getAuthenticatedUserId } from "@/src/lib/auth";
import { trackFailure } from "@/src/lib/telemetry";

export const runtime = "nodejs";

interface SearchResultRow {
  id: string;
  redmineIssueId: number | null;
  subject: string;
  description: string | null;
  projectName: string | null;
  tracker: string | null;
  priority: string | null;
  statusName: string;
  assignedToName: string | null;
  dueDate: Date | null;
  doneRatio: number | null;
  source: string;
  rank: number;
  updatedOnRemote: Date | null;
}

// Recency boost: issues updated in last 7 days get a boost
const RECENCY_DAYS = 7;
const OPEN_STATUSES = ['New', 'In Progress', 'Feedback', 'Assigned'];

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return jsonError("Unauthorized", 401);
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  // Return empty if no query
  if (!query || query.length < 2) {
    return Response.json({
      results: [],
      total: 0,
      query: query || "",
    });
  }

  try {
    const searchTerms = query.split(/\s+/).filter((t) => t.length > 0);
    const recencyCutoff = new Date(Date.now() - RECENCY_DAYS * 24 * 60 * 60 * 1000);
    
    // Full-text search with smarter ranking:
    // 1. Base FTS rank
    // 2. Boost exact subject matches
    // 3. Boost project name matches
    // 4. Boost recent issues
    // 5. Boost open statuses
    const results = await prisma.$queryRaw<SearchResultRow[]>`
      SELECT 
        i.id,
        i."redmineIssueId",
        i.subject,
        i.description,
        i."projectName",
        i.tracker,
        i.priority,
        i."statusName",
        i."assignedToName",
        i."dueDate",
        i."doneRatio",
        i.source,
        i."updatedOnRemote",
        (
          ts_rank(to_tsvector('english', 
            COALESCE(i.subject, '') || ' ' || 
            COALESCE(i.description, '') || ' ' || 
            COALESCE(i."projectName", '') || ' ' || 
            COALESCE(i."assignedToName", '') || ' ' || 
            COALESCE(i."authorName", '')
          ), plainto_tsquery('english', ${query})) 
          + CASE WHEN i.subject ILIKE ${`%${query}%`} THEN 0.5 ELSE 0 END
          + CASE WHEN i."projectName" ILIKE ${`%${query}%`} THEN 0.3 ELSE 0 END
          + CASE WHEN i."updatedOnRemote" > ${recencyCutoff} THEN 0.2 ELSE 0 END
          + CASE WHEN i."statusName" IN (${OPEN_STATUSES[0]}, ${OPEN_STATUSES[1]}, ${OPEN_STATUSES[2]}, ${OPEN_STATUSES[3]}) THEN 0.1 ELSE 0 END
        ) as rank
      FROM "Issue" i
      WHERE i."userId" = ${userId}
        AND (
          to_tsvector('english', COALESCE(i.subject, '') || ' ' || COALESCE(i.description, '') || ' ' || COALESCE(i."projectName", '') || ' ' || COALESCE(i."assignedToName", '') || ' ' || COALESCE(i."authorName", '')) @@ plainto_tsquery('english', ${query})
          OR i.subject ILIKE ${`%${query}%`}
          OR i.description ILIKE ${`%${query}%`}
          OR i."projectName" ILIKE ${`%${query}%`}
          OR i."assignedToName" ILIKE ${`%${query}%`}
          OR i."authorName" ILIKE ${`%${query}%`}
          OR i."statusName" ILIKE ${`%${query}%`}
        )
      ORDER BY rank DESC, i."updatedOnRemote" DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Get total count for pagination
    const countResult = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count
      FROM "Issue" i
      WHERE i."userId" = ${userId}
        AND (
          to_tsvector('english', COALESCE(i.subject, '') || ' ' || COALESCE(i.description, '') || ' ' || COALESCE(i."projectName", '') || ' ' || COALESCE(i."assignedToName", '') || ' ' || COALESCE(i."authorName", '')) @@ plainto_tsquery('english', ${query})
          OR i.subject ILIKE ${`%${query}%`}
          OR i.description ILIKE ${`%${query}%`}
          OR i."projectName" ILIKE ${`%${query}%`}
          OR i."assignedToName" ILIKE ${`%${query}%`}
          OR i."authorName" ILIKE ${`%${query}%`}
          OR i."statusName" ILIKE ${`%${query}%`}
        )
    `;

    const total = Number(countResult[0]?.count || BigInt(0));

    return Response.json({
      results: results.map((r) => ({
        id: r.id,
        redmineIssueId: r.redmineIssueId,
        subject: r.subject,
        description: r.description,
        projectName: r.projectName,
        tracker: r.tracker,
        priority: r.priority,
        statusName: r.statusName,
        assignedToName: r.assignedToName,
        dueDate: r.dueDate,
        doneRatio: r.doneRatio,
        source: r.source,
      })),
      total,
      query,
      pagination: {
        limit,
        offset,
        hasMore: offset + results.length < total,
      },
      ranking: {
        features: ['fts', 'recency', 'status', 'field-match'],
      },
    });
  } catch (error) {
    trackFailure({ event: "search.query.failed", error, metricName: "search_query_failed" });
    return jsonError(
      `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      500
    );
  }
}