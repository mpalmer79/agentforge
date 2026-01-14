[agent.md](https://github.com/user-attachments/files/24618486/agent.md)
# Agent API

The `Agent` class is the core of AgentForge.

## Constructor

```typescript
new Agent(config: AgentConfig)
```

### AgentConfig

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `provider` | `Provider` | ✅ | - | LLM provider instance |
| `tools` | `Tool[]` | ❌ | `[]` | Available tools |
| `systemPrompt` | `string` | ❌ | - | System message |
| `middleware` | `Middleware[]` | ❌ | `[]` | Middleware stack |
| `memory` | `MemoryConfig` | ❌ | - | Memory settings |
| `maxIterations` | `number` | ❌ | `10` | Max tool loops |
| `temperature` | `number` | ❌ | - | LLM temperature |
| `maxTokens` | `number` | ❌ | - | Max response tokens |

## Methods

### run()

Execute the agent with a message.

```typescript
async run(
  input: string | Message[],
  options?: { signal?: AbortSignal }
): Promise<AgentResponse>
```

**Parameters:**
- `input` - String message or array of Message objects
- `options.signal` - AbortSignal for cancellation

**Returns:** `AgentResponse`

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

**Example:**

```typescript
// String input
const response = await agent.run('Hello!');

// Message array
const response = await agent.run([
  { id: '1', role: 'user', content: 'Hello', timestamp: Date.now() },
]);

// With abort signal
const controller = new AbortController();
const response = await agent.run('Hello', { signal: controller.signal });
```

### stream()

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
| `'tool_result'` | `ToolResult` | Tool result |
| `'done'` | `{ content: string }` | Stream complete |

**Example:**

```typescript
for await (const event of agent.stream('Tell me a story')) {
  if (event.type === 'content') {
    process.stdout.write(event.data as string);
  }
}
```

### addTool()

Add a tool at runtime.

```typescript
addTool(tool: Tool): void
```

### removeTool()

Remove a tool by name.

```typescript
removeTool(name: string): boolean
```

**Returns:** `true` if removed, `false` if not found

### getTools()

Get all registered tools.

```typescript
getTools(): Tool[]
```

### setSystemPrompt()

Update the system prompt.

```typescript
setSystemPrompt(prompt: string): void
```

## MemoryConfig

```typescript
interface MemoryConfig {
  maxMessages?: number;
  maxTokens?: number;
  strategy?: 'sliding-window' | 'summarize' | 'trim-oldest';
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `maxMessages` | `number` | - | Max messages to keep |
| `maxTokens` | `number` | - | Max tokens to keep |
| `strategy` | `string` | `'sliding-window'` | Trimming strategy |

## Errors

| Error | Code | Cause |
|-------|------|-------|
| `AgentForgeError` | `AGENT_MAX_ITERATIONS` | Exceeded maxIterations |
| `AgentForgeError` | `AGENT_ABORTED` | Abort signal triggered |
| `ProviderError` | Various | LLM API errors |
| `ToolExecutionError` | `TOOL_EXECUTION_FAILED` | Tool threw error |
