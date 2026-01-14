[error-handling.md](https://github.com/user-attachments/files/24618592/error-handling.md)
# Error Handling

AgentForge provides comprehensive error handling with typed errors, error codes, and Result types for functional programming.

## Error Classes

### AgentForgeError

Base error class for all AgentForge errors:

```typescript
import { AgentForgeError } from 'agentforge';

try {
  await agent.run('Hello');
} catch (error) {
  if (error instanceof AgentForgeError) {
    console.log(error.code);      // Error code (e.g., 'PROVIDER_TIMEOUT')
    console.log(error.message);   // Human-readable message
    console.log(error.context);   // Additional context
    console.log(error.timestamp); // When it occurred
  }
}
```

### ProviderError

Errors from LLM providers:

```typescript
import { ProviderError, ErrorCode } from 'agentforge';

try {
  await agent.run('Hello');
} catch (error) {
  if (error instanceof ProviderError) {
    switch (error.code) {
      case ErrorCode.PROVIDER_RATE_LIMITED:
        console.log('Rate limited, retrying in', error.context.retryAfter);
        break;
      case ErrorCode.PROVIDER_AUTHENTICATION_FAILED:
        console.log('Check your API key');
        break;
      case ErrorCode.PROVIDER_TIMEOUT:
        console.log('Request timed out');
        break;
    }
  }
}
```

### ToolExecutionError

Errors from tool execution:

```typescript
import { ToolExecutionError } from 'agentforge';

try {
  await agent.run('Use the broken tool');
} catch (error) {
  if (error instanceof ToolExecutionError) {
    console.log('Tool failed:', error.toolName);
    console.log('Reason:', error.message);
  }
}
```

### ValidationError

Input validation errors:

```typescript
import { ValidationError } from 'agentforge';

try {
  await agent.run('');
} catch (error) {
  if (error instanceof ValidationError) {
    console.log('Invalid input:', error.field);
  }
}
```

### ConfigurationError

Configuration errors:

```typescript
import { ConfigurationError } from 'agentforge';

try {
  const agent = new Agent({ provider: null });
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.log('Config error:', error.message);
  }
}
```

## Error Codes

```typescript
import { ErrorCode } from 'agentforge';

// Provider errors
ErrorCode.PROVIDER_ERROR            // Generic provider error
ErrorCode.PROVIDER_RATE_LIMITED     // Rate limit exceeded
ErrorCode.PROVIDER_AUTHENTICATION_FAILED
ErrorCode.PROVIDER_TIMEOUT
ErrorCode.PROVIDER_INVALID_RESPONSE

// Tool errors
ErrorCode.TOOL_NOT_FOUND
ErrorCode.TOOL_EXECUTION_FAILED
ErrorCode.TOOL_VALIDATION_FAILED
ErrorCode.TOOL_TIMEOUT

// Validation errors
ErrorCode.VALIDATION_FAILED
ErrorCode.INVALID_INPUT
ErrorCode.MISSING_REQUIRED_FIELD

// Agent errors
ErrorCode.AGENT_MAX_ITERATIONS
ErrorCode.AGENT_ABORTED

// Configuration errors
ErrorCode.INVALID_CONFIGURATION
```

## Checking Error Types

```typescript
import { isAgentForgeError, isRetryableError } from 'agentforge';

try {
  await agent.run('Hello');
} catch (error) {
  // Check if it's an AgentForge error
  if (isAgentForgeError(error)) {
    console.log('AgentForge error:', error.code);
  }
  
  // Check if we should retry
  if (isRetryableError(error)) {
    console.log('This error is retryable');
    // Implement retry logic
  }
}
```

## Result Types (Functional Approach)

For those who prefer functional error handling without exceptions:

### Basic Usage

```typescript
import { tryCatchAsync, isOk, isErr, unwrap } from 'agentforge';

const result = await tryCatchAsync(() => agent.run('Hello'));

if (isOk(result)) {
  console.log('Success:', result.value.content);
} else {
  console.error('Error:', result.error.message);
}
```

### Creating Results

```typescript
import { ok, err } from 'agentforge';

function divide(a: number, b: number): Result<number, Error> {
  if (b === 0) {
    return err(new Error('Division by zero'));
  }
  return ok(a / b);
}

const result = divide(10, 2);
if (isOk(result)) {
  console.log(result.value); // 5
}
```

### Transforming Results

```typescript
import { map, mapErr, flatMap } from 'agentforge';

const result = await tryCatchAsync(() => agent.run('Hello'));

// Transform success value
const mapped = map(result, (response) => response.content.toUpperCase());

// Transform error
const withBetterError = mapErr(result, (error) => 
  new Error(`Agent failed: ${error.message}`)
);

// Chain operations
const chained = flatMap(result, (response) => {
  if (response.content.length === 0) {
    return err(new Error('Empty response'));
  }
  return ok(response.content);
});
```

### Pattern Matching

```typescript
import { match } from 'agentforge';

const message = match(result, {
  ok: (response) => `Success: ${response.content}`,
  err: (error) => `Failed: ${error.message}`,
});
```

### Combining Results

```typescript
import { combine } from 'agentforge';

const results = await Promise.all([
  tryCatchAsync(() => agent.run('Query 1')),
  tryCatchAsync(() => agent.run('Query 2')),
  tryCatchAsync(() => agent.run('Query 3')),
]);

const combined = combine(results);

if (isOk(combined)) {
  // All succeeded
  const [r1, r2, r3] = combined.value;
} else {
  // At least one failed
  console.error(combined.error);
}
```

## Error Recovery

### Retry with Backoff

```typescript
import { retry } from 'agentforge';

const response = await retry(
  () => agent.run('Hello'),
  {
    maxRetries: 3,
    baseDelay: 1000,
    shouldRetry: (error) => isRetryableError(error),
  }
);
```

### Fallback Responses

```typescript
async function safeRun(message: string): Promise<string> {
  try {
    const response = await agent.run(message);
    return response.content;
  } catch (error) {
    if (error instanceof ProviderError) {
      return 'Sorry, I encountered an error. Please try again.';
    }
    throw error; // Re-throw unexpected errors
  }
}
```

### Error Handlers

```typescript
import { createErrorHandler } from 'agentforge';

const handleError = createErrorHandler({
  onProviderError: (error) => {
    console.error('Provider error:', error.message);
    notifyOps(error);
  },
  onToolError: (error) => {
    console.error('Tool error:', error.toolName, error.message);
  },
  onValidationError: (error) => {
    console.warn('Validation error:', error.field);
  },
  onUnknown: (error) => {
    console.error('Unknown error:', error);
    reportToSentry(error);
  },
});

try {
  await agent.run('Hello');
} catch (error) {
  handleError(error);
}
```

## Middleware Error Handling

```typescript
const errorMiddleware = createMiddleware({
  name: 'error-handler',
  onError: async (error, context) => {
    // Log all errors
    console.error('Agent error:', {
      error: error.message,
      messageCount: context.messages.length,
      timestamp: Date.now(),
    });
    
    // Report to monitoring
    await reportError(error, context);
    
    // Re-throw to propagate
    throw error;
  },
});
```

## Tool Error Handling

Tools should throw descriptive errors:

```typescript
const apiTool = defineTool({
  name: 'call_api',
  description: 'Call an external API',
  parameters: z.object({
    endpoint: z.string().url(),
  }),
  execute: async ({ endpoint }) => {
    try {
      const response = await fetch(endpoint);
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }
      
      return response.json();
    } catch (error) {
      // Wrap with context
      throw new Error(`Failed to call ${endpoint}: ${error.message}`);
    }
  },
});
```

The error message is sent back to the LLM, which can then decide how to proceed.

## Best Practices

### 1. Be Specific

```typescript
// ❌ Bad
throw new Error('Something went wrong');

// ✅ Good
throw new ToolExecutionError(
  'Database connection failed: timeout after 30s',
  'query_database',
  { cause: originalError }
);
```

### 2. Include Context

```typescript
throw new ProviderError(
  'Rate limit exceeded',
  'PROVIDER_RATE_LIMITED',
  {
    retryAfter: 60,
    limit: 100,
    remaining: 0,
  }
);
```

### 3. Use Type Guards

```typescript
// ❌ Bad
if (error.code === 'PROVIDER_RATE_LIMITED') { ... }

// ✅ Good
if (error instanceof ProviderError && 
    error.code === ErrorCode.PROVIDER_RATE_LIMITED) { ... }
```

## Next Steps

- **[React Integration](/guide/react-integration)** — Handle errors in React
- **[Middleware](/guide/middleware)** — Global error handling
- **[Plugins & Events](/guide/plugins-events)** — Error events
