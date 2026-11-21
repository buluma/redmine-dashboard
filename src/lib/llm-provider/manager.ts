import { env } from "@/src/lib/env";
import { getOllamaClient } from "@/src/lib/ollama";
import type { ToolDefinition } from "@/src/lib/ai-tools";
import { trackWarn } from "@/src/lib/telemetry";
import { checkApertureHealth, apertureChat } from "@/src/lib/llm-provider/aperture";
import { checkAnthropicHealth, anthropicChat } from "@/src/lib/llm-provider/anthropic";
import { checkOllamaHealth, ollamaChat } from "@/src/lib/llm-provider/ollama";
import { checkOpenAIHealth, openaiChat } from "@/src/lib/llm-provider/openai";
import { checkOpenRouterHealth, openrouterChat } from "@/src/lib/llm-provider/openrouter";
import type {
  LLMChatMessage,
  LLMModel,
  LLMProvider,
  LLMResponse,
  LLMStatus,
} from "@/src/lib/llm-provider/types";

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
        return await checkOllamaHealth(this.ollama);
      } else if (this.provider === "openai") {
        return await checkOpenAIHealth();
      } else if (this.provider === "anthropic") {
        return await checkAnthropicHealth();
      } else if (this.provider === "openrouter") {
        return await checkOpenRouterHealth();
      } else if (this.provider === "aperture") {
        return await checkApertureHealth();
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

  async getAvailableModels(): Promise<LLMModel[]> {
    const status = await this.checkHealth();
    return status.models;
  }

  async chat(messages: LLMChatMessage[], options: { stream?: boolean; temperature?: number; maxTokens?: number; tools?: ToolDefinition[] } = {}): Promise<LLMResponse> {
    const { stream = false, temperature = 0.7, maxTokens = 4096, tools } = options;

    try {
      if (this.provider === "ollama") {
        return await ollamaChat(this.ollama, messages, { stream, temperature, maxTokens, tools });
      } else if (this.provider === "openai") {
        return await openaiChat(messages, { stream, temperature, maxTokens, tools });
      } else if (this.provider === "anthropic") {
        return await anthropicChat(messages, { maxTokens, tools });
      } else if (this.provider === "openrouter") {
        return await openrouterChat(messages, { temperature, maxTokens, tools });
      } else if (this.provider === "aperture") {
        return await apertureChat(messages, { stream, temperature, maxTokens, tools });
      }
      throw new Error(`Unsupported provider: ${this.provider}`);
    } catch (error) {
      // Try Ollama as fallback if another provider fails
      if (this.provider !== "ollama") {
        trackWarn("llm.provider.fallback", { provider: this.provider, fallback: "ollama" });
        try {
          return await ollamaChat(this.ollama, messages, { stream, temperature, maxTokens, tools });
        } catch {
          // Ollama fallback also failed
        }
      }
      throw error;
    }
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
