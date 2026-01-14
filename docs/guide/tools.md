[tools.md](https://github.com/user-attachments/files/24618657/tools.md)
# Tools

Tools are functions that your agent can call to interact with the outside world. They're the bridge between AI reasoning and real actions.

## Defining Tools

Use `defineTool` for full type safety with Zod schemas:

```typescript
import { defineTool } from 'agentforge';
import { z } from 'zod';

const weatherTool = defineTool({
  name: 'get_weather',
  description: 'Get the current weather for a city',
  parameters: z.object({
    city: z.string().describe('The city name'),
    unit: z.enum(['celsius', 'fahrenheit']).default('fahrenheit'),
  }),
  execute: async ({ city, unit }) => {
    // Fetch from weather API
    const data = await fetchWeather(city);
    return {
      city,
      temperature: unit === 'celsius' ? data.tempC : data.tempF,
      condition: data.condition,
    };
  },
});
```

## Tool Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | ✅ | Unique identifier (alphanumeric + underscore) |
| `description` | `string` | ✅ | What the tool does (LLM reads this) |
| `parameters` | `ZodSchema` | ✅ | Zod schema for parameters |
| `execute` | `function` | ✅ | Async function that runs the tool |

## Parameter Best Practices

### Use Descriptive Names

```typescript
// ❌ Bad
z.object({
  q: z.string(),
  n: z.number(),
})

// ✅ Good
z.object({
  searchQuery: z.string().describe('The search term to look for'),
  maxResults: z.number().describe('Maximum number of results to return'),
})
```

### Provide Defaults

```typescript
z.object({
  query: z.string(),
  limit: z.number().default(10),         // Default value
  includeArchived: z.boolean().optional(), // Optional (undefined if not provided)
})
```

### Use Enums for Constrained Values

```typescript
z.object({
  operation: z.enum(['create', 'read', 'update', 'delete']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
})
```

### Complex Nested Objects

```typescript
z.object({
  user: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  options: z.object({
    sendNotification: z.boolean().default(true),
    tags: z.array(z.string()).optional(),
  }).optional(),
})
```

## Tool Execution

### Return Values

Tools can return any JSON-serializable value:

```typescript
execute: async ({ id }) => {
  // Return an object
  return { status: 'success', data: { id, name: 'Item' } };
  
  // Or a simple value
  return 42;
  
  // Or an array
  return [1, 2, 3];
}
```

### Error Handling

Throw errors for failures — AgentForge catches them gracefully:

```typescript
execute: async ({ id }) => {
  const item = await database.findById(id);
  
  if (!item) {
    throw new Error(`Item ${id} not found`);
  }
  
  return item;
}
```

The error message is passed back to the LLM, which can then decide how to proceed.

### Async Operations

Tools are always async — use `await` freely:

```typescript
execute: async ({ url }) => {
  const response = await fetch(url);
  const data = await response.json();
  const processed = await processData(data);
  return processed;
}
```

## Simple Tools (No Zod)

For quick prototyping, use `createSimpleTool`:

```typescript
import { createSimpleTool } from 'agentforge';

const greetTool = createSimpleTool({
  name: 'greet',
  description: 'Greet a user by name',
  parameters: {
    name: { type: 'string', description: 'The name to greet' },
  },
  execute: async (params) => {
    return { message: `Hello, ${params.name}!` };
  },
});
```

::: warning Type Safety
`createSimpleTool` doesn't provide TypeScript inference for parameters. Use `defineTool` with Zod for production code.
:::

## Dynamic Tools

Add or remove tools at runtime:

```typescript
const agent = new Agent({
  provider,
  tools: [baseTool],
});

// Add a tool later
agent.addTool(newTool);

// Remove a tool
agent.removeTool('tool_name');

// Get all tools
const tools = agent.getTools();
```

## Real-World Examples

### Database Query Tool

```typescript
const queryTool = defineTool({
  name: 'query_database',
  description: 'Execute a read-only database query',
  parameters: z.object({
    table: z.enum(['users', 'orders', 'products']),
    filters: z.record(z.string()).optional(),
    limit: z.number().min(1).max(100).default(10),
  }),
  execute: async ({ table, filters, limit }) => {
    const query = db.select().from(table);
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        query.where(key, '=', value);
      });
    }
    
    return query.limit(limit).execute();
  },
});
```

### External API Tool

```typescript
const apiTool = defineTool({
  name: 'call_api',
  description: 'Make an HTTP request to an external API',
  parameters: z.object({
    endpoint: z.string().url(),
    method: z.enum(['GET', 'POST']).default('GET'),
    body: z.record(z.unknown()).optional(),
  }),
  execute: async ({ endpoint, method, body }) => {
    const response = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return response.json();
  },
});
```

### File System Tool

```typescript
const readFileTool = defineTool({
  name: 'read_file',
  description: 'Read the contents of a file',
  parameters: z.object({
    path: z.string().describe('Path to the file'),
    encoding: z.enum(['utf-8', 'base64']).default('utf-8'),
  }),
  execute: async ({ path, encoding }) => {
    const fs = await import('fs/promises');
    const content = await fs.readFile(path, encoding);
    return { path, content, size: content.length };
  },
});
```

## Testing Tools

Tools are easy to test in isolation:

```typescript
import { describe, it, expect } from 'vitest';

describe('weatherTool', () => {
  it('should return weather data', async () => {
    const result = await weatherTool.execute({
      city: 'Boston',
      unit: 'fahrenheit',
    });
    
    expect(result).toHaveProperty('temperature');
    expect(result).toHaveProperty('condition');
  });
  
  it('should handle invalid city', async () => {
    await expect(
      weatherTool.execute({ city: 'NotARealCity', unit: 'celsius' })
    ).rejects.toThrow();
  });
});
```

## Next Steps

- **[Providers](/guide/providers)** — Connect to different LLMs
- **[Middleware](/guide/middleware)** — Intercept tool calls
- **[Error Handling](/guide/error-handling)** — Handle tool failures gracefully
