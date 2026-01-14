[events-plugins.md](https://github.com/user-attachments/files/24618517/events-plugins.md)
# Events & Plugins API

Event system and plugin management.

## EventEmitter

```typescript
import { EventEmitter } from 'agentforge';

const events = new EventEmitter();
```

### Methods

#### on()

Subscribe to an event:

```typescript
on<E extends EventName>(event: E, listener: EventListener<E>): () => void
```

Returns an unsubscribe function.

#### once()

Subscribe once:

```typescript
once<E extends EventName>(event: E, listener: EventListener<E>): () => void
```

#### off()

Unsubscribe:

```typescript
off<E extends EventName>(event: E, listener: EventListener<E>): void
```

#### emit()

Emit an event:

```typescript
async emit<E extends EventName>(event: E, payload: EventPayload<E>): Promise<void>
```

#### removeAllListeners()

Remove all listeners:

```typescript
removeAllListeners(event?: EventName): void
```

#### listenerCount()

Get listener count:

```typescript
listenerCount(event: EventName): number
```

#### eventNames()

Get all events with listeners:

```typescript
eventNames(): EventName[]
```

## Event Types

```typescript
interface AgentEvents {
  'request:start': { messages: Message[]; timestamp: number };
  'request:end': { response: CompletionResponse; durationMs: number; timestamp: number };
  'request:error': { error: Error; timestamp: number };
  'tool:start': { toolCall: ToolCall; timestamp: number };
  'tool:end': { toolCall: ToolCall; result: ToolResult; durationMs: number; timestamp: number };
  'tool:error': { toolCall: ToolCall; error: Error; timestamp: number };
  'stream:chunk': { content: string; timestamp: number };
  'stream:end': { fullContent: string; timestamp: number };
  'memory:trim': { before: number; after: number; strategy: string; timestamp: number };
  'agent:start': { input: string | Message[]; timestamp: number };
  'agent:end': { iterations: number; durationMs: number; timestamp: number };
  'plugin:event': { pluginName: string; eventName: string; data: unknown; timestamp: number };
}
```

## globalEventBus

Shared global event bus:

```typescript
import { globalEventBus } from 'agentforge';

globalEventBus.on('request:end', handler);
```

## waitForEvent()

Wait for an event:

```typescript
import { waitForEvent } from 'agentforge';

const payload = await waitForEvent(emitter, 'request:end', timeoutMs?);
```

## eventIterator()

Create async iterator from events:

```typescript
import { eventIterator } from 'agentforge';

for await (const event of eventIterator(emitter, 'tool:start')) {
  // Handle each event
}
```

---

## PluginManager

```typescript
import { PluginManager, EventEmitter, Agent } from 'agentforge';

const manager = new PluginManager(agent: Agent, events: EventEmitter);
```

### Methods

#### register()

```typescript
async register(plugin: Plugin): Promise<void>
```

#### unregister()

```typescript
async unregister(name: string): Promise<void>
```

#### get()

```typescript
get(name: string): Plugin | undefined
```

#### has()

```typescript
has(name: string): boolean
```

#### getAll()

```typescript
getAll(): Plugin[]
```

#### getContext()

```typescript
getContext(name: string): PluginContext | undefined
```

## Plugin Interface

```typescript
interface Plugin {
  metadata: PluginMetadata;
  onRegister?: (context: PluginContext) => void | Promise<void>;
  onUnregister?: (context: PluginContext) => void | Promise<void>;
  tools?: Tool[];
  middleware?: Middleware[];
  events?: PluginEventHandlers;
}

interface PluginMetadata {
  name: string;
  version: string;
  description?: string;
  author?: string;
  dependencies?: string[];
}

interface PluginContext {
  agent: Agent;
  events: EventEmitter;
  storage: Map<string, unknown>;
  logger: PluginLogger;
}
```

## definePlugin()

```typescript
import { definePlugin } from 'agentforge';

const myPlugin = definePlugin({
  metadata: { name: 'my-plugin', version: '1.0.0' },
  onRegister: (ctx) => {},
  tools: [],
  events: {},
});
```

## Built-in Plugins

### analyticsPlugin

```typescript
import { analyticsPlugin } from 'agentforge';
```

### telemetryPlugin

```typescript
import { telemetryPlugin } from 'agentforge';
```
