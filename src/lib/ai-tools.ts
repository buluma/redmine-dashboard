// Barrel for the AI tool-calling system, split across src/lib/ai-tools/* by
// responsibility (types, role/confirmation permissions, the static tool
// definitions, shared ticket-reference resolution, read-only handlers,
// mutating handlers, the executor dispatcher, and cross-provider
// presentation helpers). Re-exports exactly the same public surface this
// file used to define directly, so every existing
// `from "@/src/lib/ai-tools"` import keeps working unchanged.

export type { ToolParameterProperty, ToolDefinition, ToolCall, ToolResult } from '@/src/lib/ai-tools/types';
export { requiresConfirmation, getRequiredRole } from '@/src/lib/ai-tools/permissions';
export { toolDefinitions } from '@/src/lib/ai-tools/definitions';
export { executeTool } from '@/src/lib/ai-tools/execute';
export { toAnthropicTools, summarizeToolCall } from '@/src/lib/ai-tools/presentation';
