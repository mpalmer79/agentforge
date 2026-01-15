# Architecture

Understanding how AgentForge processes requests.

## Request Flow
```
┌─────────────────────────────────────────────────────────────────┐
│                         User Request                            │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Middleware Pipeline                        │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌─────────────┐  │
│  │  Logging  │→ │   Retry   │→ │  Circuit  │→ │   Custom    │  │
│  │           │  │           │  │  Breaker  │  │             │  │
│  └───────────┘  └───────────┘  └───────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Agent Core                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Message Builder                       │   │
│  │         (system prompt + history + user input)           │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                          Provider                               │
│         (OpenAI / Anthropic / Cohere / Gemini / Together)       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │   Tool Calls Needed?  │
                    └───────────────────────┘
                         │            │
                        Yes           No
                         │            │
                         ▼            │
┌────────────────────────────────┐    │
│       Tool Execution Loop      │    │
│  ┌──────────────────────────┐  │    │
│  │  1. Parse tool call      │  │    │
│  │  2. Validate with Zod    │  │    │
│  │  3. Execute tool         │  │    │
│  │  4. Return result        │  │    │
│  │  5. Send back to LLM     │  │    │
│  └──────────────────────────┘  │    │
│         ↻ Repeat if needed     │    │
└────────────────────────────────┘    │
                         │            │
                         ▼            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Final Response                            │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Event Hooks                             │
│     (request:complete, tool:execute, tokens:used, etc.)         │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### Agent

The central orchestrator that manages the conversation loop:
```typescript
const agent = new Agent({
  provider,      // LLM provider instance
  tools,         // Array of tool definitions
  middleware,    // Request/response processors
  memory,        // Conversation history manager
  systemPrompt,  // Base instructions for the LLM
});
```

### Provider

Abstraction layer for LLM APIs. All providers implement the same interface:
```typescript
interface Provider {
  generate(messages: Message[], options?: GenerateOptions): Promise<Response>;
  stream(messages: Message[], options?: StreamOptions): AsyncIterable<Chunk>;
}
```

### Middleware

Processors that wrap requests and responses:
```typescript
interface Middleware {
  name: string;
  before?(context: RequestContext): Promise<RequestContext>;
  after?(context: ResponseContext): Promise<ResponseContext>;
  onError?(error: Error, context: ErrorContext): Promise<void>;
}
```

### Tools

Type-safe function definitions the LLM can call:
```typescript
const tool = defineTool({
  name: 'search',
  description: 'Search the web',
  schema: z.object({ query: z.string() }),
  execute: async ({ query }) => {
    return { results: await searchApi(query) };
  },
});
```

## Resilience Layer
```
┌─────────────────────────────────────────────────────────────┐
│                    Resilience Stack                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Circuit Breaker                     │   │
│  │   Prevents cascade failures when provider is down    │   │
│  │   States: CLOSED → OPEN → HALF_OPEN → CLOSED        │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Retry with Backoff                  │   │
│  │   Exponential backoff: 1s → 2s → 4s → 8s (max)      │   │
│  │   Retryable: RATE_LIMIT, TIMEOUT, SERVER_ERROR      │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                     Fallback                         │   │
│  │   Switch to backup provider if primary fails         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Memory Management
```typescript
// Conversation history is managed automatically
agent.memory.add({ role: 'user', content: 'Hello' });
agent.memory.add({ role: 'assistant', content: 'Hi there!' });

// Strategies for long conversations
const memory = new SlidingWindowMemory({ maxMessages: 20 });
const memory = new TokenLimitMemory({ maxTokens: 4000 });
const memory = new SummaryMemory({ summarizeAfter: 10 });
```
