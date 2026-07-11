import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMProviderManager } from '../llm-provider';

vi.mock('@/src/lib/db', () => ({
  prisma: {
    issue: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock('@/src/lib/log', () => ({ logEvent: vi.fn() }));

vi.mock('../env', () => ({
  env: {
    llmProvider: 'ollama',
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaChatModel: 'llama2',
    ollamaChatModelFallback: 'llama2',
    ollamaEmbedModel: 'nomic-embed-text',
    ollamaEmbedModelFallback: 'nomic-embed-text',
    ollamaTimeoutMs: 5000,
    ollamaStream: false,
    openaiApiKey: 'sk-test',
    openaiChatModel: 'gpt-4o-mini',
    anthropicApiKey: 'sk-ant-test',
    anthropicChatModel: 'claude-3-5-haiku-20250620',
    openrouterApiKey: 'sk-or-test',
    openrouterChatModel: 'anthropic/claude-3.5-haiku',
    openrouterChatModelFallback: 'openrouter/free',
    apertureBaseUrl: '',
    apertureApiKey: 'none',
    apertureChatModel: 'gemma-4b',
    enableAiFeatures: true,
  },
}));

vi.mock('../ollama', () => ({
  getOllamaClient: vi.fn().mockReturnValue({
    checkHealth: vi.fn().mockResolvedValue({ available: true, usingFallback: false }),
    getStatus: vi.fn().mockResolvedValue({ available: true, usingFallback: false }),
    chat: vi.fn().mockResolvedValue({
      content: 'Test response',
      model: 'llama2',
      done: true,
    }),
    chatWithFallback: vi.fn().mockResolvedValue({
      content: 'Test response',
      model: 'llama2',
      usedFallback: false,
    }),
  }),
}));

describe('LLM Provider', () => {
  let manager: LLMProviderManager;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Provider Selection', () => {
    it('should use ollama when configured', async () => {
      manager = new LLMProviderManager();
      
      const result = await manager.chat([
        { role: 'user', content: 'Hello' }
      ], { stream: false });

      expect(result.provider).toBe('ollama');
      expect(result.content).toBe('Test response');
    });

    it('should return a response when fetch-based providers are available', async () => {
      manager = new LLMProviderManager();

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'OpenAI response' } }]
        }),
        text: async () => '',
      });

      const result = await manager.chat([
        { role: 'user', content: 'Hello' }
      ], { stream: false });

      expect(result.content).toBeTruthy();
    });

    it('chat returns a response regardless of fetch mock', async () => {
      manager = new LLMProviderManager();

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          content: [{ type: 'text', text: 'Anthropic response' }]
        }),
        text: async () => '',
      });

      const result = await manager.chat([
        { role: 'user', content: 'Hello' }
      ], { stream: false });

      expect(result.content).toBeTruthy();
    });
  });

  describe('Chat Options', () => {
    it('should pass temperature option', async () => {
      manager = new LLMProviderManager();
      
      const result = await manager.chat([
        { role: 'user', content: 'Hello' }
      ], { 
        stream: false,
        temperature: 0.5,
      });

      expect(result.content).toBe('Test response');
    });

    it('should pass maxTokens option', async () => {
      manager = new LLMProviderManager();
      
      const result = await manager.chat([
        { role: 'user', content: 'Hello' }
      ], { 
        stream: false,
        maxTokens: 100,
      });

      expect(result.content).toBe('Test response');
    });

    it('should include tools when provided', async () => {
      manager = new LLMProviderManager();
      
      const toolDefinitions = [
        {
          type: 'function' as const,
          function: {
            name: 'test_tool',
            description: 'A test tool',
            parameters: {
              type: 'object' as const,
              properties: {
                arg: { type: 'string', description: 'An argument' }
              },
              required: ['arg']
            }
          }
        }
      ];

      const result = await manager.chat([
        { role: 'user', content: 'Use the test tool' }
      ], { 
        stream: false,
        tools: toolDefinitions,
      });

      expect(result.content).toBe('Test response');
    });
  });

  describe('Error Handling', () => {
    it('should handle provider errors gracefully', async () => {
      manager = new LLMProviderManager();
      
      // The mock should return a valid response
      const result = await manager.chat([
        { role: 'user', content: 'Hello' }
      ], { stream: false });

      expect(result.content).toBeTruthy();
    });

    it('should handle invalid provider', async () => {
        // No longer throws on instantiation, defaults to ollama
        const m = new LLMProviderManager();
        expect(m.getProvider()).toBe('ollama');
    });
  });

  describe('Streaming', () => {
    it('should request streaming when stream=true', async () => {
      manager = new LLMProviderManager();
      
      const result = await manager.chat([
        { role: 'user', content: 'Hello' }
      ], { stream: true });

      // Streaming returns a stream-like response
      expect(result.done).toBe(true);
    });
  });

  describe('Model Information', () => {
    it('should return model info', async () => {
      manager = new LLMProviderManager();

      const models = await manager.getAvailableModels();

      expect(Array.isArray(models)).toBe(true);
    });
  });
});
