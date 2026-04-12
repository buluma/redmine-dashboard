import { getOllamaClient } from "@/src/lib/ollama";
import { createSummarizeMessages, parseJsonResponse, type SummarizeResponse } from "@/src/lib/ai-prompt";
import { env } from "@/src/lib/env";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { requireCurrentUser } from "@/src/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!env.enableAiFeatures || !env.aiSummarizeEnabled) {
    return jsonError("AI summarization is disabled", 403);
  }

  try {
    const body = await request.json();
    const { issueId } = body;

    if (!issueId) {
      return jsonError("issueId is required", 400);
    }

    // Fetch the issue from database
    const issue = await prisma.issue.findUnique({
      where: { id: issueId },
    });

    if (!issue) {
      return jsonError("Issue not found", 404);
    }

    const client = getOllamaClient();
    const messages = createSummarizeMessages({
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
      updatedOn: issue.updatedOnRemote.toISOString(),
    });

    // Try primary model, fallback on error
    let result;
    try {
      result = await client.chatWithFallback(messages, { stream: false });
    } catch (error) {
      return jsonError(
        `AI summarization failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        503
      );
    }

    // Parse JSON response
    const parsed = parseJsonResponse<SummarizeResponse>(result.content);

    const summaryText = parsed
      ? JSON.stringify(parsed)
      : result.content;

    // Persist summary to database
    await prisma.aiSummary.upsert({
      where: { issueId },
      update: {
        summary: summaryText,
        model: result.model,
      },
      create: {
        issueId,
        summary: summaryText,
        model: result.model,
      },
    });

    if (!parsed) {
      return Response.json({
        summary: result.content,
        keyPoints: [],
        actionItems: [],
        confidence: 0.5,
        modelUsed: result.model,
        rawResponse: true,
      });
    }

    return Response.json({
      ...parsed,
      modelUsed: result.model,
      usedFallback: result.usedFallback,
    });
  } catch (error) {
    console.error("Summarize error:", error);
    return jsonError(
      `Failed to summarize issue: ${error instanceof Error ? error.message : "Unknown error"}`,
      500
    );
  }
}

export async function GET(request: Request) {
  try {
    await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const issueId = searchParams.get("issueId");

    if (!issueId) {
      return jsonError("issueId query param is required", 400);
    }

    const summary = await prisma.aiSummary.findUnique({
      where: { issueId },
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
