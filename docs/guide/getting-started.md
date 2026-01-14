[getting-started.md](https://github.com/user-attachments/files/24618600/getting-started.md)
# Getting Started

Get up and running with AgentForge in under 5 minutes.

## Installation

::: code-group

```bash [npm]
npm install agentforge zod
```

```bash [yarn]
yarn add agentforge zod
```

```bash [pnpm]
pnpm add agentforge zod
```

:::

## Prerequisites

- Node.js 18+ or Bun
- TypeScript 5.0+ (recommended)
- An API key from OpenAI or Anthropic

## Your First Agent

Let's create a simple agent that can answer questions:

```typescript
import { Agent, OpenAIProvider } from 'agentforge';

// Create a provider with your API key
const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Create an agent
const agent = new Agent({
  provider,
  systemPrompt: 'You are a helpful assistant.',
});

// Run the agent
const response = await agent.run('Hello! What can you help me with?');
console.log(response.content);
```

## Adding Tools

Tools give your agent superpowers. Here's an agent with a calculator tool:

```typescript
import { Agent, OpenAIProvider, defineTool } from 'agentforge';
import { z } from 'zod';

// Define a calculator tool with Zod schema
const calculatorTool = defineTool({
  name: 'calculator',
  description: 'Perform mathematical calculations',
  parameters: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number().describe('First number'),
    b: z.number().describe('Second number'),
  }),
  execute: async ({ operation, a, b }) => {
    switch (operation) {
      case 'add': return { result: a + b };
      case 'subtract': return { result: a - b };
      case 'multiply': return { result: a * b };
      case 'divide': return { result: a / b };
    }
  },
});

// Create agent with the tool
const agent = new Agent({
  provider: new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! }),
  tools: [calculatorTool],
  systemPrompt: 'You are a helpful assistant with calculator abilities.',
});

// The agent will use the calculator when needed
const response = await agent.run('What is 42 multiplied by 17?');
console.log(response.content);
// → "42 multiplied by 17 equals 714."
```

## Streaming Responses

For real-time output, use the `stream` method:

```typescript
for await (const event of agent.stream('Tell me a story')) {
  if (event.type === 'content') {
    process.stdout.write(event.data as string);
  }
}
```

## Using with React

AgentForge includes first-class React support:

```tsx
import { useAgent, OpenAIProvider } from 'agentforge/react';

const provider = new OpenAIProvider({ apiKey: '...' });

function Chat() {
  const { messages, sendMessage, isLoading } = useAgent({ provider });

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>{m.content}</div>
      ))}
      <button 
        onClick={() => sendMessage('Hello!')}
        disabled={isLoading}
      >
        Send
      </button>
    </div>
  );
}
```

## Next Steps

Now that you have the basics, explore:

- **[Core Concepts](/guide/core-concepts)** - Understand the architecture
- **[Tools](/guide/tools)** - Build powerful type-safe tools
- **[Providers](/guide/providers)** - Use different LLM providers
- **[Middleware](/guide/middleware)** - Add logging, caching, and more

::: tip TypeScript Recommended
While AgentForge works with JavaScript, TypeScript provides the best experience with full type inference for your tools.
:::
