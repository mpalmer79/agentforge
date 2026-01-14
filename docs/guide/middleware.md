[middleware.md](https://github.com/user-attachments/files/24618617/middleware.md)
# Middleware

Middleware intercepts requests and responses, enabling logging, caching, rate limiting, and custom processing.

## Creating Middleware

```typescript
import { createMiddleware } from 'agentforge';

const myMiddleware = createMiddleware({
  name: 'my-middleware',
  
  // Runs before each LLM request
  beforeRequest: async (context) => {
    console.log('Request starting...');
    return context; // Return modified or original context
  },
  
  // Runs after each LLM response
  afterResponse: async (response, context) => {
    console.log('Response received:', response.content.slice(0, 50));
    return response; // Return modified or original response
  },
  
  // Runs when an error occurs
  onError: async (error, context) => {
    console.error('Error:', error.message);
    // Optionally rethrow or handle
  },
  
  // Runs before each tool execution
  onToolCall: async (toolCall, context) => {
    console.log('Calling tool:', toolCall.name);
    return toolCall; // Can modify the tool call
  },
  
  // Runs after each tool execution
  onToolResult: async (result, context) => {
    console.log('Tool result:', result.toolCallId);
    return result; // Can modify the result
  },
});
```

## Middleware Hooks

| Hook | When it runs | Can modify |
|------|--------------|------------|
| `beforeRequest` | Before LLM call | Context, messages |
| `afterResponse` | After LLM response | Response content |
| `onError` | On any error | Can handle/rethrow |
| `onToolCall` | Before tool runs | Tool arguments |
| `onToolResult` | After tool runs | Tool result |

## Using Middleware

Pass middleware to the Agent:

```typescript
const agent = new Agent({
  provider,
  middleware: [
    loggingMiddleware,
    rateLimitMiddleware,
    cacheMiddleware,
  ],
});
```

### Execution Order

- `beforeRequest`: First → Last (in array order)
- `afterResponse`: Last → First (reverse order)

```typescript
// middleware: [A, B, C]

// beforeRequest order:
// A.beforeRequest → B.beforeRequest → C.beforeRequest → LLM

// afterResponse order:
// LLM → C.afterResponse → B.afterResponse → A.afterResponse
```

## Built-in Middleware

### Logging

```typescript
import { loggingMiddleware } from 'agentforge';

const agent = new Agent({
  provider,
  middleware: [loggingMiddleware],
});

// Output:
// [AgentForge] Request: { messageCount: 2, toolCount: 1 }
// [AgentForge] Tool Call: { name: 'calculator', arguments: {...} }
// [AgentForge] Tool Result: { toolCallId: 'tc_123' }
// [AgentForge] Response: { contentLength: 42, toolCalls: 0 }
```

### Rate Limiting

```typescript
import { createRateLimitMiddleware } from 'agentforge';

const rateLimiter = createRateLimitMiddleware({
  maxRequestsPerMinute: 60,
  onRateLimited: () => {
    console.warn('Rate limit reached!');
  },
});

const agent = new Agent({
  provider,
  middleware: [rateLimiter],
});
```

### Caching

```typescript
import { createCacheMiddleware } from 'agentforge';

const cache = createCacheMiddleware({
  ttlMs: 300000,      // 5 minutes
  maxSize: 100,       // Max cached responses
  keyFn: (context) => {
    // Custom cache key based on last message
    const lastMsg = context.messages.at(-1);
    return `${lastMsg?.role}:${lastMsg?.content}`;
  },
});

const agent = new Agent({
  provider,
  middleware: [cache],
});
```

### Retry

```typescript
import { createRetryMiddleware } from 'agentforge';

const retry = createRetryMiddleware({
  maxRetries: 3,
  baseDelayMs: 1000,          // Exponential backoff
  shouldRetry: (error) => {
    // Only retry rate limits and server errors
    return error.message.includes('rate limit') ||
           error.message.includes('503');
  },
});
```

## Custom Middleware Examples

### Request Timing

```typescript
const timingMiddleware = createMiddleware({
  name: 'timing',
  beforeRequest: async (context) => {
    context.metadata.__startTime = Date.now();
    return context;
  },
  afterResponse: async (response, context) => {
    const duration = Date.now() - (context.metadata.__startTime as number);
    console.log(`Request took ${duration}ms`);
    return response;
  },
});
```

### Input Sanitization

```typescript
const sanitizeMiddleware = createMiddleware({
  name: 'sanitize',
  beforeRequest: async (context) => {
    // Remove PII from messages
    const sanitizedMessages = context.messages.map(msg => ({
      ...msg,
      content: msg.content.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]'),
    }));
    return { ...context, messages: sanitizedMessages };
  },
});
```

### Response Filtering

```typescript
const filterMiddleware = createMiddleware({
  name: 'filter',
  afterResponse: async (response, context) => {
    // Filter out unwanted content
    const filteredContent = response.content
      .replace(/badword/gi, '***');
    return { ...response, content: filteredContent };
  },
});
```

### Tool Authorization

```typescript
const authMiddleware = createMiddleware({
  name: 'auth',
  onToolCall: async (toolCall, context) => {
    const user = context.metadata.user as { role: string };
    const restrictedTools = ['delete_data', 'admin_action'];
    
    if (restrictedTools.includes(toolCall.name) && user.role !== 'admin') {
      throw new Error(`Unauthorized: ${toolCall.name} requires admin role`);
    }
    
    return toolCall;
  },
});
```

### Analytics

```typescript
const analyticsMiddleware = createMiddleware({
  name: 'analytics',
  afterResponse: async (response, context) => {
    await analytics.track('agent_response', {
      messageCount: context.messages.length,
      toolsUsed: response.toolCalls?.length ?? 0,
      responseLength: response.content.length,
      usage: response.usage,
    });
    return response;
  },
});
```

## Composing Middleware

Build complex pipelines by combining middleware:

```typescript
const agent = new Agent({
  provider,
  middleware: [
    // Order matters!
    authMiddleware,       // Check permissions first
    rateLimitMiddleware,  // Then rate limiting
    cacheMiddleware,      // Check cache before API call
    retryMiddleware,      // Retry on failures
    loggingMiddleware,    // Log everything
    analyticsMiddleware,  // Track metrics
  ],
});
```

## Middleware Context

The `context` object contains:

```typescript
interface MiddlewareContext {
  messages: Message[];           // Current conversation
  tools: Tool[];                 // Available tools
  systemPrompt?: string;         // System prompt
  metadata: Record<string, unknown>; // Custom data
  request: CompletionRequest;    // The actual request
}
```

Use `metadata` to pass data between middleware:

```typescript
// In middleware A
context.metadata.userId = 'user_123';

// In middleware B
const userId = context.metadata.userId;
```

## Next Steps

- **[Memory Management](/guide/memory)** — Conversation history
- **[Error Handling](/guide/error-handling)** — Graceful failures
- **[Plugins & Events](/guide/plugins-events)** — Advanced extensibility
