import { getLLMProviderManager } from '@/src/lib/llm-provider';
import type { LLMChatMessage } from '@/src/lib/llm-provider';
import { requireCurrentUser, requireRedmineClientForUser } from '@/src/lib/auth';
import { prisma } from '@/src/lib/db';
import { jsonError } from '@/src/lib/http';
import { z } from 'zod';

const summarizeSchema = z.object({
  staleDays: z.number().min(1).max(90).default(30),
  maxIssues: z.number().min(1).max(100).default(20),
  projectId: z.string().optional(),
  priority: z.string().optional(),
});

/**
 * POST /api/ai/summarize-stale
 * 
 * Bulk summarize stale issues using AI
 * Creates AiSummary records for each summarized issue
 */
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    
    const parsed = summarizeSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError('Invalid parameters', 400);
    }
    
    const { staleDays, maxIssues, projectId, priority } = parsed.data;
    const cutoffDate = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
    
    // Build query for stale issues
    const where: any = {
      userId: user.id,
      updatedAt: { lt: cutoffDate },
      statusName: { notIn: ['Closed', 'Resolved'] },
    };
    
    if (projectId) {
      where.projectName = projectId;
    }
    if (priority) {
      where.priorityName = priority;
    }
    
    // Get stale issues
    const issues = await prisma.issue.findMany({
      where,
      orderBy: { updatedAt: 'asc' },
      take: maxIssues,
      select: {
        id: true,
        redmineIssueId: true,
        subject: true,
        description: true,
        statusName: true,
        priority: true,
        projectName: true,
        assignedToName: true,
        dueDate: true,
      },
    });
    
    if (issues.length === 0) {
      return Response.json({
        message: 'No stale issues found',
        summarized: 0,
      });
    }
    
    // Get Redmine client
    let client;
    try {
      const conn = await requireRedmineClientForUser(user.id);
      client = conn.client;
    } catch {
      return jsonError('Redmine not connected', 400);
    }
    
    const manager = getLLMProviderManager();
    const results: { issueId: string; summary: string; success: boolean }[] = [];
    
    // Process in batches to avoid overwhelming the LLM
    const batchSize = 5;
    for (let i = 0; i < issues.length; i += batchSize) {
      const batch = issues.slice(i, i + batchSize);
      
      const summaries = await Promise.all(
        batch.map(async (issue) => {
          const prompt = `Summarize this Redmine issue in 2-3 sentences, focusing on:
- What the issue is about
- Current status and why it might be stalled
- Any blockers or missing information

Issue #${issue.redmineIssueId}: ${issue.subject}
Status: ${issue.statusName}
Priority: ${issue.priority}
Project: ${issue.projectName}
Assignee: ${issue.assignedToName || 'Unassigned'}
Due: ${issue.dueDate || 'Not set'}
Description: ${issue.description?.substring(0, 500) || 'No description'}`;

          try {
            const result = await manager.chat(
              [{ role: 'user', content: prompt }],
              { stream: false }
            );
            
            const summary = result.content || 'Summary unavailable';
            
            // Save to database
            await prisma.aiSummary.create({
              data: {
                userId: user.id,
                issueId: issue.id,
                summary,
                model: result.model || 'unknown',
                confidence: 0.7,
                generatedAt: new Date(),
              },
            });
            
            return {
              issueId: issue.id,
              summary,
              success: true,
            };
          } catch (error) {
            console.error(`Failed to summarize issue ${issue.id}:`, error);
            return {
              issueId: issue.id,
              summary: '',
              success: false,
            };
          }
        })
      );
      
      results.push(...summaries);
    }
    
    const successCount = results.filter(r => r.success).length;
    
    return Response.json({
      message: `Summarized ${successCount} of ${issues.length} stale issues`,
      summarized: successCount,
      total: issues.length,
      results: results.filter(r => r.success).map(r => ({
        issueId: r.issueId,
        summary: r.summary.substring(0, 200) + (r.summary.length > 200 ? '...' : ''),
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return jsonError('Unauthorized', 401);
    }
    console.error('Bulk summarize error:', error);
    return jsonError('Failed to generate summaries', 500);
  }
}

/**
 * GET /api/ai/summarize-stale
 * 
 * Get count of stale issues (for UI)
 */
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    
    const staleDays = parseInt(searchParams.get('staleDays') || '30', 10);
    const cutoffDate = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
    
    const count = await prisma.issue.count({
      where: {
        userId: user.id,
        updatedAt: { lt: cutoffDate },
        statusName: { notIn: ['Closed', 'Resolved'] },
      },
    });
    
    return Response.json({
      staleDays,
      staleIssueCount: count,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return jsonError('Unauthorized', 401);
    }
    return jsonError('Failed to count stale issues', 500);
  }
}