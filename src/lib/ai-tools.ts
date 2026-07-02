import type { RedmineClient } from './redmine';
import { prisma } from './db';
import { logEvent } from './log';
import { getUserRole, type UserRole } from './rbac';
import { correlateWakaTime } from './correlation';

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
 * Minimum role required to invoke each tool. Tools not listed default to
 * VIEWER (read-only). Hierarchy: VIEWER < USER < EDITOR < ADMIN.
 *
 * Mutating tools start at USER because every employee with a Converge
 * account is at least a USER; EDITOR is reserved for tools that affect
 * issue lifecycle (close/update fields).
 */
const TOOL_ROLE_REQUIREMENTS: Record<string, UserRole> = {
  // Read-only — VIEWER is the floor.
  get_issue: 'VIEWER',
  search_issues: 'VIEWER',
  list_statuses: 'VIEWER',
  list_activities: 'VIEWER',
  get_time_summary: 'VIEWER',
  // Routine mutations any user can perform.
  log_time: 'USER',
  add_comment: 'USER',
  update_status: 'USER',
  // Lifecycle-level changes.
  close_issue: 'EDITOR',
  update_issue: 'EDITOR',
};

const ROLE_HIERARCHY: UserRole[] = ['VIEWER', 'USER', 'EDITOR', 'ADMIN'];

/**
 * Returns true when the given tool name requires explicit user confirmation
 * before execution.
 * @param {string} name - Tool function name.
 * @returns {boolean}
 */
export function requiresConfirmation(name: string): boolean {
  return mutatingTools.has(name);
}

/**
 * Minimum role required to invoke a tool. Unknown tools default to ADMIN
 * (fail closed) so a future tool added without a role entry cannot be
 * called by lower-privileged users.
 */
export function getRequiredRole(name: string): UserRole {
  return TOOL_ROLE_REQUIREMENTS[name] ?? 'ADMIN';
}

function roleAtLeast(actual: UserRole, required: UserRole): boolean {
  return ROLE_HIERARCHY.indexOf(actual) >= ROLE_HIERARCHY.indexOf(required);
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
        'Fetch full details of a ticket by ID. Accepts a Redmine issue ID (e.g. 4521) or a local/personal ticket reference (e.g. "L-5"). Returns subject, status, priority, assignee, due date, progress, and recent journals.',
      parameters: {
        type: 'object',
        properties: {
          issue_id: {
            type: 'string',
            description: 'The Redmine issue ID (e.g. "4521") or local ticket reference (e.g. "L-5").',
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
  {
    type: 'function',
    function: {
      name: 'get_time_summary',
      description:
        'Summarize WakaTime-tracked coding hours for a date range: total hours, hours per ticket, and time on projects not yet linked to any ticket. Use for questions like "how many hours this week" or "what did I work on".',
      parameters: {
        type: 'object',
        properties: {
          start: {
            type: 'string',
            description: 'Range start date (YYYY-MM-DD). Defaults to 7 days ago.',
          },
          end: {
            type: 'string',
            description: 'Range end date (YYYY-MM-DD). Defaults to today.',
          },
        },
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
            type: 'string',
            description: 'The Redmine issue ID (e.g. "4521") or local ticket reference (e.g. "L-5").',
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
            type: 'string',
            description: 'The Redmine issue ID (e.g. "4521") or local ticket reference (e.g. "L-5").',
          },
          hours: {
            type: 'number',
            description: 'Number of hours spent (e.g. 1.5).',
          },
          activity_id: {
            type: 'number',
            description: 'The activity type ID (use list_activities to find valid IDs). Required for Redmine issues; optional for local tickets (defaults to Development).',
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
        required: ['issue_id', 'hours'],
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
            type: 'string',
            description: 'The Redmine issue ID (e.g. "4521") or local ticket reference (e.g. "L-5").',
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
            type: 'string',
            description: 'The Redmine issue ID (e.g. "4521") or local ticket reference (e.g. "L-5").',
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
            type: 'string',
            description: 'The Redmine issue ID (e.g. "4521") or local ticket reference (e.g. "L-5").',
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

// ---------------------------------------------------------------------------
// Ticket reference resolution (Redmine #ID vs local L-N)
// ---------------------------------------------------------------------------

type IssueRef =
  | { kind: 'redmine'; id: number }
  | { kind: 'local'; n: number };

/** Parse "4521", 4521, "L-5", "l5" into a typed ticket reference. */
function parseIssueRef(raw: unknown): IssueRef {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) {
    return { kind: 'redmine', id: raw };
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    const localMatch = trimmed.match(/^[Ll]-?(\d+)$/);
    if (localMatch) {
      return { kind: 'local', n: parseInt(localMatch[1], 10) };
    }
    if (/^#?\d+$/.test(trimmed)) {
      const id = parseInt(trimmed.replace('#', ''), 10);
      if (id > 0) return { kind: 'redmine', id };
    }
  }
  throw new Error('issue_id must be a Redmine issue ID (e.g. 4521) or a local ticket reference (e.g. "L-5")');
}

/** Fetch the local DB row for an L-N reference; throws when it does not exist. */
async function requireLocalIssue(ref: { n: number }, userId: string) {
  const issue = await prisma.issue.findFirst({
    where: { userId, source: 'local', localIssueNumber: ref.n },
  });
  if (!issue) {
    throw new Error(`Local ticket L-${ref.n} not found`);
  }
  return issue;
}

/**
 * Append a journal entry to a local ticket, mirroring the conventions used
 * by the external API's PATCH handler (sequential redmineJournalId).
 */
async function writeLocalJournal(
  issueId: string,
  notes: string | null,
  details?: Array<{ property: string; name: string; old_value: string; new_value: string }>,
) {
  const maxJ = await prisma.issueJournal.aggregate({
    where: { issueId },
    _max: { redmineJournalId: true },
  });
  await prisma.issueJournal.create({
    data: {
      issueId,
      redmineJournalId: (maxJ._max.redmineJournalId ?? 0) + 1,
      author: 'AI',
      notes,
      detailsJson: details && details.length > 0 ? details : undefined,
      createdOnRemote: new Date(),
    },
  });
}

/** Data common to every local-ticket mutation. */
function localTouch() {
  const now = new Date();
  return { updatedOnRemote: now, lastActivityAt: now, lastActivityType: 'local_update' };
}

// ---------------------------------------------------------------------------
// Individual tool handlers
// ---------------------------------------------------------------------------

async function handleGetIssue(
  args: Record<string, unknown>,
  client: RedmineClient,
  userId: string,
) {
  const ref = parseIssueRef(args.issue_id);

  if (ref.kind === 'local') {
    const localTicket = await prisma.issue.findFirst({
      where: { userId, source: 'local', localIssueNumber: ref.n },
      include: {
        journals: { orderBy: { createdOnRemote: 'desc' }, take: 10 },
        timeEntries: { orderBy: { spentOn: 'desc' }, take: 5 },
      },
    });
    if (!localTicket) {
      throw new Error(`Local ticket L-${ref.n} not found`);
    }
    return {
      ref: `L-${ref.n}`,
      subject: localTicket.subject,
      status: localTicket.statusName,
      priority: localTicket.priority,
      assignedTo: localTicket.assignedToName,
      dueDate: localTicket.dueDate?.toISOString().slice(0, 10) ?? null,
      doneRatio: localTicket.doneRatio,
      tracker: localTicket.tracker,
      project: localTicket.projectName,
      spentHours: localTicket.spentHours,
      description: localTicket.description?.slice(0, 2000) ?? null,
      updatedOn: localTicket.updatedOnRemote.toISOString(),
      recentJournals: localTicket.journals.slice(0, 5).map((j) => ({
        author: j.author,
        notes: j.notes?.slice(0, 500) ?? null,
        createdOn: j.createdOnRemote?.toISOString() ?? null,
      })),
      recentTimeEntries: localTicket.timeEntries.slice(0, 5).map((t) => ({
        hours: t.hours,
        activity: t.activityName,
        author: t.authorName,
        spentOn: t.spentOn?.toISOString().slice(0, 10) ?? null,
      })),
    };
  }

  const issueId = ref.id;

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
      localIssueNumber: true,
      source: true,
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
      ref: i.redmineIssueId != null ? `#${i.redmineIssueId}` : i.localIssueNumber != null ? `L-${i.localIssueNumber}` : null,
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function secondsToHours(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100;
}

async function handleGetTimeSummary(
  args: Record<string, unknown>,
  userId: string,
) {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const start = typeof args.start === 'string' && args.start ? args.start : weekAgo;
  const end = typeof args.end === 'string' && args.end ? args.end : today;

  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    throw new Error('start and end must be YYYY-MM-DD dates');
  }

  const { matched, unmatched } = await correlateWakaTime(userId, { start, end });

  const perTicket = matched
    .map((m) => ({
      ref: m.localIssueNumber != null ? `L-${m.localIssueNumber}` : null,
      subject: m.subject,
      repo: m.repo,
      hours: secondsToHours(m.totalSeconds),
    }))
    .sort((a, b) => b.hours - a.hours);

  const unmatchedProjects = [...unmatched]
    .sort((a, b) => b.totalSeconds - a.totalSeconds)
    .slice(0, 5)
    .map((u) => ({ project: u.project, hours: secondsToHours(u.totalSeconds) }));

  return {
    start,
    end,
    totalTrackedHours: secondsToHours(matched.reduce((s, m) => s + m.totalSeconds, 0)),
    perTicket,
    unmatchedHours: secondsToHours(unmatched.reduce((s, u) => s + u.totalSeconds, 0)),
    unmatchedProjects,
    note: 'Hours come from WakaTime coding activity correlated to tickets via linked GitHub repos. Unmatched projects have no ticket link yet.',
  };
}

async function handleUpdateStatus(
  args: Record<string, unknown>,
  client: RedmineClient,
  userId: string,
) {
  const ref = parseIssueRef(args.issue_id);
  const statusId = Number(args.status_id);
  const note = typeof args.note === 'string' ? args.note : undefined;

  if (!Number.isInteger(statusId) || statusId <= 0) {
    throw new Error('status_id must be a positive integer');
  }

  if (ref.kind === 'local') {
    const issue = await requireLocalIssue(ref, userId);
    const catalog = await prisma.statusCatalog.findMany();
    const status = catalog.find((s) => s.id === statusId);
    if (!status) {
      throw new Error(`Unknown status_id ${statusId} (use list_statuses)`);
    }
    await prisma.issue.update({
      where: { id: issue.id },
      data: { statusId: status.id, statusName: status.name, ...localTouch() },
    });
    await writeLocalJournal(issue.id, note ?? null, [
      { property: 'attr', name: 'status', old_value: issue.statusName, new_value: status.name },
    ]);
    return { ref: `L-${ref.n}`, statusId: status.id, statusName: status.name, note: note ?? null, updated: true };
  }

  await client.updateIssueStatus(ref.id, statusId, note);
  return { issueId: ref.id, statusId, note: note ?? null, updated: true };
}

async function handleLogTime(
  args: Record<string, unknown>,
  client: RedmineClient,
  userId: string,
) {
  const ref = parseIssueRef(args.issue_id);
  const hours = Number(args.hours);
  const comment = typeof args.comment === 'string' ? args.comment : undefined;
  const spentOn = typeof args.spent_on === 'string'
    ? args.spent_on
    : new Date().toISOString().slice(0, 10);

  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    throw new Error('hours must be between 0 and 24');
  }

  if (ref.kind === 'local') {
    const issue = await requireLocalIssue(ref, userId);
    const activityId = args.activity_id != null ? Number(args.activity_id) : 9;
    await prisma.timeEntry.create({
      data: {
        issueId: issue.id,
        userId,
        hours,
        spentOn: new Date(spentOn),
        activityId,
        activityName: 'Development',
        comments: comment ?? null,
      },
    });
    await prisma.issue.update({
      where: { id: issue.id },
      data: { spentHours: { increment: hours }, ...localTouch() },
    });
    return { ref: `L-${ref.n}`, hours, spentOn, comment: comment ?? null, logged: true };
  }

  const activityId = Number(args.activity_id);
  if (!Number.isInteger(activityId) || activityId <= 0) {
    throw new Error('activity_id must be a positive integer');
  }

  const res = await client.addTimeEntry({
    issueId: ref.id, hours, activityId, comments: comment, spentOn,
  });

  return {
    issueId: ref.id,
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
  userId: string,
) {
  const ref = parseIssueRef(args.issue_id);
  const comment = String(args.comment ?? '');

  if (!comment.trim()) {
    throw new Error('comment is required');
  }

  if (ref.kind === 'local') {
    const issue = await requireLocalIssue(ref, userId);
    await writeLocalJournal(issue.id, comment);
    await prisma.issue.update({ where: { id: issue.id }, data: localTouch() });
    return { ref: `L-${ref.n}`, comment, posted: true };
  }

  await client.addComment(ref.id, comment);
  return { issueId: ref.id, comment, posted: true };
}

async function handleCloseIssue(
  args: Record<string, unknown>,
  client: RedmineClient,
  userId: string,
) {
  const ref = parseIssueRef(args.issue_id);
  const note = typeof args.note === 'string' ? args.note : undefined;

  if (ref.kind === 'local') {
    const issue = await requireLocalIssue(ref, userId);
    const catalog = await prisma.statusCatalog.findMany();
    const closed = catalog.find((s) => s.name.toLowerCase() === 'closed') ?? catalog.find((s) => s.isClosed);
    if (!closed) {
      throw new Error('No closed status found in the status catalog. Use update_status with a specific status ID instead.');
    }
    await prisma.issue.update({
      where: { id: issue.id },
      data: { statusId: closed.id, statusName: closed.name, ...localTouch() },
    });
    await writeLocalJournal(issue.id, note ?? null, [
      { property: 'attr', name: 'status', old_value: issue.statusName, new_value: closed.name },
    ]);
    return { ref: `L-${ref.n}`, statusId: closed.id, statusName: closed.name, note: note ?? null, closed: true };
  }

  const issueId = ref.id;

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
  userId: string,
) {
  const ref = parseIssueRef(args.issue_id);

  const updates: Record<string, unknown> = {};
  if (typeof args.due_date === 'string') updates.dueDate = args.due_date;
  if (typeof args.done_ratio === 'number') updates.doneRatio = Math.min(100, Math.max(0, args.done_ratio));
  if (typeof args.estimated_hours === 'number') updates.estimatedHours = args.estimated_hours;
  if (typeof args.note === 'string') updates.notes = args.note;

  if (Object.keys(updates).length === 0) {
    throw new Error('At least one field (due_date, done_ratio, estimated_hours) must be provided');
  }

  if (ref.kind === 'local') {
    const issue = await requireLocalIssue(ref, userId);
    const data: Record<string, unknown> = { ...localTouch() };
    if (typeof updates.dueDate === 'string') data.dueDate = new Date(updates.dueDate);
    if (typeof updates.doneRatio === 'number') data.doneRatio = updates.doneRatio;
    if (typeof updates.estimatedHours === 'number') data.estimatedHours = updates.estimatedHours;
    await prisma.issue.update({ where: { id: issue.id }, data });
    if (typeof updates.notes === 'string') {
      await writeLocalJournal(issue.id, updates.notes);
    }
    return { ref: `L-${ref.n}`, ...updates, updated: true };
  }

  await client.updateIssue(ref.id, updates as {
    dueDate?: string;
    doneRatio?: number;
    estimatedHours?: number;
    notes?: string;
  });

  return { issueId: ref.id, ...updates, updated: true };
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
/** Human-readable ticket reference: 42 → "#42", "L-5" → "L-5". */
function fmtRef(value: unknown): string {
  if (typeof value === 'string' && /^[Ll]-?\d+$/.test(value.trim())) {
    return `L-${value.trim().replace(/^[Ll]-?/, '')}`;
  }
  return `#${value}`;
}

export function summarizeToolCall(call: ToolCall): string {
  const args = call.arguments;
  switch (call.name) {
    case 'update_status':
      return `Update issue ${fmtRef(args.issue_id)} to status ID ${args.status_id}${args.note ? ` with note: "${args.note}"` : ''}`;
    case 'log_time':
      return `Log ${args.hours}h on issue ${fmtRef(args.issue_id)}${args.activity_id ? ` (activity ${args.activity_id})` : ''}${args.comment ? ` — "${args.comment}"` : ''}`;
    case 'add_comment':
      return `Add comment to issue ${fmtRef(args.issue_id)}: "${String(args.comment ?? '').slice(0, 80)}${String(args.comment ?? '').length > 80 ? '…' : ''}"`;
    case 'close_issue':
      return `Close issue ${fmtRef(args.issue_id)}${args.note ? ` with note: "${args.note}"` : ''}`;
    case 'update_issue': {
      const parts: string[] = [];
      if (args.due_date) parts.push(`due date → ${args.due_date}`);
      if (args.done_ratio !== undefined) parts.push(`progress → ${args.done_ratio}%`);
      if (args.estimated_hours !== undefined) parts.push(`estimate → ${args.estimated_hours}h`);
      return `Update issue ${fmtRef(args.issue_id)}: ${parts.join(', ')}`;
    }
    case 'get_issue':
      return `Fetch details for issue ${fmtRef(args.issue_id)}`;
    case 'search_issues':
      return `Search issues for "${args.query}"`;
    case 'list_statuses':
      return 'List available issue statuses';
    case 'list_activities':
      return 'List available time-entry activities';
    case 'get_time_summary':
      return `Summarize tracked time${args.start || args.end ? ` (${args.start ?? '…'} → ${args.end ?? 'today'})` : ''}`;
    default:
      return `${call.name}(${JSON.stringify(args)})`;
  }
}
