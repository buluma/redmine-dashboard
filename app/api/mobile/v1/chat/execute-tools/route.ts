import { getLLMProviderManager } from '@/src/lib/llm-provider';
import type { LLMChatMessage } from '@/src/lib/llm-provider';
import { requireMobileUser, requireRedmineClientForUser } from '@/src/lib/auth';
import { jsonError } from '@/src/lib/http';
import { assertMobileApiEnabled } from '@/src/lib/mobile-api';
import { logEvent } from '@/src/lib/log';
import { trackFailure, trackInfo, trackSuccess } from '@/src/lib/telemetry';
import { executeTool, requiresConfirmation, summarizeToolCall } from '@/src/lib/ai-tools';
import type { ToolCall, ToolResult } from '@/src/lib/ai-tools';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    assertMobileApiEnabled();
    const { user } = await requireMobileUser(request);

    const body = await request.json();
    const { toolCalls, conversationContext } = body as {
      toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
      conversationContext: Array<{ role: string; content: string }>;
    };

    if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length === 0) {
      return jsonError('toolCalls array is required', 400);
    }
    if (toolCalls.length > 5) {
      return jsonError('Too many tool calls (max 5)', 400);
    }
    if (!conversationContext || !Array.isArray(conversationContext)) {
      return jsonError('conversationContext is required', 400);
    }

    for (const tc of toolCalls) {
      if (!tc.id || !tc.name || !tc.arguments) {
        return jsonError('Each toolCall must have id, name, and arguments', 400);
      }
      if (!requiresConfirmation(tc.name)) {
        return jsonError(`Tool "${tc.name}" is read-only and should not be sent to execute-tools`, 400);
      }
    }

    trackInfo('mobile.chat.execute_tools.requested', { userId: user.id, toolCount: toolCalls.length });

    let client;
    try {
      const conn = await requireRedmineClientForUser(user.id);
      client = conn.client;
    } catch {
      return jsonError('Redmine account not connected. Please connect your account first.', 400);
    }

    const results: ToolResult[] = [];
    for (const tc of toolCalls) {
      const call: ToolCall = { id: tc.id, name: tc.name, arguments: tc.arguments };
      logEvent('ai.tool.execute_confirmed', { tool: tc.name, userId: user.id }, 'info');
      results.push(await executeTool(call, client, user.id));
    }

    const toolResultsSummary = results
      .map((r) => {
        const summary = summarizeToolCall({ id: r.toolCallId, name: r.name, arguments: {} });
        return r.success
          ? `✅ ${summary}\n   Result: ${JSON.stringify(r.result)}`
          : `❌ ${summary}\n   Error: ${r.error}`;
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
      const fallbackContent = results
        .map((r) =>
          r.success ? `✅ **${r.name}** completed successfully.` : `❌ **${r.name}** failed: ${r.error}`,
        )
        .join('\n');

      trackSuccess({
        event: 'mobile.chat.execute_tools.succeeded',
        data: { userId: user.id },
        metricName: 'mobile_chat_execute_tools_succeeded',
        durationMetricName: 'mobile_chat_execute_tools_duration',
        durationMs: Date.now() - startedAt,
      });
      return Response.json({
        message: { role: 'assistant', content: fallbackContent },
        executedTools: results.map((r) => ({ name: r.name, success: r.success, error: r.error ?? null })),
      });
    }

    trackSuccess({
      event: 'mobile.chat.execute_tools.succeeded',
      data: { userId: user.id },
      metricName: 'mobile_chat_execute_tools_succeeded',
      durationMetricName: 'mobile_chat_execute_tools_duration',
      durationMs: Date.now() - startedAt,
    });

    return Response.json({
      message: { role: 'assistant', content: finalResponse.content, model: finalResponse.model },
      executedTools: results.map((r) => ({ name: r.name, success: r.success, error: r.error ?? null })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to execute tool calls';
    const status = message === 'Unauthorized' ? 401 : 500;
    trackFailure({
      event: 'mobile.chat.execute_tools.failed',
      error,
      metricName: 'mobile_chat_execute_tools_failed',
      metricTags: { status_class: `${Math.floor(status / 100)}xx` },
      durationMetricName: 'mobile_chat_execute_tools_duration',
      durationMs: Date.now() - startedAt,
    });
    return jsonError(message === 'Unauthorized' ? 'Unauthorized' : 'Failed to execute tool calls', status);
  }
}
