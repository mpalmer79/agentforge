# AgentForge API Reference

Complete API documentation for AgentForge.

## Table of Contents

- [Agent](#agent)
- [Tools](#tools)
- [Providers](#providers)
- [Middleware](#middleware)
- [React Hooks](#react-hooks)
- [Types](#types)
- [Utilities](#utilities)
- [Error Handling](#error-handling)

---

## Agent

The `Agent` class is the core of AgentForge, orchestrating conversations with LLM providers.

### Constructor
```typescript
new Agent(config: AgentConfig)
```

#### AgentConfig

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `provider` | `Provider` | ✅ | - | LLM provider instance |
| `tools` | `Tool[]` | ❌ | `[]` | Tools available to the agent |
| `systemPrompt` | `string` | ❌ | - | System prompt for the agent |
| `middleware` | `Middleware[]` | ❌ | `[]` | Middleware stack |
| `memory` | `MemoryConfig` | ❌ | - | Memory management config |
| `maxIterations` | `number` | ❌ | `10` | Max tool execution loops |
| `temperature` | `number` | ❌ | - | LLM temperature (0-2) |
| `maxTokens` | `number` | ❌ | - | Max response tokens |

### Methods

#### `run(input, options?)`

Execute the agent with a message.
```typescript
async run(
  input: string | Message[],
  options?: { signal?: AbortSignal }
): Promise<AgentResponse>
```

**Returns:** `AgentResponse`

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Response ID |
| `content` | `string` | Text response |
| `messages` | `Message[]` | Full conversation history |
| `toolResults` | `ToolResult[]` | Results from tool calls |
| `usage` | `object` | Token usage statistics |

#### `stream(input, options?)`

Stream the agent response.
```typescript
async *stream(
  input: string | Message[],
  options?: { signal?: AbortSignal }
): AsyncIterable<StreamEvent>
```

**Yields:** `StreamEvent`

| Type | Data | Description |
|------|------|-------------|
| `'content'` | `string` | Text chunk |
| `'tool_call'` | `ToolCall` | Tool being called |
| `'tool_result'` | `ToolResult` | Tool execution result |
| `'done'` | `object` | Stream complete |

#### `addTool(tool)`

Add a tool at runtime.
```typescript
addTool(tool: Tool): void
```

#### `removeTool(name)`

Remove a tool by name.
```typescript
removeTool(name: string): boolean
```

#### `getTools()`

Get all registered tools.
```typescript
getTools(): Tool[]
```

#### `setSystemPrompt(prompt)`

Update the system prompt.
```typescript
setSystemPrompt(prompt: string): void
```

---

## Tools

### `defineTool(definition)`

Create a type-safe tool with Zod validation.
```typescript
import { defineTool } from 'agentforge';
import { z } from 'zod';

const myTool = defineTool({
  name: 'tool_name',
  description: 'What the tool does',
  parameters: z.object({
    param1: z.string().describe('Parameter description'),
    param2: z.number().optional(),
  }),
  execute: async (params) => {
    // params is fully typed
    return { result: params.param1 };
  },
});
```

#### ToolDefinition

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Tool name (alphanumeric + underscore) |
| `description` | `string` | Description for the LLM |
| `parameters` | `ZodSchema` | Zod schema for parameters |
| `execute` | `function` | Async execution function |

### `createSimpleTool(config)`

Create a tool without Zod schema.
```typescript
const tool = createSimpleTool({
  name: 'simple_tool',
  description: 'A simple tool',
  parameters: {
    input: { type: 'string', description: 'Input value' },
  },
  execute: async (params) => ({ result: params.input }),
});
```

---

## Providers

### OpenAIProvider
```typescript
import { OpenAIProvider } from 'agentforge';

const provider = new OpenAIProvider({
  apiKey: 'sk-...',
  model: 'gpt-4-turbo',        // optional, default: 'gpt-4-turbo'
  organization: 'org-...',      // optional
  baseURL: 'https://...',       // optional, for proxies
  maxRetries: 3,                // optional, default: 3
  timeout: 30000,               // optional, default: 30000ms
});
```

### AnthropicProvider
```typescript
import { AnthropicProvider } from 'agentforge';

const provider = new AnthropicProvider({
  apiKey: 'sk-ant-...',
  model: 'claude-3-5-sonnet-20241022',  // optional
  anthropicVersion: '2023-06-01',        // optional
  maxRetries: 3,
  timeout: 30000,
});
```

### Custom Provider

Extend `BaseProvider` to create custom providers:
```typescript
import { BaseProvider } from 'agentforge';

class CustomProvider extends BaseProvider {
  name = 'custom';

  protected getDefaultModel() {
    return 'custom-model';
  }

  protected getDefaultBaseURL() {
    return 'https://api.custom.com';
  }

  protected getAuthHeaders() {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  async complete(request) {
    // Implementation
  }

  async *stream(request) {
    // Implementation
  }
}
```

---

## Middleware

### `createMiddleware(config)`

Create custom middleware.
```typescript
import { createMiddleware } from 'agentforge';

const myMiddleware = createMiddleware({
  name: 'my-middleware',
  
  beforeRequest: async (context) => {
    console.log('Before request:', context.messages.length);
    return context;
  },
  
  afterResponse: async (response, context) => {
    console.log('Response:', response.content.slice(0, 50));
    return response;
  },
  
  onError: async (error, context) => {
    console.error('Error:', error.message);
  },
  
  onToolCall: async (toolCall, context) => {
    console.log('Tool call:', toolCall.name);
    return toolCall;
  },
  
  onToolResult: async (result, context) => {
    console.log('Tool result:', result.toolCallId);
    return result;
  },
});
```

### Built-in Middleware

#### `loggingMiddleware`

Logs all agent activity.
```typescript
import { loggingMiddleware } from 'agentforge';

const agent = new Agent({
  provider,
  middleware: [loggingMiddleware],
});
```

#### `createRateLimitMiddleware(options)`

Rate limit requests.
```typescript
import { createRateLimitMiddleware } from 'agentforge';

const rateLimiter = createRateLimitMiddleware({
  maxRequestsPerMinute: 60,
  onRateLimited: () => console.log('Rate limited!'),
});
```

#### `createCacheMiddleware(options)`

Cache responses.
```typescript
import { createCacheMiddleware } from 'agentforge';

const cache = createCacheMiddleware({
  ttlMs: 300000,      // 5 minutes
  maxSize: 100,       // max cached items
  keyFn: (context) => context.messages.slice(-1)[0]?.content,
});
```

#### `createRetryMiddleware(options)`

Retry on failure.
```typescript
import { createRetryMiddleware } from 'agentforge';

const retry = createRetryMiddleware({
  maxRetries: 3,
  baseDelayMs: 1000,
  shouldRetry: (error) => error.message.includes('rate limit'),
});
```

---

## React Hooks

### `useAgent(config)`

Full-featured agent hook.
```typescript
import { useAgent } from 'agentforge/react';

function Chat() {
  const {
    messages,
    isLoading,
    error,
    sendMessage,
    reset,
    abort,
  } = useAgent({
    provider: new OpenAIProvider({ apiKey: '...' }),
    tools: [myTool],
    systemPrompt: 'You are helpful.',
    onError: (err) => console.error(err),
    onToolCall: (name, args) => console.log(name, args),
  });

  return (
    <div>
      {messages.map(m => <div key={m.id}>{m.content}</div>)}
      <button onClick={() => sendMessage('Hello!')}>Send</button>
    </div>
  );
}
```

### `useChat(config)`

Simplified chat hook.
```typescript
import { useChat } from 'agentforge/react';

function Chat() {
  const {
    messages,
    input,
    setInput,
    handleSubmit,
    isLoading,
    reload,
    stop,
  } = useChat({
    provider: new OpenAIProvider({ apiKey: '...' }),
    systemPrompt: 'You are helpful.',
  });

  return (
    <form onSubmit={handleSubmit}>
      <input value={input} onChange={e => setInput(e.target.value)} />
      <button type="submit">Send</button>
    </form>
  );
}
```

### `useStreamingAgent(config)`

Streaming agent hook.
```typescript
import { useStreamingAgent } from 'agentforge/react';

function Chat() {
  const {
    messages,
    streamingContent,
    isStreaming,
    sendMessage,
    abort,
  } = useStreamingAgent({
    provider: new OpenAIProvider({ apiKey: '...' }),
    onToken: (token) => console.log(token),
    onComplete: (content) => console.log('Done:', content),
  });

  return (
    <div>
      {streamingContent && <div>{streamingContent}</div>}
    </div>
  );
}
```

### `AgentProvider`

Context provider for app-wide configuration.
```typescript
import { AgentProvider } from 'agentforge/react';

function App() {
  return (
    <AgentProvider
      provider={new OpenAIProvider({ apiKey: '...' })}
      tools={[myTool]}
      systemPrompt="You are helpful."
    >
      <Chat />
    </AgentProvider>
  );
}
```

---

## Types

### Message
```typescript
interface Message {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}
```

### ToolCall
```typescript
interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
```

### ToolResult
```typescript
interface ToolResult {
  toolCallId: string;
  result: unknown;
  error?: string;
}
```

### MemoryConfig
```typescript
interface MemoryConfig {
  maxMessages?: number;
  maxTokens?: number;
  strategy?: 'sliding-window' | 'summarize' | 'trim-oldest';
}
```

---

## Utilities

### `generateId(prefix?)`

Generate unique IDs.
```typescript
const id = generateId('msg'); // 'msg_abc123...'
```

### `sleep(ms)`

Async sleep.
```typescript
await sleep(1000); // Wait 1 second
```

### `retry(fn, options)`

Retry with exponential backoff.
```typescript
const result = await retry(
  () => fetchData(),
  { maxRetries: 3, baseDelay: 1000 }
);
```

### `estimateTokens(text)`

Estimate token count.
```typescript
const tokens = estimateTokens('Hello world'); // ~3
```

---

## Error Handling

### Error Classes

| Class | Code | Description |
|-------|------|-------------|
| `AgentForgeError` | Various | Base error class |
| `ProviderError` | `PROVIDER_*` | LLM provider errors |
| `ToolExecutionError` | `TOOL_*` | Tool execution errors |
| `ValidationError` | `VALIDATION_*` | Input validation errors |
| `ConfigurationError` | `INVALID_CONFIGURATION` | Configuration errors |

### Error Codes
```typescript
import { ErrorCode } from 'agentforge';

// Provider errors
ErrorCode.PROVIDER_RATE_LIMITED
ErrorCode.PROVIDER_AUTHENTICATION_FAILED
ErrorCode.PROVIDER_TIMEOUT

// Tool errors
ErrorCode.TOOL_NOT_FOUND
ErrorCode.TOOL_EXECUTION_FAILED
ErrorCode.TOOL_VALIDATION_FAILED

// Agent errors
ErrorCode.AGENT_MAX_ITERATIONS
ErrorCode.AGENT_ABORTED
```

### Result Type

Type-safe error handling without exceptions.
```typescript
import { tryCatchAsync, isOk, isErr, unwrap } from 'agentforge';

const result = await tryCatchAsync(() => agent.run('Hello'));

if (isOk(result)) {
  console.log(result.value.content);
} else {
  console.error(result.error.message);
}
```

---

## License

MIT © Michael Palmer
