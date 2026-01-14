import { describe, it, expect, vi } from 'vitest';
import { Agent, defineTool, createMiddleware } from '../../src';
import { z } from 'zod';

describe('Agent Integration Workflows', () => {
  /**
   * Create a mock provider that simulates realistic LLM behavior
   */
  function createRealisticMockProvider(responses: Array<{
    content: string;
    toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  }>) {
    let callIndex = 0;

    return {
      name: 'realistic-mock',
      complete: vi.fn().mockImplementation(async () => {
        const response = responses[callIndex] || responses[responses.length - 1];
        callIndex++;

        return {
          id: `resp-${callIndex}`,
          content: response.content,
          toolCalls: response.toolCalls?.map((tc, i) => ({
            id: `tc-${callIndex}-${i}`,
            name: tc.name,
            arguments: tc.arguments,
          })),
          finishReason: response.toolCalls ? 'tool_calls' : 'stop',
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        };
      }),
      stream: vi.fn(),
    };
  }

  describe('multi-tool workflow', () => {
    it('should execute a multi-step tool workflow', async () => {
      // Define tools
      const searchTool = defineTool({
        name: 'search',
        description: 'Search for information',
        parameters: z.object({ query: z.string() }),
        execute: async ({ query }) => ({
          results: [`Result for: ${query}`],
        }),
      });

      const summarizeTool = defineTool({
        name: 'summarize',
        description: 'Summarize text',
        parameters: z.object({ text: z.string() }),
        execute: async ({ text }) => ({
          summary: `Summary: ${text.slice(0, 50)}...`,
        }),
      });

      // Provider returns tool calls then final response
      const provider = createRealisticMockProvider([
        {
          content: '',
          toolCalls: [{ name: 'search', arguments: { query: 'AI trends 2024' } }],
        },
        {
          content: '',
          toolCalls: [{ name: 'summarize', arguments: { text: 'Result for: AI trends 2024' } }],
        },
        {
          content: 'Based on my research, here are the key AI trends...',
        },
      ]);

      const agent = new Agent({
        provider,
        tools: [searchTool, summarizeTool],
        systemPrompt: 'You are a research assistant.',
      });

      const response = await agent.run('Research AI trends for 2024 and summarize');

      expect(response.content).toContain('Based on my research');
      expect(provider.complete).toHaveBeenCalledTimes(3);
    });
  });

  describe('middleware workflow', () => {
    it('should track all tool calls through middleware', async () => {
      const toolCallLog: Array<{ name: string; args: unknown }> = [];

      const trackingMiddleware = createMiddleware({
        name: 'tracking',
        onToolCall: async (toolCall) => {
          toolCallLog.push({ name: toolCall.name, args: toolCall.arguments });
          return toolCall;
        },
      });

      const calculatorTool = defineTool({
        name: 'calculate',
        description: 'Calculate',
        parameters: z.object({ expression: z.string() }),
        execute: async ({ expression }) => ({ result: expression }),
      });

      const provider = createRealisticMockProvider([
        {
          content: '',
          toolCalls: [{ name: 'calculate', arguments: { expression: '2+2' } }],
        },
        { content: 'The answer is 4.' },
      ]);

      const agent = new Agent({
        provider,
        tools: [calculatorTool],
        middleware: [trackingMiddleware],
      });

      await agent.run('What is 2+2?');

      expect(toolCallLog).toHaveLength(1);
      expect(toolCallLog[0].name).toBe('calculate');
    });

    it('should modify requests through middleware', async () => {
      const modifyMiddleware = createMiddleware({
        name: 'modify',
        beforeRequest: async (context) => ({
          ...context,
          metadata: { ...context.metadata, modified: true },
        }),
      });

      const provider = createRealisticMockProvider([
        { content: 'Hello!' },
      ]);

      const agent = new Agent({
        provider,
        middleware: [modifyMiddleware],
      });

      await agent.run('Hi');

      expect(provider.complete).toHaveBeenCalled();
    });
  });

  describe('error recovery workflow', () => {
    it('should continue after tool error', async () => {
      const flakyTool = defineTool({
        name: 'flaky',
        description: 'Sometimes fails',
        parameters: z.object({}),
        execute: async () => {
          throw new Error('Temporary failure');
        },
      });

      const provider = createRealisticMockProvider([
        {
          content: '',
          toolCalls: [{ name: 'flaky', arguments: {} }],
        },
        { content: 'I encountered an error but handled it gracefully.' },
      ]);

      const agent = new Agent({
        provider,
        tools: [flakyTool],
      });

      const response = await agent.run('Use the flaky tool');

      // Agent should complete despite tool error
      expect(response.content).toContain('gracefully');
      expect(response.toolResults![0].error).toContain('Temporary failure');
    });
  });

  describe('conversation continuity', () => {
    it('should maintain context across multiple messages', async () => {
      const provider = createRealisticMockProvider([
        { content: 'Hello! How can I help you today?' },
      ]);

      const agent = new Agent({
        provider,
        systemPrompt: 'You are a helpful assistant.',
      });

      // First message
      const response1 = await agent.run('Hi');
      expect(response1.messages).toHaveLength(3); // system + user + assistant

      // Simulate follow-up with history
      const response2 = await agent.run([
        ...response1.messages,
        { id: 'msg-4', role: 'user', content: 'What can you help me with?', timestamp: Date.now() },
      ]);

      expect(response2.messages.length).toBeGreaterThan(response1.messages.length);
    });
  });

  describe('memory constraints', () => {
    it('should respect token limits while preserving important context', async () => {
      const provider = createRealisticMockProvider([
        { content: 'Summarized response based on recent context.' },
      ]);

      const agent = new Agent({
        provider,
        memory: {
          maxTokens: 500,
          strategy: 'sliding-window',
        },
      });

      // Create many messages that exceed token limit
      const manyMessages = Array.from({ length: 50 }, (_, i) => ({
        id: `msg-${i}`,
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `This is message number ${i} with some content to add tokens.`,
        timestamp: Date.now() + i,
      }));

      const response = await agent.run(manyMessages);

      // Verify the agent completed successfully
      expect(response.content).toBeDefined();

      // The actual sent messages should be fewer than input
      const sentMessages = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0].messages;
      expect(sentMessages.length).toBeLessThan(manyMessages.length);
    });
  });
});
