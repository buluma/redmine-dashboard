import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/src/lib/auth";
import { getLLMProviderManager, type LLMModel } from "@/src/lib/llm-provider";
import { getOllamaClient, type OllamaModel } from "@/src/lib/ollama";
import { env } from "@/src/lib/env";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const overrideModel = searchParams.get("model");

    const manager = getLLMProviderManager();
    const status = await manager.checkHealth();

    // If using Ollama, also fetch the actual model list
    let models: LLMModel[] = status.models;
    if (status.provider === "ollama") {
      try {
        const ollama = getOllamaClient();
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

    // If a model override is provided, test if it's available and works
    let effectiveModel = overrideModel || status.primaryModel;
    let modelAvailable = !overrideModel; // If no override, assume primary is available

    if (overrideModel && status.provider === "ollama") {
      // Check if the requested model is in the available list
      modelAvailable = models.some(m => m.name === overrideModel);
    }

    return NextResponse.json({
      ...status,
      models,
      primaryModel: effectiveModel,
      modelAvailable,
      overrideModel: overrideModel || null,
      config: {
        provider: status.provider,
        primaryModel: effectiveModel,
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
