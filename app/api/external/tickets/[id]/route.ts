import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";

export const runtime = "nodejs";

// GET /api/external/tickets/[id] - Get ticket by local ID or Redmine ID
// 
// Path params:
//   - id: local ID (cuid) or Redmine issue ID (number)
//
// Query params:
//   - api_key: API key for authentication

function getApiKey(request: NextRequest): string | null {
  return request.headers.get("x-api-key") || request.nextUrl.searchParams.get("api_key");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const apiKey = getApiKey(request);

  // Require API key for external access
  if (!apiKey) {
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

  try {
    // Try to find by local ID (cuid) or Redmine ID
    const issue = await prisma.issue.findFirst({
      where: {
        OR: [
          { id: id }, // local ID
          ...(id.match(/^\d+$/) ? [{ redmineIssueId: parseInt(id) }] : []), // numeric = Redmine ID
        ],
      },
    });

    if (!issue) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error("External API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}