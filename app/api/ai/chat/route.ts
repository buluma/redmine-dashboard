import { getLLMProviderManager, type LLMResponse } from "@/src/lib/llm-provider";
import { requireCurrentUser, requireRedmineClientForUser } from "@/src/lib/auth";
import { formatIssueForPrompt, type IssueContext } from "@/src/lib/ai-prompt";
import { env } from "@/src/lib/env";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { extractAttachmentSnippetsForAi } from "@/src/lib/attachment-ai";
import { trackFailure } from "@/src/lib/telemetry";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

const CHAT_SYSTEM_PROMPT = `You are a helpful project management assistant with FULL access to the current Redmine issue context provided below.

Your capabilities:
- Answer questions about the issue's status, priority, assignee, due date, and progress
- Summarize journal entries and time entries
- Explain the issue description and attachments
- Suggest next steps or clarify blockers
- Answer questions about who did what and when

Rules:
- Always reference the actual issue data provided in the context — do not say you don't have access.
- Be specific: mention issue numbers, names, dates, and details from the context.
- Keep responses concise and actionable.
- If asked something not covered in the context, say so honestly and suggest what information would help.`;

async function buildIssueContext(
  userId: string,
  redmineIssueId: number,
): Promise<IssueContext | null> {
  const issue = await prisma.issue.findFirst({
    where: { userId, redmineIssueId },
    include: {
      journals: { orderBy: { createdOnRemote: "desc" }, take: 30 },
      timeEntries: { orderBy: { spentOn: "desc" }, take: 30 },
      attachments: { orderBy: [{ createdOnRemote: "desc" }, { createdAt: "desc" }], take: 20 },
    },
  });

  if (!issue) return null;

  let attachmentSnippets = new Map<number, string>();
  try {
    const { client: redmineClient } = await requireRedmineClientForUser(userId);
    attachmentSnippets = await extractAttachmentSnippetsForAi(
      redmineClient,
      issue.attachments.map((a) => ({
        redmineAttachmentId: a.redmineAttachmentId,
        filename: a.filename,
        filesize: a.filesize,
        contentType: a.contentType,
        downloadUrl: a.downloadUrl,
      })),
    );
  } catch {
    // Continue without attachment content
  }

  return {
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
    journals: issue.journals.map((j) => ({
      author: j.author,
      notes: j.notes,
      createdOn: j.createdOnRemote.toISOString(),
    })),
    timeEntries: issue.timeEntries.map((e) => ({
      hours: e.hours,
      activityName: e.activityName,
      authorName: e.authorName,
      comments: e.comments,
      spentOn: e.spentOn.toISOString(),
    })),
    attachments: issue.attachments.map((a) => ({
      redmineAttachmentId: a.redmineAttachmentId,
      filename: a.filename,
      contentType: a.contentType,
      filesize: a.filesize,
      createdOn: a.createdOnRemote?.toISOString() ?? a.createdAt.toISOString(),
      extractedText: attachmentSnippets.get(a.redmineAttachmentId) ?? null,
    })),
  };
}

export async function POST(request: Request) {
  if (!env.enableAiFeatures) {
    return jsonError("AI features are disabled", 403);
  }

  let userId: string | null = null;
  try {
    const user = await requireCurrentUser();
    userId = user.id;
  } catch {
    return jsonError("Unauthorized", 401);
  }

  try {
    const body = await request.json();

    const redmineIssueId = body.redmineIssueId as number | undefined;
    const messages = body.messages as Array<{ role: "user" | "assistant"; content: string }> | undefined;

    if (!redmineIssueId || !Number.isInteger(redmineIssueId) || redmineIssueId <= 0) {
      return jsonError("Valid redmineIssueId is required", 400);
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonError("At least one message is required", 400);
    }

    // Log start
    await prisma.webLog.create({
      data: {
        userId,
        message: `Chat started for issue #${redmineIssueId} (${messages.length} message(s))`,
        level: "info",
        source: "api",
        url: "/api/ai/chat",
        meta: { type: "chat_start", redmineIssueId, messageCount: messages.length },
      },
    });

    // Find the issue to get internal ID
    const issue = await prisma.issue.findFirst({
      where: { userId, redmineIssueId },
      select: { id: true },
    });
    if (!issue) {
      return jsonError("Issue not found", 404);
    }

    // Save the incoming user message
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg.role === "user") {
      // We need userId - get from user or issue
      const userForChat = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (userForChat) {
        await prisma.aiChatMessage.create({
          data: {
            userId: userForChat.id,
            issueId: issue.id,
            role: "user",
            content: lastUserMsg.content,
          } satisfies Prisma.AiChatMessageUncheckedCreateInput,
        });
      }
    }

    const issueContext = await buildIssueContext(userId, redmineIssueId);
    if (!issueContext) {
      return jsonError("Issue not found", 404);
    }

    // Build messages with issue context injected as system prompt
    const issueContextText = formatIssueForPrompt(issueContext);
    const fullMessages = [
      { role: "system" as const, content: CHAT_SYSTEM_PROMPT },
      { role: "system" as const, content: `Here is the full context for the issue you are discussing:\n\n${issueContextText}` },
      ...messages,
    ];

    const manager = getLLMProviderManager();
    let result: LLMResponse;
    try {
      result = await manager.chat(fullMessages, { stream: false });
    } catch (error) {
      // Log failure
      await prisma.webLog.create({
        data: {
          userId,
          message: `Chat failed for issue #${redmineIssueId}: ${error instanceof Error ? error.message : "Unknown error"}`,
          level: "error",
          source: "api",
          url: "/api/ai/chat",
          meta: { type: "chat_error", redmineIssueId },
        },
      });
      return jsonError(
        `AI chat failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        503,
      );
    }

    // Helper to convert number to BigInt safely
    const toBigInt = (val: number | undefined | null): bigint | null =>
      val != null ? BigInt(val) : null;

    // Extract metrics from unified LLMResponse
    const metrics = result.metrics;
    const usage = result.usage;

    // Save the assistant response with performance metrics
    // We need userId - get from user or issue
    const userForChat2 = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (userForChat2) {
      await prisma.aiChatMessage.create({
        data: {
          userId: userForChat2.id,
          issueId: issue.id,
          role: "assistant",
          content: result.content,
          model: result.model,
          totalDuration: toBigInt(metrics?.totalDuration ?? null),
          loadDuration: toBigInt(metrics?.loadDuration ?? null),
          promptEvalCount: metrics?.promptEvalCount ?? null,
          promptEvalDuration: toBigInt(metrics?.promptEvalDuration ?? null),
          evalCount: metrics?.evalCount ?? usage?.totalTokens ?? null,
          evalDuration: toBigInt(metrics?.evalDuration ?? null),
        } satisfies Prisma.AiChatMessageUncheckedCreateInput,
      });
    }

    // Log success
    const tokenCount = metrics?.evalCount ?? usage?.totalTokens ?? 0;
    const durationMs = metrics?.totalDuration != null ? Math.round(Number(metrics.totalDuration) / 1e6) : 0;
    await prisma.webLog.create({
      data: {
        userId,
        message: `Chat completed for issue #${redmineIssueId} — ${result.model} (${result.provider}), ${tokenCount} tokens, ${durationMs}ms`,
        level: "info",
        source: "api",
        url: "/api/ai/chat",
        meta: {
          type: "chat_complete",
          redmineIssueId,
          model: result.model,
          provider: result.provider,
          tokens: tokenCount,
          duration: metrics?.totalDuration?.toString(),
        },
      },
    });

    return Response.json({
      content: result.content,
      model: result.model,
      provider: result.provider,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    trackFailure({ event: "ai.chat.failed", error, metricName: "ai_chat_failed" });
    return jsonError(
      `Failed to chat: ${error instanceof Error ? error.message : "Unknown error"}`,
      500,
    );
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const redmineIssueId = searchParams.get("redmineIssueId");

    if (!redmineIssueId) {
      return jsonError("redmineIssueId query param is required", 400);
    }

    const issue = await prisma.issue.findFirst({
      where: { userId: user.id, redmineIssueId: Number(redmineIssueId) },
      select: { id: true },
    });
    if (!issue) {
      return jsonError("Issue not found", 404);
    }

    const history = await prisma.aiChatMessage.findMany({
      where: { issueId: issue.id, userId: user.id },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        content: true,
        model: true,
        totalDuration: true,
        loadDuration: true,
        promptEvalCount: true,
        promptEvalDuration: true,
        evalCount: true,
        evalDuration: true,
        createdAt: true,
      },
    });

    // Serialize BigInt fields to strings for JSON
    const serialized = history.map((m) => ({
      role: m.role,
      content: m.content,
      model: m.model,
      totalDuration: m.totalDuration != null ? m.totalDuration.toString() : null,
      loadDuration: m.loadDuration != null ? m.loadDuration.toString() : null,
      promptEvalCount: m.promptEvalCount,
      promptEvalDuration: m.promptEvalDuration != null ? m.promptEvalDuration.toString() : null,
      evalCount: m.evalCount,
      evalDuration: m.evalDuration != null ? m.evalDuration.toString() : null,
      createdAt: m.createdAt,
    }));

    return Response.json({ messages: serialized });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Failed to fetch chat history", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const redmineIssueId = searchParams.get("redmineIssueId");

    if (!redmineIssueId) {
      return jsonError("redmineIssueId query param is required", 400);
    }

    const issue = await prisma.issue.findFirst({
      where: { userId: user.id, redmineIssueId: Number(redmineIssueId) },
      select: { id: true },
    });
    if (!issue) {
      return jsonError("Issue not found", 404);
    }

    await prisma.aiChatMessage.deleteMany({
      where: { issueId: issue.id, userId: user.id },
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Failed to clear chat history", 500);
  }
}
