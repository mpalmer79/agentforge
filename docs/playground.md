[playground.md](https://github.com/user-attachments/files/24618443/playground.md)
# Playground

Try AgentForge directly in your browser.

## Interactive Demo

<div class="playground-container">

Click the button below to open a live coding environment with AgentForge pre-installed:

<a href="https://stackblitz.com/edit/agentforge-playground?file=src%2Findex.ts" target="_blank" class="playground-button">
  Open in StackBlitz →
</a>

</div>

<style>
.playground-container {
  padding: 2rem;
  background: var(--vp-c-bg-soft);
  border-radius: 12px;
  border: 1px solid var(--vp-c-divider);
  text-align: center;
  margin: 2rem 0;
}

.playground-button {
  display: inline-flex;
  align-items: center;
  padding: 1rem 2rem;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);
  color: white !important;
  border-radius: 10px;
  font-weight: 600;
  font-size: 1.1rem;
  text-decoration: none !important;
  transition: all 0.3s ease;
  box-shadow: 0 4px 20px rgba(99, 102, 241, 0.3);
}

.playground-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 30px rgba(99, 102, 241, 0.4);
}
</style>

## Quick Start Code

Copy this code to get started:

```typescript
import { Agent, OpenAIProvider, defineTool } from 'agentforge';
import { z } from 'zod';

// Create a simple tool
const greetTool = defineTool({
  name: 'greet',
  description: 'Greet someone by name',
  parameters: z.object({
    name: z.string().describe('The name to greet'),
  }),
  execute: async ({ name }) => {
    return { message: `Hello, ${name}! Welcome to AgentForge.` };
  },
});

// Create the agent
const agent = new Agent({
  provider: new OpenAIProvider({
    apiKey: 'your-api-key-here', // Replace with your key
  }),
  tools: [greetTool],
  systemPrompt: 'You are a friendly assistant that greets people.',
});

// Run it
async function main() {
  const response = await agent.run('Please greet Michael');
  console.log(response.content);
}

main();
```

## What to Try

### 1. Add More Tools

```typescript
const calculatorTool = defineTool({
  name: 'calculate',
  description: 'Perform math calculations',
  parameters: z.object({
    expression: z.string().describe('Math expression like "2 + 2"'),
  }),
  execute: async ({ expression }) => {
    // Simple eval (use a proper parser in production!)
    const result = Function(`return ${expression}`)();
    return { result };
  },
});

// Add to agent
const agent = new Agent({
  provider,
  tools: [greetTool, calculatorTool],
});
```

### 2. Try Streaming

```typescript
for await (const event of agent.stream('Tell me a short story')) {
  if (event.type === 'content') {
    process.stdout.write(event.data as string);
  }
}
```

### 3. Add Middleware

```typescript
import { createMiddleware } from 'agentforge';

const loggingMiddleware = createMiddleware({
  name: 'logger',
  beforeRequest: async (ctx) => {
    console.log('Request starting...');
    return ctx;
  },
  afterResponse: async (res, ctx) => {
    console.log('Response received!');
    return res;
  },
});

const agent = new Agent({
  provider,
  middleware: [loggingMiddleware],
});
```

### 4. Handle Errors

```typescript
import { tryCatchAsync, isOk, isErr } from 'agentforge';

const result = await tryCatchAsync(() => agent.run('Hello'));

if (isOk(result)) {
  console.log('Success:', result.value.content);
} else {
  console.error('Error:', result.error.message);
}
```

## CodeSandbox Alternative

If you prefer CodeSandbox:

<a href="https://codesandbox.io/p/sandbox/agentforge-demo" target="_blank" class="alt-button">
  Open in CodeSandbox
</a>

<style>
.alt-button {
  display: inline-flex;
  align-items: center;
  padding: 0.75rem 1.5rem;
  background: transparent;
  color: var(--vp-c-brand-1) !important;
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 8px;
  font-weight: 500;
  text-decoration: none !important;
  transition: all 0.3s ease;
  margin-top: 1rem;
}

.alt-button:hover {
  background: var(--vp-c-brand-soft);
}
</style>

## Local Development

For the full experience, clone and run locally:

```bash
# Clone the repo
git clone https://github.com/mpalmer79/agentforge.git
cd agentforge

# Install dependencies
npm install

# Run examples
npm run example:customer-support
npm run example:data-analyst
```
