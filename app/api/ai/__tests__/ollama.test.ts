import { describe, it, expect, beforeEach, vi } from "vitest";
import { OllamaClient, getOllamaClient } from "@/src/lib/ollama";

// Mock the env module
vi.mock("@/src/lib/env", () => ({
  env: {
    ollamaBaseUrl: "http://localhost:11434",
    ollamaChatModel: "qwen3.5:cloud",
    ollamaEmbedModel: "nomic-embed-text-v2-moe:latest",
    ollamaTimeoutMs: 120000,
    ollamaStream: false,
    ollamaChatModelFallback: "gpt-oss:20b-cloud",
    ollamaEmbedModelFallback: "nomic-embed-text:latest",
    enableAiFeatures: true,
    aiSummarizeEnabled: true,
    aiSearchEnabled: true,
    aiCategorizeEnabled: true,
  },
}));

describe("OllamaClient", () => {
  let client: OllamaClient;

  beforeEach(() => {
    client = new OllamaClient();
  });

  it("should be instantiated with correct defaults", () => {
    expect(client).toBeDefined();
  });

  it("should return current chat model", () => {
    expect(client.getCurrentChatModel(false)).toBe("qwen3.5:cloud");
    expect(client.getCurrentChatModel(true)).toBe("gpt-oss:20b-cloud");
  });
});

describe("getOllamaClient", () => {
  it("should return a singleton instance", () => {
    const client1 = getOllamaClient();
    const client2 = getOllamaClient();
    expect(client1).toBe(client2);
  });
});
