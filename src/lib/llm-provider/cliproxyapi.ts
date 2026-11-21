import { env } from "@/src/lib/env";
import type { LLMChatMessage, LLMChatOptions, LLMModel, LLMResponse, LLMStatus } from "@/src/lib/llm-provider/types";

export async function checkCLIProxyAPIHealth(): Promise<LLMStatus> {
  const baseUrl = env.cliproxyapiBaseUrl;
  if (!baseUrl) {
    return { available: false, provider: "cliproxyapi", models: [], primaryModel: "", usingFallback: false, error: "CLIProxyAPI not configured" };
  }

  try {
    // Test connection with a simple request
    const response = await fetch(`${baseUrl}/v1/models`, {
      headers: env.cliproxyapiApiKey !== "none" ? { Authorization: `Bearer ${env.cliproxyapiApiKey}` } : {}
    });

    if (!response.ok) {
      return { available: false, provider: "cliproxyapi", models: [], primaryModel: env.cliproxyapiChatModel, usingFallback: false, error: `CLIProxyAPI error: ${response.status}` };
    }

    const data = await response.json();
    const models: LLMModel[] = (data.data || [])
      .slice(0, 20)
      .map((m: { id: string; name?: string }) => ({
        id: m.id,
        name: m.name || m.id,
        provider: "cliproxyapi" as const,
        description: "CLIProxyAPI model"
      }));

    return {
      available: true,
      provider: "cliproxyapi",
      models,
      primaryModel: env.cliproxyapiChatModel,
      usingFallback: false
    };
  } catch (error) {
    return { available: false, provider: "cliproxyapi", models: [], primaryModel: env.cliproxyapiChatModel, usingFallback: false, error: error instanceof Error ? error.message : "Failed to connect to CLIProxyAPI" };
  }
}

// CLIProxyAPI - Private LLM Gateway
export async function cliProxyAPIChat(messages: LLMChatMessage[], options: LLMChatOptions): Promise<LLMResponse> {
  const baseUrl = env.cliproxyapiBaseUrl;
  const model = env.cliproxyapiChatModel;
  const apiKey = env.cliproxyapiApiKey !== "none" ? env.cliproxyapiApiKey : undefined;

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: options.stream ?? false,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
  };
  if (options.tools?.length) {
    body.tools = options.tools;
    body.tool_choice = "auto";
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "HTTP-Referer": "https://converge.local",
    "X-Title": "Converge",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`CLIProxyAPI API error: ${response.status} - ${error}`);
  }

  if (options.stream ?? false) {
    return cliProxyAPIStreamResponse(response, model);
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
    model: data.model || model,
    provider: "cliproxyapi",
    done: true,
    toolCalls: toolCalls?.length ? toolCalls : undefined,
    usage: {
      totalTokens: data.usage?.total_tokens,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
    },
  };
}

async function cliProxyAPIStreamResponse(response: Response, model: string): Promise<LLMResponse> {
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
    provider: "cliproxyapi",
    done: true,
    usage: { totalTokens: promptTokens + completionTokens, promptTokens, completionTokens },
  };
}
