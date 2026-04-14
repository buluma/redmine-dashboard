import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { getSessionUserId } from "@/src/lib/session";

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
}

export async function GET(request: Request) {
  const userId = await getSessionUserId();
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
    // Use Prisma's raw query for PostgreSQL full-text search
    // Search across subject, description, projectName, assignedToName, authorName
    const searchTerms = query.split(/\s+/).filter((t) => t.length > 0);
    
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
        ts_rank(to_tsvector('english', COALESCE(i.subject, '') || ' ' || COALESCE(i.description, '') || ' ' || COALESCE(i."projectName", '') || ' ' || COALESCE(i."assignedToName", '') || ' ' || COALESCE(i."authorName", '')), plainto_tsquery('english', ${query})) as rank
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
    });
  } catch (error) {
    console.error("Search error:", error);
    return jsonError(
      `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      500
    );
  }
}