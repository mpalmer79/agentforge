import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIProvider } from '../../../src/providers/openai';
import { mockFetchResponse, mockFetchError, mockStreamingResponse, mockFetch } from '../../setup';

describe('OpenAIProvider', () => {
  const apiKey = 'test-api-key';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with API key', () => {
      const provider = new OpenAIProvider({ apiKey });
      expect(provider.name).toBe('openai');
    });

    it('should throw without API key', () => {
      expect(() => new OpenAIProvider({ apiKey: '' })).toThrow(/Authentication failed/);
    });

    it('should use default model', () => {
      const provider = new OpenAIProvider({ apiKey });
      expect(provider).toBeDefined();
    });

    it('should accept custom model', () => {
      const provider = new OpenAIProvider({ apiKey, model: 'gpt-4o' });
      expect(provider).toBeDefined();
    });

    it('should accept organization', () => {
      const provider = new OpenAIProvider({ apiKey, organization: 'org-123' });
      expect(provider).toBeDefined();
    });
  });

  describe('complete()', () => {
    it('should make completion request', async () => {
      const provider = new OpenAIProvider({ apiKey });

      mockFetchResponse({
        id: 'chatcmpl-123',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello!' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      });

      const response = await provider.complete({
        messages: [{ id: '1', role: 'user', content: 'Hi', timestamp: Date.now() }],
      });

      expect(response.content).toBe('Hello!');
      expect(response.finishReason).toBe('stop');
      expect(response.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });
    });

    it('should handle tool calls in response', async () => {
      const provider = new OpenAIProvider({ apiKey });

      mockFetchResponse({
        id: 'chatcmpl-123',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"location":"Boston"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      });

      const response = await provider.complete({
        messages: [{ id: '1', role: 'user', content: 'Weather?', timestamp: Date.now() }],
      });

      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls![0].name).toBe('get_weather');
      expect(response.toolCalls![0].arguments).toEqual({ location: 'Boston' });
      expect(response.finishReason).toBe('tool_calls');
    });

    it('should include tools in request when provided', async () => {
      const provider = new OpenAIProvider({ apiKey });

      mockFetchResponse({
        id: 'chatcmpl-123',
        choices: [
          { index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' },
        ],
      });

      await provider.complete({
        messages: [{ id: '1', role: 'user', content: 'Hi', timestamp: Date.now() }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'test_tool',
              description: 'A test tool',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
      });

      expect(mockFetch).toHaveBeenCalled();
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.tools).toBeDefined();
      expect(requestBody.tool_choice).toBe('auto');
    });

    it('should handle API errors', async () => {
      const provider = new OpenAIProvider({ apiKey, maxRetries: 0 });

      mockFetchError('Rate limit exceeded', 429);

      await expect(
        provider.complete({
          messages: [{ id: '1', role: 'user', content: 'Hi', timestamp: Date.now() }],
        })
      ).rejects.toThrow(/429/);
    });

    it('should convert tool messages correctly', async () => {
      const provider = new OpenAIProvider({ apiKey });

      mockFetchResponse({
        id: 'chatcmpl-123',
        choices: [
          { index: 0, message: { role: 'assistant', content: 'Done' }, finish_reason: 'stop' },
        ],
      });

      await provider.complete({
        messages: [
          { id: '1', role: 'user', content: 'Hi', timestamp: Date.now() },
          { id: '2', role: 'assistant', content: '', timestamp: Date.now() },
          {
            id: '3',
            role: 'tool',
            content: '{"result": "success"}',
            timestamp: Date.now(),
            metadata: { toolCallId: 'call_123' },
          },
        ],
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const toolMessage = requestBody.messages.find((m: { role: string }) => m.role === 'tool');

      expect(toolMessage.tool_call_id).toBe('call_123');
    });
  });

  describe('stream()', () => {
    it('should stream content chunks', async () => {
      const provider = new OpenAIProvider({ apiKey });

      mockStreamingResponse([
        JSON.stringify({
          id: 'chatcmpl-123',
          choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
        }),
        JSON.stringify({
          id: 'chatcmpl-123',
          choices: [{ index: 0, delta: { content: ' world' }, finish_reason: null }],
        }),
        JSON.stringify({
          id: 'chatcmpl-123',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        }),
      ]);

      const chunks: string[] = [];

      for await (const chunk of provider.stream({
        messages: [{ id: '1', role: 'user', content: 'Hi', timestamp: Date.now() }],
      })) {
        if (chunk.delta.content) {
          chunks.push(chunk.delta.content);
        }
      }

      expect(chunks).toEqual(['Hello', ' world']);
    });
  });
});
