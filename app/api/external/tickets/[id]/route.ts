import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { Prisma } from "@prisma/client";
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

  // Require a valid API key, or fall back to a logged-in session
  if (apiKey) {
    if (!validateApiKey(apiKey)) {
      return NextResponse.json({ error: "Valid API key required" }, { status: 401 });
    }
  } else {
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
    // Try to find by local ID (cuid), Redmine ID (numeric), or L-N format
    const localMatch = id.match(/^[Ll]-?(\d+)$/);
    const issue = await prisma.issue.findFirst({
      where: {
        OR: [
          { id: id },
          ...(id.match(/^\d+$/) ? [{ redmineIssueId: parseInt(id) }] : []),
          ...(localMatch ? [{ source: "local", localIssueNumber: parseInt(localMatch[1]) }] : []),
        ],
      },
    });

    if (!issue) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: issue.id,
      redmineIssueId: issue.redmineIssueId,
      localIssueNumber: issue.localIssueNumber,
      source: issue.source,
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

type LocalIssue = { id: string; userId: string; source: string; statusName: string; priority: string | null; assignedToName: string | null; doneRatio: number | null };

async function patchLocalIssue(issue: LocalIssue, body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  const details: Array<{ property: string; name: string; old_value: string; new_value: string }> = [];

  if (typeof body.subject === "string") data.subject = body.subject;
  if (body.description !== undefined) data.description = typeof body.description === "string" ? body.description : null;
  if (typeof body.tracker === "string") data.tracker = body.tracker;
  if (typeof body.priority === "string") {
    if (body.priority !== issue.priority) {
      details.push({ property: "attr", name: "priority", old_value: issue.priority ?? "", new_value: body.priority });
    }
    data.priority = body.priority;
  }
  if (typeof body.projectName === "string") data.projectName = body.projectName;

  if (typeof body.statusId === "number" || typeof body.status === "string") {
    let statusId: number | undefined;
    let statusName: string | undefined;
    if (typeof body.status === "string") {
      const catalog = await prisma.statusCatalog.findFirst({ where: { name: { equals: body.status as string } } });
      if (!catalog) return NextResponse.json({ error: `Unknown status: ${body.status}` }, { status: 400 });
      statusId = catalog.id;
      statusName = catalog.name;
    } else {
      statusId = body.statusId as number;
      const catalog = await prisma.statusCatalog.findUnique({ where: { id: statusId } });
      statusName = catalog?.name ?? issue.statusName;
    }
    if (statusName !== issue.statusName) {
      details.push({ property: "attr", name: "status", old_value: issue.statusName, new_value: statusName });
    }
    data.statusId = statusId;
    data.statusName = statusName;
  }

  if (typeof body.assignedToName === "string" || body.assignedToName === null) {
    const newVal = (body.assignedToName as string | null) ?? "";
    if (newVal !== (issue.assignedToName ?? "")) {
      details.push({ property: "attr", name: "assigned_to", old_value: issue.assignedToName ?? "", new_value: newVal });
    }
    data.assignedToName = body.assignedToName;
  }
  if (typeof body.assignedToId === "number" || body.assignedToId === null) {
    data.assignedToId = body.assignedToId;
  }

  if (typeof body.doneRatio === "number") {
    if (body.doneRatio !== issue.doneRatio) {
      details.push({ property: "attr", name: "done_ratio", old_value: String(issue.doneRatio ?? 0), new_value: String(body.doneRatio) });
    }
    data.doneRatio = body.doneRatio;
  }

  if (typeof body.estimatedHours === "number" || body.estimatedHours === null) data.estimatedHours = body.estimatedHours;

  const hasUpdates = Object.keys(data).length > 0;
  const hasNotes = typeof body.notes === "string" && body.notes.length > 0;

  if (!hasUpdates && !hasNotes) {
    return NextResponse.json({ error: "No valid update fields provided" }, { status: 400 });
  }

  if (hasUpdates) {
    data.updatedOnRemote = new Date();
    data.lastActivityAt = new Date();
    data.lastActivityType = "local_update";
    await prisma.issue.update({ where: { id: issue.id }, data });
  }

  if (details.length > 0 || hasNotes) {
    const maxJ = await prisma.issueJournal.aggregate({ where: { issueId: issue.id }, _max: { redmineJournalId: true } });
    const nextId = (maxJ._max.redmineJournalId ?? 0) + 1;
    await prisma.issueJournal.create({
      data: {
        issueId: issue.id,
        redmineJournalId: nextId,
        author: "API",
        notes: hasNotes ? (body.notes as string) : null,
        detailsJson: details.length > 0 ? (details as unknown as Prisma.InputJsonValue) : undefined,
        createdOnRemote: new Date(),
      },
    });
  }

  trackInfo("external.tickets.local.update", { issueId: issue.id, fields: Object.keys(data) });

  return NextResponse.json({ ok: true, id: issue.id, source: "local" });
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
  const localMatch = id.match(/^[Ll]-?(\d+)$/);
  try {
    const issue = await prisma.issue.findFirst({
      where: {
        OR: [
          { id: id },
          ...(redmineId ? [{ redmineIssueId: redmineId }] : []),
          ...(localMatch ? [{ source: "local" as const, localIssueNumber: parseInt(localMatch[1]) }] : []),
        ],
      },
    });

    if (!issue) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // Local ticket — update directly in DB
    if (issue.source === "local") {
      return patchLocalIssue(issue as LocalIssue, body);
    }

    // Redmine ticket — proxy through Redmine API
    if (!issue.redmineIssueId) {
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

    const NOBODY_ID = 25;
    const CLOSED_ID = 5;
    const RESOLVED_ID = 3;
    const targetStatus = updates.statusId as number | undefined;
    if (targetStatus === CLOSED_ID || targetStatus === RESOLVED_ID) {
      const detail = await client.getIssue(issue.redmineIssueId);
      const issueData = detail.issue as { author?: { id: number } };
      const authorId = issueData.author?.id;
      const currentUserId = (await client.getCurrentUser()).id;
      const reassignTo = authorId === currentUserId ? NOBODY_ID : (authorId ?? NOBODY_ID);
      await client.updateIssue(issue.redmineIssueId, { assignedToId: reassignTo });
    }

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