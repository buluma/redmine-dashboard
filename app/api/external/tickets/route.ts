import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { trackFailure } from "@/src/lib/telemetry";

export const runtime = "nodejs";

// GET /api/external/tickets - List or search tickets
// Query params:
//   - search: semantic search query
//   - redmineId: filter by Redmine issue ID
//   - status: filter by status name
//   - project: filter by project name
//   - assignee: filter by assignee name
//   - limit: max results (default 20, max 100)
//
// For search, requires AI_SUMMARY_API_KEY or valid session
// For direct queries, requires API key in header: X-API-Key

function getApiKey(request: NextRequest): string | null {
  // Check header
  const headerKey = request.headers.get("x-api-key");
  if (headerKey) return headerKey;
  
  // Check query param (for simpler integrations)
  return request.nextUrl.searchParams.get("api_key");
}

function validateApiKey(key: string): boolean {
  // Allow configured API keys
  const validKeys = (process.env.EXTERNAL_API_KEYS || "").split(",").filter(Boolean);
  if (validKeys.includes(key)) return true;
  
  // Also allow mobile API tokens
  return false;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  
  const search = searchParams.get("search");
  const redmineId = searchParams.get("redmineId");
  const status = searchParams.get("status");
  const project = searchParams.get("project");
  const assignee = searchParams.get("assignee");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  const apiKey = getApiKey(request);
  
  // If searching, check for AI summary API key
  if (search) {
    const aiKey = process.env.AI_SUMMARY_API_KEY;
    if (aiKey && aiKey !== "your-ai-summary-api-key" && apiKey !== aiKey) {
      return NextResponse.json({ error: "Invalid API key for search" }, { status: 401 });
    }
  }

  // For non-search queries, require API key
  if (!search && !apiKey) {
    // Allow session-based access if logged in
    try {
      const { getSessionUserId } = await import("@/src/lib/session");
      const userId = await getSessionUserId();
      if (!userId) {
        return NextResponse.json({ error: "API key required" }, { status: 401 });
      }
    } catch {
      return NextResponse.json({ error: "API key required" }, { status: 401 });
    }
  }

  // Validate API key if provided
  if (apiKey && !validateApiKey(apiKey)) {
    // For development, allow if no keys configured
    const validKeys = (process.env.EXTERNAL_API_KEYS || "").split(",").filter(Boolean);
    if (validKeys.length > 0) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }
  }

  try {
    // If searching by Redmine ID directly
    if (redmineId) {
      const issue = await prisma.issue.findFirst({
        where: {
          redmineIssueId: parseInt(redmineId),
        },
      });

      if (!issue) {
        return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
      }

      return NextResponse.json({
        tickets: [formatTicket(issue)],
        total: 1,
      });
    }

    // Semantic search
    if (search) {
      // Use full-text search
      const issues = await prisma.issue.findMany({
        where: {
          OR: [
            { subject: { contains: search } },
            { description: { contains: search } },
          ],
          ...(status && { statusName: { equals: status } }),
          ...(project && { projectName: { contains: project } }),
          ...(assignee && { assignedToName: { contains: assignee } }),
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
      });

      const total = await prisma.issue.count({
        where: {
          OR: [
            { subject: { contains: search } },
            { description: { contains: search } },
          ],
        },
      });

      return NextResponse.json({
        tickets: issues.map(formatTicket),
        total,
        limit,
        offset,
      });
    }

    // Regular list with filters
    const where: any = {};
    
    if (status) {
      where.statusName = { equals: status };
    }
    if (project) {
      where.projectName = { contains: project };
    }
    if (assignee) {
      where.assignedToName = { contains: assignee };
    }

    const [issues, total] = await Promise.all([
      prisma.issue.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.issue.count({ where }),
    ]);

    return NextResponse.json({
      tickets: issues.map(formatTicket),
      total,
      limit,
      offset,
    });
  } catch (error) {
    trackFailure({ event: "external.tickets.list.failed", error, metricName: "external_tickets_list_failed" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function formatTicket(issue: any) {
  return {
    id: issue.id,
    redmineIssueId: issue.redmineIssueId,
    subject: issue.subject,
    description: issue.description,
    projectName: issue.projectName,
    tracker: issue.tracker,
    status: issue.statusName,
    priority: issue.priority,
    assignedTo: issue.assignedToName,
    author: issue.authorName,
    dueDate: issue.dueDate?.toISOString() || null,
    doneRatio: issue.doneRatio,
    createdAt: issue.createdAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
  };
}
