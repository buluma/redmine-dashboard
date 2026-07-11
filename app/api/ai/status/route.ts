import { NextResponse } from "next/server";
import { getLLMProviderManager, type LLMModel } from "@/src/lib/llm-provider";
import type { OllamaModel } from "@/src/lib/ollama";
import { env } from "@/src/lib/env";

export const runtime = "nodejs";

export async function GET() {
  try {
    const manager = getLLMProviderManager();
    const status = await manager.checkHealth();

    // If using Ollama, also fetch the actual model list
    let models: LLMModel[] = status.models;
    if (status.provider === "ollama") {
      try {
        const response = await fetch(`${env.ollamaBaseUrl}/api/tags`);
        if (response.ok) {
          const data = await response.json();
          const ollamaModels: OllamaModel[] = data.models || [];
          models = ollamaModels.map(m => ({
            id: m.name,
            name: m.name,
            provider: "ollama" as const,
            description: m.size ? `Size: ${(m.size / 1e9).toFixed(1)}GB` : undefined
          }));
        }
      } catch {
        // Ignore model list errors
      }
    }

    return NextResponse.json({
      ...status,
      models,
      config: {
        provider: status.provider,
        primaryModel: status.primaryModel,
        embeddingModel: env.ollamaEmbedModel,
        features: {
          summarize: env.aiSummarizeEnabled,
          search: env.aiSearchEnabled,
          categorize: env.aiCategorizeEnabled,
          chat: true
        }
      }
    });
  } catch (error) {
    return NextResponse.json(
      { available: false, error: error instanceof Error ? error.message : "Failed to check status" },
      { status: 500 }
    );
  }
}
