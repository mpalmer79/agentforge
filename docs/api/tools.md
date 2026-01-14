[tools.md](https://github.com/user-attachments/files/24618548/tools.md)
# Tools API

Functions for creating type-safe tools.

## defineTool()

Create a tool with Zod schema validation.

```typescript
function defineTool<T extends z.ZodType>(
  definition: ToolDefinition<T>
): Tool
```

### ToolDefinition

```typescript
interface ToolDefinition<T extends z.ZodType> {
  name: string;
  description: string;
  parameters: T;
  execute: (params: z.infer<T>) => Promise<unknown>;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Unique identifier (alphanumeric + underscore) |
| `description` | `string` | Description for the LLM |
| `parameters` | `ZodSchema` | Zod schema for parameters |
| `execute` | `function` | Async execution function |

### Example

```typescript
import { defineTool } from 'agentforge';
import { z } from 'zod';

const searchTool = defineTool({
  name: 'search',
  description: 'Search the database',
  parameters: z.object({
    query: z.string().describe('Search query'),
    limit: z.number().min(1).max(100).default(10),
    filters: z.object({
      category: z.string().optional(),
      dateRange: z.enum(['day', 'week', 'month', 'year']).optional(),
    }).optional(),
  }),
  execute: async ({ query, limit, filters }) => {
    const results = await db.search(query, { limit, ...filters });
    return { count: results.length, results };
  },
});
```

## createSimpleTool()

Create a tool without Zod (less type safety).

```typescript
function createSimpleTool(config: SimpleToolConfig): Tool
```

### SimpleToolConfig

```typescript
interface SimpleToolConfig {
  name: string;
  description: string;
  parameters: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    description?: string;
    required?: boolean;
  }>;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}
```

### Example

```typescript
import { createSimpleTool } from 'agentforge';

const greetTool = createSimpleTool({
  name: 'greet',
  description: 'Greet a user',
  parameters: {
    name: { type: 'string', description: 'User name', required: true },
    formal: { type: 'boolean', description: 'Use formal greeting' },
  },
  execute: async ({ name, formal }) => {
    const greeting = formal ? `Good day, ${name}.` : `Hey ${name}!`;
    return { greeting };
  },
});
```

## Tool Interface

```typescript
interface Tool {
  name: string;
  description: string;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
  toJSON: () => ToolSchema;
}
```

### toJSON()

Returns the JSON Schema representation for the LLM:

```typescript
const schema = myTool.toJSON();
// {
//   name: 'search',
//   description: 'Search the database',
//   parameters: {
//     type: 'object',
//     properties: { ... },
//     required: ['query'],
//   },
// }
```

## ToolCall

Represents a tool invocation from the LLM:

```typescript
interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
```

## ToolResult

Result of tool execution:

```typescript
interface ToolResult {
  toolCallId: string;
  result: unknown;
  error?: string;
}
```

## Supported Zod Types

| Zod Type | JSON Schema |
|----------|-------------|
| `z.string()` | `{ type: 'string' }` |
| `z.number()` | `{ type: 'number' }` |
| `z.boolean()` | `{ type: 'boolean' }` |
| `z.array(z.string())` | `{ type: 'array', items: { type: 'string' } }` |
| `z.object({})` | `{ type: 'object', properties: {} }` |
| `z.enum(['a', 'b'])` | `{ type: 'string', enum: ['a', 'b'] }` |
| `z.optional()` | Removes from `required` |
| `z.default(val)` | Sets `default` in schema |
| `z.describe('text')` | Sets `description` |

## Best Practices

1. **Use descriptive names** - `get_weather` not `gw`
2. **Write clear descriptions** - The LLM reads these
3. **Validate inputs** - Use Zod constraints (`.min()`, `.max()`, `.email()`)
4. **Handle errors** - Throw descriptive errors for failures
5. **Return structured data** - Objects are easier for LLMs to interpret
