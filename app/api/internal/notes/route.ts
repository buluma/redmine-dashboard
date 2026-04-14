import { requireCurrentUser } from "@/src/lib/auth";
import { recomputeIssueActivityIndex, recordIssueActivityEvent } from "@/src/lib/activity-index";
import { prisma } from "@/src/lib/db";
import { jsonError, parseJson } from "@/src/lib/http";
import { getSlackNotificationService } from "@/src/lib/slack-notification-service";
import { getAuditService, extractClientIp, extractUserAgent } from "@/src/lib/audit";
import { checkRateLimit, addRateLimitHeaders } from "@/src/lib/rate-limit";
import { hasPermission } from "@/src/lib/rbac";
import { NextResponse } from "next/server";
import { z } from "zod";

const createNoteSchema = z.object({
  issueId: z.string().min(1),
  content: z.string().trim().min(1).max(10000),
});

// GET /api/internal/notes?issueId=xxx
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    
    // RBAC: require notes:read permission
    if (!(await hasPermission(user.id, "notes:read"))) {
      return jsonError("Permission denied", 403);
    }
    
    const { searchParams } = new URL(request.url);
    const issueId = searchParams.get("issueId");

    if (!issueId) {
      return jsonError("issueId query param is required", 400);
    }

    const issue = await prisma.issue.findFirst({
      where: { id: issueId, userId: user.id },
      select: { id: true },
    });

    if (!issue) {
      return jsonError("Issue not found", 404);
    }

    const notes = await prisma.internalNote.findMany({
      where: { issueId: issue.id },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, displayName: true } },
      },
    });

    return Response.json({
      notes: notes.map((n) => ({
        id: n.id,
        issueId: n.issueId,
        content: n.content,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
        authorId: n.userId,
        authorName: n.user.displayName,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Failed to fetch notes", 500);
  }
}

// POST /api/internal/notes
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    
    // RBAC: require notes:write permission
    if (!(await hasPermission(user.id, "notes:write"))) {
      return jsonError("Permission denied", 403);
    }

    // Rate limiting
    const rateLimitResult = await checkRateLimit(request, user.id);
    if (!rateLimitResult.allowed) {
      return addRateLimitHeaders(
        NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 }),
        rateLimitResult
      );
    }

    const body = await parseJson(request, createNoteSchema);

    // Audit logging setup
    const audit = getAuditService({
      userId: user.id,
      userEmail: user.emailOrUsername,
      ipAddress: extractClientIp(request),
      userAgent: extractUserAgent(request),
    });

    const issue = await prisma.issue.findFirst({
      where: { id: body.issueId, userId: user.id },
      select: { id: true },
    });

    if (!issue) {
      return jsonError("Issue not found", 404);
    }

    const note = await prisma.internalNote.create({
      data: {
        issueId: issue.id,
        userId: user.id,
        content: body.content,
      },
      include: {
        user: { select: { id: true, displayName: true } },
      },
    });

    // Audit log
    await audit.logCreate("InternalNote", {
      id: note.id,
      issueId: note.issueId,
      userId: note.userId,
      content: note.content,
      createdAt: note.createdAt,
    }, { issueId: issue.id });

    await recordIssueActivityEvent({
      issueId: issue.id,
      eventType: "internal_note",
      source: "local",
      sourceRemoteId: note.id,
      eventAt: note.updatedAt,
      summary: note.content,
    });
    await recomputeIssueActivityIndex(issue.id);

    // Send Slack notification for internal note
    const slackResult = await getSlackNotificationService().notifyInternalNoteAdded(
      issue.id,
      note.content,
      user.displayName
    );
    if (!slackResult.success) {
      console.error("Slack notification failed:", slackResult.error);
    }

    return addRateLimitHeaders(
      NextResponse.json({
        note: {
          id: note.id,
          issueId: note.issueId,
          content: note.content,
          createdAt: note.createdAt.toISOString(),
          updatedAt: note.updatedAt.toISOString(),
          authorId: note.userId,
          authorName: note.user.displayName,
        },
      }),
      rateLimitResult
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Failed to create note", 500);
  }
}
