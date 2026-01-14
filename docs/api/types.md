[types.md](https://github.com/user-attachments/files/24618550/types.md)
# Types API

TypeScript types, branded types, and type guards.

## Core Types

### Message

```typescript
interface Message {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

type MessageRole = 'system' | 'user' | 'assistant' | 'tool';
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

### AgentResponse

```typescript
interface AgentResponse {
  id: string;
  content: string;
  messages: Message[];
  toolResults?: ToolResult[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
```

## Branded Types

Type-safe primitives that prevent mixing IDs:

```typescript
import {
  MessageId,
  ToolCallId,
  ResponseId,
  Temperature,
  messageId,
  toolCallId,
  temperature,
} from 'agentforge';

// Create branded values
const msgId: MessageId = messageId('msg_123');
const tcId: ToolCallId = toolCallId('tc_456');
const temp: Temperature = temperature(0.7);

// Type error: can't mix them
const wrong: MessageId = tcId; // ❌ Error
```

### Available Branded Types

| Type | Creator | Validator |
|------|---------|-----------|
| `MessageId` | `messageId(str)` | `isMessageId(val)` |
| `ToolCallId` | `toolCallId(str)` | `isToolCallId(val)` |
| `ResponseId` | `responseId(str)` | - |
| `ErrorId` | `errorId(str)` | - |
| `SessionId` | `sessionId(str)` | - |
| `Temperature` | `temperature(num)` | `isTemperature(val)` |
| `NonNegativeInteger` | `nonNegativeInteger(num)` | `isNonNegativeInteger(val)` |
| `PositiveInteger` | `positiveInteger(num)` | `isPositiveInteger(val)` |
| `Percentage` | `percentage(num)` | - |
| `TokenCount` | `tokenCount(num)` | - |
| `Timestamp` | `timestamp(num)` | - |
| `NonEmptyString` | `nonEmptyString(str)` | - |
| `ToolName` | `toolName(str)` | `isToolName(val)` |
| `ApiKey` | `apiKey(str)` | - |
| `ModelId` | `modelId(str)` | - |

## Type Guards

Runtime type checking:

```typescript
import {
  isMessage,
  isToolCall,
  isToolResult,
  isProvider,
  isTool,
  isUserMessage,
  isAssistantMessage,
  isSystemMessage,
  isToolMessage,
  hasToolCalls,
} from 'agentforge';

// Check types at runtime
if (isMessage(value)) {
  console.log(value.content); // TypeScript knows it's a Message
}

if (isUserMessage(message)) {
  // Handle user message
}

if (hasToolCalls(response)) {
  // Response has toolCalls array
}
```

### Available Guards

| Guard | Checks |
|-------|--------|
| `isMessage(val)` | Valid Message object |
| `isToolCall(val)` | Valid ToolCall object |
| `isToolResult(val)` | Valid ToolResult object |
| `isProvider(val)` | Valid Provider object |
| `isTool(val)` | Valid Tool object |
| `isUserMessage(msg)` | `role === 'user'` |
| `isAssistantMessage(msg)` | `role === 'assistant'` |
| `isSystemMessage(msg)` | `role === 'system'` |
| `isToolMessage(msg)` | `role === 'tool'` |
| `hasToolCalls(resp)` | Has non-empty toolCalls |
| `isObject(val)` | Plain object |
| `isNonEmptyString(val)` | Non-empty string |
| `isDefined(val)` | Not null/undefined |
| `isNullish(val)` | null or undefined |

## Assertion Functions

Throw if invalid:

```typescript
import {
  assertMessage,
  assertProvider,
  assertTool,
  assertDefined,
  assertNonEmptyString,
} from 'agentforge';

// Throws if invalid
assertMessage(value); // value is now Message
assertDefined(value); // value is now non-nullable
assertNonEmptyString(value); // value is now string
```

## Utility Types

```typescript
// Deep partial
type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]> };

// Awaitable (value or promise)
type Awaitable<T> = T | Promise<T>;
```
