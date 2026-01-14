[memory.md](https://github.com/user-attachments/files/24618604/memory.md)
# Memory Management

Long conversations exceed context limits. Memory management keeps conversations efficient while preserving important context.

## Configuration

```typescript
const agent = new Agent({
  provider,
  memory: {
    maxMessages: 50,              // Max messages to keep
    maxTokens: 8000,              // Max tokens to keep
    strategy: 'sliding-window',   // How to trim
  },
});
```

## Memory Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxMessages` | `number` | None | Maximum messages to retain |
| `maxTokens` | `number` | None | Maximum tokens to retain |
| `strategy` | `string` | `'sliding-window'` | Trimming strategy |

## Strategies

### Sliding Window

Keeps the most recent messages:

```typescript
memory: {
  maxMessages: 20,
  strategy: 'sliding-window',
}

// Conversation: [1, 2, 3, ..., 25]
// After trimming: [6, 7, 8, ..., 25]
```

System messages are always preserved:

```typescript
// Before: [system, user1, asst1, user2, asst2, ..., user25]
// After:  [system, ..., user21, asst21, user22, asst22, ..., user25]
```

### Trim Oldest

Similar to sliding window, removes oldest non-system messages:

```typescript
memory: {
  maxMessages: 10,
  strategy: 'trim-oldest',
}
```

### Summarize

(Coming soon) Summarizes old messages instead of removing them:

```typescript
memory: {
  maxMessages: 10,
  strategy: 'summarize',
}

// Old messages get summarized into a single context message
```

## Token-Based Limits

Limit by token count for precise control:

```typescript
memory: {
  maxTokens: 4000,
  strategy: 'sliding-window',
}
```

Token estimation uses a simple heuristic (~4 characters per token). For precise counting, implement custom middleware.

## Combining Limits

Use both limits together — the stricter one applies:

```typescript
memory: {
  maxMessages: 50,     // Keep at most 50 messages
  maxTokens: 8000,     // But also stay under 8000 tokens
  strategy: 'sliding-window',
}
```

## Manual Conversation Management

For full control, pass your own message array:

```typescript
const conversationHistory: Message[] = [];

// Add user message
conversationHistory.push({
  id: generateId('msg'),
  role: 'user',
  content: userInput,
  timestamp: Date.now(),
});

// Run agent with history
const response = await agent.run(conversationHistory);

// Add assistant response
conversationHistory.push({
  id: generateId('msg'),
  role: 'assistant',
  content: response.content,
  timestamp: Date.now(),
});

// Manually trim if needed
if (conversationHistory.length > 100) {
  const system = conversationHistory.filter(m => m.role === 'system');
  const recent = conversationHistory.filter(m => m.role !== 'system').slice(-50);
  conversationHistory.length = 0;
  conversationHistory.push(...system, ...recent);
}
```

## Preserving Important Messages

Mark messages to prevent trimming:

```typescript
const importantMessage: Message = {
  id: generateId('msg'),
  role: 'user',
  content: 'My budget is $5000',
  timestamp: Date.now(),
  metadata: {
    preserve: true, // Custom flag
  },
};
```

Then handle in custom middleware:

```typescript
const preserveMiddleware = createMiddleware({
  name: 'preserve',
  beforeRequest: async (context) => {
    // Custom logic to preserve marked messages
    const preserved = context.messages.filter(m => m.metadata?.preserve);
    const recent = context.messages.filter(m => !m.metadata?.preserve).slice(-20);
    return {
      ...context,
      messages: [...preserved, ...recent],
    };
  },
});
```

## Session Persistence

Save conversations to a database:

```typescript
class ConversationStore {
  private db: Database;

  async save(sessionId: string, messages: Message[]): Promise<void> {
    await this.db.put(sessionId, JSON.stringify(messages));
  }

  async load(sessionId: string): Promise<Message[]> {
    const data = await this.db.get(sessionId);
    return data ? JSON.parse(data) : [];
  }
}

// Usage
const store = new ConversationStore();

// Load previous conversation
const history = await store.load(sessionId);

// Run agent
const response = await agent.run([...history, newUserMessage]);

// Save updated history
await store.save(sessionId, response.messages);
```

## Best Practices

### 1. Set Reasonable Limits

```typescript
// Good: Plenty of context, won't hit API limits
memory: {
  maxMessages: 50,
  maxTokens: 8000,
}

// Too aggressive: May lose important context
memory: {
  maxMessages: 5,
}

// No limits: Will eventually fail with long conversations
memory: {} // ❌
```

### 2. Consider Your Model's Context Window

| Model | Context Window | Recommended maxTokens |
|-------|---------------|----------------------|
| GPT-4 Turbo | 128K | 32000 |
| GPT-4 | 8K | 4000 |
| Claude 3.5 | 200K | 50000 |
| GPT-3.5 | 16K | 8000 |

### 3. Include System Prompt in Calculations

System prompts count toward limits:

```typescript
const systemPrompt = '...'; // 500 tokens
const available = maxTokens - estimateTokens(systemPrompt);
```

## Memory Events

Track memory operations:

```typescript
import { EventEmitter } from 'agentforge';

const events = new EventEmitter();

events.on('memory:trim', ({ before, after, strategy }) => {
  console.log(`Memory trimmed: ${before} → ${after} messages (${strategy})`);
});
```

## Next Steps

- **[Streaming](/guide/streaming)** — Real-time responses
- **[Error Handling](/guide/error-handling)** — Graceful failures
- **[React Integration](/guide/react-integration)** — Build chat UIs
