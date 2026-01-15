# Error Handling

Comprehensive guide to handling errors in AgentForge.

## Error Taxonomy

| Error Type | Code | Retryable | Description |
|------------|------|-----------|-------------|
| `RateLimitError` | `RATE_LIMIT` | ✅ Yes | Provider rate limit exceeded |
| `TimeoutError` | `TIMEOUT` | ✅ Yes | Request exceeded timeout |
| `ServerError` | `SERVER_ERROR` | ✅ Yes | Provider returned 5xx |
| `AuthenticationError` | `AUTH_ERROR` | ❌ No | Invalid API key |
| `ValidationError` | `VALIDATION` | ❌ No | Invalid input/schema |
| `ToolExecutionError` | `TOOL_ERROR` | ⚠️ Maybe | Tool failed to execute |
| `ContextLengthError` | `CONTEXT_LENGTH` | ❌ No | Exceeded max tokens |
| `ContentFilterError` | `CONTENT_FILTER` | ❌ No | Content blocked by provider |
| `NetworkError` | `NETWORK` | ✅ Yes | Connection failed |
| `ParseError` | `PARSE_ERROR` | ❌ No | Failed to parse response |

## Handling Errors

### Basic Try/Catch
```typescript
import { AgentForgeError, RateLimitError } from 'agentforge';

try {
  const response = await agent.run('Hello');
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log('Rate limited, retry after:', error.retryAfter);
  } else if (error instanceof AgentForgeError) {
    console.log('AgentForge error:', error.code, error.message);
  } else {
    throw error;
  }
}
```

### Error Event Hook
```typescript
agent.on('request:error', ({ error, requestId, context }) => {
  logger.error('Request failed', {
    requestId,
    code: error.code,
    message: error.message,
    retryable: error.retryable,
  });
});
```

### Result Type Pattern

For explicit error handling without exceptions:
```typescript
import { Result } from 'agentforge';

const result: Result<Response> = await agent.runSafe('Hello');

if (result.ok) {
  console.log('Success:', result.value.content);
} else {
  console.log('Error:', result.error.code);
}
```

## Automatic Retry

Configure retry behavior for transient errors:
```typescript
import { RetryMiddleware } from 'agentforge';

const retry = new RetryMiddleware({
  maxRetries: 3,
  baseDelay: 1000,        // Start with 1s
  maxDelay: 10000,        // Cap at 10s
  backoffMultiplier: 2,   // Double each time
  retryableErrors: [
    'RATE_LIMIT',
    'TIMEOUT',
    'SERVER_ERROR',
    'NETWORK',
  ],
  onRetry: (attempt, error) => {
    console.log(`Retry ${attempt}: ${error.message}`);
  },
});

const agent = new Agent({
  provider,
  middleware: [retry],
});
```

## Circuit Breaker

Prevent cascade failures:
```typescript
import { CircuitBreakerMiddleware } from 'agentforge';

const circuitBreaker = new CircuitBreakerMiddleware({
  failureThreshold: 5,    // Open after 5 failures
  resetTimeout: 30000,    // Try again after 30s
  
  onOpen: () => {
    alert.send('Circuit breaker opened - provider may be down');
  },
  onClose: () => {
    alert.send('Circuit breaker closed - service recovered');
  },
});
```

### Circuit Breaker States
```
     Success
        │
        ▼
┌──────────────┐
│    CLOSED    │ ◄─── Normal operation
└──────────────┘
        │
        │ Failure threshold reached
        ▼
┌──────────────┐
│     OPEN     │ ◄─── All requests fail immediately
└──────────────┘
        │
        │ Reset timeout elapsed
        ▼
┌──────────────┐
│  HALF_OPEN   │ ◄─── Test with single request
└──────────────┘
        │
   Success? ───────► CLOSED
        │
   Failure? ───────► OPEN
```

## Tool Execution Errors

Handle tool failures gracefully:
```typescript
const tool = defineTool({
  name: 'fetch_data',
  description: 'Fetch data from API',
  schema: z.object({ url: z.string().url() }),
  execute: async ({ url }) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new ToolExecutionError(
          `HTTP ${response.status}`,
          { retryable: response.status >= 500 }
        );
      }
      return await response.json();
    } catch (error) {
      // Return error info to LLM so it can adapt
      return {
        error: true,
        message: error.message,
        suggestion: 'Try a different URL or approach',
      };
    }
  },
});
```

## Validation Errors

Zod schema validation failures:
```typescript
import { ValidationError } from 'agentforge';

try {
  await agent.run('Call the tool with bad data');
} catch (error) {
  if (error instanceof ValidationError) {
    console.log('Validation failed:', error.issues);
    // [{ path: ['email'], message: 'Invalid email format' }]
  }
}
```

## Global Error Handler

Catch-all for unhandled errors:
```typescript
agent.on('error', ({ error, context }) => {
  // Log to monitoring service
  Sentry.captureException(error, {
    extra: {
      requestId: context.requestId,
      provider: context.provider,
    },
  });
  
  // Alert on critical errors
  if (!error.retryable) {
    pagerduty.alert('Non-retryable error in AgentForge');
  }
});
```
