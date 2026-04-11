import { getOllamaClient } from "@/src/lib/ollama";
import { createSearchMessages, parseJsonResponse, type SearchResponse } from "@/src/lib/ai-prompt";
import { env } from "@/src/lib/env";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!env.enableAiFeatures || !env.aiSearchEnabled) {
    return jsonError("AI search is disabled", 403);
  }

  try {
    const body = await request.json();
    const { query, limit = 10, userId } = body;

    if (!query) {
      return jsonError("query is required", 400);
    }

    // Fetch issues for the user
    const where = userId ? { userId } : {};
    const issues = await prisma.issue.findMany({
      where,
      take: 50, // Limit for AI processing
      orderBy: { updatedOnRemote: "desc" },
    });

    if (issues.length === 0) {
      return Response.json({
        results: [],
        insights: "No issues found to search through.",
        modelUsed: "none",
      });
    }

    const client = getOllamaClient();
    const messages = createSearchMessages(
      query,
      issues.map((issue) => ({
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
      }))
    );

    // Try primary model, fallback on error
    let result;
    try {
      result = await client.chatWithFallback(messages, { stream: false });
    } catch (error) {
      return jsonError(
        `AI search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        503
      );
    }

    // Parse JSON response
    const parsed = parseJsonResponse<SearchResponse>(result.content);

    if (!parsed) {
      // If parsing failed, return basic response
      return Response.json({
        results: issues.slice(0, limit).map((issue) => ({
          issueId: issue.id,
          relevance: 0.5,
          explanation: result.content.substring(0, 200),
        })),
        insights: "Could not parse AI response",
        modelUsed: result.model,
        usedFallback: result.usedFallback,
        rawResponse: true,
      });
    }

    // Enrich results with actual issue data
    const enrichedResults = parsed.results.slice(0, limit).map((r) => {
      const issue = issues.find((i) => i.id === r.issueId);
      return {
        ...r,
        issue: issue
          ? {
              id: issue.id,
              redmineIssueId: issue.redmineIssueId,
              subject: issue.subject,
              statusName: issue.statusName,
              projectName: issue.projectName,
            }
          : null,
      };
    });

    return Response.json({
      results: enrichedResults,
      insights: parsed.insights,
      modelUsed: result.model,
      usedFallback: result.usedFallback,
    });
  } catch (error) {
    console.error("Search error:", error);
    return jsonError(
      `Failed to search: ${error instanceof Error ? error.message : "Unknown error"}`,
      500
    );
  }
}
