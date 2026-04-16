import { getLLMProviderManager } from '@/src/lib/llm-provider';
import type { LLMChatMessage } from '@/src/lib/llm-provider';
import { requireCurrentUser } from '@/src/lib/auth';
import { prisma } from '@/src/lib/db';
import { jsonError } from '@/src/lib/http';

export const runtime = 'nodejs';

/**
 * GET /api/ai/stream
 * 
 * Streaming AI chat endpoint using SSE
 * Note: This currently returns the full response streamed chunk by chunk
 * rather than true LLM streaming (which requires provider-level support)
 */
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const message = searchParams.get('message');
    
    if (!message) {
      return jsonError('message query param required', 400);
    }

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

Provide helpful, concise responses. Reference actual data when available.`;

    const messages: LLMChatMessage[] = [
      { role: 'system', content: contextInfo },
      { role: 'user', content: message },
    ];

    const manager = getLLMProviderManager();
    
    try {
      const result = await manager.chat(messages, { stream: false });
      const content = result.content || '';
      
      // Stream the response back chunk by chunk for a more natural feel
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          // Split content into words for chunked delivery
          const words = content.split(/(\s+)/);
          
          for (let i = 0; i < words.length; i += 3) {
            const chunk = words.slice(i, i + 3).join('');
            controller.enqueue(encoder.encode(chunk));
            // Small delay for visual effect
            await new Promise(r => setTimeout(r, 10));
          }
          
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (llmError) {
      console.error('LLM error:', llmError);
      return jsonError('AI service unavailable. Please try again later.', 503);
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return jsonError('Unauthorized', 401);
    }
    return jsonError('Failed to generate streaming response', 500);
  }
}