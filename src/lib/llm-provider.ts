import { env } from "./env";
import { getOllamaClient } from "./ollama";
import type { ToolDefinition } from "./ai-tools";
import { toAnthropicTools } from "./ai-tools";
import { trackWarn } from "./telemetry";

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

export class LLMProviderManager {
  private provider: LLMProvider;
  private ollama = getOllamaClient();

  constructor() {
    this.provider = this.detectProvider();
  }

  private detectProvider(): LLMProvider {
    const configured = env.llmProvider;
    if (configured && ["ollama", "openai", "anthropic", "openrouter", "aperture"].includes(configured)) {
      return configured as LLMProvider;
    }
    // Check if Tailscale Aperture is available (private network)
    if (env.apertureBaseUrl) {
      return "aperture";
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
      } else if (this.provider === "openrouter") {
        return this.checkOpenRouterHealth();
      } else if (this.provider === "aperture") {
        return this.checkApertureHealth();
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

  private async checkOpenRouterHealth(): Promise<LLMStatus> {
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
          provider: "openrouter" as LLMProvider,
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

  private async checkApertureHealth(): Promise<LLMStatus> {
    const baseUrl = env.apertureBaseUrl;
    if (!baseUrl) {
      return { available: false, provider: "aperture", models: [], primaryModel: "", usingFallback: false, error: "Aperture not configured" };
    }

    try {
      // Test connection with a simple request
      const response = await fetch(`${baseUrl}/v1/models`, {
        headers: env.apertureApiKey !== "none" ? { Authorization: `Bearer ${env.apertureApiKey}` } : {}
      });

      if (!response.ok) {
        return { available: false, provider: "aperture", models: [], primaryModel: env.apertureChatModel, usingFallback: false, error: `Aperture error: ${response.status}` };
      }

      const data = await response.json();
      const models: LLMModel[] = (data.data || [])
        .slice(0, 20)
        .map((m: { id: string; name?: string }) => ({
          id: m.id,
          name: m.name || m.id,
          provider: "aperture" as LLMProvider,
          description: "Tailscale Aperture model"
        }));

      return {
        available: true,
        provider: "aperture",
        models,
        primaryModel: env.apertureChatModel,
        usingFallback: false
      };
    } catch (error) {
      return { available: false, provider: "aperture", models: [], primaryModel: env.apertureChatModel, usingFallback: false, error: error instanceof Error ? error.message : "Failed to connect to Aperture" };
    }
  }

  async getAvailableModels(): Promise<LLMModel[]> {
    const status = await this.checkHealth();
    return status.models;
  }

  async chat(messages: LLMChatMessage[], options: { stream?: boolean; temperature?: number; maxTokens?: number; tools?: ToolDefinition[] } = {}): Promise<LLMResponse> {
    const { stream = false, temperature = 0.7, maxTokens = 4096, tools } = options;

    try {
      if (this.provider === "ollama") {
        return this.ollamaChat(messages, { stream, temperature, maxTokens, tools });
      } else if (this.provider === "openai") {
        return this.openaiChat(messages, { stream, temperature, maxTokens, tools });
      } else if (this.provider === "anthropic") {
        return this.anthropicChat(messages, { maxTokens, tools });
      } else if (this.provider === "openrouter") {
        return this.openrouterChat(messages, { temperature, maxTokens, tools });
      } else if (this.provider === "aperture") {
        return this.apertureChat(messages, { stream, temperature, maxTokens, tools });
      }
      throw new Error(`Unsupported provider: ${this.provider}`);
    } catch (error) {
      // Try Ollama as fallback if another provider fails
      if (this.provider !== "ollama") {
        trackWarn("llm.provider.fallback", { provider: this.provider, fallback: "ollama" });
        try {
          return await this.ollamaChat(messages, { stream, temperature, maxTokens, tools });
        } catch {
          // Ollama fallback also failed
        }
      }
      throw error;
    }
  }

  private async ollamaChat(messages: LLMChatMessage[], options: { stream?: boolean; temperature?: number; maxTokens?: number; tools?: ToolDefinition[] }): Promise<LLMResponse> {
    // Ollama passes tools natively for compatible models (≥ 0.5)
    const result = await this.ollama.chat(messages, {
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

  private async openaiChat(messages: LLMChatMessage[], options: { stream?: boolean; temperature?: number; maxTokens?: number; tools?: ToolDefinition[] }): Promise<LLMResponse> {
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
      return this.openaiStreamResponse(response, env.openaiChatModel);
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

  private async anthropicChat(messages: LLMChatMessage[], options: { maxTokens?: number; tools?: ToolDefinition[] }): Promise<LLMResponse> {
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

  private async openrouterChat(messages: LLMChatMessage[], options: { temperature?: number; maxTokens?: number; tools?: ToolDefinition[] }): Promise<LLMResponse> {
    const apiKey = env.openrouterApiKey;
    if (!apiKey) throw new Error("OpenRouter API key not configured");

    // Try primary model first
    try {
      return await this.openrouterChatWithModel(messages, env.openrouterChatModel, options);
    } catch (primaryError) {
      // If primary fails and we have a fallback, try it
      if (env.openrouterChatModelFallback && env.openrouterChatModelFallback !== env.openrouterChatModel) {
        trackWarn("llm.openrouter.fallback", { fallbackModel: env.openrouterChatModelFallback });
        try {
          return await this.openrouterChatWithModel(messages, env.openrouterChatModelFallback, options);
        } catch {
          // If fallback also fails, throw the primary error
          throw primaryError;
        }
      }
      throw primaryError;
    }
  }

  private async openrouterChatWithModel(messages: LLMChatMessage[], model: string, options: { temperature?: number; maxTokens?: number; tools?: ToolDefinition[] }): Promise<LLMResponse> {
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

  // Tailscale Aperture - Private LLM Gateway
  private async apertureChat(messages: LLMChatMessage[], options: { stream?: boolean; temperature?: number; maxTokens?: number; tools?: ToolDefinition[] }): Promise<LLMResponse> {
    const baseUrl = env.apertureBaseUrl;
    const model = env.apertureChatModel;
    const apiKey = env.apertureApiKey !== "none" ? env.apertureApiKey : undefined;

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
      throw new Error(`Aperture API error: ${response.status} - ${error}`);
    }

    if (options.stream ?? false) {
      return this.apertureStreamResponse(response, model);
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
      provider: "aperture",
      done: true,
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      usage: {
        totalTokens: data.usage?.total_tokens,
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
      },
    };
  }

  private async apertureStreamResponse(response: Response, model: string): Promise<LLMResponse> {
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
      provider: "aperture",
      done: true,
      usage: { totalTokens: promptTokens + completionTokens, promptTokens, completionTokens },
    };
  }

  async generateEmbeddings(texts: string[]): Promise<LLMEmbeddingResponse> {
    // Try to use the configured provider first
    if (this.provider === "openai" || this.provider === "openrouter" || this.provider === "aperture") {
      try {
        let apiKey: string | undefined;
        let endpoint = "";
        let model = "";

        if (this.provider === "openai") {
          apiKey = env.openaiApiKey;
          endpoint = "https://api.openai.com/v1/embeddings";
          model = "text-embedding-3-small";
        } else if (this.provider === "openrouter") {
          apiKey = env.openrouterApiKey;
          endpoint = "https://openrouter.ai/api/v1/embeddings";
          model = env.openrouterChatModel.includes("embed") ? env.openrouterChatModel : "openai/text-embedding-3-small";
        } else if (this.provider === "aperture") {
          // Use Aperture for embeddings if available
          apiKey = env.apertureApiKey !== "none" ? env.apertureApiKey : undefined;
          endpoint = `${env.apertureBaseUrl}/v1/embeddings`;
          // Use same embed model or default
          model = env.ollamaEmbedModel || "nomic-embed-text";
        }

        if (apiKey || this.provider === "aperture") {
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (apiKey) {
            headers["Authorization"] = `Bearer ${apiKey}`;
          }
          if (this.provider === "openrouter") {
            headers["HTTP-Referer"] = "https://converge.local";
            headers["X-Title"] = "Converge";
          }
          
          const response = await fetch(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify({ model, input: texts }),
          });
          
          if (response.ok) {
            const data = await response.json();
            const embeddings = data.data.map((item: { embedding: number[] }) => item.embedding);
            return {
              embeddings,
              model: data.model || model,
              provider: this.provider,
            };
          }
        }
      } catch {
        trackWarn("llm.embeddings.fallback", { provider: this.provider, fallback: "ollama" });
      }
    }
    
    // Fallback to Ollama for embeddings
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
