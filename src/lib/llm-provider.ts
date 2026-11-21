// Barrel for the multi-provider LLM client, split across
// src/lib/llm-provider/* by responsibility (shared types, one module per
// provider's health-check + chat functions and the
// LLMProviderManager class that dispatches to them). Re-exports exactly the
// same public surface this file used to define directly, so every existing
// `from "@/src/lib/llm-provider"` import keeps working unchanged.

export type {
  LLMProvider,
  LLMModel,
  LLMChatMessage,
  LLMToolCall,
  LLMResponse,
  LLMStatus,
} from "@/src/lib/llm-provider/types";
export { LLMProviderManager, getLLMProviderManager } from "@/src/lib/llm-provider/manager";
