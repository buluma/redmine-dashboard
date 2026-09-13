import { env } from "@/src/lib/env";
import type { LLMChatMessage, LLMChatOptions, LLMModel, LLMResponse, LLMStatus } from "@/src/lib/llm-provider/types";

export async function checkOpenAIHealth(): Promise<LLMStatus> {
  if (!env.openaiApiKey) {
    return { available: false, provider: "openai", models: [], primaryModel: "", usingFallback: false, error: "OpenAI API key not configured" };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${env.openaiApiKey}` }
    });

    if (!response.ok) {
      return { available: false, provider: "openai", models: [], primaryModel: "", usingFallback: false, error: `OpenAI API error: ${response.status}` };
    }

    const data = await response.json();
    const models: LLMModel[] = (data.data || [])
      .filter((m: { id: string }) => m.id.startsWith("gpt-"))
      .slice(0, 20)
      .map((m: { id: string }) => ({
        id: m.id,
        name: m.id,
        provider: "openai" as const,
        description: "OpenAI model"
      }));

    return {
      available: true,
      provider: "openai",
      models,
      primaryModel: env.openaiChatModel,
      usingFallback: false
    };
  } catch (error) {
    return { available: false, provider: "openai", models: [], primaryModel: "", usingFallback: false, error: error instanceof Error ? error.message : "Failed to connect" };
  }
}

export async function openaiChat(messages: LLMChatMessage[], options: LLMChatOptions): Promise<LLMResponse> {
  const apiKey = env.openaiApiKey;
  if (!apiKey) throw new Error("OpenAI API key not configured");

  const body: Record<string, unknown> = {
    model: env.openaiChatModel,
    messages,
    stream: options.stream ?? false,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
  };
  if (options.tools?.length) {
    body.tools = options.tools;
    body.tool_choice = "auto";
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  if (options.stream ?? false) {
    return openaiStreamResponse(response, env.openaiChatModel);
  }

  const data = await response.json();
  const choice = data.choices[0];
  const toolCalls = choice?.message?.tool_calls?.map(
    (tc: { id: string; function: { name: string; arguments: string } }) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments),
    })
  );

  return {
    content: choice?.message?.content || "",
    model: data.model,
    provider: "openai",
    done: true,
    toolCalls: toolCalls?.length ? toolCalls : undefined,
    usage: {
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
      totalTokens: data.usage?.total_tokens
    }
  };
}

async function openaiStreamResponse(response: Response, model: string): Promise<LLMResponse> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body reader");

  let fullContent = "";
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = new TextDecoder().decode(value);
      const lines = chunk.split("\n").filter(Boolean);

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            fullContent += parsed.choices?.[0]?.delta?.content || "";
            if (parsed.usage) {
              promptTokens = parsed.usage.prompt_tokens || 0;
              completionTokens = parsed.usage.completion_tokens || 0;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    content: fullContent,
    model,
    provider: "openai",
    done: true,
    usage: { totalTokens: promptTokens + completionTokens, promptTokens, completionTokens }
  };
}
