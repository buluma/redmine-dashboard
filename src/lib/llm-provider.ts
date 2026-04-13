import { env } from "./env";
import { getOllamaClient } from "./ollama";

export type LLMProvider = "ollama" | "openai" | "anthropic";

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

export interface LLMResponse {
  content: string;
  model: string;
  provider: LLMProvider;
  done: boolean;
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

// OpenAI compatible response type
interface OpenAIChatMessage {
  role: string;
  content: string;
}

export class LLMProviderManager {
  private provider: LLMProvider;
  private ollama = getOllamaClient();

  constructor() {
    this.provider = this.detectProvider();
  }

  private detectProvider(): LLMProvider {
    const configured = env.llmProvider;
    if (configured && ["ollama", "openai", "anthropic"].includes(configured)) {
      return configured as LLMProvider;
    }
    // Default to ollama
    return "ollama";
  }

  getProvider(): LLMProvider {
    return this.provider;
  }

  async checkHealth(): Promise<LLMStatus> {
    try {
      if (this.provider === "ollama") {
        return this.checkOllamaHealth();
      } else if (this.provider === "openai") {
        return this.checkOpenAIHealth();
      } else if (this.provider === "anthropic") {
        return this.checkAnthropicHealth();
      }
      return { available: false, provider: this.provider, models: [], primaryModel: "", usingFallback: false, error: "Unknown provider" };
    } catch (error) {
      return {
        available: false,
        provider: this.provider,
        models: [],
        primaryModel: "",
        usingFallback: false,
        error: error instanceof Error ? error.message : "Health check failed"
      };
    }
  }

  private async checkOllamaHealth(): Promise<LLMStatus> {
    const health = await this.ollama.checkHealth();
    return {
      available: health.available,
      provider: "ollama",
      models: [], // Will be populated by getAvailableModels
      primaryModel: env.ollamaChatModel,
      usingFallback: health.usingFallback,
      error: health.error
    };
  }

  private async checkOpenAIHealth(): Promise<LLMStatus> {
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
          provider: "openai" as LLMProvider,
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

  private async checkAnthropicHealth(): Promise<LLMStatus> {
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

  async getAvailableModels(): Promise<LLMModel[]> {
    const status = await this.checkHealth();
    return status.models;
  }

  async chat(messages: LLMChatMessage[], options: { stream?: boolean; temperature?: number; maxTokens?: number; model?: string } = {}): Promise<LLMResponse> {
    const { stream = false, temperature = 0.7, maxTokens = 4096, model: modelOverride } = options;

    try {
      if (this.provider === "ollama") {
        return this.ollamaChat(messages, { stream, temperature, maxTokens, model: modelOverride });
      } else if (this.provider === "openai") {
        return this.openaiChat(messages, { stream, temperature, maxTokens, model: modelOverride });
      } else if (this.provider === "anthropic") {
        return this.anthropicChat(messages, { maxTokens, model: modelOverride });
      }
      throw new Error(`Unsupported provider: ${this.provider}`);
    } catch (error) {
      // Try Ollama as fallback if another provider fails
      if (this.provider !== "ollama") {
        console.warn(`Primary provider ${this.provider} failed, trying Ollama fallback...`);
        try {
          return await this.ollamaChat(messages, { stream, temperature, maxTokens, model: modelOverride });
        } catch {
          // Ollama fallback also failed
        }
      }
      throw error;
    }
  }

  private async ollamaChat(messages: LLMChatMessage[], options: { stream?: boolean; temperature?: number; maxTokens?: number; model?: string }): Promise<LLMResponse> {
    const result = await this.ollama.chat(messages, options);
    return {
      content: result.content,
      model: result.model,
      provider: "ollama",
      done: result.done,
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

  private async openaiChat(messages: LLMChatMessage[], options: { stream?: boolean; temperature?: number; maxTokens?: number }): Promise<LLMResponse> {
    const apiKey = env.openaiApiKey;
    if (!apiKey) throw new Error("OpenAI API key not configured");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: env.openaiChatModel,
        messages,
        stream: options.stream ?? false,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    if (options.stream ?? false) {
      return this.openaiStreamResponse(response, env.openaiChatModel);
    }

    const data = await response.json();
    return {
      content: data.choices[0]?.message?.content || "",
      model: data.model,
      provider: "openai",
      done: true,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens
      }
    };
  }

  private async openaiStreamResponse(response: Response, model: string): Promise<LLMResponse> {
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

  private async anthropicChat(messages: LLMChatMessage[], options: { maxTokens?: number }): Promise<LLMResponse> {
    const apiKey = env.anthropicApiKey;
    if (!apiKey) throw new Error("Anthropic API key not configured");

    // Convert messages format for Anthropic
    const anthropicMessages = messages
      .filter(m => m.role !== "system")
      .map(m => ({ role: m.role, content: m.content }));

    const systemMessage = messages.find(m => m.role === "system");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: env.anthropicChatModel,
        messages: anthropicMessages,
        system: systemMessage?.content,
        max_tokens: options.maxTokens ?? 4096
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return {
      content: data.content[0]?.text || "",
      model: data.model,
      provider: "anthropic",
      done: true,
      usage: {
        totalTokens: data.usage?.input_tokens + data.usage?.output_tokens,
        promptTokens: data.usage?.input_tokens,
        completionTokens: data.usage?.output_tokens
      }
    };
  }

  async generateEmbeddings(texts: string[]): Promise<LLMEmbeddingResponse> {
    // Currently only Ollama supports embeddings
    if (this.provider !== "ollama") {
      // Fallback to Ollama for embeddings
      const result = await this.ollama.generateEmbeddings(texts);
      return { embeddings: result.embeddings, model: result.model, provider: "ollama" };
    }

    const result = await this.ollama.generateEmbeddings(texts);
    return { embeddings: result.embeddings, model: result.model, provider: "ollama" };
  }
}

// Singleton instance
let llmProviderManager: LLMProviderManager | null = null;

export function getLLMProviderManager(): LLMProviderManager {
  if (!llmProviderManager) {
    llmProviderManager = new LLMProviderManager();
  }
  return llmProviderManager;
}
