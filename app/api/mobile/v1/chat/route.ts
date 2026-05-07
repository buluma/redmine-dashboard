import { getLLMProviderManager } from '@/src/lib/llm-provider';
import type { LLMChatMessage } from '@/src/lib/llm-provider';
import { requireMobileUser, requireRedmineClientForUser } from '@/src/lib/auth';
import { prisma } from '@/src/lib/db';
import { jsonError } from '@/src/lib/http';
import { assertMobileApiEnabled } from '@/src/lib/mobile-api';
import { trackFailure, trackInfo, trackSuccess } from '@/src/lib/telemetry';
import {
  toolDefinitions,
  requiresConfirmation,
  executeTool,
  summarizeToolCall,
} from '@/src/lib/ai-tools';
import type { ToolCall, ToolResult } from '@/src/lib/ai-tools';

export const runtime = 'nodejs';

const SYSTEM_PROMPT = `You are a helpful assistant for the Converge project management dashboard.

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

// GET: Fetch chat history for the mobile user
export async function GET(request: Request) {
  const startedAt = Date.now();
  try {
    assertMobileApiEnabled();
    const { user } = await requireMobileUser(request);

    const history = await prisma.aiChatMessage.findMany({
      where: { userId: user.id, issueId: { equals: null } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    trackSuccess({
      event: 'mobile.chat.history.succeeded',
      data: { userId: user.id, count: history.length },
      metricName: 'mobile_chat_history_succeeded',
      durationMetricName: 'mobile_chat_history_duration',
      durationMs: Date.now() - startedAt,
    });

    return Response.json({
      messages: history.reverse().map((m) => ({
        role: m.role,
        content: m.content,
        model: m.model,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch chat history';
    const status = message === 'Unauthorized' ? 401 : 500;
    trackFailure({
      event: 'mobile.chat.history.failed',
      error,
      metricName: 'mobile_chat_history_failed',
      metricTags: { status_class: `${Math.floor(status / 100)}xx` },
      durationMetricName: 'mobile_chat_history_duration',
      durationMs: Date.now() - startedAt,
    });
    return jsonError(message === 'Unauthorized' ? 'Unauthorized' : 'Failed to fetch chat history', status);
  }
}

// POST: Send a message
export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    assertMobileApiEnabled();
    const { user } = await requireMobileUser(request);
    const body = await request.json();
    const { messages } = body as { messages: Array<{ role: string; content: string }> };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return jsonError('messages array is required', 400);
    }

    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg.role !== 'user') {
      return jsonError('Last message must be from user', 400);
    }

    trackInfo('mobile.chat.message.requested', { userId: user.id });

    await prisma.aiChatMessage.create({
      data: {
        userId: user.id,
        issueId: null,
        role: 'user',
        content: lastUserMsg.content,
      } as any,
    });

    const [issueCount] = await Promise.all([
      prisma.issue.count({ where: { userId: user.id } }),
    ]);

    const contextInfo = `Current session context:\n- Total issues tracked: ${issueCount}`;

    const fullMessages: LLMChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: contextInfo },
      ...messages.map((m) => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })),
    ];

    const manager = getLLMProviderManager();
    let result;

    try {
      result = await manager.chat(fullMessages, { stream: false, tools: toolDefinitions });
    } catch (llmError) {
      trackFailure({
        event: 'mobile.chat.message.llm_error',
        error: llmError,
        metricName: 'mobile_chat_llm_error',
        metricTags: { status_class: '5xx' },
        durationMetricName: 'mobile_chat_message_duration',
        durationMs: Date.now() - startedAt,
      });
      return jsonError('AI service unavailable. Please try again later.', 503);
    }

    // ---------- Tool call handling ----------
    if (result.toolCalls && result.toolCalls.length > 0) {
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

      if (autoExecute.length > 0 && pending.length === 0) {
        let client;
        try {
          const conn = await requireRedmineClientForUser(user.id);
          client = conn.client;
        } catch {
          return Response.json({
            message: { role: 'assistant', content: result.content || 'Redmine account not connected.', model: result.model },
          });
        }

        const toolResults: ToolResult[] = [];
        for (const call of autoExecute) {
          toolResults.push(await executeTool(call, client, user.id));
        }

        const followUpMessages: LLMChatMessage[] = [
          ...fullMessages,
          { role: 'assistant', content: result.content || '' },
          {
            role: 'system',
            content: `Tool results:\n${toolResults.map((r) => `[${r.name}] ${r.success ? JSON.stringify(r.result) : `Error: ${r.error}`}`).join('\n')}`,
          },
        ];

        try {
          const followUp = await manager.chat(followUpMessages, { stream: false });
          trackSuccess({
            event: 'mobile.chat.message.succeeded',
            data: { userId: user.id },
            metricName: 'mobile_chat_message_succeeded',
            durationMetricName: 'mobile_chat_message_duration',
            durationMs: Date.now() - startedAt,
          });
          return Response.json({
            message: { role: 'assistant', content: followUp.content, model: followUp.model },
            executedTools: toolResults.map((r) => ({ name: r.name, success: r.success, summary: summarizeToolCall({ id: r.toolCallId, name: r.name, arguments: {} }) })),
          });
        } catch {
          return Response.json({
            message: { role: 'assistant', content: result.content || '', model: result.model },
          });
        }
      }

      if (pending.length > 0) {
        let autoResults: ToolResult[] = [];
        if (autoExecute.length > 0) {
          try {
            const conn = await requireRedmineClientForUser(user.id);
            for (const call of autoExecute) {
              autoResults.push(await executeTool(call, conn.client, user.id));
            }
          } catch { /* best-effort */ }
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
          conversationContext: fullMessages.map((m) => ({ role: m.role, content: m.content })),
          autoExecutedResults: autoResults.length > 0 ? autoResults.map((r) => ({ name: r.name, success: r.success, result: r.result })) : undefined,
        });
      }
    }

    // ---------- No tool calls ----------
    await prisma.aiChatMessage.create({
      data: {
        userId: user.id,
        issueId: null,
        role: 'assistant',
        content: result.content,
        model: result.model,
        totalDuration: result.metrics?.totalDuration ?? null,
      } as any,
    });

    trackSuccess({
      event: 'mobile.chat.message.succeeded',
      data: { userId: user.id },
      metricName: 'mobile_chat_message_succeeded',
      durationMetricName: 'mobile_chat_message_duration',
      durationMs: Date.now() - startedAt,
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
    const message = error instanceof Error ? error.message : 'Failed to process chat message';
    const status = message === 'Unauthorized' ? 401 : 500;
    trackFailure({
      event: 'mobile.chat.message.failed',
      error,
      metricName: 'mobile_chat_message_failed',
      metricTags: { status_class: `${Math.floor(status / 100)}xx` },
      durationMetricName: 'mobile_chat_message_duration',
      durationMs: Date.now() - startedAt,
    });
    return jsonError(message === 'Unauthorized' ? 'Unauthorized' : 'Failed to process chat message', status);
  }
}
