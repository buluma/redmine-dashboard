import type { ToolDefinition } from "@/src/lib/ai-tools";

export type LLMProvider = "ollama" | "openai" | "anthropic" | "openrouter" | "aperture";

export interface LLMModel {
  id: string;
  name: string;
  provider: LLMProvider;
  description?: string;
}

export interface LLMChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** A tool call parsed from an LLM response. */
export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: LLMProvider;
  done: boolean;
  /** Tool calls requested by the model (when function calling is active). */
  toolCalls?: LLMToolCall[];
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  metrics?: {
    totalDuration?: number;
    loadDuration?: number;
    promptEvalCount?: number;
    promptEvalDuration?: number;
    evalCount?: number;
    evalDuration?: number;
  };
}

export interface LLMEmbeddingResponse {
  embeddings: number[][];
  model: string;
  provider: LLMProvider;
}

export interface LLMStatus {
  available: boolean;
  provider: LLMProvider;
  models: LLMModel[];
  primaryModel: string;
  usingFallback: boolean;
  error?: string;
}

/** Shared chat options every provider's chat function accepts (not every field is used by every provider). */
export interface LLMChatOptions {
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
}
