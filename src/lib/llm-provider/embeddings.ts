import { env } from "@/src/lib/env";
import { trackWarn } from "@/src/lib/telemetry";
import type { OllamaClient } from "@/src/lib/ollama";
import type { LLMEmbeddingResponse, LLMProvider } from "@/src/lib/llm-provider/types";

export async function generateEmbeddings(
  provider: LLMProvider,
  ollama: OllamaClient,
  texts: string[],
): Promise<LLMEmbeddingResponse> {
  // Try to use the configured provider first
  if (provider === "openai" || provider === "openrouter" || provider === "aperture") {
    try {
      let apiKey: string | undefined;
      let endpoint = "";
      let model = "";

      if (provider === "openai") {
        apiKey = env.openaiApiKey;
        endpoint = "https://api.openai.com/v1/embeddings";
        model = "text-embedding-3-small";
      } else if (provider === "openrouter") {
        apiKey = env.openrouterApiKey;
        endpoint = "https://openrouter.ai/api/v1/embeddings";
        model = env.openrouterChatModel.includes("embed") ? env.openrouterChatModel : "openai/text-embedding-3-small";
      } else if (provider === "aperture") {
        // Use Aperture for embeddings if available
        apiKey = env.apertureApiKey !== "none" ? env.apertureApiKey : undefined;
        endpoint = `${env.apertureBaseUrl}/v1/embeddings`;
        // Use same embed model or default
        model = env.ollamaEmbedModel || "nomic-embed-text";
      }

      if (apiKey || provider === "aperture") {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }
        if (provider === "openrouter") {
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
            provider,
          };
        }
      }
    } catch {
      trackWarn("llm.embeddings.fallback", { provider, fallback: "ollama" });
    }
  }

  // Fallback to Ollama for embeddings
  const result = await ollama.generateEmbeddings(texts);
  return { embeddings: result.embeddings, model: result.model, provider: "ollama" };
}
