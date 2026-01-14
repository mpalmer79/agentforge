# 🔧 AgentForge

[![npm version](https://img.shields.io/npm/v/agentforge.svg)](https://www.npmjs.com/package/agentforge)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**A TypeScript framework for building production-ready, tool-using AI agents.**

https://www.linkedin.com/in/mpalmer1234/

AgentForge provides a type-safe, provider-agnostic foundation for creating AI agents that can use tools, maintain conversation context, and integrate seamlessly with React applications.

## ✨ Features

- **🔒 Type-Safe Tools** - Define tools with Zod schemas for full TypeScript inference
- **🔌 Multi-Provider** - Works with OpenAI, Anthropic, and custom providers
- **⚛️ React Hooks** - First-class React integration with `useAgent` and `useChat`
- **🌊 Streaming** - Built-in support for streaming responses
- **🧠 Memory Management** - Configurable conversation history and context windows
- **🔄 Middleware** - Extensible middleware system for logging, caching, and more
- **⚡ Production-Ready** - Error boundaries, retry logic, and graceful degradation

## 📦 Installation
```bash
npm install agentforge
# or
yarn add agentforge
# or
pnpm add agentforge
```

## 🚀 Quick Start

### Basic Agent
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
    // Your implementation here
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
const response = await agent.run('What\'s the weather in Boston?');
console.log(response.content);
```

### React Integration
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
      {error && <div className="error">{error.message}</div>}
    </div>
  );
}
```

## 🔧 Core Concepts

### Providers

AgentForge supports multiple LLM providers out of the box:
```typescript
import { OpenAIProvider, AnthropicProvider } from 'agentforge';

// OpenAI
const openai = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4-turbo',
});

// Anthropic
const anthropic = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-5-sonnet-20241022',
});
```

### Tool Definition

Tools are defined with full type safety using Zod schemas:
```typescript
import { defineTool } from 'agentforge';
import { z } from 'zod';

const searchTool = defineTool({
  name: 'search_database',
  description: 'Search the database for records',
  parameters: z.object({
    query: z.string(),
    limit: z.number().min(1).max(100).default(10),
    filters: z.object({
      status: z.enum(['active', 'inactive']).optional(),
      createdAfter: z.string().datetime().optional(),
    }).optional(),
  }),
  execute: async (params) => {
    // TypeScript knows the exact shape of params
    const results = await db.search(params);
    return results;
  },
});
```

### Middleware

Add cross-cutting concerns with the middleware system:
```typescript
import { Agent, createMiddleware } from 'agentforge';

const loggingMiddleware = createMiddleware({
  name: 'logging',
  beforeRequest: async (context) => {
    console.log('Request:', context.messages);
    return context;
  },
  afterResponse: async (response, context) => {
    console.log('Response:', response.content);
    return response;
  },
  onError: async (error, context) => {
    console.error('Error:', error);
    throw error;
  },
});

const agent = new Agent({
  provider: openai,
  middleware: [loggingMiddleware],
});
```

### Memory Management

Configure how conversation history is managed:
```typescript
const agent = new Agent({
  provider: openai,
  memory: {
    maxMessages: 50,
    maxTokens: 4000,
    strategy: 'sliding-window', // or 'summarize', 'trim-oldest'
  },
});
```

## 📖 API Reference

### `Agent`

The main class for creating AI agents.

| Option | Type | Description |
|--------|------|-------------|
| `provider` | `Provider` | LLM provider instance |
| `tools` | `Tool[]` | Array of tools available to the agent |
| `systemPrompt` | `string` | System prompt for the agent |
| `middleware` | `Middleware[]` | Middleware stack |
| `memory` | `MemoryConfig` | Memory configuration |

### `useAgent` Hook

React hook for agent integration.

| Return Value | Type | Description |
|--------------|------|-------------|
| `messages` | `Message[]` | Conversation history |
| `sendMessage` | `(content: string) => Promise<void>` | Send a message |
| `isLoading` | `boolean` | Loading state |
| `error` | `Error \| null` | Current error |
| `reset` | `() => void` | Reset conversation |

## 🛠️ Examples

Check out the [examples](./examples) directory for complete implementations:

- **[Basic Agent](./examples/basic-agent)** - Simple tool-using agent
- **[Customer Support](./examples/customer-support)** - Multi-tool support agent
- **[Data Analyst](./examples/data-analyst)** - Agent with database tools
- **[React Chat](./examples/react-chat)** - Full React chat interface

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) for details.

## 📄 License

MIT © [Michael Palmer](https://github.com/mpalmer79)

---

**Built with ❤️ for the AI engineering community**
