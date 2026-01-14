[helpers.md](https://github.com/user-attachments/files/24618526/helpers.md)
# Helpers API

Utility functions for common operations.

## generateId()

Generate unique IDs:

```typescript
import { generateId } from 'agentforge';

const id = generateId();           // 'id_abc123xyz'
const msgId = generateId('msg');   // 'msg_abc123xyz'
const customId = generateId('tc'); // 'tc_abc123xyz'
```

## sleep()

Async delay:

```typescript
import { sleep } from 'agentforge';

await sleep(1000); // Wait 1 second
await sleep(500);  // Wait 500ms
```

## retry()

Retry with exponential backoff:

```typescript
import { retry } from 'agentforge';

const result = await retry(
  () => fetchData(),
  {
    maxRetries: 3,      // Default: 3
    baseDelay: 1000,    // Default: 1000ms
    maxDelay: 30000,    // Default: 30000ms
    shouldRetry: (error) => error.message.includes('timeout'),
  }
);
```

### Retry Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxRetries` | `number` | `3` | Max retry attempts |
| `baseDelay` | `number` | `1000` | Initial delay (ms) |
| `maxDelay` | `number` | `30000` | Maximum delay (ms) |
| `shouldRetry` | `function` | All errors | Predicate function |

## deepMerge()

Deep merge objects:

```typescript
import { deepMerge } from 'agentforge';

const merged = deepMerge(
  { a: 1, b: { c: 2 } },
  { b: { d: 3 }, e: 4 }
);
// { a: 1, b: { c: 2, d: 3 }, e: 4 }
```

## truncate()

Truncate strings:

```typescript
import { truncate } from 'agentforge';

truncate('Hello world', 5);        // 'Hello...'
truncate('Hello world', 5, '…');   // 'Hello…'
truncate('Hi', 10);                // 'Hi'
```

## estimateTokens()

Estimate token count:

```typescript
import { estimateTokens } from 'agentforge';

const tokens = estimateTokens('Hello, world!'); // ~4
const tokens = estimateTokens(longText);        // Approximate count
```

Uses ~4 characters per token heuristic. For precise counting, use a tokenizer library.

## createDeferred()

Create a deferred promise:

```typescript
import { createDeferred } from 'agentforge';

const deferred = createDeferred<string>();

// Later...
deferred.resolve('done');
// or
deferred.reject(new Error('failed'));

// Await the result
const result = await deferred.promise;
```

### Deferred Interface

```typescript
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}
```

## isPlainObject()

Check if value is a plain object:

```typescript
import { isPlainObject } from 'agentforge';

isPlainObject({});           // true
isPlainObject({ a: 1 });     // true
isPlainObject([]);           // false
isPlainObject(null);         // false
isPlainObject(new Date());   // false
```

## omit()

Omit keys from object:

```typescript
import { omit } from 'agentforge';

const obj = { a: 1, b: 2, c: 3 };
omit(obj, ['b']);     // { a: 1, c: 3 }
omit(obj, ['a', 'c']); // { b: 2 }
```

## pick()

Pick keys from object:

```typescript
import { pick } from 'agentforge';

const obj = { a: 1, b: 2, c: 3 };
pick(obj, ['a']);      // { a: 1 }
pick(obj, ['a', 'c']); // { a: 1, c: 3 }
```

## Validation Utilities

### validateRange()

```typescript
import { validateRange } from 'agentforge';

validateRange(5, 1, 10, 'count');   // OK
validateRange(15, 1, 10, 'count');  // Throws ValidationError
```

### validatePattern()

```typescript
import { validatePattern } from 'agentforge';

validatePattern('hello', /^[a-z]+$/, 'name'); // OK
validatePattern('Hello', /^[a-z]+$/, 'name'); // Throws
```

### validateOneOf()

```typescript
import { validateOneOf } from 'agentforge';

validateOneOf('a', ['a', 'b', 'c'], 'option'); // OK
validateOneOf('d', ['a', 'b', 'c'], 'option'); // Throws
```

### sanitizeToolName()

```typescript
import { sanitizeToolName } from 'agentforge';

sanitizeToolName('My Tool!');  // 'my_tool'
sanitizeToolName('API-v2');    // 'api_v2'
```

### safeParseJSON()

```typescript
import { safeParseJSON } from 'agentforge';

safeParseJSON('{"a":1}');      // { a: 1 }
safeParseJSON('invalid');      // undefined
safeParseJSON('invalid', {}); // {} (default)
```

### safeStringify()

```typescript
import { safeStringify } from 'agentforge';

safeStringify({ a: 1 });       // '{"a":1}'
safeStringify(circular);       // '[object Object]' (fallback)
```
