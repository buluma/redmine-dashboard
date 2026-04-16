import { getLLMProviderManager } from '@/src/lib/llm-provider';
import type { LLMChatMessage } from '@/src/lib/llm-provider';
import { requireCurrentUser, requireRedmineClientForUser } from '@/src/lib/auth';
import { jsonError } from '@/src/lib/http';
import { logEvent } from '@/src/lib/log';
import {
  executeTool,
  requiresConfirmation,
  summarizeToolCall,
} from '@/src/lib/ai-tools';
import type { ToolCall, ToolResult } from '@/src/lib/ai-tools';

export const runtime = 'nodejs';

/**
 * POST /api/chat/execute-tools
 *
 * Receives user-confirmed tool calls together with the conversation context,
 * executes each tool against Redmine, feeds the results back to the LLM, and
 * returns a final natural-language summary response.
 */
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();

    const { toolCalls, conversationContext } = body as {
      toolCalls: Array<{
        id: string;
        name: string;
        arguments: Record<string, unknown>;
      }>;
      conversationContext: Array<{ role: string; content: string }>;
    };

    // ---------- Validate input ----------
    if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length === 0) {
      return jsonError('toolCalls array is required', 400);
    }
    if (toolCalls.length > 5) {
      return jsonError('Too many tool calls (max 5)', 400);
    }
    if (!conversationContext || !Array.isArray(conversationContext)) {
      return jsonError('conversationContext is required', 400);
    }

    // Verify all tool calls are for mutating tools (read-only are auto-executed)
    for (const tc of toolCalls) {
      if (!tc.id || !tc.name || !tc.arguments) {
        return jsonError('Each toolCall must have id, name, and arguments', 400);
      }
      if (!requiresConfirmation(tc.name)) {
        return jsonError(
          `Tool "${tc.name}" is read-only and should not be sent to execute-tools`,
          400,
        );
      }
    }

    // ---------- Get Redmine client ----------
    let client;
    try {
      const conn = await requireRedmineClientForUser(user.id);
      client = conn.client;
    } catch {
      return jsonError(
        'Redmine account not connected. Please connect your account first.',
        400,
      );
    }

    // ---------- Execute each tool ----------
    const results: ToolResult[] = [];
    for (const tc of toolCalls) {
      const call: ToolCall = {
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      };

      logEvent(
        'ai.tool.execute_confirmed',
        { tool: tc.name, userId: user.id },
        'info',
      );

      const result = await executeTool(call, client, user.id);
      results.push(result);
    }

    // ---------- Feed results back to LLM for summary ----------
    const toolResultsSummary = results
      .map((r) => {
        const summary = summarizeToolCall({
          id: r.toolCallId,
          name: r.name,
          arguments: {},
        });
        if (r.success) {
          return `✅ ${summary}\n   Result: ${JSON.stringify(r.result)}`;
        }
        return `❌ ${summary}\n   Error: ${r.error}`;
      })
      .join('\n\n');

    const followUpMessages: LLMChatMessage[] = [
      ...conversationContext.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
      {
        role: 'system',
        content: `The user confirmed the following tool actions and they have been executed:\n\n${toolResultsSummary}\n\nPlease provide a brief, friendly summary of what was done. If any action failed, explain the error and suggest a fix.`,
      },
    ];

    const manager = getLLMProviderManager();
    let finalResponse;

    try {
      finalResponse = await manager.chat(followUpMessages, { stream: false });
    } catch {
      // If LLM fails, fall back to a structured summary
      const fallbackContent = results
        .map((r) =>
          r.success
            ? `✅ **${r.name}** completed successfully.`
            : `❌ **${r.name}** failed: ${r.error}`,
        )
        .join('\n');

      return Response.json({
        message: {
          role: 'assistant',
          content: fallbackContent,
        },
        executedTools: results.map((r) => ({
          name: r.name,
          success: r.success,
          error: r.error ?? null,
        })),
      });
    }

    return Response.json({
      message: {
        role: 'assistant',
        content: finalResponse.content,
        model: finalResponse.model,
      },
      executedTools: results.map((r) => ({
        name: r.name,
        success: r.success,
        error: r.error ?? null,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return jsonError('Unauthorized', 401);
    }
    console.error('Execute-tools error:', error);
    return jsonError('Failed to execute tool calls', 500);
  }
}
