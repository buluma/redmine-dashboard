import { getOllamaClient } from "@/src/lib/ollama";
import { env } from "@/src/lib/env";

export const runtime = "nodejs";

export async function GET() {
  if (!env.enableAiFeatures) {
    return Response.json({
      available: false,
      featuresEnabled: false,
      message: "AI features are disabled",
    });
  }

  try {
    const client = getOllamaClient();
    const status = await client.getStatus();

    return Response.json(status);
  } catch (error) {
    return Response.json(
      {
        available: false,
        featuresEnabled: env.enableAiFeatures,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 }
    );
  }
}
