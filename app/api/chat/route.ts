import { getLLMProviderManager } from '@/src/lib/llm-provider';
import type { LLMChatMessage } from '@/src/lib/llm-provider';
import { requireCurrentUser, requireRedmineClientForUser } from '@/src/lib/auth';
import { prisma } from '@/src/lib/db';
import { jsonError } from '@/src/lib/http';
import {
  toolDefinitions,
  requiresConfirmation,
  executeTool,
  summarizeToolCall,
} from '@/src/lib/ai-tools';
import type { ToolCall, ToolResult } from '@/src/lib/ai-tools';

export const runtime = 'nodejs';

const TOOL_SYSTEM_PROMPT = `You are a helpful assistant for the Converge project management dashboard.

Your capabilities:
- Help users navigate and understand their Redmine issues
- Answer questions about system logs and traces
- Explain error patterns and provide troubleshooting tips
- Summarize project status and metrics
- Assist with dashboard features and navigation

You also have access to tools that let you take actions in Redmine:
- Search and fetch issue details (auto-executed, no confirmation needed)
- Update issue status, log time, add comments, close issues, and update fields

Guidelines:
- Be helpful and concise
- Reference actual data when available
- Suggest actionable next steps
- Before calling a mutating tool, briefly explain what you are about to do and why
- Never batch more than 3 tool calls in a single response
- If you need a status ID or activity ID but don't have one, use list_statuses or list_activities first
- If you don't have specific information, explain what data sources are available`;

// GET: Fetch chat history
export async function GET() {
  try {
    const user = await requireCurrentUser();

    // Get recent general chat messages (not tied to specific issues)
    const chatHistory = await prisma.aiChatMessage.findMany({
      where: { userId: user.id, issueId: { equals: null } }, // null = not tied to issue
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return Response.json({ 
      messages: chatHistory.map(m => ({
        role: m.role,
        content: m.content,
        model: m.model,
        createdAt: m.createdAt.toISOString(),
      }))
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return jsonError('Unauthorized', 401);
    }
    return jsonError('Failed to fetch chat history', 500);
  }
}

// POST: Send a new message
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return jsonError('messages array is required', 400);
    }

    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg.role !== 'user') {
      return jsonError('Last message must be from user', 400);
    }

    // Save the incoming user message
    await prisma.aiChatMessage.create({
      data: {
        userId: user.id,
        issueId: null, // null = general chat not tied to issue
        role: "user",
        content: lastUserMsg.content,
      } as any, // Use unchecked input to bypass Prisma type issue
    });

    // Get recent system stats for context
    const [issueCount, syncJobsCount, recentErrors] = await Promise.all([
      prisma.issue.count({ where: { userId: user.id } }),
      prisma.syncJob.count(),
      prisma.mbuLog.count({
        where: {
          logLevel: { equals: 'ERROR' },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    const contextInfo = `
Current session context:
- Total issues tracked: ${issueCount}
- Total sync jobs: ${syncJobsCount}
- Errors in last 24h: ${recentErrors}
`;

    // Build messages with system prompt
    const fullMessages: LLMChatMessage[] = [
      { role: 'system', content: TOOL_SYSTEM_PROMPT },
      { role: 'system', content: contextInfo },
      ...messages,
    ];

    const manager = getLLMProviderManager();
    let result;

    try {
      result = await manager.chat(fullMessages, {
        stream: false,
        tools: toolDefinitions,
      });
    } catch (llmError) {
      console.error('LLM completion failed:', llmError);
      return jsonError('AI service unavailable. Please try again later.', 503);
    }

    // ---------- Handle tool calls ----------
    if (result.toolCalls && result.toolCalls.length > 0) {
      // Split into auto-execute (read-only) and pending (mutating)
      const autoExecute: ToolCall[] = [];
      const pending: ToolCall[] = [];

      for (const tc of result.toolCalls) {
        const call: ToolCall = { id: tc.id, name: tc.name, arguments: tc.arguments };
        if (requiresConfirmation(tc.name)) {
          pending.push(call);
        } else {
          autoExecute.push(call);
        }
      }

      // Auto-execute read-only tools and feed results back to LLM
      if (autoExecute.length > 0 && pending.length === 0) {
        // All tool calls are read-only — execute and get final response
        let client;
        try {
          const conn = await requireRedmineClientForUser(user.id);
          client = conn.client;
        } catch {
          // No Redmine connection, return error for read-only tools that need it
          return Response.json({
            message: {
              role: 'assistant',
              content: result.content || 'I need a connected Redmine account to look up that information.',
              model: result.model,
            },
          });
        }

        const toolResults: ToolResult[] = [];
        for (const call of autoExecute) {
          const toolResult = await executeTool(call, client, user.id);
          toolResults.push(toolResult);
        }

        // Build tool result messages and ask LLM for a final response
        const followUpMessages: LLMChatMessage[] = [
          ...fullMessages,
          // Include the assistant message that requested the tools
          { role: 'assistant', content: result.content || '' },
          // Include tool results as a system message
          {
            role: 'system',
            content: `Tool results:\n${toolResults.map((r) => `[${r.name}] ${r.success ? JSON.stringify(r.result) : `Error: ${r.error}`}`).join('\n')}`,
          },
        ];

        try {
          const followUp = await manager.chat(followUpMessages, { stream: false });
          return Response.json({
            message: {
              role: 'assistant',
              content: followUp.content,
              model: followUp.model,
            },
            executedTools: toolResults.map((r) => ({
              name: r.name,
              success: r.success,
              summary: summarizeToolCall({ id: r.toolCallId, name: r.name, arguments: {} }),
            })),
          });
        } catch {
          // If follow-up fails, return the raw tool results
          const summary = toolResults
            .map((r) => (r.success ? `✅ ${r.name}: ${JSON.stringify(r.result)}` : `❌ ${r.name}: ${r.error}`))
            .join('\n');
          return Response.json({
            message: {
              role: 'assistant',
              content: result.content || summary,
              model: result.model,
            },
          });
        }
      }

      // If there are pending (mutating) tool calls, return them for confirmation
      if (pending.length > 0) {
        // Also auto-execute any read-only calls in the same batch
        let autoResults: ToolResult[] = [];
        if (autoExecute.length > 0) {
          try {
            const conn = await requireRedmineClientForUser(user.id);
            for (const call of autoExecute) {
              const toolResult = await executeTool(call, conn.client, user.id);
              autoResults.push(toolResult);
            }
          } catch {
            // Ignore — read-only tools are best-effort alongside pending calls
          }
        }

        return Response.json({
          message: {
            role: 'assistant',
            content: result.content || 'I\'d like to perform the following actions:',
            model: result.model,
          },
          pendingToolCalls: pending.map((tc) => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
            summary: summarizeToolCall(tc),
          })),
          // Include conversation context so the execute-tools endpoint can resume
          conversationContext: fullMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          autoExecutedResults: autoResults.length > 0
            ? autoResults.map((r) => ({
              name: r.name,
              success: r.success,
              result: r.result,
            }))
            : undefined,
        });
      }
    }

    // ---------- No tool calls — standard response ----------
    // Save the assistant response
    await prisma.aiChatMessage.create({
      data: {
        userId: user.id,
        issueId: null, // null = general chat
        role: "assistant",
        content: result.content,
        model: result.model,
        totalDuration: result.metrics?.totalDuration ?? null,
      } as any, // Use unchecked input to bypass Prisma type issue
    });

    return Response.json({
      message: {
        role: 'assistant',
        content: result.content,
        model: result.model,
        totalDuration: result.metrics?.totalDuration?.toString() || null,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return jsonError('Unauthorized', 401);
    }
    console.error('Chat error:', error);
    return jsonError('Failed to process chat message', 500);
  }
}