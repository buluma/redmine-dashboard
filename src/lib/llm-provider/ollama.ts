import { env } from "@/src/lib/env";
import type { OllamaClient } from "@/src/lib/ollama";
import type { LLMChatMessage, LLMChatOptions, LLMResponse, LLMStatus } from "@/src/lib/llm-provider/types";

export async function checkOllamaHealth(ollama: OllamaClient): Promise<LLMStatus> {
  const health = await ollama.checkHealth();
  return {
    available: health.available,
    provider: "ollama",
    models: [], // Will be populated by getAvailableModels
    primaryModel: env.ollamaChatModel,
    usingFallback: health.usingFallback,
    error: health.error
  };
}

export async function ollamaChat(
  ollama: OllamaClient,
  messages: LLMChatMessage[],
  options: LLMChatOptions,
): Promise<LLMResponse> {
  // Ollama passes tools natively for compatible models (≥ 0.5)
  const result = await ollama.chat(messages, {
    stream: options.stream,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    ...(options.tools?.length ? { tools: options.tools } : {}),
  });
  return {
    content: result.content,
    model: result.model,
    provider: "ollama",
    done: result.done,
    // Note: Ollama native tool_calls not yet fully supported in response
    metrics: {
      totalDuration: result.total_duration,
      loadDuration: result.load_duration,
      promptEvalCount: result.prompt_eval_count,
      promptEvalDuration: result.prompt_eval_duration,
      evalCount: result.eval_count,
      evalDuration: result.eval_duration
    }
  };
}
