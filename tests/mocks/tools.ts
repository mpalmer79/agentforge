import { vi } from 'vitest';
import { z } from 'zod';
import { defineTool } from '../../src/tool';
import type { Tool } from '../../src/types';

/**
 * Simple calculator tool for testing
 */
export const calculatorTool = defineTool({
  name: 'calculator',
  description: 'Perform basic math calculations',
  parameters: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number(),
  }),
  execute: async ({ operation, a, b }) => {
    switch (operation) {
      case 'add':
        return { result: a + b };
      case 'subtract':
        return { result: a - b };
      case 'multiply':
        return { result: a * b };
      case 'divide':
        if (b === 0) throw new Error('Division by zero');
        return { result: a / b };
    }
  },
});

/**
 * Weather tool for testing
 */
export const weatherTool = defineTool({
  name: 'get_weather',
  description: 'Get weather for a location',
  parameters: z.object({
    location: z.string(),
    unit: z.enum(['celsius', 'fahrenheit']).default('fahrenheit'),
  }),
  execute: async ({ location, unit }) => ({
    location,
    temperature: unit === 'celsius' ? 22 : 72,
    condition: 'sunny',
    unit,
  }),
});

/**
 * Create a mock tool with custom execute function
 */
export function createMockTool(
  name: string,
  executeFn: (...args: unknown[]) => Promise<unknown> = vi.fn().mockResolvedValue({ success: true })
): Tool {
  return defineTool({
    name,
    description: `Mock tool: ${name}`,
    parameters: z.object({
      input: z.string().optional(),
    }),
    execute: executeFn as (params: { input?: string }) => Promise<unknown>,
  });
}

/**
 * Create a tool that throws an error
 */
export function createErrorTool(name: string, errorMessage: string): Tool {
  return defineTool({
    name,
    description: `Error tool: ${name}`,
    parameters: z.object({}),
    execute: async () => {
      throw new Error(errorMessage);
    },
  });
}

/**
 * Create a tool with complex nested parameters
 */
export const complexTool = defineTool({
  name: 'complex_tool',
  description: 'Tool with complex nested parameters',
  parameters: z.object({
    query: z.string().min(1).max(100),
    filters: z
      .object({
        status: z.enum(['active', 'inactive', 'pending']).optional(),
        tags: z.array(z.string()).optional(),
        dateRange: z
          .object({
            start: z.string().datetime(),
            end: z.string().datetime(),
          })
          .optional(),
      })
      .optional(),
    pagination: z
      .object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(10),
      })
      .optional(),
  }),
  execute: async (params) => ({
    received: params,
    timestamp: Date.now(),
  }),
});
