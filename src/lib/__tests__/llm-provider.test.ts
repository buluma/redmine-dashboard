import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMProviderManager } from '../llm-provider';

const { envState, mockOllamaChat, mockOllamaCheckHealth } = vi.hoisted(() => ({
  mockOllamaChat: vi.fn().mockResolvedValue({
    content: 'Test response',
    model: 'llama2',
    done: true,
  }),
  mockOllamaCheckHealth: vi.fn().mockResolvedValue({ available: true, usingFallback: false }),
  envState: {
    llmProvider: 'ollama' as string,
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaChatModel: 'llama2',
    ollamaChatModelFallback: 'llama2',
    ollamaTimeoutMs: 5000,
    ollamaStream: false,
    openaiApiKey: 'sk-test' as string | undefined,
    openaiChatModel: 'gpt-4o-mini',
    anthropicApiKey: 'sk-ant-test' as string | undefined,
    anthropicChatModel: 'claude-3-5-haiku-20250620',
    openrouterApiKey: 'sk-or-test' as string | undefined,
    openrouterChatModel: 'anthropic/claude-3.5-haiku',
    openrouterChatModelFallback: 'openrouter/free',
    apertureBaseUrl: '' as string,
    apertureApiKey: 'none',
    apertureChatModel: 'gemma-4b',
    enableAiFeatures: true,
  },
}));

vi.mock('@/src/lib/db', () => ({
  prisma: {
    issue: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock('@/src/lib/log', () => ({ logEvent: vi.fn() }));
vi.mock('@/src/lib/telemetry', () => ({ trackWarn: vi.fn() }));

vi.mock('../env', () => ({ env: envState }));

vi.mock('../ollama', () => ({
  getOllamaClient: vi.fn().mockReturnValue({
    checkHealth: mockOllamaCheckHealth,
    getStatus: vi.fn().mockResolvedValue({ available: true, usingFallback: false }),
    chat: mockOllamaChat,
    chatWithFallback: vi.fn().mockResolvedValue({
      content: 'Test response',
      model: 'llama2',
      usedFallback: false,
    }),
  }),
}));

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: async () => JSON.stringify(body),
  } as Response;
}

/** Builds a fake SSE stream Response body compatible with getReader(). */
function sseResponse(lines: string[]) {
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (index >= lines.length) return { done: true, value: undefined };
          const chunk = lines[index++];
          return { done: false, value: new TextEncoder().encode(chunk) };
        },
        releaseLock: () => {},
      }),
    },
    text: async () => '',
  } as unknown as Response;
}

describe('LLM Provider', () => {
  let manager: LLMProviderManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOllamaChat.mockResolvedValue({ content: 'Test response', model: 'llama2', done: true });
    mockOllamaCheckHealth.mockResolvedValue({ available: true, usingFallback: false });
    envState.llmProvider = 'ollama';
    envState.openaiApiKey = 'sk-test';
    envState.anthropicApiKey = 'sk-ant-test';
    envState.openrouterApiKey = 'sk-or-test';
    envState.apertureBaseUrl = 'http://aperture.local';
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
      envState.llmProvider = 'openai';
      manager = new LLMProviderManager();

      global.fetch = vi.fn().mockResolvedValue(jsonResponse({
        model: 'gpt-4o-mini',
        choices: [{ message: { content: 'OpenAI response' } }],
      }));

      const result = await manager.chat([
        { role: 'user', content: 'Hello' }
      ], { stream: false });

      expect(result.content).toBe('OpenAI response');
      expect(result.provider).toBe('openai');
    });

    it('should return a response for anthropic', async () => {
      envState.llmProvider = 'anthropic';
      manager = new LLMProviderManager();

      global.fetch = vi.fn().mockResolvedValue(jsonResponse({
        model: 'claude-3-5-haiku-20250620',
        content: [{ type: 'text', text: 'Anthropic response' }],
      }));

      const result = await manager.chat([
        { role: 'user', content: 'Hello' }
      ], { stream: false });

      expect(result.content).toBe('Anthropic response');
      expect(result.provider).toBe('anthropic');
    });

    it('should default to ollama for an unset/invalid provider', () => {
      const m = new LLMProviderManager();
      expect(m.getProvider()).toBe('ollama');
    });
  });

  describe('OpenAI', () => {
    beforeEach(() => {
      envState.llmProvider = 'openai';
    });

    it('checkHealth reports unavailable without an API key', async () => {
      envState.openaiApiKey = undefined;
      manager = new LLMProviderManager();

      const status = await manager.checkHealth();

      expect(status).toMatchObject({ available: false, provider: 'openai', error: 'OpenAI API key not configured' });
    });

    it('checkHealth lists gpt- models when the key works', async () => {
      manager = new LLMProviderManager();
      global.fetch = vi.fn().mockResolvedValue(jsonResponse({
        data: [{ id: 'gpt-4o-mini' }, { id: 'text-embedding-3-small' }],
      }));

      const status = await manager.checkHealth();

      expect(status.available).toBe(true);
      expect(status.models).toEqual([
        expect.objectContaining({ id: 'gpt-4o-mini', provider: 'openai' }),
      ]);
    });

    it('checkHealth reports the API error status when the request fails', async () => {
      manager = new LLMProviderManager();
      global.fetch = vi.fn().mockResolvedValue(jsonResponse({}, false, 401));

      const status = await manager.checkHealth();

      expect(status).toMatchObject({ available: false, error: 'OpenAI API error: 401' });
    });

    it('chat parses tool_calls from the response', async () => {
      manager = new LLMProviderManager();
      global.fetch = vi.fn().mockResolvedValue(jsonResponse({
        model: 'gpt-4o-mini',
        choices: [{
          message: {
            content: '',
            tool_calls: [{ id: 'call_1', function: { name: 'get_issue', arguments: '{"issue_id":"42"}' } }],
          },
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }));

      const result = await manager.chat([{ role: 'user', content: 'get issue 42' }]);

      expect(result.toolCalls).toEqual([{ id: 'call_1', name: 'get_issue', arguments: { issue_id: '42' } }]);
      expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    });

    it('chat streams SSE deltas into the final content', async () => {
      manager = new LLMProviderManager();
      global.fetch = vi.fn().mockResolvedValue(sseResponse([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n',
        'data: {"choices":[{"delta":{"content":"lo"}}],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n',
        'data: [DONE]\n',
      ]));

      const result = await manager.chat([{ role: 'user', content: 'Hi' }], { stream: true });

      expect(result.content).toBe('Hello');
      expect(result.provider).toBe('openai');
      expect(result.usage).toMatchObject({ promptTokens: 3, completionTokens: 2 });
    });

    it('falls back to ollama when the OpenAI request throws', async () => {
      manager = new LLMProviderManager();
      global.fetch = vi.fn().mockRejectedValue(new Error('network down'));

      const result = await manager.chat([{ role: 'user', content: 'Hi' }]);

      expect(result.provider).toBe('ollama');
      expect(mockOllamaChat).toHaveBeenCalled();
    });
  });

  describe('Anthropic', () => {
    beforeEach(() => {
      envState.llmProvider = 'anthropic';
    });

    it('checkHealth reports unavailable without an API key', async () => {
      envState.anthropicApiKey = undefined;
      manager = new LLMProviderManager();

      const status = await manager.checkHealth();

      expect(status).toMatchObject({ available: false, provider: 'anthropic', error: 'Anthropic API key not configured' });
    });

    it('checkHealth treats a 400 (valid model, no content) as available', async () => {
      manager = new LLMProviderManager();
      global.fetch = vi.fn().mockResolvedValue(jsonResponse({}, false, 400));

      const status = await manager.checkHealth();

      expect(status.available).toBe(true);
      expect(status.models.length).toBeGreaterThan(0);
    });

    it('checkHealth reports unavailable on a real error status', async () => {
      manager = new LLMProviderManager();
      global.fetch = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));

      const status = await manager.checkHealth();

      expect(status).toMatchObject({ available: false, error: 'Anthropic API error: 500' });
    });

    it('chat separates the system message and parses tool_use blocks', async () => {
      manager = new LLMProviderManager();
      const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({
        model: 'claude-3-5-haiku-20250620',
        content: [
          { type: 'text', text: 'Sure, on it.' },
          { type: 'tool_use', id: 'tu_1', name: 'get_issue', input: { issue_id: '42' } },
        ],
        usage: { input_tokens: 20, output_tokens: 8 },
      }));
      global.fetch = fetchSpy;

      const result = await manager.chat([
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'get issue 42' },
      ]);

      expect(result.content).toBe('Sure, on it.');
      expect(result.toolCalls).toEqual([{ id: 'tu_1', name: 'get_issue', arguments: { issue_id: '42' } }]);
      const requestBody = JSON.parse(String(fetchSpy.mock.calls[0][1].body));
      expect(requestBody.system).toBe('You are helpful.');
      expect(requestBody.messages).toEqual([{ role: 'user', content: 'get issue 42' }]);
    });

    it('falls back to ollama when the Anthropic request fails', async () => {
      manager = new LLMProviderManager();
      global.fetch = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));

      const result = await manager.chat([{ role: 'user', content: 'Hi' }]);

      expect(result.provider).toBe('ollama');
    });
  });

  describe('OpenRouter', () => {
    beforeEach(() => {
      envState.llmProvider = 'openrouter';
    });

    it('checkHealth reports unavailable without an API key', async () => {
      envState.openrouterApiKey = undefined;
      manager = new LLMProviderManager();

      const status = await manager.checkHealth();

      expect(status).toMatchObject({ available: false, provider: 'openrouter' });
    });

    it('chat uses the primary model first', async () => {
      manager = new LLMProviderManager();
      const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({
        model: 'anthropic/claude-3.5-haiku',
        choices: [{ message: { content: 'primary ok' } }],
      }));
      global.fetch = fetchSpy;

      const result = await manager.chat([{ role: 'user', content: 'Hi' }]);

      expect(result.content).toBe('primary ok');
      const body = JSON.parse(String(fetchSpy.mock.calls[0][1].body));
      expect(body.model).toBe('anthropic/claude-3.5-haiku');
    });

    it('falls back to the configured fallback model when the primary model fails', async () => {
      manager = new LLMProviderManager();
      let call = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        call++;
        if (call === 1) return Promise.resolve(jsonResponse({}, false, 503));
        return Promise.resolve(jsonResponse({
          model: 'openrouter/free',
          choices: [{ message: { content: 'fallback ok' } }],
        }));
      });

      const result = await manager.chat([{ role: 'user', content: 'Hi' }]);

      expect(result.content).toBe('fallback ok');
      expect(call).toBe(2);
    });

    it('falls back to ollama when both the primary and fallback OpenRouter models fail', async () => {
      manager = new LLMProviderManager();
      global.fetch = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));

      const result = await manager.chat([{ role: 'user', content: 'Hi' }]);

      expect(result.provider).toBe('ollama');
    });
  });

  describe('Aperture', () => {
    beforeEach(() => {
      envState.llmProvider = 'aperture';
    });

    it('checkHealth reports unavailable without a base URL', async () => {
      envState.apertureBaseUrl = '';
      manager = new LLMProviderManager();

      const status = await manager.checkHealth();

      expect(status).toMatchObject({ available: false, provider: 'aperture', error: 'Aperture not configured' });
    });

    it('checkHealth lists models when reachable', async () => {
      manager = new LLMProviderManager();
      global.fetch = vi.fn().mockResolvedValue(jsonResponse({
        data: [{ id: 'gemma-4b', name: 'Gemma 4B' }],
      }));

      const status = await manager.checkHealth();

      expect(status.available).toBe(true);
      expect(status.models).toEqual([
        expect.objectContaining({ id: 'gemma-4b', name: 'Gemma 4B', provider: 'aperture' }),
      ]);
    });

    it('chat streams SSE deltas into the final content', async () => {
      manager = new LLMProviderManager();
      global.fetch = vi.fn().mockResolvedValue(sseResponse([
        'data: {"choices":[{"delta":{"content":"Ap"}}]}\n',
        'data: {"choices":[{"delta":{"content":"erture"}}]}\n',
        'data: [DONE]\n',
      ]));

      const result = await manager.chat([{ role: 'user', content: 'Hi' }], { stream: true });

      expect(result.content).toBe('Aperture');
      expect(result.provider).toBe('aperture');
    });

    it('falls back to ollama when Aperture is unreachable', async () => {
      manager = new LLMProviderManager();
      global.fetch = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));

      const result = await manager.chat([{ role: 'user', content: 'Hi' }]);

      expect(result.provider).toBe('ollama');
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

  describe('Streaming', () => {
    it('should request streaming when stream=true', async () => {
      manager = new LLMProviderManager();

      const result = await manager.chat([
        { role: 'user', content: 'Hello' }
      ], { stream: true });

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
