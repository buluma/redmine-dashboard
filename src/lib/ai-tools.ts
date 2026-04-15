import type { RedmineClient } from './redmine';
import { prisma } from './db';
import { logEvent } from './log';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** JSON-Schema-style parameter definition (subset used by OpenAI tools API). */
export interface ToolParameterProperty {
  type: string;
  description: string;
  enum?: string[];
}

/** A single tool definition in OpenAI function-calling format. */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, ToolParameterProperty>;
      required: string[];
    };
  };
}

/** A tool call returned by the LLM. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Result from executing a single tool call. */
export interface ToolResult {
  toolCallId: string;
  name: string;
  success: boolean;
  result: unknown;
  error?: string;
}

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

/** Whether a tool mutates state and therefore requires user confirmation. */
const mutatingTools = new Set([
  'update_status',
  'log_time',
  'add_comment',
  'close_issue',
  'update_issue',
]);

/**
 * Returns true when the given tool name requires explicit user confirmation
 * before execution.
 * @param {string} name - Tool function name.
 * @returns {boolean}
 */
export function requiresConfirmation(name: string): boolean {
  return mutatingTools.has(name);
}

// ---------------------------------------------------------------------------
// Tool definitions (OpenAI function-calling format)
// ---------------------------------------------------------------------------

export const toolDefinitions: ToolDefinition[] = [
  // --- Read-only tools ---------------------------------------------------
  {
    type: 'function',
    function: {
      name: 'get_issue',
      description:
        'Fetch full details of a Redmine issue by its Redmine issue ID. Returns subject, status, priority, assignee, due date, progress, and recent journals.',
      parameters: {
        type: 'object',
        properties: {
          issue_id: {
            type: 'number',
            description: 'The Redmine issue ID (e.g. 4521).',
          },
        },
        required: ['issue_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_issues',
      description:
        'Search local cached issues by keyword. Returns matching issues with their subject, status, priority, and assignee.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search keyword(s).',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return (default 10, max 25).',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_statuses',
      description:
        'List all available issue statuses in the Redmine instance. Returns id and name for each status.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_activities',
      description:
        'List all available time-entry activity types in the Redmine instance. Returns id and name for each activity.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },

  // --- Mutating tools (require confirmation) ------------------------------
  {
    type: 'function',
    function: {
      name: 'update_status',
      description:
        'Update the status of a Redmine issue. Requires the issue ID and the target status ID. Optionally include a note.',
      parameters: {
        type: 'object',
        properties: {
          issue_id: {
            type: 'number',
            description: 'The Redmine issue ID.',
          },
          status_id: {
            type: 'number',
            description: 'The target status ID (use list_statuses to find valid IDs).',
          },
          note: {
            type: 'string',
            description: 'Optional note to attach to the status change.',
          },
        },
        required: ['issue_id', 'status_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_time',
      description:
        'Log time spent on a Redmine issue. Requires issue ID, hours, and activity ID.',
      parameters: {
        type: 'object',
        properties: {
          issue_id: {
            type: 'number',
            description: 'The Redmine issue ID.',
          },
          hours: {
            type: 'number',
            description: 'Number of hours spent (e.g. 1.5).',
          },
          activity_id: {
            type: 'number',
            description: 'The activity type ID (use list_activities to find valid IDs).',
          },
          comment: {
            type: 'string',
            description: 'Optional comment describing the work done.',
          },
          spent_on: {
            type: 'string',
            description: 'Date the time was spent (YYYY-MM-DD). Defaults to today.',
          },
        },
        required: ['issue_id', 'hours', 'activity_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_comment',
      description: 'Add a journal note/comment to a Redmine issue.',
      parameters: {
        type: 'object',
        properties: {
          issue_id: {
            type: 'number',
            description: 'The Redmine issue ID.',
          },
          comment: {
            type: 'string',
            description: 'The comment text to post.',
          },
        },
        required: ['issue_id', 'comment'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'close_issue',
      description:
        'Close a Redmine issue by setting its status to the closed status. Optionally include a closing note.',
      parameters: {
        type: 'object',
        properties: {
          issue_id: {
            type: 'number',
            description: 'The Redmine issue ID.',
          },
          note: {
            type: 'string',
            description: 'Optional closing note.',
          },
        },
        required: ['issue_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_issue',
      description:
        'Update fields on a Redmine issue: due date, done ratio (% complete), or estimated hours.',
      parameters: {
        type: 'object',
        properties: {
          issue_id: {
            type: 'number',
            description: 'The Redmine issue ID.',
          },
          due_date: {
            type: 'string',
            description: 'New due date (YYYY-MM-DD).',
          },
          done_ratio: {
            type: 'number',
            description: 'Completion percentage (0-100).',
          },
          estimated_hours: {
            type: 'number',
            description: 'Estimated hours for the issue.',
          },
          note: {
            type: 'string',
            description: 'Optional note explaining the change.',
          },
        },
        required: ['issue_id'],
      },
    },
  },
];

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
    case 'update_status':
      return handleUpdateStatus(args, client);
    case 'log_time':
      return handleLogTime(args, client);
    case 'add_comment':
      return handleAddComment(args, client);
    case 'close_issue':
      return handleCloseIssue(args, client);
    case 'update_issue':
      return handleUpdateIssue(args, client);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Individual tool handlers
// ---------------------------------------------------------------------------

async function handleGetIssue(
  args: Record<string, unknown>,
  client: RedmineClient,
  userId: string,
) {
  const issueId = Number(args.issue_id);
  if (!Number.isInteger(issueId) || issueId <= 0) {
    throw new Error('issue_id must be a positive integer');
  }

  // Try local DB first for richer data
  const local = await prisma.issue.findFirst({
    where: { userId, redmineIssueId: issueId },
    include: {
      journals: { orderBy: { createdOnRemote: 'desc' }, take: 10 },
      timeEntries: { orderBy: { spentOn: 'desc' }, take: 5 },
    },
  });

  if (local) {
    return {
      issueId: local.redmineIssueId,
      subject: local.subject,
      status: local.statusName,
      priority: local.priority,
      assignedTo: local.assignedToName,
      dueDate: local.dueDate?.toISOString().slice(0, 10) ?? null,
      doneRatio: local.doneRatio,
      tracker: local.tracker,
      project: local.projectName,
      description: local.description?.slice(0, 2000) ?? null,
      updatedOn: local.updatedOnRemote.toISOString(),
      recentJournals: local.journals.slice(0, 5).map((j) => ({
        author: j.author,
        notes: j.notes?.slice(0, 500) ?? null,
        createdOn: j.createdOnRemote?.toISOString() ?? null,
      })),
      recentTimeEntries: local.timeEntries.slice(0, 5).map((t) => ({
        hours: t.hours,
        activity: t.activityName,
        author: t.authorName,
        spentOn: t.spentOn?.toISOString().slice(0, 10) ?? null,
      })),
    };
  }

  // Fallback to Redmine API
  const detail = await client.getIssue(issueId, ['journals']);
  const issue = detail.issue as Record<string, unknown>;
  return {
    issueId,
    subject: issue.subject,
    status: (issue.status as { name?: string })?.name ?? null,
    priority: (issue.priority as { name?: string })?.name ?? null,
    assignedTo: (issue.assigned_to as { name?: string })?.name ?? null,
    dueDate: issue.due_date ?? null,
    doneRatio: issue.done_ratio ?? null,
    tracker: (issue.tracker as { name?: string })?.name ?? null,
    project: (issue.project as { name?: string })?.name ?? null,
    description: typeof issue.description === 'string' ? issue.description.slice(0, 2000) : null,
    updatedOn: issue.updated_on ?? null,
  };
}

async function handleSearchIssues(
  args: Record<string, unknown>,
  userId: string,
) {
  const query = String(args.query ?? '');
  if (!query.trim()) {
    throw new Error('query is required');
  }
  const limit = Math.min(Math.max(1, Number(args.limit) || 10), 25);

  const issues = await prisma.issue.findMany({
    where: {
      userId,
      OR: [
        { subject: { contains: query } },
        { description: { contains: query } },
        { assignedToName: { contains: query } },
      ],
    },
    orderBy: { updatedOnRemote: 'desc' },
    take: limit,
    select: {
      redmineIssueId: true,
      subject: true,
      statusName: true,
      priority: true,
      assignedToName: true,
      dueDate: true,
      doneRatio: true,
      projectName: true,
    },
  });

  return {
    count: issues.length,
    issues: issues.map((i) => ({
      issueId: i.redmineIssueId,
      subject: i.subject,
      status: i.statusName,
      priority: i.priority,
      assignedTo: i.assignedToName,
      dueDate: i.dueDate?.toISOString().slice(0, 10) ?? null,
      doneRatio: i.doneRatio,
      project: i.projectName,
    })),
  };
}

async function handleListStatuses(client: RedmineClient) {
  const statuses = await client.getIssueStatuses();
  return {
    statuses: statuses.map((s) => ({
      id: s.id,
      name: s.name,
      isClosed: s.is_closed ?? false,
    })),
  };
}

async function handleListActivities(client: RedmineClient) {
  const activities = await client.getTimeEntryActivities();
  return {
    activities: activities.map((a) => ({
      id: a.id,
      name: a.name,
    })),
  };
}

async function handleUpdateStatus(
  args: Record<string, unknown>,
  client: RedmineClient,
) {
  const issueId = Number(args.issue_id);
  const statusId = Number(args.status_id);
  const note = typeof args.note === 'string' ? args.note : undefined;

  if (!Number.isInteger(issueId) || issueId <= 0) {
    throw new Error('issue_id must be a positive integer');
  }
  if (!Number.isInteger(statusId) || statusId <= 0) {
    throw new Error('status_id must be a positive integer');
  }

  await client.updateIssueStatus(issueId, statusId, note);
  return { issueId, statusId, note: note ?? null, updated: true };
}

async function handleLogTime(
  args: Record<string, unknown>,
  client: RedmineClient,
) {
  const issueId = Number(args.issue_id);
  const hours = Number(args.hours);
  const activityId = Number(args.activity_id);
  const comment = typeof args.comment === 'string' ? args.comment : undefined;
  const spentOn = typeof args.spent_on === 'string'
    ? args.spent_on
    : new Date().toISOString().slice(0, 10);

  if (!Number.isInteger(issueId) || issueId <= 0) {
    throw new Error('issue_id must be a positive integer');
  }
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    throw new Error('hours must be between 0 and 24');
  }
  if (!Number.isInteger(activityId) || activityId <= 0) {
    throw new Error('activity_id must be a positive integer');
  }

  const res = await client.addTimeEntry({
    issueId, hours, activityId, comments: comment, spentOn,
  });

  return {
    issueId,
    hours,
    activityId,
    spentOn,
    comment: comment ?? null,
    timeEntryId: res?.time_entry?.id ?? null,
    logged: true,
  };
}

async function handleAddComment(
  args: Record<string, unknown>,
  client: RedmineClient,
) {
  const issueId = Number(args.issue_id);
  const comment = String(args.comment ?? '');

  if (!Number.isInteger(issueId) || issueId <= 0) {
    throw new Error('issue_id must be a positive integer');
  }
  if (!comment.trim()) {
    throw new Error('comment is required');
  }

  await client.addComment(issueId, comment);
  return { issueId, comment, posted: true };
}

async function handleCloseIssue(
  args: Record<string, unknown>,
  client: RedmineClient,
) {
  const issueId = Number(args.issue_id);
  const note = typeof args.note === 'string' ? args.note : undefined;

  if (!Number.isInteger(issueId) || issueId <= 0) {
    throw new Error('issue_id must be a positive integer');
  }

  // Find the "Closed" status ID from the Redmine status catalog
  const statuses = await client.getIssueStatuses();
  const closedStatus = statuses.find(
    (s) => s.is_closed === true || s.name.toLowerCase() === 'closed',
  );

  if (!closedStatus) {
    throw new Error('Could not find a "Closed" status in Redmine. Use update_status with a specific status ID instead.');
  }

  await client.updateIssueStatus(issueId, closedStatus.id, note);
  return {
    issueId,
    statusId: closedStatus.id,
    statusName: closedStatus.name,
    note: note ?? null,
    closed: true,
  };
}

async function handleUpdateIssue(
  args: Record<string, unknown>,
  client: RedmineClient,
) {
  const issueId = Number(args.issue_id);
  if (!Number.isInteger(issueId) || issueId <= 0) {
    throw new Error('issue_id must be a positive integer');
  }

  const updates: Record<string, unknown> = {};
  if (typeof args.due_date === 'string') updates.dueDate = args.due_date;
  if (typeof args.done_ratio === 'number') updates.doneRatio = Math.min(100, Math.max(0, args.done_ratio));
  if (typeof args.estimated_hours === 'number') updates.estimatedHours = args.estimated_hours;
  if (typeof args.note === 'string') updates.notes = args.note;

  if (Object.keys(updates).length === 0) {
    throw new Error('At least one field (due_date, done_ratio, estimated_hours) must be provided');
  }

  await client.updateIssue(issueId, updates as {
    dueDate?: string;
    doneRatio?: number;
    estimatedHours?: number;
    notes?: string;
  });

  return { issueId, ...updates, updated: true };
}

// ---------------------------------------------------------------------------
// Helpers for converting tool definitions across LLM providers
// ---------------------------------------------------------------------------

/**
 * Convert OpenAI-format tool definitions to Anthropic format.
 * @param {ToolDefinition[]} tools - OpenAI-format tools.
 * @returns {Array<{name: string; description: string; input_schema: object}>}
 */
export function toAnthropicTools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

/**
 * Create a human-readable summary of a tool call for display in confirmation cards.
 * @param {ToolCall} call - The tool call to summarise.
 * @returns {string}
 */
export function summarizeToolCall(call: ToolCall): string {
  const args = call.arguments;
  switch (call.name) {
    case 'update_status':
      return `Update issue #${args.issue_id} to status ID ${args.status_id}${args.note ? ` with note: "${args.note}"` : ''}`;
    case 'log_time':
      return `Log ${args.hours}h on issue #${args.issue_id} (activity ${args.activity_id})${args.comment ? ` — "${args.comment}"` : ''}`;
    case 'add_comment':
      return `Add comment to issue #${args.issue_id}: "${String(args.comment ?? '').slice(0, 80)}${String(args.comment ?? '').length > 80 ? '…' : ''}"`;
    case 'close_issue':
      return `Close issue #${args.issue_id}${args.note ? ` with note: "${args.note}"` : ''}`;
    case 'update_issue': {
      const parts: string[] = [];
      if (args.due_date) parts.push(`due date → ${args.due_date}`);
      if (args.done_ratio !== undefined) parts.push(`progress → ${args.done_ratio}%`);
      if (args.estimated_hours !== undefined) parts.push(`estimate → ${args.estimated_hours}h`);
      return `Update issue #${args.issue_id}: ${parts.join(', ')}`;
    }
    case 'get_issue':
      return `Fetch details for issue #${args.issue_id}`;
    case 'search_issues':
      return `Search issues for "${args.query}"`;
    case 'list_statuses':
      return 'List available issue statuses';
    case 'list_activities':
      return 'List available time-entry activities';
    default:
      return `${call.name}(${JSON.stringify(args)})`;
  }
}
