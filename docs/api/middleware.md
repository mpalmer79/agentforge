[middleware.md](https://github.com/user-attachments/files/24618531/middleware.md)
# Middleware API

Create and compose middleware for request/response processing.

## createMiddleware()

```typescript
function createMiddleware(config: Middleware): Middleware
```

### Middleware Interface

```typescript
interface Middleware {
  name: string;
  beforeRequest?: (context: MiddlewareContext) => Promise<MiddlewareContext>;
  afterResponse?: (response: CompletionResponse, context: MiddlewareContext) => Promise<CompletionResponse>;
  onError?: (error: Error, context: MiddlewareContext) => Promise<void>;
  onToolCall?: (toolCall: ToolCall, context: MiddlewareContext) => Promise<ToolCall>;
  onToolResult?: (result: ToolResult, context: MiddlewareContext) => Promise<ToolResult>;
}
```

### MiddlewareContext

```typescript
interface MiddlewareContext {
  messages: Message[];
  tools: Tool[];
  systemPrompt?: string;
  metadata: Record<string, unknown>;
  request: CompletionRequest;
}
```

## Built-in Middleware

### loggingMiddleware

Logs all agent activity:

```typescript
import { loggingMiddleware } from 'agentforge';

const agent = new Agent({
  provider,
  middleware: [loggingMiddleware],
});
```

### createRateLimitMiddleware()

```typescript
function createRateLimitMiddleware(options: {
  maxRequestsPerMinute: number;
  onRateLimited?: () => void;
}): Middleware
```

### createCacheMiddleware()

```typescript
function createCacheMiddleware(options: {
  ttlMs?: number;      // Default: 300000 (5 min)
  maxSize?: number;    // Default: 100
  keyFn?: (context: MiddlewareContext) => string;
}): Middleware
```

### createRetryMiddleware()

```typescript
function createRetryMiddleware(options: {
  maxRetries?: number;     // Default: 3
  baseDelayMs?: number;    // Default: 1000
  shouldRetry?: (error: Error) => boolean;
}): Middleware
```

## composeMiddleware()

Compose multiple middleware into a pipeline:

```typescript
import { composeMiddleware } from 'agentforge';

const composed = composeMiddleware([
  middleware1,
  middleware2,
  middleware3,
]);

// Use internally by Agent, or manually:
const processedContext = await composed.runBeforeRequest(context);
const processedResponse = await composed.runAfterResponse(response, context);
```

### Execution Order

- `beforeRequest`: First → Last
- `afterResponse`: Last → First (reverse)
- `onError`: First → Last
- `onToolCall`: First → Last
- `onToolResult`: First → Last
