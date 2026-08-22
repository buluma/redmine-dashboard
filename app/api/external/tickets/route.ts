import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import type { Prisma, Issue } from "@prisma/client";
import {
  getExternalApiKey,
  requireExternalApiKey,
  validateExternalApiKey,
} from "@/src/lib/external-auth";
import { trackFailure } from "@/src/lib/telemetry";
import { z } from "zod";

export const runtime = "nodejs";

// POST /api/external/tickets - Create a local (non-Redmine-synced) ticket
// via API key, for scripted/automation use (e.g. provisioning a catch-all
// bucket ticket for correlation.ts's MISC_UNLINKED_ISSUE_ID). Deliberately
// a small subset of app/api/issues/local/route.ts's schema — that route's
// full field set is for the UI form; this one is for scripts that just
// need "create me a ticket to point other things at."
// Callers that submit a parsed email as a ticket (e.g. the Odysseus/OpenClaw
// bridge) sometimes hit an upstream extraction failure and still POST —
// subject/body/sender all placeholders. Reject those instead of letting a
// broken parser flood Converge with unusable "(no subject)" tickets.
const EMAIL_PLACEHOLDER_SUBJECT = /\(no subject\)/i;

const createExternalTicketSchema = z
  .object({
    subject: z.string().min(1).max(500),
    description: z.string().optional(),
    tracker: z.string().optional(),
    priority: z.string().optional(),
  })
  .refine((data) => !EMAIL_PLACEHOLDER_SUBJECT.test(data.subject), {
    message: "Subject is an unresolved email-parse placeholder — fix extraction upstream instead of submitting it",
    path: ["subject"],
  });

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

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  
  const search = searchParams.get("search");
  const redmineId = searchParams.get("redmineId");
  const status = searchParams.get("status");
  const project = searchParams.get("project");
  const assignee = searchParams.get("assignee");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  const apiKey = getExternalApiKey(request);

  // If searching, check for AI summary API key
  if (search) {
    const aiKey = process.env.AI_SUMMARY_API_KEY;
    if (aiKey && aiKey !== "your-ai-summary-api-key" && apiKey !== aiKey) {
      return NextResponse.json({ error: "Invalid API key for search" }, { status: 401 });
    }
  } else if (apiKey) {
    // Fail closed like every other external route: an unrecognized key is
    // rejected even when no EXTERNAL_API_KEYS are configured.
    if (!validateExternalApiKey(apiKey)) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }
  } else {
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
    const where: Prisma.IssueWhereInput = {};
    
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

export async function POST(request: NextRequest) {
  const authError = requireExternalApiKey(request);
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = createExternalTicketSchema.safeParse(body);
    if (!parsed.success) {
      const isPlaceholder = parsed.error.issues.some((issue) => issue.path.join(".") === "subject" && issue.message.includes("email-parse placeholder"));
      if (isPlaceholder) {
        trackFailure({
          event: "external.tickets.create.rejected_placeholder",
          error: new Error("Rejected email-parse placeholder subject"),
          metricName: "external_tickets_create_rejected_placeholder",
        });
        return NextResponse.json(
          { error: "Invalid request", details: parsed.error.flatten() },
          { status: 422 }
        );
      }
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const data = parsed.data;

    // Single-user app — same "the one user" resolution as
    // app/api/external/correlation/route.ts, no per-request session to
    // scope by.
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "No users" }, { status: 503 });

    const maxNumber = await prisma.issue.aggregate({
      where: { userId: user.id, source: "local" },
      _max: { localIssueNumber: true },
    });
    const localIssueNumber = (maxNumber._max.localIssueNumber ?? 0) + 1;

    const issue = await prisma.issue.create({
      data: {
        userId: user.id,
        source: "local",
        localIssueNumber,
        redmineIssueId: null,
        redmineBaseUrl: null,
        subject: data.subject,
        description: data.description,
        tracker: data.tracker,
        priority: data.priority,
        statusId: 1,
        statusName: "New",
        updatedOnRemote: new Date(),
        lastActivityAt: new Date(),
        lastActivityType: "local_create",
      },
    });

    return NextResponse.json({ ticket: formatTicket(issue) }, { status: 201 });
  } catch (error) {
    trackFailure({ event: "external.tickets.create.failed", error, metricName: "external_tickets_create_failed" });
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to create ticket", message }, { status: 500 });
  }
}

function formatTicket(issue: Issue) {
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
