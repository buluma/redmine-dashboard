import { extractAttachmentSnippetsForAi } from "@/src/lib/attachment-ai";
import { createSummarizeMessages, normalizeSummarizeResponse, parseJsonResponse } from "@/src/lib/ai-prompt";
import { env } from "@/src/lib/env";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { requireCurrentUser, requireMobileUser, requireRedmineClientForUser } from "@/src/lib/auth";
import { getLLMProviderManager } from "@/src/lib/llm-provider";

export const runtime = "nodejs";

async function resolveActorUserId(request: Request): Promise<string> {
  try {
    const user = await requireCurrentUser();
    return user.id;
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "Unauthorized") {
      throw error;
    }
    const { user } = await requireMobileUser(request);
    return user.id;
  }
}

export async function POST(request: Request) {
  if (!env.enableAiFeatures || !env.aiSummarizeEnabled) {
    return jsonError("AI summarization is disabled", 403);
  }

  let actorUserId: string;
  try {
    actorUserId = await resolveActorUserId(request);
  } catch {
    return jsonError("Unauthorized", 401);
  }

  try {
    const body = await request.json();
    let issueId = body.issueId as string | undefined;
    const modelOverride = body.model as string | undefined;

    // If issueId looks like a number, treat it as redmineIssueId
    const numericId = parseInt(issueId ?? "", 10);
    if (!isNaN(numericId)) {
      const issue = await prisma.issue.findFirst({
        where: { userId: actorUserId, redmineIssueId: numericId },
      });
      if (!issue) return jsonError("Issue not found", 404);
      issueId = issue.id;
    }

    if (!issueId) {
      return jsonError("issueId is required", 400);
    }

    // Log start
    await prisma.webLog.create({
      data: {
        userId: actorUserId,
        message: `Summarize started for issue ${issueId}`,
        level: "info",
        source: "api",
        url: "/api/ai/summarize",
        meta: { type: "summarize_start", issueId },
      },
    });

    // Fetch the issue from database
    const issue = await prisma.issue.findFirst({
      where: { id: issueId, userId: actorUserId },
      include: {
        journals: {
          orderBy: { createdOnRemote: "desc" },
          take: 30,
        },
        timeEntries: {
          orderBy: { spentOn: "desc" },
          take: 30,
        },
        attachments: {
          orderBy: [{ createdOnRemote: "desc" }, { createdAt: "desc" }],
          take: 20,
        },
      },
    });

    if (!issue) {
      return jsonError("Issue not found", 404);
    }

    const client = getOllamaClient();
    let attachmentSnippets = new Map<number, string>();
    try {
      const { client: redmineClient } = await requireRedmineClientForUser(actorUserId);
      attachmentSnippets = await extractAttachmentSnippetsForAi(
        redmineClient,
        issue.attachments.map((attachment) => ({
          redmineAttachmentId: attachment.redmineAttachmentId,
          filename: attachment.filename,
          filesize: attachment.filesize,
          contentType: attachment.contentType,
          downloadUrl: attachment.downloadUrl,
        }))
      );
    } catch {
      // Continue without attachment content extraction when credentials are missing or fetch fails.
    }

    const issueContext = {
      id: issue.id,
      redmineIssueId: issue.redmineIssueId,
      subject: issue.subject,
      description: issue.description,
      projectName: issue.projectName,
      tracker: issue.tracker,
      priority: issue.priority,
      statusId: issue.statusId,
      statusName: issue.statusName,
      assignedToName: issue.assignedToName,
      dueDate: issue.dueDate?.toISOString() ?? null,
      doneRatio: issue.doneRatio,
      updatedOn: (issue.lastActivityAt ?? issue.updatedOnRemote).toISOString(),
      journals: issue.journals.map((journal) => ({
        author: journal.author,
        notes: journal.notes,
        createdOn: journal.createdOnRemote.toISOString(),
      })),
      timeEntries: issue.timeEntries.map((entry) => ({
        hours: entry.hours,
        activityName: entry.activityName,
        authorName: entry.authorName,
        comments: entry.comments,
        spentOn: entry.spentOn.toISOString(),
      })),
      attachments: issue.attachments.map((attachment) => ({
        redmineAttachmentId: attachment.redmineAttachmentId,
        filename: attachment.filename,
        contentType: attachment.contentType,
        filesize: attachment.filesize,
        createdOn: attachment.createdOnRemote?.toISOString() ?? attachment.createdAt.toISOString(),
        extractedText: attachmentSnippets.get(attachment.redmineAttachmentId) ?? null,
      })),
    };
    const messages = createSummarizeMessages(issueContext);

    // Try AI service, but if it fails and we have a cached summary, return it
    let result: {
      content: string;
      model: string;
      usedFallback: boolean;
      total_duration?: number;
      load_duration?: number;
      prompt_eval_count?: number;
      prompt_eval_duration?: number;
      eval_count?: number;
      eval_duration?: number;
    };
    try {
      const manager = getLLMProviderManager();
      const response = await manager.chat(messages, { stream: false, model: modelOverride });
      result = {
        content: response.content,
        model: response.model,
        usedFallback: false,
        total_duration: response.metrics?.totalDuration,
        load_duration: response.metrics?.loadDuration,
        prompt_eval_count: response.metrics?.promptEvalCount,
        prompt_eval_duration: response.metrics?.promptEvalDuration,
        eval_count: response.metrics?.evalCount,
        eval_duration: response.metrics?.evalDuration,
      };
    } catch (primaryError) {
      // Try to get cached summary as fallback
      const cached = await prisma.aiSummary.findFirst({ where: { issueId } });
      if (cached) {
        try {
          const cachedData = JSON.parse(cached.summary);
          return Response.json({
            ...cachedData,
            modelUsed: cached.model,
            usedFallback: true,
            cached: true,
            warning: `AI service unavailable. Showing cached summary from ${cached.updatedAt.toISOString()}.`,
            metrics: {
              totalDuration: cached.totalDuration?.toString() ?? null,
              loadDuration: cached.loadDuration?.toString() ?? null,
              promptEvalCount: cached.promptEvalCount,
              promptEvalDuration: cached.promptEvalDuration?.toString() ?? null,
              evalCount: cached.evalCount,
              evalDuration: cached.evalDuration?.toString() ?? null,
            },
          });
        } catch {
          // Cache parse failed, continue to error
        }
      }
      return jsonError(
        `AI summarization failed: ${primaryError instanceof Error ? primaryError.message : "Unknown error"}`,
        503
      );
    }

    // Parse JSON response
    const parsed = parseJsonResponse<unknown>(result.content);
    const structured = normalizeSummarizeResponse(parsed, issueContext);
    const summaryText = JSON.stringify(structured);

    // Helper to convert number to BigInt safely
    const toBigInt = (val: number | undefined | null): bigint | null =>
      val != null ? BigInt(val) : null;

    // Persist summary to database
    await prisma.aiSummary.upsert({
      where: { issueId },
      update: {
        summary: summaryText,
        model: result.model,
        totalDuration: toBigInt(result.total_duration),
        loadDuration: toBigInt(result.load_duration),
        promptEvalCount: result.prompt_eval_count ?? null,
        promptEvalDuration: toBigInt(result.prompt_eval_duration),
        evalCount: result.eval_count ?? null,
        evalDuration: toBigInt(result.eval_duration),
      },
      create: {
        issueId,
        summary: summaryText,
        model: result.model,
        totalDuration: toBigInt(result.total_duration),
        loadDuration: toBigInt(result.load_duration),
        promptEvalCount: result.prompt_eval_count ?? null,
        promptEvalDuration: toBigInt(result.prompt_eval_duration),
        evalCount: result.eval_count ?? null,
        evalDuration: toBigInt(result.eval_duration),
      },
    });

    // Log success
    await prisma.webLog.create({
      data: {
        userId: actorUserId,
        message: `Summarize completed for issue ${issueId} — ${result.model}, ${result.eval_count ?? 0} tokens, ${result.total_duration ? Math.round(Number(result.total_duration) / 1e6) : 0}ms`,
        level: "info",
        source: "api",
        url: "/api/ai/summarize",
        meta: { type: "summarize_complete", issueId, model: result.model, tokens: result.eval_count, duration: result.total_duration?.toString() },
      },
    });

    return Response.json({
      ...structured,
      modelUsed: result.model,
      usedFallback: result.usedFallback,
      rawResponse: !parsed,
      metrics: {
        totalDuration: result.total_duration != null ? String(result.total_duration) : null,
        loadDuration: result.load_duration != null ? String(result.load_duration) : null,
        promptEvalCount: result.prompt_eval_count ?? null,
        promptEvalDuration: result.prompt_eval_duration != null ? String(result.prompt_eval_duration) : null,
        evalCount: result.eval_count ?? null,
        evalDuration: result.eval_duration != null ? String(result.eval_duration) : null,
      },
    });
  } catch (error) {
    // Log failure
    try {
      await prisma.webLog.create({
        data: {
          userId: actorUserId,
          message: `Summarize failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          level: "error",
          source: "api",
          url: "/api/ai/summarize",
          meta: { type: "summarize_error" },
        },
      });
    } catch {
      // Ignore logging errors
    }
    console.error("Summarize error:", error);
    return jsonError(
      `Failed to summarize issue: ${error instanceof Error ? error.message : "Unknown error"}`,
      500
    );
  }
}

export async function GET(request: Request) {
  try {
    const actorUserId = await resolveActorUserId(request);
    const { searchParams } = new URL(request.url);
    let issueId = searchParams.get("issueId");

    if (!issueId) {
      return jsonError("issueId query param is required", 400);
    }

    const numericId = parseInt(issueId, 10);
    if (!isNaN(numericId)) {
      const issue = await prisma.issue.findFirst({
        where: { userId: actorUserId, redmineIssueId: numericId },
        select: { id: true },
      });
      if (!issue) {
        return jsonError("Issue not found", 404);
      }
      issueId = issue.id;
    }

    const summary = await prisma.aiSummary.findFirst({
      where: {
        issueId,
        issue: { userId: actorUserId },
      },
    });

    if (!summary) {
      return Response.json({ summary: null });
    }

    return Response.json({ summary });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Failed to fetch summary", 500);
  }
}
