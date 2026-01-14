[errors.md](https://github.com/user-attachments/files/24618509/errors.md)
# Errors API

Error classes, codes, and Result types.

## Error Classes

### AgentForgeError

Base error class:

```typescript
class AgentForgeError extends Error {
  code: string;
  context: ErrorContext;
  timestamp: number;
  errorId: string;
  
  getUserMessage(): string;
  getDiagnostics(): object;
}
```

### ProviderError

LLM provider errors:

```typescript
class ProviderError extends AgentForgeError {
  provider: string;
  statusCode?: number;
}
```

### ToolExecutionError

Tool execution errors:

```typescript
class ToolExecutionError extends AgentForgeError {
  toolName: string;
}
```

### ValidationError

Input validation errors:

```typescript
class ValidationError extends AgentForgeError {
  field?: string;
  
  static missingRequired(field: string): ValidationError;
  static invalidField(field: string, expected: string, actual: unknown): ValidationError;
  static invalidFormat(field: string, format: string): ValidationError;
}
```

### ConfigurationError

Configuration errors:

```typescript
class ConfigurationError extends AgentForgeError {}
```

### AgentExecutionError

Agent execution errors:

```typescript
class AgentExecutionError extends AgentForgeError {}
```

## Error Codes

```typescript
enum ErrorCode {
  // Provider
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  PROVIDER_RATE_LIMITED = 'PROVIDER_RATE_LIMITED',
  PROVIDER_AUTHENTICATION_FAILED = 'PROVIDER_AUTHENTICATION_FAILED',
  PROVIDER_TIMEOUT = 'PROVIDER_TIMEOUT',
  PROVIDER_INVALID_RESPONSE = 'PROVIDER_INVALID_RESPONSE',
  
  // Tool
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',
  TOOL_VALIDATION_FAILED = 'TOOL_VALIDATION_FAILED',
  TOOL_TIMEOUT = 'TOOL_TIMEOUT',
  
  // Validation
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  
  // Agent
  AGENT_MAX_ITERATIONS = 'AGENT_MAX_ITERATIONS',
  AGENT_ABORTED = 'AGENT_ABORTED',
  
  // Config
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
  
  // Unknown
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}
```

## Error Utilities

### isAgentForgeError()

```typescript
function isAgentForgeError(error: unknown): error is AgentForgeError
```

### isRetryableError()

```typescript
function isRetryableError(error: unknown): boolean
```

Checks for rate limits, timeouts, and server errors.

### wrapError()

```typescript
function wrapError(error: unknown, context?: Partial<ErrorContext>): AgentForgeError
```

Wraps any error in AgentForgeError.

### createErrorHandler()

```typescript
function createErrorHandler(handlers: {
  onProviderError?: (error: ProviderError) => void;
  onToolError?: (error: ToolExecutionError) => void;
  onValidationError?: (error: ValidationError) => void;
  onUnknown?: (error: Error) => void;
}): (error: unknown) => void
```

## Result Types

Functional error handling without exceptions.

### Result Type

```typescript
type Result<T, E = Error> = Ok<T> | Err<E>;

interface Ok<T> {
  readonly _tag: 'ok';
  readonly value: T;
}

interface Err<E> {
  readonly _tag: 'err';
  readonly error: E;
}
```

### Creating Results

```typescript
import { ok, err, errFrom } from 'agentforge';

const success = ok(42);          // Ok<number>
const failure = err(new Error('fail')); // Err<Error>
const wrapped = errFrom('fail'); // Err<Error>
```

### Checking Results

```typescript
import { isOk, isErr } from 'agentforge';

if (isOk(result)) {
  console.log(result.value);
}

if (isErr(result)) {
  console.log(result.error.message);
}
```

### Unwrapping

```typescript
import { unwrap, unwrapOr, unwrapOrElse } from 'agentforge';

unwrap(result);              // Throws if Err
unwrapOr(result, 0);         // Returns 0 if Err
unwrapOrElse(result, () => fallback()); // Lazy fallback
```

### Transforming

```typescript
import { map, mapErr, flatMap } from 'agentforge';

map(result, x => x * 2);        // Transform value
mapErr(result, e => new CustomError(e)); // Transform error
flatMap(result, x => ok(x * 2)); // Chain operations
```

### Combining

```typescript
import { combine } from 'agentforge';

const results = [ok(1), ok(2), ok(3)];
const combined = combine(results); // Ok<[1, 2, 3]> or first Err
```

### Try/Catch Wrappers

```typescript
import { tryCatch, tryCatchAsync } from 'agentforge';

const sync = tryCatch(() => JSON.parse(str));
const async = await tryCatchAsync(() => fetch(url));
```

### Pattern Matching

```typescript
import { match } from 'agentforge';

const message = match(result, {
  ok: (value) => `Success: ${value}`,
  err: (error) => `Failed: ${error.message}`,
});
```

### Promise Conversion

```typescript
import { fromPromise, toPromise } from 'agentforge';

const result = await fromPromise(promise);
const promise = toPromise(result);
```
