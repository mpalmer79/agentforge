import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Agent } from '../../src/agent';
import { createMockProvider, createToolCallingMockProvider, createErrorMockProvider } from '../mocks/providers';
import { calculatorTool, weatherTool, createErrorTool } from '../mocks/tools';
import { createMiddleware } from '../../src/middleware';

describe('Agent', () => {
  describe('constructor', () => {
    it('should create an agent with minimal config', () => {
      const agent = new Agent({
        provider: createMockProvider(),
      });

      expect(agent).toBeDefined();
      expect(agent.getTools()).toHaveLength(0);
    });

    it('should create an agent with tools', () => {
      const agent = new Agent({
        provider: createMockProvider(),
        tools: [calculatorTool, weatherTool],
      });

      expect(agent.getTools()).toHaveLength(2);
    });

    it('should create an agent with system prompt', () => {
      const agent = new Agent({
        provider: createMockProvider(),
        systemPrompt: 'You are a helpful assistant.',
      });

      expect(agent).toBeDefined();
    });
  });

  describe('run()', () => {
    it('should handle string input', async () => {
      const mockProvider = createMockProvider();
      const agent = new Agent({ provider: mockProvider });

      const response = await agent.run('Hello!');

      expect(response.content).toBe('Mock response content');
      expect(mockProvider.complete).toHaveBeenCalled();
    });

    it('should handle message array input', async () => {
      const mockProvider = createMockProvider();
      const agent = new Agent({ provider: mockProvider });

      const response = await agent.run([
        { id: '1', role: 'user', content: 'Hello!', timestamp: Date.now() },
      ]);

      expect(response.content).toBe('Mock response content');
    });

    it('should include system prompt in messages', async () => {
      const mockProvider = createMockProvider();
      const agent = new Agent({
        provider: mockProvider,
        systemPrompt: 'You are helpful.',
      });

      await agent.run('Hello!');

      const completeCalls = vi.mocked(mockProvider.complete).mock.calls;
      const messages = completeCalls[0][0].messages;

      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toBe('You are helpful.');
    });

    it('should execute tool calls', async () => {
      const mockProvider = createToolCallingMockProvider('calculator', {
        operation: 'add',
        a: 5,
        b: 3,
      });

      const agent = new Agent({
        provider: mockProvider,
        tools: [calculatorTool],
      });

      const response = await agent.run('Add 5 and 3');

      expect(response.content).toBe('Final response after tool call');
      expect(response.toolResults).toHaveLength(1);
      expect(response.toolResults![0].result).toEqual({ result: 8 });
    });

    it('should handle tool execution errors gracefully', async () => {
      const mockProvider = createToolCallingMockProvider('error_tool', {});
      const errorTool = createErrorTool('error_tool', 'Tool failed!');

      const agent = new Agent({
        provider: mockProvider,
        tools: [errorTool],
      });

      const response = await agent.run('Use the error tool');

      expect(response.toolResults).toHaveLength(1);
      expect(response.toolResults![0].error).toContain('Tool failed!');
    });

    it('should handle unknown tool gracefully', async () => {
      const mockProvider = createToolCallingMockProvider('unknown_tool', {});

      const agent = new Agent({
        provider: mockProvider,
        tools: [calculatorTool],
      });

      const response = await agent.run('Use unknown tool');

      expect(response.toolResults![0].error).toContain('not found');
    });

    it('should respect maxIterations', async () => {
      // Provider that always returns tool calls
      const infiniteToolProvider = {
        name: 'infinite',
        complete: vi.fn().mockResolvedValue({
          id: 'resp',
          content: '',
          toolCalls: [{ id: 'tc', name: 'calculator', arguments: { operation: 'add', a: 1, b: 1 } }],
          finishReason: 'tool_calls',
        }),
        stream: vi.fn(),
      };

      const agent = new Agent({
        provider: infiniteToolProvider,
        tools: [calculatorTool],
        maxIterations: 3,
      });

      await expect(agent.run('Loop forever')).rejects.toThrow(/maximum iterations/);
      expect(infiniteToolProvider.complete).toHaveBeenCalledTimes(3);
    });

    it('should support abort signal', async () => {
      const slowProvider = {
        name: 'slow',
        complete: vi.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return { id: 'resp', content: 'Done', finishReason: 'stop' };
        }),
        stream: vi.fn(),
      };

      const agent = new Agent({ provider: slowProvider });
      const abortController = new AbortController();

      // Abort immediately
      abortController.abort();

      await expect(
        agent.run('Hello', { signal: abortController.signal })
      ).rejects.toThrow(/aborted/);
    });

    it('should include usage statistics', async () => {
      const agent = new Agent({ provider: createMockProvider() });
      const response = await agent.run('Hello');

      expect(response.usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      });
    });
  });

  describe('stream()', () => {
    it('should yield content chunks', async () => {
      const agent = new Agent({ provider: createMockProvider() });
      const chunks: string[] = [];

      for await (const event of agent.stream('Hello')) {
        if (event.type === 'content') {
          chunks.push(event.data as string);
        }
      }

      expect(chunks).toEqual(['Mock ', 'streaming ', 'response']);
    });

    it('should yield done event at end', async () => {
      const agent = new Agent({ provider: createMockProvider() });
      let doneReceived = false;

      for await (const event of agent.stream('Hello')) {
        if (event.type === 'done') {
          doneReceived = true;
        }
      }

      expect(doneReceived).toBe(true);
    });
  });

  describe('tool management', () => {
    it('should add tools dynamically', () => {
      const agent = new Agent({ provider: createMockProvider() });

      expect(agent.getTools()).toHaveLength(0);

      agent.addTool(calculatorTool);
      expect(agent.getTools()).toHaveLength(1);

      agent.addTool(weatherTool);
      expect(agent.getTools()).toHaveLength(2);
    });

    it('should remove tools by name', () => {
      const agent = new Agent({
        provider: createMockProvider(),
        tools: [calculatorTool, weatherTool],
      });

      expect(agent.getTools()).toHaveLength(2);

      const removed = agent.removeTool('calculator');
      expect(removed).toBe(true);
      expect(agent.getTools()).toHaveLength(1);

      const notRemoved = agent.removeTool('nonexistent');
      expect(notRemoved).toBe(false);
    });
  });

  describe('system prompt', () => {
    it('should update system prompt', async () => {
      const mockProvider = createMockProvider();
      const agent = new Agent({
        provider: mockProvider,
        systemPrompt: 'Original prompt',
      });

      agent.setSystemPrompt('Updated prompt');
      await agent.run('Test');

      const completeCalls = vi.mocked(mockProvider.complete).mock.calls;
      const messages = completeCalls[0][0].messages;

      expect(messages[0].content).toBe('Updated prompt');
    });
  });

  describe('memory management', () => {
    it('should apply sliding window strategy', async () => {
      const mockProvider = createMockProvider();
      const agent = new Agent({
        provider: mockProvider,
        memory: {
          maxMessages: 3,
          strategy: 'sliding-window',
        },
      });

      const manyMessages = [
        { id: '1', role: 'user' as const, content: 'Message 1', timestamp: 1 },
        { id: '2', role: 'assistant' as const, content: 'Response 1', timestamp: 2 },
        { id: '3', role: 'user' as const, content: 'Message 2', timestamp: 3 },
        { id: '4', role: 'assistant' as const, content: 'Response 2', timestamp: 4 },
        { id: '5', role: 'user' as const, content: 'Message 3', timestamp: 5 },
      ];

      await agent.run(manyMessages);

      const completeCalls = vi.mocked(mockProvider.complete).mock.calls;
      const sentMessages = completeCalls[0][0].messages;

      // Should only send last 3 messages
      expect(sentMessages.length).toBeLessThanOrEqual(3);
    });

    it('should preserve system messages in memory trimming', async () => {
      const mockProvider = createMockProvider();
      const agent = new Agent({
        provider: mockProvider,
        systemPrompt: 'System prompt',
        memory: {
          maxMessages: 2,
          strategy: 'sliding-window',
        },
      });

      await agent.run([
        { id: '1', role: 'user', content: 'Msg 1', timestamp: 1 },
        { id: '2', role: 'assistant', content: 'Resp 1', timestamp: 2 },
        { id: '3', role: 'user', content: 'Msg 2', timestamp: 3 },
      ]);

      const completeCalls = vi.mocked(mockProvider.complete).mock.calls;
      const sentMessages = completeCalls[0][0].messages;

      // System message should always be present
      expect(sentMessages.find((m) => m.role === 'system')).toBeDefined();
    });
  });

  describe('middleware integration', () => {
    it('should run beforeRequest middleware', async () => {
      const beforeRequest = vi.fn().mockImplementation((ctx) => ctx);

      const middleware = createMiddleware({
        name: 'test',
        beforeRequest,
      });

      const agent = new Agent({
        provider: createMockProvider(),
        middleware: [middleware],
      });

      await agent.run('Hello');

      expect(beforeRequest).toHaveBeenCalled();
    });

    it('should run afterResponse middleware', async () => {
      const afterResponse = vi.fn().mockImplementation((resp) => resp);

      const middleware = createMiddleware({
        name: 'test',
        afterResponse,
      });

      const agent = new Agent({
        provider: createMockProvider(),
        middleware: [middleware],
      });

      await agent.run('Hello');

      expect(afterResponse).toHaveBeenCalled();
    });

    it('should run onError middleware', async () => {
      const onError = vi.fn();

      const middleware = createMiddleware({
        name: 'test',
        onError,
      });

      const agent = new Agent({
        provider: createErrorMockProvider('Test error'),
        middleware: [middleware],
      });

      await expect(agent.run('Hello')).rejects.toThrow();
      expect(onError).toHaveBeenCalled();
    });
  });
});
