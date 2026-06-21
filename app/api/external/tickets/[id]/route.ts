import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { requireRedmineClientForUser } from "@/src/lib/auth";
import { syncSingleIssue } from "@/src/lib/sync";
import { trackFailure, trackInfo } from "@/src/lib/telemetry";

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
    trackFailure({ event: "external.tickets.detail.failed", error, metricName: "external_tickets_detail_failed" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function validateApiKey(key: string): boolean {
  const validKeys = (process.env.EXTERNAL_API_KEYS || "").split(",").filter(Boolean);
  return validKeys.includes(key);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const apiKey = getApiKey(request);

  if (!apiKey || !validateApiKey(apiKey)) {
    return NextResponse.json({ error: "Valid API key required" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const redmineId = id.match(/^\d+$/) ? parseInt(id) : null;
  try {
    const issue = await prisma.issue.findFirst({
      where: {
        OR: [
          { id: id },
          ...(redmineId ? [{ redmineIssueId: redmineId }] : []),
        ],
      },
    });

    if (!issue || !issue.redmineIssueId) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const user = await prisma.user.findUnique({ where: { id: issue.userId } });
    if (!user) {
      return NextResponse.json({ error: "No user for this ticket" }, { status: 503 });
    }

    const { client } = await requireRedmineClientForUser(user.id);

    const updates: Record<string, unknown> = {};
    if (typeof body.statusId === "number") updates.statusId = body.statusId;
    if (typeof body.status === "string") {
      const catalog = await prisma.statusCatalog.findFirst({
        where: { name: { equals: body.status as string } },
      });
      if (!catalog) {
        return NextResponse.json({ error: `Unknown status: ${body.status}` }, { status: 400 });
      }
      updates.statusId = catalog.id;
    }
    if (typeof body.notes === "string") updates.notes = body.notes;
    if (typeof body.assignedToId === "number") updates.assignedToId = body.assignedToId;
    if (typeof body.doneRatio === "number") updates.doneRatio = body.doneRatio;
    if (typeof body.priorityId === "number") updates.priorityId = body.priorityId;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid update fields provided" }, { status: 400 });
    }

    trackInfo("external.tickets.update", { redmineIssueId: issue.redmineIssueId, updates: Object.keys(updates) });

    await client.updateIssue(issue.redmineIssueId, updates as Parameters<typeof client.updateIssue>[1]);

    const synced = await syncSingleIssue(user.id, client, issue.redmineIssueId, {
      pruneAttachments: false,
      pruneRelations: false,
      pruneTimeEntries: false,
    });

    return NextResponse.json({
      ok: true,
      redmineIssueId: issue.redmineIssueId,
      status: synced?.statusName ?? "updated",
    });
  } catch (error) {
    trackFailure({ event: "external.tickets.update.failed", error, metricName: "external_tickets_update_failed" });
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}