[Uploading react-hooks.md…]()
# React Hooks API

React hooks for building chat interfaces.

## useAgent()

Full-featured agent hook.

```typescript
import { useAgent } from 'agentforge/react';

const {
  messages,
  isLoading,
  error,
  sendMessage,
  reset,
  abort,
} = useAgent(config: UseAgentConfig);
```

### UseAgentConfig

```typescript
interface UseAgentConfig {
  provider: Provider;
  tools?: Tool[];
  systemPrompt?: string;
  middleware?: Middleware[];
  memory?: MemoryConfig;
  onError?: (error: Error) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onResponse?: (response: AgentResponse) => void;
}
```

### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `messages` | `Message[]` | Conversation history |
| `isLoading` | `boolean` | Request in progress |
| `error` | `Error \| null` | Last error |
| `sendMessage` | `(message: string) => Promise<void>` | Send a message |
| `reset` | `() => void` | Clear conversation |
| `abort` | `() => void` | Cancel current request |

## useChat()

Simplified chat hook with input management.

```typescript
import { useChat } from 'agentforge/react';

const {
  messages,
  input,
  setInput,
  handleSubmit,
  isLoading,
  reload,
  stop,
} = useChat(config: UseChatConfig);
```

### UseChatConfig

```typescript
interface UseChatConfig {
  provider: Provider;
  systemPrompt?: string;
  initialMessages?: Message[];
}
```

### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `messages` | `Message[]` | Conversation history |
| `input` | `string` | Current input value |
| `setInput` | `(value: string) => void` | Update input |
| `handleSubmit` | `(e: FormEvent) => void` | Form submit handler |
| `isLoading` | `boolean` | Request in progress |
| `reload` | `() => void` | Resend last message |
| `stop` | `() => void` | Cancel current request |

## useStreamingAgent()

Hook with streaming support.

```typescript
import { useStreamingAgent } from 'agentforge/react';

const {
  messages,
  streamingContent,
  isStreaming,
  sendMessage,
  abort,
} = useStreamingAgent(config: UseStreamingAgentConfig);
```

### UseStreamingAgentConfig

```typescript
interface UseStreamingAgentConfig {
  provider: Provider;
  tools?: Tool[];
  systemPrompt?: string;
  onToken?: (token: string) => void;
  onComplete?: (content: string) => void;
}
```

### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `messages` | `Message[]` | Conversation history |
| `streamingContent` | `string` | Current streaming content |
| `isStreaming` | `boolean` | Streaming in progress |
| `sendMessage` | `(message: string) => Promise<void>` | Send a message |
| `abort` | `() => void` | Cancel stream |

## AgentProvider

Context provider for sharing configuration.

```tsx
import { AgentProvider } from 'agentforge/react';

<AgentProvider
  provider={provider}
  tools={tools}
  systemPrompt="You are helpful."
>
  {children}
</AgentProvider>
```

## useAgentContext()

Access provider context:

```typescript
import { useAgentContext } from 'agentforge/react';

const { provider, tools, systemPrompt } = useAgentContext();
```
