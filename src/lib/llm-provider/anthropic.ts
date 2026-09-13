import { env } from "@/src/lib/env";
import { toAnthropicTools } from "@/src/lib/ai-tools";
import type { LLMChatMessage, LLMChatOptions, LLMResponse, LLMStatus } from "@/src/lib/llm-provider/types";

export async function checkAnthropicHealth(): Promise<LLMStatus> {
  if (!env.anthropicApiKey) {
    return { available: false, provider: "anthropic", models: [], primaryModel: "", usingFallback: false, error: "Anthropic API key not configured" };
  }

  // Anthropic doesn't have a models list endpoint, just validate the key works
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: env.anthropicChatModel,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }]
      })
    });

    // 400 means the model is valid, just no content
    if (response.ok || response.status === 400) {
      return {
        available: true,
        provider: "anthropic",
        models: [
          { id: "claude-opus-4-5", name: "claude-opus-4-20251120", provider: "anthropic", description: "Most capable model" },
          { id: "claude-sonnet-4-5", name: "claude-sonnet-4-20251120", provider: "anthropic", description: "Balanced performance" },
          { id: "claude-3-5-haiku", name: "claude-3-5-haiku-20250620", provider: "anthropic", description: "Fast and efficient" }
        ],
        primaryModel: env.anthropicChatModel,
        usingFallback: false
      };
    }

    return { available: false, provider: "anthropic", models: [], primaryModel: "", usingFallback: false, error: `Anthropic API error: ${response.status}` };
  } catch (error) {
    return { available: false, provider: "anthropic", models: [], primaryModel: "", usingFallback: false, error: error instanceof Error ? error.message : "Failed to connect" };
  }
}

export async function anthropicChat(
  messages: LLMChatMessage[],
  options: Pick<LLMChatOptions, "maxTokens" | "tools">,
): Promise<LLMResponse> {
  const apiKey = env.anthropicApiKey;
  if (!apiKey) throw new Error("Anthropic API key not configured");

  // Convert messages format for Anthropic
  const anthropicMessages = messages
    .filter(m => m.role !== "system")
    .map(m => ({ role: m.role, content: m.content }));

  const systemMessage = messages.find(m => m.role === "system");

  const body: Record<string, unknown> = {
    model: env.anthropicChatModel,
    messages: anthropicMessages,
    system: systemMessage?.content,
    max_tokens: options.maxTokens ?? 4096,
  };
  if (options.tools?.length) {
    body.tools = toAnthropicTools(options.tools);
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  // Anthropic returns content blocks; text blocks and tool_use blocks
  const textBlocks = (data.content || []).filter((b: { type: string }) => b.type === "text");
  const toolUseBlocks = (data.content || []).filter((b: { type: string }) => b.type === "tool_use");
  const toolCalls = toolUseBlocks.map((b: { id: string; name: string; input: Record<string, unknown> }) => ({
    id: b.id,
    name: b.name,
    arguments: b.input,
  }));

  return {
    content: textBlocks.map((b: { text: string }) => b.text).join("\n") || "",
    model: data.model,
    provider: "anthropic",
    done: true,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    usage: {
      totalTokens: data.usage?.input_tokens + data.usage?.output_tokens,
      promptTokens: data.usage?.input_tokens,
      completionTokens: data.usage?.output_tokens
    }
  };
}
