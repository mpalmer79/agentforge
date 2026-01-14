import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { defineTool, createSimpleTool } from '../../src/tool';

describe('defineTool', () => {
  describe('basic functionality', () => {
    it('should create a tool with correct properties', () => {
      const tool = defineTool({
        name: 'test_tool',
        description: 'A test tool',
        parameters: z.object({
          input: z.string(),
        }),
        execute: async ({ input }) => ({ result: input }),
      });

      expect(tool.name).toBe('test_tool');
      expect(tool.description).toBe('A test tool');
      expect(typeof tool.execute).toBe('function');
      expect(typeof tool.toJSON).toBe('function');
    });

    it('should validate parameters with Zod', async () => {
      const tool = defineTool({
        name: 'validated_tool',
        description: 'Tool with validation',
        parameters: z.object({
          count: z.number().min(0).max(100),
        }),
        execute: async ({ count }) => ({ doubled: count * 2 }),
      });

      // Valid input
      const result = await tool.execute({ count: 50 });
      expect(result).toEqual({ doubled: 100 });

      // Invalid input should throw
      await expect(tool.execute({ count: 150 })).rejects.toThrow();
    });

    it('should reject invalid tool names', () => {
      expect(() =>
        defineTool({
          name: 'invalid-name',
          description: 'Tool with invalid name',
          parameters: z.object({}),
          execute: async () => ({}),
        })
      ).toThrow(/Invalid tool name/);

      expect(() =>
        defineTool({
          name: '123start',
          description: 'Tool starting with number',
          parameters: z.object({}),
          execute: async () => ({}),
        })
      ).toThrow(/Invalid tool name/);
    });

    it('should accept valid tool names', () => {
      expect(() =>
        defineTool({
          name: 'valid_tool_name',
          description: 'Valid name',
          parameters: z.object({}),
          execute: async () => ({}),
        })
      ).not.toThrow();

      expect(() =>
        defineTool({
          name: '_privateStyle',
          description: 'Underscore start',
          parameters: z.object({}),
          execute: async () => ({}),
        })
      ).not.toThrow();
    });
  });

  describe('toJSON()', () => {
    it('should convert simple schema to JSON', () => {
      const tool = defineTool({
        name: 'simple_tool',
        description: 'Simple tool description',
        parameters: z.object({
          name: z.string(),
          age: z.number(),
        }),
        execute: async () => ({}),
      });

      const json = tool.toJSON();

      expect(json).toEqual({
        type: 'function',
        function: {
          name: 'simple_tool',
          description: 'Simple tool description',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'number' },
            },
            required: ['name', 'age'],
          },
        },
      });
    });

    it('should handle optional fields', () => {
      const tool = defineTool({
        name: 'optional_tool',
        description: 'Tool with optional fields',
        parameters: z.object({
          required: z.string(),
          optional: z.string().optional(),
        }),
        execute: async () => ({}),
      });

      const json = tool.toJSON();
      const params = json.function.parameters as Record<string, unknown>;

      expect(params.required).toEqual(['required']);
    });

    it('should handle default values', () => {
      const tool = defineTool({
        name: 'default_tool',
        description: 'Tool with defaults',
        parameters: z.object({
          count: z.number().default(10),
        }),
        execute: async () => ({}),
      });

      const json = tool.toJSON();
      const params = json.function.parameters as Record<string, unknown>;
      const properties = params.properties as Record<string, Record<string, unknown>>;

      expect(properties.count.default).toBe(10);
    });

    it('should handle enums', () => {
      const tool = defineTool({
        name: 'enum_tool',
        description: 'Tool with enum',
        parameters: z.object({
          status: z.enum(['active', 'inactive', 'pending']),
        }),
        execute: async () => ({}),
      });

      const json = tool.toJSON();
      const params = json.function.parameters as Record<string, unknown>;
      const properties = params.properties as Record<string, Record<string, unknown>>;

      expect(properties.status).toEqual({
        type: 'string',
        enum: ['active', 'inactive', 'pending'],
      });
    });

    it('should handle arrays', () => {
      const tool = defineTool({
        name: 'array_tool',
        description: 'Tool with array',
        parameters: z.object({
          tags: z.array(z.string()),
        }),
        execute: async () => ({}),
      });

      const json = tool.toJSON();
      const params = json.function.parameters as Record<string, unknown>;
      const properties = params.properties as Record<string, Record<string, unknown>>;

      expect(properties.tags).toEqual({
        type: 'array',
        items: { type: 'string' },
      });
    });

    it('should handle nested objects', () => {
      const tool = defineTool({
        name: 'nested_tool',
        description: 'Tool with nested object',
        parameters: z.object({
          user: z.object({
            name: z.string(),
            email: z.string(),
          }),
        }),
        execute: async () => ({}),
      });

      const json = tool.toJSON();
      const params = json.function.parameters as Record<string, unknown>;
      const properties = params.properties as Record<string, Record<string, unknown>>;

      expect(properties.user).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
        },
        required: ['name', 'email'],
      });
    });

    it('should handle string constraints', () => {
      const tool = defineTool({
        name: 'constrained_tool',
        description: 'Tool with string constraints',
        parameters: z.object({
          email: z.string().email(),
          url: z.string().url(),
          short: z.string().min(1).max(10),
        }),
        execute: async () => ({}),
      });

      const json = tool.toJSON();
      const params = json.function.parameters as Record<string, unknown>;
      const properties = params.properties as Record<string, Record<string, unknown>>;

      expect(properties.email.format).toBe('email');
      expect(properties.url.format).toBe('uri');
      expect(properties.short.minLength).toBe(1);
      expect(properties.short.maxLength).toBe(10);
    });

    it('should handle number constraints', () => {
      const tool = defineTool({
        name: 'number_tool',
        description: 'Tool with number constraints',
        parameters: z.object({
          count: z.number().min(0).max(100),
          id: z.number().int(),
        }),
        execute: async () => ({}),
      });

      const json = tool.toJSON();
      const params = json.function.parameters as Record<string, unknown>;
      const properties = params.properties as Record<string, Record<string, unknown>>;

      expect(properties.count.minimum).toBe(0);
      expect(properties.count.maximum).toBe(100);
      expect(properties.id.type).toBe('integer');
    });
  });

  describe('execute()', () => {
    it('should execute with validated params', async () => {
      const executeFn = vi.fn().mockResolvedValue({ success: true });

      const tool = defineTool({
        name: 'exec_tool',
        description: 'Executable tool',
        parameters: z.object({
          value: z.string(),
        }),
        execute: executeFn,
      });

      await tool.execute({ value: 'test' });

      expect(executeFn).toHaveBeenCalledWith({ value: 'test' });
    });

    it('should apply default values', async () => {
      const executeFn = vi.fn().mockResolvedValue({});

      const tool = defineTool({
        name: 'default_exec_tool',
        description: 'Tool with defaults',
        parameters: z.object({
          value: z.string().default('default_value'),
        }),
        execute: executeFn,
      });

      await tool.execute({});

      expect(executeFn).toHaveBeenCalledWith({ value: 'default_value' });
    });
  });
});

describe('createSimpleTool', () => {
  it('should create a tool without Zod schema', () => {
    const tool = createSimpleTool({
      name: 'simple',
      description: 'Simple tool',
      parameters: {
        input: { type: 'string' },
      },
      execute: async (params) => ({ received: params }),
    });

    expect(tool.name).toBe('simple');
    expect(typeof tool.execute).toBe('function');
    expect(typeof tool.toJSON).toBe('function');
  });

  it('should generate correct JSON schema', () => {
    const tool = createSimpleTool({
      name: 'json_tool',
      description: 'JSON schema tool',
      parameters: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', default: 10 },
      },
      execute: async () => ({}),
    });

    const json = tool.toJSON();

    expect(json.function.name).toBe('json_tool');
    expect(json.function.parameters).toEqual({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', default: 10 },
      },
    });
  });
});
