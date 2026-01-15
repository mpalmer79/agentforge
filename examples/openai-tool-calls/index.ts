/**
 * OpenAI Tool Calls Example
 *
 * Run with: npx ts-node examples/openai-tool-calls/index.ts
 * Requires: OPENAI_API_KEY environment variable
 */

import { Agent, OpenAIProvider, defineTool } from 'agentforge';
import { z } from 'zod';

// Define tools with type-safe schemas
const weatherTool = defineTool({
  name: 'get_weather',
  description: 'Get current weather for a location',
  schema: z.object({
    location: z.string().describe('City name'),
    unit: z.enum(['celsius', 'fahrenheit']).default('fahrenheit'),
  }),
  execute: async ({ location, unit }) => {
    // Simulated weather API response
    const temp = unit === 'celsius' ? 22 : 72;
    return { location, temperature: temp, unit, condition: 'sunny' };
  },
});

const calculatorTool = defineTool({
  name: 'calculator',
  description: 'Perform basic math operations',
  schema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number(),
  }),
  execute: async ({ operation, a, b }) => {
    const ops = {
      add: a + b,
      subtract: a - b,
      multiply: a * b,
      divide: b !== 0 ? a / b : 'Error: Division by zero',
    };
    return { result: ops[operation] };
  },
});

async function main() {
  const provider = new OpenAIProvider({
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4-turbo-preview',
  });

  const agent = new Agent({
    provider,
    tools: [weatherTool, calculatorTool],
  });

  const response = await agent.run(
    "What's the weather in Boston, and what's 42 multiplied by 17?"
  );

  console.log('Response:', response.content);
  console.log('Tool calls:', response.toolCalls);
}

main().catch(console.error);
