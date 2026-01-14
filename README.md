# 🔧 AgentForge

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

**A production-ready TypeScript framework for building AI agents that actually work.**

[📚 Documentation](https://mpalmer79.github.io/agentforge/) • [🚀 Getting Started](https://mpalmer79.github.io/agentforge/guide/getting-started) • [💼 LinkedIn](https://www.linkedin.com/in/mpalmer1234/)

---

## Why AgentForge?

Most AI agent frameworks break down when you try to ship them to production. AgentForge was designed from the ground up with **production patterns**: type safety, fault tolerance, observability, and clean architecture.

### What This Project Demonstrates

- 🏗️ **Modular Architecture** — Provider-agnostic design that scales
- 🔒 **Type-Safe APIs** — Runtime validation with Zod, full TypeScript inference
- ⚡ **Streaming Systems** — Async iterators for real-time responses
- 🔗 **Middleware Pipelines** — Extensible request/response processing
- 🛡️ **Production Patterns** — Circuit breakers, retry logic, graceful degradation
- 📊 **Observability** — Distributed tracing, metrics, structured logging
- 📚 **Complete Documentation** — Guides, API reference, and real-world examples

---

## ✨ Features

### Core
- **Type-Safe Tools** — Define tools with Zod schemas for full TypeScript inference
- **Multi-Provider** — OpenAI, Anthropic, Azure, or custom providers
- **Streaming** — Built-in async iterator support for real-time responses
- **React Hooks** — First-class integration with `useAgent`, `useChat`, `useStreamingAgent`

### Production-Ready (v1.0)
- **Circuit Breakers** — Prevent cascading failures with configurable thresholds
- **Request Deduplication** — Coalesce identical concurrent requests
- **Retry with Backoff** — Exponential backoff with jitter for transient failures
- **Graceful Degradation** — Feature flags and fallback responses
- **Distributed Tracing** — OpenTelemetry-compatible spans and metrics
- **Conversation Persistence** — Pluggable storage adapters (memory, file, custom)
- **Token Management** — Accurate counting per model, budget tracking, smart truncation

---

## 📦 Installation

```bash
npm install agentforge zod
```

---

## 🚀 Quick Start

```typescript
import { Agent, OpenAIProvider, defineTool } from 'agentforge';
import { z } from 'zod';

// Define a type-safe tool
const weatherTool = defineTool({
  name: 'get_weather',
  description: 'Get the current weather for a location',
  parameters: z.object({
    location: z.string().describe('City name'),
    unit: z.enum(['celsius', 'fahrenheit']).default('fahrenheit'),
  }),
  execute: async ({ location, unit }) => {
    return { temperature: 72, condition: 'sunny', location, unit };
  },
});

// Create an agent
const agent = new Agent({
  provider: new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY }),
  tools: [weatherTool],
  systemPrompt: 'You are a helpful weather assistant.',
});

// Run the agent
const response = await agent.run("What's the weather in Boston?");
console.log(response.content);
```

---

## 🛡️ Production Features

### Circuit Breaker & Resilience

```typescript
const agent = new Agent({
  provider: new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY }),
  
  // Circuit breaker prevents cascading failures
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    resetTimeoutMs: 30000,
  },
  
  // Deduplicate identical concurrent requests
  deduplication: { enabled: true },
  
  // Limit concurrency
  concurrency: { maxConcurrent: 10 },
  
  // Timeouts
  timeouts: {
    requestMs: 30000,
    toolExecutionMs: 10000,
  },
});

// Check health status
const health = agent.getHealth();
console.log(health.circuitBreaker?.state); // 'closed' | 'open' | 'half-open'
```

### Observability

```typescript
import { initTelemetry, createConsoleExporter } from 'agentforge';

// Initialize telemetry
initTelemetry(createConsoleExporter());

// Telemetry automatically tracks:
// - Request/response spans with timing
// - Token usage metrics
// - Error rates
// - Tool execution duration
```

### Multi-Provider Failover

```typescript
import { createFailoverProvider } from 'agentforge';

// Automatic failover between providers
const provider = createFailoverProvider(
  process.env.OPENAI_API_KEY,
  process.env.ANTHROPIC_API_KEY,
  { primaryModel: 'gpt-4-turbo', fallbackModel: 'claude-3-sonnet-20240229' }
);
```

---

## ⚛️ React Integration

```tsx
import { useAgent, AgentProvider } from 'agentforge/react';

function ChatInterface() {
  const { messages, sendMessage, isLoading, error } = useAgent({
    tools: [weatherTool],
    systemPrompt: 'You are a helpful assistant.',
  });

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id} className={msg.role}>
          {msg.content}
        </div>
      ))}
      <input
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            sendMessage(e.currentTarget.value);
            e.currentTarget.value = '';
          }
        }}
        disabled={isLoading}
        placeholder="Type a message..."
      />
    </div>
  );
}
```

---

## 🔧 Middleware

```typescript
import { 
  createRateLimitMiddleware,
  createCacheMiddleware,
  createCostTrackingMiddleware,
  loggingMiddleware 
} from 'agentforge';

const agent = new Agent({
  provider: openai,
  middleware: [
    loggingMiddleware,
    createRateLimitMiddleware({ maxRequestsPerMinute: 60 }),
    createCacheMiddleware({ ttlMs: 300000 }),
    createCostTrackingMiddleware({
      onCost: (cost) => console.log(`Request cost: $${cost.total.toFixed(4)}`),
    }),
  ],
});
```

---

## 📖 Documentation

Visit [mpalmer79.github.io/agentforge](https://mpalmer79.github.io/agentforge/) for:

- **[Getting Started](https://mpalmer79.github.io/agentforge/guide/getting-started)** — Installation and first agent
- **[Core Concepts](https://mpalmer79.github.io/agentforge/guide/core-concepts)** — Architecture overview
- **[Tools](https://mpalmer79.github.io/agentforge/guide/tools)** — Defining type-safe tools
- **[Providers](https://mpalmer79.github.io/agentforge/guide/providers)** — OpenAI, Anthropic, custom
- **[Middleware](https://mpalmer79.github.io/agentforge/guide/middleware)** — Extending the pipeline
- **[React Integration](https://mpalmer79.github.io/agentforge/guide/react-integration)** — Hooks and components
- **[API Reference](https://mpalmer79.github.io/agentforge/api/agent)** — Complete API docs

---

## 🛠️ Examples

| Example | Description |
|---------|-------------|
| [Basic Agent](./examples/basic-agent) | Simple tool-using agent |
| [Customer Support](./examples/customer-support) | Multi-tool support agent with escalation |
| [Data Analyst](./examples/data-analyst) | Agent with database query tools |
| [React Chat](./examples/react-chat) | Full React chat interface |

---

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) for details.

---

## 📄 License

MIT © [Michael Palmer](https://github.com/mpalmer79)

---

<p align="center">
  <strong>Built with TypeScript for production AI systems</strong>
</p>
