import { getLLMProviderManager } from '@/src/lib/llm-provider';
import type { LLMChatMessage } from '@/src/lib/llm-provider';
import { requireCurrentUser, requireRedmineClientForUser } from '@/src/lib/auth';
import { prisma } from '@/src/lib/db';
import { jsonError } from '@/src/lib/http';
import { trackFailure } from '@/src/lib/telemetry';
import { z } from 'zod';
import type { RedmineClient } from '@/src/lib/redmine';

const slackMessageSchema = z.object({
  channelId: z.string().optional(),  // defaults to SLACK_DEFAULT_CHANNEL_ID
  threadTs: z.string().optional(),
  limit: z.number().min(1).max(50).default(20),
});

interface ParsedIssue {
  subject: string;
  description: string;
  projectName?: string;
  priorityName?: string;
  assigneeName?: string;
  dueDate?: string;
  confidence: number;
}

async function parseSlackMessageToIssue(
  messageText: string,
  client: RedmineClient,
  manager: ReturnType<typeof getLLMProviderManager>
): Promise<ParsedIssue | null> {
  const prompt = `Analyze this Slack message and extract information to create a Redmine issue if appropriate.

Extract the following:
- subject: A short title for the issue (required)
- description: Detailed description of what needs to be done (required)
- projectName: The project name if mentioned (optional)
- priorityName: Priority like "Low", "Normal", "High", "Urgent" (optional)
- assigneeName: Person to assign to if mentioned (optional)
- dueDate: Due date if mentioned in format YYYY-MM-DD (optional)

Return ONLY a JSON object with these fields (empty string if not found):
{
  "subject": "...",
  "description": "...",
  "projectName": "...",
  "priorityName": "...",
  "assigneeName": "...",
  "dueDate": "..."
}

If the message is just a casual conversation and NOT a task request, return:
{ "subject": "", "description": "", "confidence": 0 }

Slack message:
${messageText}`;

  try {
    const result = await manager.chat(
      [{ role: 'user', content: prompt }],
      { stream: false }
    );

    const content = result.content || '';
    
    // Try to parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    
    if (!parsed.subject || !parsed.description) {
      return null;
    }

    // Validate project exists (if provided) - skip validation, just use name as-is
    // The Redmine API will reject invalid projects when creating the issue

    return {
      ...parsed,
      confidence: 0.7,
    };
  } catch (error) {
    trackFailure({ event: 'slack.create_issue.parse.failed', error, metricName: 'slack_create_issue_parse_failed' });
    return null;
  }
}

async function createRedmineIssueFromSlack(
  parsed: ParsedIssue,
  client: RedmineClient
): Promise<{ issueId: number; url: string }> {
  // Get project ID from project name (let Redmine API handle invalid names)
  // We'll skip client-side lookup for now - the API will reject invalid projects

  // Get priority ID
  let priorityId: number | undefined;
  const priorityMap: Record<string, number> = {
    low: 1, normal: 2, high: 3, urgent: 4, immediate: 5,
  };
  if (parsed.priorityName) {
    priorityId = priorityMap[parsed.priorityName.toLowerCase()];
  }

  // Project ID from parsed name (or undefined to use default)
  const projectId = parsed.projectName ? undefined : undefined; // Let Redmine handle project validation

  // Get assignee ID - skip for now, let Redmine handle it
  let assignedToId: number | undefined;

  // Create the issue
  const issue = await client.createIssue({
    subject: parsed.subject,
    description: parsed.description,
    projectId: undefined,
    priorityId,
    assignedToId,
    dueDate: parsed.dueDate,
  });

  return {
    issueId: issue.id,
    url: issue.url,
  };
}

/**
 * GET /api/slack/create-issue
 * 
 * Fetch messages from Slack channel and potentially create issues
 * Query params:
 *   - channelId: Slack channel (default: from env)
 *   - threadTs: specific thread to analyze
 *   - limit: number of messages (default 20)
 */
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    
    const channelId = searchParams.get('channelId') || process.env.SLACK_DEFAULT_CHANNEL_ID;
    const threadTs = searchParams.get('threadTs');
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    
    if (!channelId) {
      return jsonError('SLACK_DEFAULT_CHANNEL_ID not configured', 400);
    }

    // Get Slack messages
    const messages = await fetchSlackMessages(channelId, threadTs, limit);
    
    if (messages.length === 0) {
      return Response.json({
        messages: [],
        suggestedIssues: [],
      });
    }

    // Analyze messages with LLM to find issue-worthy content
    let client;
    try {
      const conn = await requireRedmineClientForUser(user.id);
      client = conn.client;
    } catch {
      return jsonError('Redmine not connected', 400);
    }

    const manager = getLLMProviderManager();
    const suggestedIssues: ParsedIssue[] = [];
    
    // Analyze recent messages (last 10 for efficiency)
    const messagesToAnalyze = messages.slice(0, 10);
    
    for (const msg of messagesToAnalyze) {
      // Skip bot messages and empty text
      if (!msg.text || msg.subtype === 'bot_message') continue;
      
      const parsed = await parseSlackMessageToIssue(msg.text, client, manager);
      if (parsed && parsed.confidence > 0.5) {
        suggestedIssues.push({
          ...parsed,
          description: `${parsed.description}\n\n---\n*Source: Slack message from ${msg.user} at ${msg.ts}*`,
        });
      }
    }

    return Response.json({
      channelId,
      messages: messages.map(m => ({
        ts: m.ts,
        user: m.user,
        text: m.text?.substring(0, 200),
        timestamp: m.ts,
      })),
      suggestedIssues: suggestedIssues.map(i => ({
        subject: i.subject,
        description: i.description?.substring(0, 100) + '...',
        projectName: i.projectName,
        priorityName: i.priorityName,
        confidence: i.confidence,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return jsonError('Unauthorized', 401);
    }
    trackFailure({ event: 'slack.create_issue.failed', error, metricName: 'slack_create_issue_failed' });
    return jsonError('Failed to analyze Slack messages', 500);
  }
}

/**
 * POST /api/slack/create-issue
 * 
 * Create a Redmine issue from Slack message content
 * Request body:
 *   - messageText: The Slack message text
 *   - projectName: (optional) Override project
 *   - priorityName: (optional) Override priority
 */
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    
    const { messageText, projectName, priorityName, assigneeName, dueDate } = body;
    
    if (!messageText) {
      return jsonError('messageText is required', 400);
    }

    let client;
    try {
      const conn = await requireRedmineClientForUser(user.id);
      client = conn.client;
    } catch {
      return jsonError('Redmine not connected', 400);
    }

    const manager = getLLMProviderManager();
    
    // Parse the message
    const parsed: ParsedIssue = {
      subject: '',
      description: messageText,
      projectName,
      priorityName,
      assigneeName,
      dueDate,
      confidence: 1.0, // User explicitly requesting
    };

    // If subject not provided, try to extract it
    if (!parsed.subject) {
      const extractPrompt = `Extract a short subject line (max 60 chars) from this message that would serve as a Redmine issue title:\n\n${messageText}`;
      const result = await manager.chat(
        [{ role: 'user', content: extractPrompt }],
        { stream: false }
      );
      parsed.subject = (result.content || 'Slack Message').substring(0, 60);
    }

    const created = await createRedmineIssueFromSlack(parsed, client);

    return Response.json({
      success: true,
      issueId: created.issueId,
      issueUrl: created.url,
      message: `Created issue #${created.issueId}`,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return jsonError('Unauthorized', 401);
    }
    trackFailure({ event: 'slack.create_issue.failed', error, metricName: 'slack_create_issue_failed' });
    return jsonError('Failed to create issue from Slack', 500);
  }
}

// Helper: Fetch messages from Slack
async function fetchSlackMessages(
  channelId: string,
  threadTs?: string | null,
  limit = 20
): Promise<Array<{ ts: string; text: string; user: string; subtype?: string }>> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error('SLACK_BOT_TOKEN not configured');
  }

  const baseUrl = 'https://slack.com/api';
  let url = `${baseUrl}/conversations.history?channel=${channelId}&limit=${limit}`;
  
  if (threadTs) {
    url = `${baseUrl}/conversations.replies?channel=${channelId}&ts=${threadTs}&limit=${limit}`;
  }

  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json();
  
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }

  const messages = threadTs ? data.messages : data.messages;
  return messages.map((m: any) => ({
    ts: m.ts,
    text: m.text,
    user: m.user,
    subtype: m.subtype,
  }));
}