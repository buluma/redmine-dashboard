import { env } from "@/src/lib/env";
import { trackWarn } from "@/src/lib/telemetry";
import type { LLMChatMessage, LLMChatOptions, LLMModel, LLMResponse, LLMStatus } from "@/src/lib/llm-provider/types";

export async function checkOpenRouterHealth(): Promise<LLMStatus> {
  if (!env.openrouterApiKey) {
    return { available: false, provider: "openrouter", models: [], primaryModel: "", usingFallback: false, error: "OpenRouter API key not configured" };
  }

  try {
    // OpenRouter uses OpenAI-compatible API
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${env.openrouterApiKey}` }
    });

    if (!response.ok) {
      return { available: false, provider: "openrouter", models: [], primaryModel: "", usingFallback: false, error: `OpenRouter API error: ${response.status}` };
    }

    const data = await response.json();
    const models: LLMModel[] = (data.data || [])
      .slice(0, 30)
      .map((m: { id: string }) => ({
        id: m.id,
        name: m.id,
        provider: "openrouter" as const,
        description: "OpenRouter model"
      }));

    return {
      available: true,
      provider: "openrouter",
      models,
      primaryModel: env.openrouterChatModel,
      usingFallback: false
    };
  } catch (error) {
    return { available: false, provider: "openrouter", models: [], primaryModel: "", usingFallback: false, error: error instanceof Error ? error.message : "Failed to connect" };
  }
}

export async function openrouterChat(
  messages: LLMChatMessage[],
  options: Pick<LLMChatOptions, "temperature" | "maxTokens" | "tools">,
): Promise<LLMResponse> {
  const apiKey = env.openrouterApiKey;
  if (!apiKey) throw new Error("OpenRouter API key not configured");

  // Try primary model first
  try {
    return await openrouterChatWithModel(messages, env.openrouterChatModel, options);
  } catch (primaryError) {
    // If primary fails and we have a fallback, try it
    if (env.openrouterChatModelFallback && env.openrouterChatModelFallback !== env.openrouterChatModel) {
      trackWarn("llm.openrouter.fallback", { fallbackModel: env.openrouterChatModelFallback });
      try {
        return await openrouterChatWithModel(messages, env.openrouterChatModelFallback, options);
      } catch {
        // If fallback also fails, throw the primary error
        throw primaryError;
      }
    }
    throw primaryError;
  }
}

async function openrouterChatWithModel(
  messages: LLMChatMessage[],
  model: string,
  options: Pick<LLMChatOptions, "temperature" | "maxTokens" | "tools">,
): Promise<LLMResponse> {
  const apiKey = env.openrouterApiKey;
  if (!apiKey) throw new Error("OpenRouter API key not configured");

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
  };
  if (options.tools?.length) {
    body.tools = options.tools;
    body.tool_choice = "auto";
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://converge.local",
      "X-Title": "Converge"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  const toolCalls = choice?.message?.tool_calls?.map(
    (tc: { id: string; function: { name: string; arguments: string } }) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments,
    })
  );

  return {
    content: choice?.message?.content || "",
    model: data.model,
    provider: "openrouter",
    done: true,
    toolCalls: toolCalls?.length ? toolCalls : undefined,
    usage: {
      totalTokens: data.usage?.total_tokens,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens
    }
  };
}
