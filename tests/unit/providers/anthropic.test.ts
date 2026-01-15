import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicProvider } from '../../../src/providers/anthropic';
import { mockFetchResponse, mockFetchError, mockFetch } from '../../setup';

describe('AnthropicProvider', () => {
  const apiKey = 'test-api-key';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with API key', () => {
      const provider = new AnthropicProvider({ apiKey });
      expect(provider.name).toBe('anthropic');
    });

    it('should throw without API key', () => {
      expect(() => new AnthropicProvider({ apiKey: '' })).toThrow(/Authentication failed/);
    });

    it('should use default model', () => {
      const provider = new AnthropicProvider({ apiKey });
      expect(provider).toBeDefined();
    });
  });

  describe('complete()', () => {
    it('should make completion request', async () => {
      const provider = new AnthropicProvider({ apiKey });

      mockFetchResponse({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello!' }],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 5,
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

    it('should extract system prompt from messages', async () => {
      const provider = new AnthropicProvider({ apiKey });

      mockFetchResponse({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'OK' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await provider.complete({
        messages: [
          { id: '0', role: 'system', content: 'You are helpful', timestamp: Date.now() },
          { id: '1', role: 'user', content: 'Hi', timestamp: Date.now() },
        ],
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(requestBody.system).toBe('You are helpful');
      expect(
        requestBody.messages.find((m: { role: string }) => m.role === 'system')
      ).toBeUndefined();
    });

    it('should handle tool use in response', async () => {
      const provider = new AnthropicProvider({ apiKey });

      mockFetchResponse({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me check the weather.' },
          {
            type: 'tool_use',
            id: 'toolu_123',
            name: 'get_weather',
            input: { location: 'Boston' },
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      const response = await provider.complete({
        messages: [{ id: '1', role: 'user', content: 'Weather?', timestamp: Date.now() }],
      });

      expect(response.content).toBe('Let me check the weather.');
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls![0].name).toBe('get_weather');
      expect(response.toolCalls![0].arguments).toEqual({ location: 'Boston' });
      expect(response.finishReason).toBe('tool_calls');
    });

    it('should convert tools to Anthropic format', async () => {
      const provider = new AnthropicProvider({ apiKey });

      mockFetchResponse({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'OK' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await provider.complete({
        messages: [{ id: '1', role: 'user', content: 'Hi', timestamp: Date.now() }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'test_tool',
              description: 'A test tool',
              parameters: { type: 'object', properties: { input: { type: 'string' } } },
            },
          },
        ],
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(requestBody.tools).toEqual([
        {
          name: 'test_tool',
          description: 'A test tool',
          input_schema: { type: 'object', properties: { input: { type: 'string' } } },
        },
      ]);
    });

    it('should handle tool result messages', async () => {
      const provider = new AnthropicProvider({ apiKey });

      mockFetchResponse({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'The weather is sunny.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 20, output_tokens: 10 },
      });

      await provider.complete({
        messages: [
          { id: '1', role: 'user', content: 'Weather?', timestamp: Date.now() },
          { id: '2', role: 'assistant', content: 'Checking...', timestamp: Date.now() },
          {
            id: '3',
            role: 'tool',
            content: '{"temperature": 72}',
            timestamp: Date.now(),
            metadata: { toolCallId: 'toolu_123' },
          },
        ],
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const userMessages = requestBody.messages.filter((m: { role: string }) => m.role === 'user');

      // Tool results should be wrapped in user message with tool_result content
      const lastUserMessage = userMessages[userMessages.length - 1];
      expect(Array.isArray(lastUserMessage.content)).toBe(true);
      expect(lastUserMessage.content[0].type).toBe('tool_result');
    });

    it('should include anthropic-version header', async () => {
      const provider = new AnthropicProvider({ apiKey });

      mockFetchResponse({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'OK' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await provider.complete({
        messages: [{ id: '1', role: 'user', content: 'Hi', timestamp: Date.now() }],
      });

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['anthropic-version']).toBeDefined();
    });
  });
});
