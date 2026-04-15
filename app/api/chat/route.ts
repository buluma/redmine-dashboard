import { getLLMProviderManager } from "@/src/lib/llm-provider";
import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";

export const runtime = "nodejs";

const GENERAL_CHAT_SYSTEM_PROMPT = `You are a helpful assistant for the Converge project management dashboard.

Your capabilities:
- Help users navigate and understand their Redmine issues
- Answer questions about system logs and traces
- Explain error patterns and provide troubleshooting tips
- Summarize project status and metrics
- Assist with dashboard features and navigation

Guidelines:
- Be helpful and concise
- Reference actual data when available
- Suggest actionable next steps
- If you don't have specific information, explain what data sources are available`;

// GET: Fetch chat history
export async function GET() {
  try {
    const user = await requireCurrentUser();
    
    // Get recent general chat messages (not tied to specific issues)
    // For now, we'll just return an empty history - can be expanded later
    return Response.json({ messages: [] });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Failed to fetch chat history", 500);
  }
}

// POST: Send a new message
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return jsonError("messages array is required", 400);
    }

    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg.role !== "user") {
      return jsonError("Last message must be from user", 400);
    }

    // Get recent system stats for context
    const [issueCount, syncJobsCount, recentErrors] = await Promise.all([
      prisma.issue.count({ where: { userId: user.id } }),
      prisma.syncJob.count(),
      prisma.mbuLog.count({ where: { logLevel: { equals: "ERROR" }, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    ]);

    const contextInfo = `
Current session context:
- Total issues tracked: ${issueCount}
- Total sync jobs: ${syncJobsCount}
- Errors in last 24h: ${recentErrors}
`;

    // Build messages with system prompt
    const fullMessages = [
      { role: "system" as const, content: GENERAL_CHAT_SYSTEM_PROMPT },
      { role: "system" as const, content: contextInfo },
      ...messages,
    ];

    const manager = getLLMProviderManager();
    let result;

    try {
      result = await manager.chat(fullMessages, { stream: false });
    } catch (llmError) {
      console.error("LLM completion failed:", llmError);
      return jsonError("AI service unavailable. Please try again later.", 503);
    }

    return Response.json({
      message: {
        role: "assistant",
        content: result.content,
        model: result.model,
        totalDuration: result.metrics?.totalDuration?.toString() || null,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    console.error("Chat error:", error);
    return jsonError("Failed to process chat message", 500);
  }
}