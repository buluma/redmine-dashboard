import { getLLMProviderManager, type LLMResponse } from "@/src/lib/llm-provider";
import { createCategorizeMessages, parseJsonResponse, type CategorizeResponse } from "@/src/lib/ai-prompt";
import { env } from "@/src/lib/env";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { requireCurrentUser, requireMobileUser } from "@/src/lib/auth";
import { trackFailure } from "@/src/lib/telemetry";

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
  if (!env.enableAiFeatures || !env.aiCategorizeEnabled) {
    return jsonError("AI categorization is disabled", 403);
  }

  try {
    const body = await request.json();
    const actorUserId = await resolveActorUserId(request);
    let issueId = body.issueId as string | undefined;

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

    // Fetch the issue from database
    const issue = await prisma.issue.findFirst({
      where: { id: issueId, userId: actorUserId },
    });

    if (!issue) {
      return jsonError("Issue not found", 404);
    }

    const messages = createCategorizeMessages({
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
    });

    // Try primary model, fallback on error
    let result: LLMResponse;
    try {
      const manager = getLLMProviderManager();
      result = await manager.chat(messages, { stream: false });
    } catch (error) {
      return jsonError(
        `AI categorization failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        503
      );
    }

    // Parse JSON response
    const parsed = parseJsonResponse<CategorizeResponse>(result.content);

    if (!parsed) {
      // If parsing failed, return the raw content
      return Response.json({
        suggestedPriority: { name: "Unknown", confidence: 0 },
        suggestedTags: [],
        suggestedCategory: { name: "Unknown", confidence: 0 },
        reasoning: result.content,
        modelUsed: result.model,
        provider: result.provider,
        rawResponse: true,
      });
    }

    return Response.json({
      ...parsed,
      modelUsed: result.model,
      provider: result.provider,
    });
  } catch (error) {
    trackFailure({ event: "ai.categorize.failed", error, metricName: "ai_categorize_failed" });
    return jsonError(
      `Failed to categorize issue: ${error instanceof Error ? error.message : "Unknown error"}`,
      500
    );
  }
}
