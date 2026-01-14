[plugins-events.md](https://github.com/user-attachments/files/24618621/plugins-events.md)
# Plugins & Events

Extend AgentForge with plugins and react to lifecycle events.

## Event System

### EventEmitter

Create and use event emitters:

```typescript
import { EventEmitter } from 'agentforge';

const events = new EventEmitter();

// Subscribe to events
events.on('request:start', ({ messages, timestamp }) => {
  console.log(`Request started with ${messages.length} messages`);
});

events.on('request:end', ({ response, durationMs }) => {
  console.log(`Request completed in ${durationMs}ms`);
});

// One-time subscription
events.once('agent:start', (payload) => {
  console.log('Agent started (first time only)');
});

// Unsubscribe
const unsubscribe = events.on('tool:start', handler);
unsubscribe(); // Remove listener
```

### Available Events

| Event | Payload | When |
|-------|---------|------|
| `request:start` | `{ messages, timestamp }` | Before LLM request |
| `request:end` | `{ response, durationMs, timestamp }` | After LLM response |
| `request:error` | `{ error, timestamp }` | On request failure |
| `tool:start` | `{ toolCall, timestamp }` | Before tool execution |
| `tool:end` | `{ toolCall, result, durationMs, timestamp }` | After tool execution |
| `tool:error` | `{ toolCall, error, timestamp }` | On tool failure |
| `stream:chunk` | `{ content, timestamp }` | Streaming content received |
| `stream:end` | `{ fullContent, timestamp }` | Streaming complete |
| `memory:trim` | `{ before, after, strategy, timestamp }` | Memory trimmed |
| `agent:start` | `{ input, timestamp }` | Agent run started |
| `agent:end` | `{ iterations, durationMs, timestamp }` | Agent run complete |
| `plugin:event` | `{ pluginName, eventName, data, timestamp }` | Custom plugin event |

### Global Event Bus

Use the shared global event bus:

```typescript
import { globalEventBus } from 'agentforge';

// Any component can emit
globalEventBus.emit('plugin:event', {
  pluginName: 'my-plugin',
  eventName: 'custom-action',
  data: { foo: 'bar' },
  timestamp: Date.now(),
});

// Any component can listen
globalEventBus.on('plugin:event', ({ pluginName, data }) => {
  console.log(`Event from ${pluginName}:`, data);
});
```

### Event Utilities

Wait for a specific event:

```typescript
import { waitForEvent } from 'agentforge';

// Wait for next request to complete
const payload = await waitForEvent(events, 'request:end', 30000);
console.log(`Request took ${payload.durationMs}ms`);

// With timeout
try {
  await waitForEvent(events, 'agent:end', 5000);
} catch (error) {
  console.log('Timeout waiting for agent');
}
```

Create an async iterator from events:

```typescript
import { eventIterator } from 'agentforge';

// Stream all tool calls
for await (const event of eventIterator(events, 'tool:start')) {
  console.log('Tool called:', event.toolCall.name);
}
```

## Plugin System

Plugins bundle tools, middleware, and event handlers into reusable packages.

### Defining Plugins

```typescript
import { definePlugin } from 'agentforge';

const myPlugin = definePlugin({
  metadata: {
    name: 'my-plugin',
    version: '1.0.0',
    description: 'A custom plugin',
    author: 'Your Name',
    dependencies: [], // Other plugins this depends on
  },

  // Called when plugin is registered
  onRegister: ({ agent, events, storage, logger }) => {
    logger.info('Plugin registered!');
    storage.set('initialized', true);
  },

  // Called when plugin is unregistered
  onUnregister: ({ logger }) => {
    logger.info('Plugin unregistered');
  },

  // Tools provided by this plugin
  tools: [myCustomTool],

  // Middleware provided by this plugin
  middleware: [myMiddleware],

  // Event handlers
  events: {
    'request:start': ({ messages }) => {
      console.log('Request starting...');
    },
    'tool:end': ({ toolCall, durationMs }) => {
      console.log(`Tool ${toolCall.name} took ${durationMs}ms`);
    },
  },
});
```

### Plugin Manager

```typescript
import { Agent, PluginManager, EventEmitter } from 'agentforge';

const agent = new Agent({ provider });
const events = new EventEmitter();

const plugins = new PluginManager(agent, events);

// Register plugins
await plugins.register(analyticsPlugin);
await plugins.register(loggingPlugin);

// Check if registered
plugins.has('analytics'); // true

// Get plugin
const plugin = plugins.get('analytics');

// Get plugin context (storage, etc.)
const context = plugins.getContext('analytics');
context?.storage.get('metrics');

// Unregister
await plugins.unregister('analytics');

// Get all plugins
const allPlugins = plugins.getAll();
```

### Plugin Context

Each plugin receives a context object:

```typescript
interface PluginContext {
  agent: Agent;           // The agent instance
  events: EventEmitter;   // Event emitter for subscriptions
  storage: Map<string, unknown>; // Plugin-specific storage
  logger: PluginLogger;   // Scoped logger
}

// Logger methods
logger.debug('Debug message');
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message');

// Output: [Plugin:my-plugin] Info message
```

### Plugin Dependencies

Plugins can depend on other plugins:

```typescript
const basePlugin = definePlugin({
  metadata: {
    name: 'base',
    version: '1.0.0',
  },
  // ...
});

const extendedPlugin = definePlugin({
  metadata: {
    name: 'extended',
    version: '1.0.0',
    dependencies: ['base'], // Requires 'base' to be registered first
  },
  // ...
});

// Must register in order
await plugins.register(basePlugin);
await plugins.register(extendedPlugin);

// Unregistration checks dependencies
await plugins.unregister('base'); // Error: 'extended' depends on it
```

## Built-in Plugins

### Analytics Plugin

```typescript
import { analyticsPlugin } from 'agentforge';

await plugins.register(analyticsPlugin);

// Tracks:
// - Total requests
// - Tool call counts
// - Error rates
// - Response times
```

### Telemetry Plugin

```typescript
import { telemetryPlugin } from 'agentforge';

await plugins.register(telemetryPlugin);

// Logs:
// - Agent start/end
// - Tool execution
// - Stream chunks
```

## Real-World Plugin Example

```typescript
const sentryPlugin = definePlugin({
  metadata: {
    name: 'sentry',
    version: '1.0.0',
    description: 'Error reporting with Sentry',
  },

  onRegister: ({ storage, logger }) => {
    // Initialize Sentry
    Sentry.init({ dsn: process.env.SENTRY_DSN });
    storage.set('initialized', true);
    logger.info('Sentry initialized');
  },

  events: {
    'request:error': ({ error, timestamp }) => {
      Sentry.captureException(error, {
        tags: { component: 'agent' },
        extra: { timestamp },
      });
    },

    'tool:error': ({ toolCall, error }) => {
      Sentry.captureException(error, {
        tags: { 
          component: 'tool',
          toolName: toolCall.name,
        },
      });
    },
  },
});
```

## Performance Monitoring Plugin

```typescript
const perfPlugin = definePlugin({
  metadata: {
    name: 'performance',
    version: '1.0.0',
  },

  onRegister: ({ storage }) => {
    storage.set('metrics', {
      requests: [],
      tools: [],
    });
  },

  events: {
    'request:end': ({ durationMs }) => {
      const metrics = storage.get('metrics') as any;
      metrics.requests.push(durationMs);
      
      // Keep last 100
      if (metrics.requests.length > 100) {
        metrics.requests.shift();
      }
    },

    'tool:end': ({ toolCall, durationMs }) => {
      const metrics = storage.get('metrics') as any;
      metrics.tools.push({
        name: toolCall.name,
        duration: durationMs,
      });
    },
  },
});

// Later: get metrics
const context = plugins.getContext('performance');
const metrics = context?.storage.get('metrics');
console.log('Average request time:', 
  metrics.requests.reduce((a, b) => a + b, 0) / metrics.requests.length
);
```

## Next Steps

- **[API Reference](/api/events-plugins)** — Full API documentation
- **[Examples](/examples/multi-agent)** — Multi-agent systems
- **[Middleware](/guide/middleware)** — Alternative extension point
