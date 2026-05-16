import { describe, expect, it, vi } from "vitest";

describe("AI Status API", () => {
  it("returns AI status", async () => {
    vi.resetModules();

    const checkHealth = vi.fn().mockResolvedValue({
      available: true,
      provider: "openai",
      models: [{ id: "gpt-5.4", name: "GPT-5.4", provider: "openai" }],
      primaryModel: "gpt-5.4",
    });

    vi.doMock("@/src/lib/llm-provider", () => ({
      getLLMProviderManager: () => ({ checkHealth }),
    }));
    vi.doMock("@/src/lib/ollama", () => ({
      getOllamaClient: vi.fn(),
    }));
    vi.doMock("@/src/lib/env", () => ({
      env: {
        ollamaBaseUrl: "http://localhost:11434",
        ollamaEmbedModel: "nomic-embed-text",
        aiSummarizeEnabled: true,
        aiSearchEnabled: true,
        aiCategorizeEnabled: true,
      },
    }));

    const { GET } = await import("@/app/api/ai/status/route");
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.available).toBe(true);
    expect(checkHealth).toHaveBeenCalledTimes(1);
  });
});

describe("Bootstrap API", () => {
  it("returns bootstrap info without auth", async () => {
    vi.resetModules();

    vi.doMock("@/src/lib/db", () => ({
      prisma: {
        userRedmineCredential: {
          count: vi.fn().mockResolvedValue(0),
        },
      },
    }));
    vi.doMock("@/src/lib/env", () => ({
      env: {
        databaseUrl: "file:./test.db",
        redmineBaseUrl: "https://redmine.example.com",
        redmineApiKey: "test-key",
      },
    }));
    vi.doMock("@/src/lib/session", () => ({ setSessionCookie: vi.fn() }));
    vi.doMock("@/src/lib/redmine-connect", () => ({ connectRedmineAccount: vi.fn() }));
    vi.doMock("@/src/lib/sync", () => ({ runSyncJob: vi.fn() }));
    vi.doMock("@/src/lib/log", () => ({ logEvent: vi.fn() }));

    const { GET } = await import("@/app/api/redmine/bootstrap/route");
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.configured).toBe(true);
    expect(data.canBootstrap).toBe(true);
    expect(data.activeCredentials).toBe(0);
  });
});
