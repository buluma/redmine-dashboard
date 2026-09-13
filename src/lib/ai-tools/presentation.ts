import type { ToolCall, ToolDefinition } from '@/src/lib/ai-tools/types';

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

/** Human-readable ticket reference: 42 → "#42", "L-5" → "L-5". */
function fmtRef(value: unknown): string {
  if (typeof value === 'string' && /^[Ll]-?\d+$/.test(value.trim())) {
    return `L-${value.trim().replace(/^[Ll]-?/, '')}`;
  }
  return `#${value}`;
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
