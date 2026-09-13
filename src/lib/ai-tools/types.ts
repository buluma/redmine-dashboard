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
