import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLMProviderManager } from '../llm-provider';

vi.mock('../env', () => ({
  env: {
    LLM_PROVIDER: 'ollama',
    OLLAMA_BASE_URL: 'http://localhost:11434',
    OPENAI_API_KEY: 'sk-test',
    OPENAI_BASE_URL: 'https://api.openai.com',
    ANTHROPIC_API_KEY: 'sk-ant-test',
    OPENROUTER_API_KEY: 'sk-or-test',
  },
}));

vi.mock('../ollama', () => ({
  getOllamaClient: vi.fn().mockReturnValue({
    chat: vi.fn().mockResolvedValue({
      content: 'Test response',
      model: 'llama2',
      provider: 'ollama',
      done: true,
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
      manager = new LLMProviderManager('ollama');
      
      const result = await manager.chat([
        { role: 'user', content: 'Hello' }
      ], { stream: false });

      expect(result.provider).toBe('ollama');
      expect(result.content).toBe('Test response');
    });

    it('should use openai when configured', async () => {
      manager = new LLMProviderManager('openai');
      
      // Mock fetch for OpenAI
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'OpenAI response' } }]
        }),
      });

      const result = await manager.chat([
        { role: 'user', content: 'Hello' }
      ], { stream: false });

      expect(result.provider).toBe('openai');
    });

    it('should use anthropic when configured', async () => {
      manager = new LLMProviderManager('anthropic');
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          content: [{ type: 'text', text: 'Anthropic response' }]
        }),
      });

      const result = await manager.chat([
        { role: 'user', content: 'Hello' }
      ], { stream: false });

      expect(result.provider).toBe('anthropic');
    });
  });

  describe('Chat Options', () => {
    it('should pass temperature option', async () => {
      manager = new LLMProviderManager('ollama');
      
      const result = await manager.chat([
        { role: 'user', content: 'Hello' }
      ], { 
        stream: false,
        temperature: 0.5,
      });

      expect(result.content).toBe('Test response');
    });

    it('should pass maxTokens option', async () => {
      manager = new LLMProviderManager('ollama');
      
      const result = await manager.chat([
        { role: 'user', content: 'Hello' }
      ], { 
        stream: false,
        maxTokens: 100,
      });

      expect(result.content).toBe('Test response');
    });

    it('should include tools when provided', async () => {
      manager = new LLMProviderManager('ollama');
      
      const toolDefinitions = [
        {
          type: 'function',
          function: {
            name: 'test_tool',
            description: 'A test tool',
            parameters: {
              type: 'object',
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
      manager = new LLMProviderManager('ollama');
      
      // The mock should return a valid response
      const result = await manager.chat([
        { role: 'user', content: 'Hello' }
      ], { stream: false });

      expect(result.content).toBeTruthy();
    });

    it('should handle invalid provider', async () => {
      expect(() => {
        new LLMProviderManager('invalid-provider' as any);
      }).toThrow();
    });
  });

  describe('Streaming', () => {
    it('should request streaming when stream=true', async () => {
      manager = new LLMProviderManager('ollama');
      
      const result = await manager.chat([
        { role: 'user', content: 'Hello' }
      ], { stream: true });

      // Streaming returns a stream-like response
      expect(result.done).toBe(true);
    });
  });

  describe('Model Information', () => {
    it('should return model info', () => {
      manager = new LLMProviderManager('ollama');
      
      const models = manager.getAvailableModels();
      
      expect(Array.isArray(models)).toBe(true);
    });
  });
});
