import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  requiresConfirmation,
  executeTool,
  toAnthropicTools,
  summarizeToolCall,
  toolDefinitions,
  type ToolCall,
} from '../ai-tools';

// ── Mocks ─────────────────────────────────────────────────────────────────

const {
  mockLogEvent,
  mockIssueFindFirst,
  mockIssueFindMany,
  mockIssueUpdate,
  mockUserFindUnique,
  mockStatusCatalogFindMany,
  mockJournalCreate,
  mockJournalAggregate,
  mockTimeEntryCreate,
  mockCorrelateWakaTime,
} = vi.hoisted(() => ({
  mockLogEvent: vi.fn(),
  mockIssueFindFirst: vi.fn(),
  mockIssueFindMany: vi.fn(),
  mockIssueUpdate: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockStatusCatalogFindMany: vi.fn(),
  mockJournalCreate: vi.fn(),
  mockJournalAggregate: vi.fn(),
  mockTimeEntryCreate: vi.fn(),
  mockCorrelateWakaTime: vi.fn(),
}));

vi.mock('@/src/lib/log', () => ({ logEvent: mockLogEvent }));

vi.mock('@/src/lib/correlation', () => ({
  correlateWakaTime: mockCorrelateWakaTime,
}));

vi.mock('@/src/lib/db', () => ({
  prisma: {
    issue: {
      findFirst: mockIssueFindFirst,
      findMany: mockIssueFindMany,
      update: mockIssueUpdate,
    },
    user: {
      findUnique: mockUserFindUnique,
    },
    statusCatalog: {
      findMany: mockStatusCatalogFindMany,
    },
    issueJournal: {
      create: mockJournalCreate,
      aggregate: mockJournalAggregate,
    },
    timeEntry: {
      create: mockTimeEntryCreate,
    },
  },
}));

// ── Shared test fixtures ──────────────────────────────────────────────────

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    getIssue: vi.fn().mockResolvedValue({
      issue: {
        subject: 'Remote Issue',
        status: { name: 'New' },
        priority: { name: 'Normal' },
        assigned_to: { name: 'Alice' },
        due_date: '2026-06-01',
        done_ratio: 0,
        tracker: { name: 'Bug' },
        project: { name: 'Test Project' },
        description: 'Remote description',
        updated_on: '2026-05-01T00:00:00Z',
      },
    }),
    getIssueStatuses: vi.fn().mockResolvedValue([
      { id: 1, name: 'New', is_closed: false },
      { id: 5, name: 'Closed', is_closed: true },
    ]),
    getTimeEntryActivities: vi.fn().mockResolvedValue([
      { id: 9, name: 'Development' },
      { id: 10, name: 'Testing' },
    ]),
    updateIssueStatus: vi.fn().mockResolvedValue(undefined),
    addTimeEntry: vi.fn().mockResolvedValue({ time_entry: { id: 42 } }),
    addComment: vi.fn().mockResolvedValue(undefined),
    updateIssue: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeCall(name: string, args: Record<string, unknown> = {}, id = 'call_1'): ToolCall {
  return { id, name, arguments: args };
}

const USER_ID = 'user_abc';

// ── requiresConfirmation ──────────────────────────────────────────────────

describe('requiresConfirmation', () => {
  it.each(['update_status', 'log_time', 'add_comment', 'close_issue', 'update_issue'])(
    'returns true for mutating tool %s',
    (name) => {
      expect(requiresConfirmation(name)).toBe(true);
    },
  );

  it.each(['get_issue', 'search_issues', 'list_statuses', 'list_activities'])(
    'returns false for read-only tool %s',
    (name) => {
      expect(requiresConfirmation(name)).toBe(false);
    },
  );

  it('returns false for unknown tool names', () => {
    expect(requiresConfirmation('nonexistent_tool')).toBe(false);
  });
});

// ── toolDefinitions ───────────────────────────────────────────────────────

describe('toolDefinitions', () => {
  it('exports 10 tool definitions', () => {
    expect(toolDefinitions).toHaveLength(10);
  });

  it('all definitions are type function', () => {
    toolDefinitions.forEach((t) => expect(t.type).toBe('function'));
  });

  it('all definitions have name, description, and parameters', () => {
    toolDefinitions.forEach((t) => {
      expect(t.function.name).toBeTruthy();
      expect(t.function.description).toBeTruthy();
      expect(t.function.parameters.type).toBe('object');
    });
  });
});

// ── executeTool ───────────────────────────────────────────────────────────

describe('executeTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIssueFindFirst.mockResolvedValue(null);
    mockIssueFindMany.mockResolvedValue([]);
    // Default: ADMIN — allows every tool. Individual RBAC tests override.
    mockUserFindUnique.mockResolvedValue({ id: USER_ID, role: 'ADMIN' });
  });

  it('returns success result for a valid read-only tool', async () => {
    const client = makeClient();
    const call = makeCall('list_statuses');

    const result = await executeTool(call, client as any, USER_ID);

    expect(result.success).toBe(true);
    expect(result.toolCallId).toBe('call_1');
    expect(result.name).toBe('list_statuses');
    expect(result.result).toEqual({ statuses: [{ id: 1, name: 'New', isClosed: false }, { id: 5, name: 'Closed', isClosed: true }] });
    expect(mockLogEvent).toHaveBeenCalledWith('ai.tool.executed', { tool: 'list_statuses', success: true }, 'info');
  });

  it('returns failure result and logs error for unknown tool', async () => {
    const client = makeClient();
    const call = makeCall('does_not_exist');

    const result = await executeTool(call, client as any, USER_ID);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unknown tool: does_not_exist');
    expect(result.result).toBeNull();
    expect(mockLogEvent).toHaveBeenCalledWith('ai.tool.failed', { tool: 'does_not_exist', error: 'Unknown tool: does_not_exist' }, 'error');
  });

  it('returns failure result when handler throws', async () => {
    const client = makeClient({
      getIssueStatuses: vi.fn().mockRejectedValue(new Error('Network error')),
    });
    const call = makeCall('list_statuses');

    const result = await executeTool(call, client as any, USER_ID);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
  });

  it('handles non-Error throws gracefully', async () => {
    const client = makeClient({
      getIssueStatuses: vi.fn().mockRejectedValue('string error'),
    });

    const result = await executeTool(makeCall('list_statuses'), client as any, USER_ID);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Tool execution failed');
  });
});

// ── get_issue ─────────────────────────────────────────────────────────────

describe('get_issue handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns local DB data when issue found in cache', async () => {
    const localIssue = {
      redmineIssueId: 100,
      subject: 'Local Issue',
      statusName: 'In Progress',
      priority: 'High',
      assignedToName: 'Bob',
      dueDate: new Date('2026-07-01'),
      doneRatio: 50,
      tracker: 'Feature',
      projectName: 'Converge',
      description: 'Local desc',
      updatedOnRemote: new Date('2026-05-10'),
      journals: [{ author: 'Bob', notes: 'Fixed it', createdOnRemote: new Date('2026-05-09') }],
      timeEntries: [{ hours: 2.5, activityName: 'Dev', authorName: 'Bob', spentOn: new Date('2026-05-08') }],
    };
    mockIssueFindFirst.mockResolvedValue(localIssue);
    const client = makeClient();
    const call = makeCall('get_issue', { issue_id: 100 });

    const result = await executeTool(call, client as any, USER_ID);

    expect(result.success).toBe(true);
    const data = result.result as any;
    expect(data.subject).toBe('Local Issue');
    expect(data.status).toBe('In Progress');
    expect(client.getIssue).not.toHaveBeenCalled();
  });

  it('falls back to Redmine API when not in local cache', async () => {
    mockIssueFindFirst.mockResolvedValue(null);
    const client = makeClient();
    const call = makeCall('get_issue', { issue_id: 42 });

    const result = await executeTool(call, client as any, USER_ID);

    expect(result.success).toBe(true);
    expect(client.getIssue).toHaveBeenCalledWith(42, ['journals']);
    const data = result.result as any;
    expect(data.subject).toBe('Remote Issue');
  });

  it('rejects non-integer issue_id', async () => {
    const client = makeClient();
    const result = await executeTool(makeCall('get_issue', { issue_id: 1.5 }), client as any, USER_ID);
    expect(result.success).toBe(false);
    expect(result.error).toContain('issue_id must be a Redmine issue ID');
  });

  it('rejects zero issue_id', async () => {
    const client = makeClient();
    const result = await executeTool(makeCall('get_issue', { issue_id: 0 }), client as any, USER_ID);
    expect(result.success).toBe(false);
  });

  it('rejects negative issue_id', async () => {
    const client = makeClient();
    const result = await executeTool(makeCall('get_issue', { issue_id: -5 }), client as any, USER_ID);
    expect(result.success).toBe(false);
  });
});

// ── search_issues ─────────────────────────────────────────────────────────

describe('search_issues handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIssueFindMany.mockResolvedValue([]);
  });

  it('returns matching issues', async () => {
    mockIssueFindMany.mockResolvedValue([
      {
        redmineIssueId: 10,
        subject: 'Login bug',
        statusName: 'New',
        priority: 'High',
        assignedToName: 'Alice',
        dueDate: null,
        doneRatio: 0,
        projectName: 'Converge',
      },
    ]);
    const client = makeClient();

    const result = await executeTool(makeCall('search_issues', { query: 'login' }), client as any, USER_ID);

    expect(result.success).toBe(true);
    const data = result.result as any;
    expect(data.count).toBe(1);
    expect(data.issues[0].subject).toBe('Login bug');
  });

  it('rejects empty query', async () => {
    const client = makeClient();
    const result = await executeTool(makeCall('search_issues', { query: '   ' }), client as any, USER_ID);
    expect(result.success).toBe(false);
    expect(result.error).toContain('query is required');
  });

  it('clamps limit to 25', async () => {
    const client = makeClient();
    await executeTool(makeCall('search_issues', { query: 'bug', limit: 999 }), client as any, USER_ID);
    expect(mockIssueFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 25 }));
  });

  it('uses default limit 10 when not provided', async () => {
    const client = makeClient();
    await executeTool(makeCall('search_issues', { query: 'bug' }), client as any, USER_ID);
    expect(mockIssueFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
  });
});

// ── list_statuses ─────────────────────────────────────────────────────────

describe('list_statuses handler', () => {
  it('returns statuses from Redmine client', async () => {
    const client = makeClient();
    const result = await executeTool(makeCall('list_statuses'), client as any, USER_ID);

    expect(result.success).toBe(true);
    const data = result.result as any;
    expect(data.statuses).toHaveLength(2);
    expect(data.statuses[0]).toEqual({ id: 1, name: 'New', isClosed: false });
  });
});

// ── list_activities ───────────────────────────────────────────────────────

describe('list_activities handler', () => {
  it('returns activities from Redmine client', async () => {
    const client = makeClient();
    const result = await executeTool(makeCall('list_activities'), client as any, USER_ID);

    expect(result.success).toBe(true);
    const data = result.result as any;
    expect(data.activities).toHaveLength(2);
    expect(data.activities[0]).toEqual({ id: 9, name: 'Development' });
  });
});

// ── update_status ─────────────────────────────────────────────────────────

describe('update_status handler', () => {
  it('calls client.updateIssueStatus with correct args', async () => {
    const client = makeClient();
    const result = await executeTool(
      makeCall('update_status', { issue_id: 10, status_id: 3, note: 'In review' }),
      client as any,
      USER_ID,
    );

    expect(result.success).toBe(true);
    expect(client.updateIssueStatus).toHaveBeenCalledWith(10, 3, 'In review');
    const data = result.result as any;
    expect(data.updated).toBe(true);
    expect(data.note).toBe('In review');
  });

  it('rejects invalid issue_id', async () => {
    const client = makeClient();
    const result = await executeTool(
      makeCall('update_status', { issue_id: 0, status_id: 3 }),
      client as any,
      USER_ID,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('issue_id must be a Redmine issue ID');
  });

  it('rejects invalid status_id', async () => {
    const client = makeClient();
    const result = await executeTool(
      makeCall('update_status', { issue_id: 10, status_id: -1 }),
      client as any,
      USER_ID,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('status_id must be a positive integer');
  });
});

// ── log_time ──────────────────────────────────────────────────────────────

describe('log_time handler', () => {
  it('logs time and returns time entry id', async () => {
    const client = makeClient();
    const result = await executeTool(
      makeCall('log_time', { issue_id: 5, hours: 2.5, activity_id: 9, comment: 'Debugging', spent_on: '2026-05-15' }),
      client as any,
      USER_ID,
    );

    expect(result.success).toBe(true);
    expect(client.addTimeEntry).toHaveBeenCalledWith({
      issueId: 5, hours: 2.5, activityId: 9, comments: 'Debugging', spentOn: '2026-05-15',
    });
    const data = result.result as any;
    expect(data.timeEntryId).toBe(42);
    expect(data.logged).toBe(true);
  });

  it('uses today as default spent_on', async () => {
    const client = makeClient();
    await executeTool(
      makeCall('log_time', { issue_id: 5, hours: 1, activity_id: 9 }),
      client as any,
      USER_ID,
    );
    const callArg = (client.addTimeEntry as any).mock.calls[0][0];
    expect(callArg.spentOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rejects hours > 24', async () => {
    const client = makeClient();
    const result = await executeTool(
      makeCall('log_time', { issue_id: 5, hours: 25, activity_id: 9 }),
      client as any,
      USER_ID,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('hours must be between 0 and 24');
  });

  it('rejects hours <= 0', async () => {
    const client = makeClient();
    const result = await executeTool(
      makeCall('log_time', { issue_id: 5, hours: 0, activity_id: 9 }),
      client as any,
      USER_ID,
    );
    expect(result.success).toBe(false);
  });
});

// ── add_comment ───────────────────────────────────────────────────────────

describe('add_comment handler', () => {
  it('posts comment and returns confirmation', async () => {
    const client = makeClient();
    const result = await executeTool(
      makeCall('add_comment', { issue_id: 7, comment: 'Fixed in PR #88' }),
      client as any,
      USER_ID,
    );

    expect(result.success).toBe(true);
    expect(client.addComment).toHaveBeenCalledWith(7, 'Fixed in PR #88');
    const data = result.result as any;
    expect(data.posted).toBe(true);
  });

  it('rejects empty comment', async () => {
    const client = makeClient();
    const result = await executeTool(
      makeCall('add_comment', { issue_id: 7, comment: '   ' }),
      client as any,
      USER_ID,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('comment is required');
  });
});

// ── close_issue ───────────────────────────────────────────────────────────

describe('close_issue handler', () => {
  it('finds closed status and calls updateIssueStatus', async () => {
    const client = makeClient();
    const result = await executeTool(
      makeCall('close_issue', { issue_id: 3 }),
      client as any,
      USER_ID,
    );

    expect(result.success).toBe(true);
    expect(client.updateIssueStatus).toHaveBeenCalledWith(3, 5, undefined);
    const data = result.result as any;
    expect(data.closed).toBe(true);
    expect(data.statusName).toBe('Closed');
  });

  it('passes optional note to updateIssueStatus', async () => {
    const client = makeClient();
    await executeTool(
      makeCall('close_issue', { issue_id: 3, note: 'Done!' }),
      client as any,
      USER_ID,
    );
    expect(client.updateIssueStatus).toHaveBeenCalledWith(3, 5, 'Done!');
  });

  it('throws when no closed status found in catalog', async () => {
    const client = makeClient({
      getIssueStatuses: vi.fn().mockResolvedValue([{ id: 1, name: 'New', is_closed: false }]),
    });
    const result = await executeTool(
      makeCall('close_issue', { issue_id: 3 }),
      client as any,
      USER_ID,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Could not find');
  });
});

// ── update_issue ──────────────────────────────────────────────────────────

describe('update_issue handler', () => {
  it('updates due_date and done_ratio', async () => {
    const client = makeClient();
    const result = await executeTool(
      makeCall('update_issue', { issue_id: 8, due_date: '2026-12-31', done_ratio: 75 }),
      client as any,
      USER_ID,
    );

    expect(result.success).toBe(true);
    expect(client.updateIssue).toHaveBeenCalledWith(8, { dueDate: '2026-12-31', doneRatio: 75 });
    const data = result.result as any;
    expect(data.updated).toBe(true);
  });

  it('clamps done_ratio to [0, 100]', async () => {
    const client = makeClient();
    await executeTool(
      makeCall('update_issue', { issue_id: 8, done_ratio: 150 }),
      client as any,
      USER_ID,
    );
    expect(client.updateIssue).toHaveBeenCalledWith(8, expect.objectContaining({ doneRatio: 100 }));
  });

  it('rejects update with no fields provided', async () => {
    const client = makeClient();
    const result = await executeTool(
      makeCall('update_issue', { issue_id: 8 }),
      client as any,
      USER_ID,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('At least one field');
  });
});

// ── toAnthropicTools ──────────────────────────────────────────────────────

describe('toAnthropicTools', () => {
  it('converts OpenAI format to Anthropic format', () => {
    const result = toAnthropicTools(toolDefinitions);

    expect(result).toHaveLength(toolDefinitions.length);
    result.forEach((t, i) => {
      expect(t.name).toBe(toolDefinitions[i].function.name);
      expect(t.description).toBe(toolDefinitions[i].function.description);
      expect(t.input_schema).toBe(toolDefinitions[i].function.parameters);
    });
  });
});

// ── summarizeToolCall ─────────────────────────────────────────────────────

describe('summarizeToolCall', () => {
  it.each([
    [makeCall('update_status', { issue_id: 10, status_id: 3 }), 'Update issue #10 to status ID 3'],
    [makeCall('update_status', { issue_id: 10, status_id: 3, note: 'Done' }), 'with note: "Done"'],
    [makeCall('log_time', { issue_id: 5, hours: 2, activity_id: 9 }), 'Log 2h on issue #5'],
    [makeCall('add_comment', { issue_id: 7, comment: 'Hello' }), 'Add comment to issue #7'],
    [makeCall('close_issue', { issue_id: 3 }), 'Close issue #3'],
    [makeCall('close_issue', { issue_id: 3, note: 'Done!' }), 'with note: "Done!"'],
    [makeCall('get_issue', { issue_id: 42 }), 'Fetch details for issue #42'],
    [makeCall('search_issues', { query: 'login' }), 'Search issues for "login"'],
    [makeCall('list_statuses'), 'List available issue statuses'],
    [makeCall('list_activities'), 'List available time-entry activities'],
  ])('summarizes %o correctly', (call, expected) => {
    expect(summarizeToolCall(call)).toContain(expected);
  });

  it('summarizes update_issue with multiple fields', () => {
    const call = makeCall('update_issue', { issue_id: 8, due_date: '2026-12-31', done_ratio: 50 });
    const summary = summarizeToolCall(call);
    expect(summary).toContain('Update issue #8');
    expect(summary).toContain('due date');
    expect(summary).toContain('progress');
  });

  it('truncates long add_comment at 80 chars', () => {
    const longComment = 'A'.repeat(100);
    const call = makeCall('add_comment', { issue_id: 1, comment: longComment });
    const summary = summarizeToolCall(call);
    expect(summary).toContain('…');
  });

  it('uses JSON fallback for unknown tool names', () => {
    const call = makeCall('mystery_tool', { foo: 'bar' });
    const summary = summarizeToolCall(call);
    expect(summary).toBe('mystery_tool({"foo":"bar"})');
  });
});

// ── RBAC: getRequiredRole + executeTool role gating ──────────────────────

import { getRequiredRole } from '../ai-tools';

describe('getRequiredRole', () => {
  it.each([
    ['get_issue', 'VIEWER'],
    ['search_issues', 'VIEWER'],
    ['list_statuses', 'VIEWER'],
    ['log_time', 'USER'],
    ['add_comment', 'USER'],
    ['update_status', 'USER'],
    ['close_issue', 'EDITOR'],
    ['update_issue', 'EDITOR'],
  ])('%s requires %s', (name, role) => {
    expect(getRequiredRole(name)).toBe(role);
  });

  it('fails closed for unknown tool names (defaults to ADMIN)', () => {
    expect(getRequiredRole('mystery_tool')).toBe('ADMIN');
  });
});

describe('executeTool RBAC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIssueFindFirst.mockResolvedValue(null);
    mockIssueFindMany.mockResolvedValue([]);
  });

  it('denies USER attempting an EDITOR-only close_issue', async () => {
    mockUserFindUnique.mockResolvedValue({ id: USER_ID, role: 'USER' });
    const client = makeClient();
    const result = await executeTool(
      makeCall('close_issue', { issue_id: 1 }),
      client as any,
      USER_ID,
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Insufficient role/);
    expect(client.updateIssueStatus).not.toHaveBeenCalled();
  });

  it('allows VIEWER to call read-only get_issue', async () => {
    mockUserFindUnique.mockResolvedValue({ id: USER_ID, role: 'VIEWER' });
    const client = makeClient();
    const result = await executeTool(makeCall('get_issue', { issue_id: 1 }), client as any, USER_ID);
    expect(result.success).toBe(true);
  });

  it('denies VIEWER attempting a USER-level log_time', async () => {
    mockUserFindUnique.mockResolvedValue({ id: USER_ID, role: 'VIEWER' });
    const client = makeClient();
    const result = await executeTool(
      makeCall('log_time', { issue_id: 1, hours: 1, activity_id: 9 }),
      client as any,
      USER_ID,
    );
    expect(result.success).toBe(false);
    expect(client.addTimeEntry).not.toHaveBeenCalled();
  });

  it('allows ADMIN to call every mutating tool', async () => {
    mockUserFindUnique.mockResolvedValue({ id: USER_ID, role: 'ADMIN' });
    const client = makeClient();
    const result = await executeTool(
      makeCall('update_issue', { issue_id: 1, due_date: '2026-12-31' }),
      client as any,
      USER_ID,
    );
    expect(result.success).toBe(true);
    expect(client.updateIssue).toHaveBeenCalled();
  });
});

// ── Local ticket (L-N) support ────────────────────────────────────────────

const LOCAL_ROW = {
  id: 'cuid_local_5',
  userId: USER_ID,
  source: 'local',
  localIssueNumber: 5,
  redmineIssueId: null,
  subject: 'Converge Dashboard Improvements',
  statusId: 2,
  statusName: 'In Progress',
  priority: 'Normal',
  assignedToName: 'MBU',
  doneRatio: 20,
  dueDate: null,
  tracker: 'Task',
  projectName: 'Personal',
  description: 'Local ticket body',
  updatedOnRemote: new Date('2026-07-01T00:00:00Z'),
  spentHours: 3,
  journals: [],
  timeEntries: [],
};

describe('local ticket support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({ id: USER_ID, role: 'ADMIN' });
    mockIssueFindFirst.mockResolvedValue(LOCAL_ROW);
    mockIssueUpdate.mockResolvedValue(LOCAL_ROW);
    mockJournalAggregate.mockResolvedValue({ _max: { redmineJournalId: 3 } });
    mockJournalCreate.mockResolvedValue({});
    mockTimeEntryCreate.mockResolvedValue({ id: 'te1' });
    mockStatusCatalogFindMany.mockResolvedValue([
      { id: 1, name: 'New', isClosed: false },
      { id: 2, name: 'In Progress', isClosed: false },
      { id: 3, name: 'Resolved', isClosed: false },
      { id: 5, name: 'Closed', isClosed: true },
    ]);
  });

  it('get_issue resolves an L-N reference to the local ticket', async () => {
    const client = makeClient();
    const result = await executeTool(makeCall('get_issue', { issue_id: 'L-5' }), client as any, USER_ID);

    expect(result.success).toBe(true);
    expect(result.result).toMatchObject({ ref: 'L-5', subject: 'Converge Dashboard Improvements' });
    expect(client.getIssue).not.toHaveBeenCalled();
    expect(mockIssueFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: 'local', localIssueNumber: 5 }),
      }),
    );
  });

  it('search_issues returns L-N refs for local tickets', async () => {
    mockIssueFindMany.mockResolvedValue([
      { redmineIssueId: null, localIssueNumber: 5, source: 'local', subject: 'OpenWA', statusName: 'In Progress', priority: 'Normal', assignedToName: 'MBU', dueDate: null, updatedOnRemote: new Date() },
      { redmineIssueId: 42, localIssueNumber: null, source: 'redmine', subject: 'Remote', statusName: 'New', priority: 'Normal', assignedToName: 'Alice', dueDate: null, updatedOnRemote: new Date() },
    ]);
    const result = await executeTool(makeCall('search_issues', { query: 'open' }), makeClient() as any, USER_ID);

    expect(result.success).toBe(true);
    const rows = (result.result as { issues: Array<{ ref: string }> }).issues;
    expect(rows[0].ref).toBe('L-5');
    expect(rows[1].ref).toBe('#42');
  });

  it('update_status on L-N updates the local row and writes a journal, without Redmine', async () => {
    const client = makeClient();
    const result = await executeTool(
      makeCall('update_status', { issue_id: 'L-5', status_id: 3, note: 'done for now' }),
      client as any,
      USER_ID,
    );

    expect(result.success).toBe(true);
    expect(client.updateIssueStatus).not.toHaveBeenCalled();
    expect(mockIssueUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cuid_local_5' },
        data: expect.objectContaining({ statusId: 3, statusName: 'Resolved' }),
      }),
    );
    expect(mockJournalCreate).toHaveBeenCalled();
  });

  it('log_time on L-N creates a TimeEntry and increments spentHours, without Redmine', async () => {
    const client = makeClient();
    const result = await executeTool(
      makeCall('log_time', { issue_id: 'L-5', hours: 2.5, comment: 'pairing' }),
      client as any,
      USER_ID,
    );

    expect(result.success).toBe(true);
    expect(client.addTimeEntry).not.toHaveBeenCalled();
    expect(mockTimeEntryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ issueId: 'cuid_local_5', hours: 2.5 }),
      }),
    );
    expect(mockIssueUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ spentHours: { increment: 2.5 } }),
      }),
    );
  });

  it('add_comment on L-N writes a local journal entry, without Redmine', async () => {
    const client = makeClient();
    const result = await executeTool(
      makeCall('add_comment', { issue_id: 'L-5', comment: 'note from chat' }),
      client as any,
      USER_ID,
    );

    expect(result.success).toBe(true);
    expect(client.addComment).not.toHaveBeenCalled();
    expect(mockJournalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ issueId: 'cuid_local_5', notes: 'note from chat' }),
      }),
    );
  });

  it('close_issue on L-N sets the closed status from the catalog, without Redmine', async () => {
    const client = makeClient();
    const result = await executeTool(makeCall('close_issue', { issue_id: 'L-5' }), client as any, USER_ID);

    expect(result.success).toBe(true);
    expect(client.updateIssueStatus).not.toHaveBeenCalled();
    expect(client.getIssueStatuses).not.toHaveBeenCalled();
    expect(mockIssueUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ statusId: 5, statusName: 'Closed' }),
      }),
    );
  });

  it('update_issue on L-N updates local fields, without Redmine', async () => {
    const client = makeClient();
    const result = await executeTool(
      makeCall('update_issue', { issue_id: 'L-5', done_ratio: 80 }),
      client as any,
      USER_ID,
    );

    expect(result.success).toBe(true);
    expect(client.updateIssue).not.toHaveBeenCalled();
    expect(mockIssueUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ doneRatio: 80 }),
      }),
    );
  });

  it('fails cleanly when the L-N ticket does not exist', async () => {
    mockIssueFindFirst.mockResolvedValue(null);
    const result = await executeTool(makeCall('get_issue', { issue_id: 'L-99' }), makeClient() as any, USER_ID);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/L-99/);
  });
});

// ── get_time_summary ──────────────────────────────────────────────────────

describe('get_time_summary handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({ id: USER_ID, role: 'VIEWER' });
    mockCorrelateWakaTime.mockResolvedValue({
      matched: [
        {
          ticketId: 'cuid_local_5',
          localIssueNumber: 5,
          subject: 'Converge Dashboard Improvements',
          repo: 'buluma/odin',
          totalSeconds: 7200,
          perDay: [{ date: '2026-07-01', seconds: 7200 }],
          alreadyLoggedDates: [],
        },
      ],
      unmatched: [
        { project: '.pi', totalSeconds: 3600, perDay: [{ date: '2026-07-01', seconds: 3600 }] },
      ],
    });
  });

  it('is a read-only VIEWER tool that needs no confirmation', () => {
    expect(requiresConfirmation('get_time_summary')).toBe(false);
    expect(toolDefinitions.some((t) => t.function.name === 'get_time_summary')).toBe(true);
  });

  it('summarizes tracked hours per ticket and unmatched projects for a range', async () => {
    const result = await executeTool(
      makeCall('get_time_summary', { start: '2026-06-26', end: '2026-07-02' }),
      makeClient() as any,
      USER_ID,
    );

    expect(result.success).toBe(true);
    expect(mockCorrelateWakaTime).toHaveBeenCalledWith(USER_ID, { start: '2026-06-26', end: '2026-07-02' });
    expect(result.result).toMatchObject({
      start: '2026-06-26',
      end: '2026-07-02',
      totalTrackedHours: 2,
      unmatchedHours: 1,
    });
    const summary = result.result as { perTicket: Array<{ ref: string; hours: number }> };
    expect(summary.perTicket[0]).toMatchObject({ ref: 'L-5', hours: 2 });
  });

  it('rejects malformed date ranges', async () => {
    const result = await executeTool(
      makeCall('get_time_summary', { start: 'yesterday', end: '2026-07-02' }),
      makeClient() as any,
      USER_ID,
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/YYYY-MM-DD/);
  });
});
