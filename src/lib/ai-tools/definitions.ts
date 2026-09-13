import type { ToolDefinition } from '@/src/lib/ai-tools/types';

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
