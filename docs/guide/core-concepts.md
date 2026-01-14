[core-concepts.md](https://github.com/user-attachments/files/24618585/core-concepts.md)
# Core Concepts

Understanding AgentForge's architecture will help you build better agents.

## The Agent Loop

At its core, AgentForge implements an **agentic loop** — a cycle where the LLM can use tools and iterate until it has a final answer:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   User Input                                            │
│       │                                                 │
│       ▼                                                 │
│   ┌───────────────┐                                     │
│   │   Agent.run() │                                     │
│   └───────┬───────┘                                     │
│           │                                             │
│           ▼                                             │
│   ┌───────────────┐     ┌──────────────┐               │
│   │   Middleware  │────▶│   Provider   │               │
│   │  (beforeReq)  │     │  (complete)  │               │
│   └───────────────┘     └──────┬───────┘               │
│                                │                        │
│                                ▼                        │
│                    ┌───────────────────────┐           │
│                    │   Has Tool Calls?     │           │
│                    └───────────┬───────────┘           │
│                          │           │                  │
│                         Yes          No                 │
│                          │           │                  │
│                          ▼           ▼                  │
│                    ┌──────────┐  ┌──────────┐          │
│                    │ Execute  │  │  Return  │          │
│                    │  Tools   │  │ Response │          │
│                    └────┬─────┘  └──────────┘          │
│                         │                               │
│                         └──────────┐                    │
│                                    │ (loop back)        │
│                                    ▼                    │
│                              Provider.complete()        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Key Components

### Provider

A **Provider** connects AgentForge to an LLM. It handles API communication, message formatting, and response parsing.

```typescript
import { OpenAIProvider, AnthropicProvider } from 'agentforge';

// Use OpenAI
const openai = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4-turbo', // optional
});

// Or Anthropic
const anthropic = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-5-sonnet-20241022',
});
```

Providers are interchangeable — your tools and logic work with any provider.

### Tools

A **Tool** is a function the LLM can call. AgentForge uses Zod schemas for type-safe parameter validation:

```typescript
import { defineTool } from 'agentforge';
import { z } from 'zod';

const searchTool = defineTool({
  name: 'search',                          // Unique identifier
  description: 'Search the knowledge base', // LLM reads this
  parameters: z.object({                    // Zod schema
    query: z.string(),
    limit: z.number().optional().default(10),
  }),
  execute: async ({ query, limit }) => {    // Your implementation
    const results = await searchDatabase(query, limit);
    return { results };
  },
});
```

The schema serves three purposes:
1. **LLM instruction** — The description tells the model when/how to use it
2. **Runtime validation** — Invalid parameters are caught before execution
3. **Type inference** — Full TypeScript types in your execute function

### Agent

The **Agent** orchestrates everything:

```typescript
import { Agent } from 'agentforge';

const agent = new Agent({
  provider,                          // Required: LLM provider
  tools: [searchTool, calculatorTool], // Optional: available tools
  systemPrompt: 'You are helpful.',  // Optional: system message
  middleware: [loggingMiddleware],   // Optional: request pipeline
  memory: {                          // Optional: conversation management
    maxMessages: 50,
    strategy: 'sliding-window',
  },
  maxIterations: 10,                 // Optional: tool loop limit
});
```

### Messages

Conversations are sequences of **Messages**:

```typescript
interface Message {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}
```

You can pass either a string or an array of messages to `agent.run()`:

```typescript
// Simple string input
await agent.run('Hello!');

// Full conversation history
await agent.run([
  { id: '1', role: 'user', content: 'My name is Alice', timestamp: Date.now() },
  { id: '2', role: 'assistant', content: 'Hello Alice!', timestamp: Date.now() },
  { id: '3', role: 'user', content: 'What is my name?', timestamp: Date.now() },
]);
```

### Middleware

**Middleware** intercepts requests and responses for logging, caching, rate limiting, and more:

```typescript
import { createMiddleware } from 'agentforge';

const loggingMiddleware = createMiddleware({
  name: 'logging',
  
  beforeRequest: async (context) => {
    console.log('→ Request:', context.messages.length, 'messages');
    return context;
  },
  
  afterResponse: async (response, context) => {
    console.log('← Response:', response.content.slice(0, 50));
    return response;
  },
  
  onToolCall: async (toolCall, context) => {
    console.log('🔧 Tool:', toolCall.name);
    return toolCall;
  },
});
```

Middleware runs in a pipeline:
- `beforeRequest` runs first → last
- `afterResponse` runs last → first (reverse order)

## Response Structure

Every `agent.run()` returns an **AgentResponse**:

```typescript
interface AgentResponse {
  id: string;                    // Response ID
  content: string;               // The text response
  messages: Message[];           // Full conversation history
  toolResults?: ToolResult[];    // Results from tool executions
  usage?: {                      // Token usage (if available)
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
```

## Error Handling Philosophy

AgentForge provides two approaches:

### Exception-Based (Default)

```typescript
try {
  const response = await agent.run('Hello');
} catch (error) {
  if (error instanceof ProviderError) {
    // Handle API errors
  }
}
```

### Result Types (Functional)

```typescript
import { tryCatchAsync, isOk, isErr } from 'agentforge';

const result = await tryCatchAsync(() => agent.run('Hello'));

if (isOk(result)) {
  console.log(result.value.content);
} else {
  console.error(result.error.message);
}
```

## Next Steps

- **[Tools](/guide/tools)** — Deep dive into tool creation
- **[Providers](/guide/providers)** — Configure and customize providers
- **[Middleware](/guide/middleware)** — Build custom middleware
