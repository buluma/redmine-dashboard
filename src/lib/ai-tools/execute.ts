import type { RedmineClient } from '@/src/lib/redmine';
import { logEvent } from '@/src/lib/log';
import { getUserRole } from '@/src/lib/rbac';
import { getRequiredRole, roleAtLeast } from '@/src/lib/ai-tools/permissions';
import {
  handleGetIssue,
  handleGetTimeSummary,
  handleListActivities,
  handleListStatuses,
  handleSearchIssues,
} from '@/src/lib/ai-tools/read-handlers';
import {
  handleAddComment,
  handleCloseIssue,
  handleLogTime,
  handleUpdateIssue,
  handleUpdateStatus,
} from '@/src/lib/ai-tools/write-handlers';
import type { ToolCall, ToolResult } from '@/src/lib/ai-tools/types';

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

/**
 * Execute a single tool call against the Redmine API.
 * @param {ToolCall} call - The validated tool call.
 * @param {RedmineClient} client - Authenticated Redmine client.
 * @param {string} userId - Dashboard user ID (for DB queries).
 * @returns {Promise<ToolResult>}
 */
export async function executeTool(
  call: ToolCall,
  client: RedmineClient,
  userId: string,
): Promise<ToolResult> {
  const base = { toolCallId: call.id, name: call.name };

  try {
    const required = getRequiredRole(call.name);
    const actual = await getUserRole(userId);
    if (!roleAtLeast(actual, required)) {
      const message = `Insufficient role for tool ${call.name}: requires ${required}, user has ${actual}`;
      logEvent(
        'ai.tool.role_denied',
        { tool: call.name, requiredRole: required, actualRole: actual, userId },
        'warn',
      );
      return { ...base, success: false, result: null, error: message };
    }

    const result = await runTool(call.name, call.arguments, client, userId);
    logEvent('ai.tool.executed', { tool: call.name, success: true }, 'info');
    return { ...base, success: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tool execution failed';
    logEvent('ai.tool.failed', { tool: call.name, error: message }, 'error');
    return { ...base, success: false, result: null, error: message };
  }
}

/**
 * Internal dispatcher that routes a tool call to the correct handler.
 */
async function runTool(
  name: string,
  args: Record<string, unknown>,
  client: RedmineClient,
  userId: string,
): Promise<unknown> {
  switch (name) {
    case 'get_issue':
      return handleGetIssue(args, client, userId);
    case 'search_issues':
      return handleSearchIssues(args, userId);
    case 'list_statuses':
      return handleListStatuses(client);
    case 'list_activities':
      return handleListActivities(client);
    case 'get_time_summary':
      return handleGetTimeSummary(args, userId);
    case 'update_status':
      return handleUpdateStatus(args, client, userId);
    case 'log_time':
      return handleLogTime(args, client, userId);
    case 'add_comment':
      return handleAddComment(args, client, userId);
    case 'close_issue':
      return handleCloseIssue(args, client, userId);
    case 'update_issue':
      return handleUpdateIssue(args, client, userId);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
