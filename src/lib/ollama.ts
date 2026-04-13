import { env } from "./env";

export interface OllamaModel {
  name: string;
  model: string;
  size?: number;
  modified_at?: string;
}

export interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaChatResponse {
  model: string;
  message: {
    role: "assistant";
    content: string;
  };
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaEmbeddingResponse {
  model: string;
  embeddings: number[][];
}

export interface OllamaStatus {
  available: boolean;
  primaryModel: string;
  fallbackModel: string;
  embeddingModel: string;
  embeddingModelFallback: string;
  featuresEnabled: boolean;
  usingFallback: boolean;
  error?: string;
}

export class OllamaClient {
  private baseUrl: string;
  private apiKey: string | null;
  private primaryChatModel: string;
  private fallbackChatModel: string;
  private primaryEmbedModel: string;
  private fallbackEmbedModel: string;
  private timeoutMs: number;
  private streamEnabled: boolean;

  constructor() {
    this.baseUrl = env.ollamaBaseUrl;
    this.apiKey = process.env.OLLAMA_API_KEY || null;
    this.primaryChatModel = env.ollamaChatModel;
    this.fallbackChatModel = env.ollamaChatModelFallback;
    this.primaryEmbedModel = env.ollamaEmbedModel;
    this.fallbackEmbedModel = env.ollamaEmbedModelFallback;
    this.timeoutMs = env.ollamaTimeoutMs;
    this.streamEnabled = env.ollamaStream;
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      ...(options.headers as Record<string, string> || {}),
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  async checkHealth(): Promise<{ available: boolean; usingFallback: boolean; error?: string }> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        return {
          available: false,
          usingFallback: false,
          error: `Ollama API returned ${response.status}`,
        };
      }

      const data = await response.json();
      const models: OllamaModel[] = data.models || [];

      // Check if primary model is available
      const primaryAvailable = models.some(
        (m) => m.name === this.primaryChatModel
      );

      // If primary not available, try fallback
      const fallbackAvailable = models.some(
        (m) => m.name === this.fallbackChatModel
      );

      if (primaryAvailable) {
        return { available: true, usingFallback: false };
      } else if (fallbackAvailable) {
        return { available: true, usingFallback: true };
      } else {
        return {
          available: true,
          usingFallback: true,
          error: `Neither primary (${this.primaryChatModel}) nor fallback (${this.fallbackChatModel}) models available`,
        };
      }
    } catch (error) {
      return {
        available: false,
        usingFallback: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async getStatus(): Promise<OllamaStatus> {
    const health = await this.checkHealth();
    return {
      available: health.available,
      primaryModel: this.primaryChatModel,
      fallbackModel: this.fallbackChatModel,
      embeddingModel: this.primaryEmbedModel,
      embeddingModelFallback: this.fallbackEmbedModel,
      featuresEnabled: env.enableAiFeatures,
      usingFallback: health.usingFallback,
      error: health.error,
    };
  }

  getCurrentChatModel(usingFallback: boolean): string {
    return usingFallback ? this.fallbackChatModel : this.primaryChatModel;
  }

  async chat(
    messages: OllamaChatMessage[],
    options: {
      stream?: boolean;
      temperature?: number;
      maxTokens?: number;
      useFallback?: boolean;
      model?: string; // Override model selection
    } = {}
  ): Promise<{
    content: string;
    model: string;
    done: boolean;
    total_duration?: number;
    load_duration?: number;
    prompt_eval_count?: number;
    prompt_eval_duration?: number;
    eval_count?: number;
    eval_duration?: number;
  }> {
    const { stream = this.streamEnabled, temperature = 0.7, maxTokens = 4096, useFallback = false, model: modelOverride } = options;
    
    // Priority: override > fallback > primary
    let model: string;
    if (modelOverride) {
      model = modelOverride;
    } else if (useFallback) {
      model = this.fallbackChatModel;
    } else {
      model = this.primaryChatModel;
    }

    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/chat`, {
      method: "POST",
      body: JSON.stringify({
        model,
        messages,
        stream,
        options: {
          temperature,
          num_predict: maxTokens,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama chat failed: ${response.status} - ${error}`);
    }

    if (stream) {
      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body reader available");
      }

      let fullContent = "";
      let finalModel = model;
      let totalDuration: number | undefined;
      let loadDuration: number | undefined;
      let promptEvalCount: number | undefined;
      let promptEvalDuration: number | undefined;
      let evalCount: number | undefined;
      let evalDuration: number | undefined;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = new TextDecoder().decode(value);
          const lines = chunk.split("\n").filter(Boolean);

          for (const line of lines) {
            try {
              const data: OllamaChatResponse = JSON.parse(line);
              fullContent += data.message.content;
              finalModel = data.model;
              if (data.total_duration != null) totalDuration = data.total_duration;
              if (data.load_duration != null) loadDuration = data.load_duration;
              if (data.prompt_eval_count != null) promptEvalCount = data.prompt_eval_count;
              if (data.prompt_eval_duration != null) promptEvalDuration = data.prompt_eval_duration;
              if (data.eval_count != null) evalCount = data.eval_count;
              if (data.eval_duration != null) evalDuration = data.eval_duration;
              if (data.done) {
                return {
                  content: fullContent,
                  model: finalModel,
                  done: true,
                  total_duration: totalDuration,
                  load_duration: loadDuration,
                  prompt_eval_count: promptEvalCount,
                  prompt_eval_duration: promptEvalDuration,
                  eval_count: evalCount,
                  eval_duration: evalDuration,
                };
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      return {
        content: fullContent,
        model: finalModel,
        done: true,
        total_duration: totalDuration,
        load_duration: loadDuration,
        prompt_eval_count: promptEvalCount,
        prompt_eval_duration: promptEvalDuration,
        eval_count: evalCount,
        eval_duration: evalDuration,
      };
    } else {
      const data: OllamaChatResponse = await response.json();
      return {
        content: data.message.content,
        model: data.model,
        done: data.done,
        total_duration: data.total_duration,
        load_duration: data.load_duration,
        prompt_eval_count: data.prompt_eval_count,
        prompt_eval_duration: data.prompt_eval_duration,
        eval_count: data.eval_count,
        eval_duration: data.eval_duration,
      };
    }
  }

  async chatWithFallback(
    messages: OllamaChatMessage[],
    options: {
      stream?: boolean;
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<{
    content: string;
    model: string;
    usedFallback: boolean;
    total_duration?: number;
    load_duration?: number;
    prompt_eval_count?: number;
    prompt_eval_duration?: number;
    eval_count?: number;
    eval_duration?: number;
  }> {
    // Try primary model first
    try {
      const result = await this.chat(messages, { ...options, useFallback: false });
      return { ...result, usedFallback: false };
    } catch (error) {
      console.warn(`Primary model failed, trying fallback:`, error);
    }

    // Try fallback model
    try {
      const result = await this.chat(messages, { ...options, useFallback: true });
      return { ...result, usedFallback: true };
    } catch (error) {
      throw new Error(
        `Both primary and fallback models failed. Last error: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  async generateEmbeddings(
    texts: string[],
    options: { useFallback?: boolean } = {}
  ): Promise<{ embeddings: number[][]; model: string }> {
    const { useFallback = false } = options;
    const model = useFallback ? this.fallbackEmbedModel : this.primaryEmbedModel;

    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/embeddings`, {
      method: "POST",
      body: JSON.stringify({
        model,
        prompt: texts[0], // Ollama embeddings API takes single prompt
      }),
    });

    if (!response.ok) {
      // Try fallback if primary fails
      if (!useFallback) {
        return this.generateEmbeddings(texts, { useFallback: true });
      }
      const error = await response.text();
      throw new Error(`Ollama embeddings failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return {
      embeddings: [data.embedding],
      model: data.model,
    };
  }
}

// Singleton instance
let ollamaClient: OllamaClient | null = null;

export function getOllamaClient(): OllamaClient {
  if (!ollamaClient) {
    ollamaClient = new OllamaClient();
  }
  return ollamaClient;
}
