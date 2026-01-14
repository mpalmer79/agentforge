import { describe, it, expect, vi } from 'vitest';
import { Agent } from '../../src/agent';
import { defineTool } from '../../src/tool';
import { createMiddleware } from '../../src/middleware';
import { z } from 'zod';

describe('Agent Integration Workflows', () => {
  describe('multi-tool workflow', () => {
    it('should execute multiple tools in sequence', async () => {
      const executionOrder: string[] = [];

      const tool1 = defineTool({
        name: 'step_one',
        description: 'First step',
        parameters: z.object({ input: z.string() }),
        execute: async ({ input }) => {
          executionOrder.push('step_one');
          return { result: `processed: ${input}` };
        },
      });

      const tool2 = defineTool({
        name: 'step_two',
        description: 'Second step',
        parameters: z.object({ data: z.string() }),
        execute: async ({ data }) => {
          executionOrder.push('step_two');
          return { result: `finalized: ${data}` };
        },
      });

      // Mock provider that calls tools in sequence
      let callCount = 0;
      const mockProvider = {
        name: 'mock',
        complete: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            return {
              id: 'r1',
              content: '',
              toolCalls: [{ id: 'tc1', name: 'step_one', arguments: { input: 'start' } }],
              finishReason: 'tool_calls',
            };
          }
          if (callCount === 2) {
            return {
              id: 'r2',
              content: '',
              toolCalls: [{ id: 'tc2', name: 'step_two', arguments: { data: 'middle' } }],
              finishReason: 'tool_calls',
            };
          }
          return {
            id: 'r3',
            content: 'Workflow complete!',
            finishReason: 'stop',
          };
        }),
        stream: vi.fn(),
      };

      const agent = new Agent({
        provider: mockProvider,
        tools: [tool1, tool2],
      });

      const response = await agent.run('Execute workflow');

      expect(executionOrder).toEqual(['step_one', 'step_two']);
      expect(response.content).toBe('Workflow complete!');
    });

    it('should track tool results through workflow', async () => {
      const dataTool = defineTool({
        name: 'get_data',
        description: 'Get data',
        parameters: z.object({}),
        execute: async () => ({ value: 42 }),
      });

      let callCount = 0;
      const mockProvider = {
        name: 'mock',
        complete: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            return {
              id: 'r1',
              content: '',
              toolCalls: [{ id: 'tc1', name: 'get_data', arguments: {} }],
              finishReason: 'tool_calls',
            };
          }
          return {
            id: 'r2',
            content: 'Data retrieved: 42',
            finishReason: 'stop',
          };
        }),
        stream: vi.fn(),
      };

      const agent = new Agent({
        provider: mockProvider,
        tools: [dataTool],
      });

      const response = await agent.run('Get data');

      expect(response.toolResults).toBeDefined();
      expect(response.toolResults).toHaveLength(1);
      expect(response.toolResults![0].result).toEqual({ value: 42 });
    });
  });

  describe('middleware workflow', () => {
    it('should track requests through middleware', async () => {
      const requestLog: string[] = [];

      const trackingMiddleware = createMiddleware({
        name: 'tracking',
        beforeRequest: async (ctx) => {
          requestLog.push(`request:${ctx.messages.length}`);
          return ctx;
        },
        afterResponse: async (resp, _ctx) => {
          requestLog.push(`response:${resp.content.length}`);
          return resp;
        },
      });

      const mockProvider = {
        name: 'mock',
        complete: vi.fn().mockResolvedValue({
          id: 'r1',
          content: 'Response',
          finishReason: 'stop',
        }),
        stream: vi.fn(),
      };

      const agent = new Agent({
        provider: mockProvider,
        middleware: [trackingMiddleware],
      });

      await agent.run('Test');

      expect(requestLog).toContain('request:1');
      expect(requestLog).toContain('response:8');
    });

    it('should allow middleware to modify requests', async () => {
      const modifyMiddleware = createMiddleware({
        name: 'modify',
        beforeRequest: async (ctx) => ({
          ...ctx,
          metadata: { ...ctx.metadata, modified: true },
        }),
      });

      const mockProvider = {
        name: 'mock',
        complete: vi.fn().mockResolvedValue({
          id: 'r1',
          content: 'Response',
          finishReason: 'stop',
        }),
        stream: vi.fn(),
      };

      const agent = new Agent({
        provider: mockProvider,
        middleware: [modifyMiddleware],
      });

      await agent.run('Test');

      // Provider was called (middleware didn't block)
      expect(mockProvider.complete).toHaveBeenCalled();
    });
  });

  describe('error recovery workflow', () => {
    it('should continue after tool error', async () => {
      const failingTool = defineTool({
        name: 'failing_tool',
        description: 'A tool that fails',
        parameters: z.object({}),
        execute: async () => {
          throw new Error('Temporary failure');
        },
      });

      let callCount = 0;
      const mockProvider = {
        name: 'mock',
        complete: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            return {
              id: 'r1',
              content: '',
              toolCalls: [{ id: 'tc1', name: 'failing_tool', arguments: {} }],
              finishReason: 'tool_calls',
            };
          }
          return {
            id: 'r2',
            content: 'Handled gracefully',
            finishReason: 'stop',
          };
        }),
        stream: vi.fn(),
      };

      const agent = new Agent({
        provider: mockProvider,
        tools: [failingTool],
      });

      const response = await agent.run('Try the failing tool');

      // Agent should complete despite tool error
      expect(response.content).toContain('gracefully');
      expect(response.toolResults).toBeDefined();
      expect(response.toolResults![0].error).toContain('Temporary failure');
    });
  });

  describe('conversation continuity', () => {
    it('should maintain message history', async () => {
      const mockProvider = {
        name: 'mock',
        complete: vi.fn().mockResolvedValue({
          id: 'r1',
          content: 'Response',
          finishReason: 'stop',
        }),
        stream: vi.fn(),
      };

      const agent = new Agent({ provider: mockProvider });

      const response = await agent.run([
        { id: '1', role: 'user', content: 'First message', timestamp: 1 },
        { id: '2', role: 'assistant', content: 'First response', timestamp: 2 },
        { id: '3', role: 'user', content: 'Second message', timestamp: 3 },
      ]);

      // Response messages should include all input messages plus new assistant message
      expect(response.messages.length).toBeGreaterThanOrEqual(3);
    });

    it('should apply memory constraints', async () => {
      const mockProvider = {
        name: 'mock',
        complete: vi.fn().mockResolvedValue({
          id: 'r1',
          content: 'Response',
          finishReason: 'stop',
        }),
        stream: vi.fn(),
      };

      const agent = new Agent({
        provider: mockProvider,
        memory: {
          maxMessages: 2,
          strategy: 'sliding-window',
        },
      });

      await agent.run([
        { id: '1', role: 'user', content: 'Msg 1', timestamp: 1 },
        { id: '2', role: 'assistant', content: 'Resp 1', timestamp: 2 },
        { id: '3', role: 'user', content: 'Msg 2', timestamp: 3 },
        { id: '4', role: 'assistant', content: 'Resp 2', timestamp: 4 },
        { id: '5', role: 'user', content: 'Msg 3', timestamp: 5 },
      ]);

      const callArgs = mockProvider.complete.mock.calls[0][0];
      expect(callArgs.messages.length).toBeLessThanOrEqual(2);
    });
  });
});
