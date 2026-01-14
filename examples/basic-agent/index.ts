/**
 * Basic Agent Example
 *
 * This example demonstrates how to create a simple AI agent
 * with tool-calling capabilities using AgentForge.
 *
 * Run with: npx ts-node examples/basic-agent/index.ts
 */

import { Agent, OpenAIProvider, defineTool } from '../../src';
import { z } from 'zod';

// Define tools with full type safety
const weatherTool = defineTool({
  name: 'get_weather',
  description: 'Get the current weather for a location',
  parameters: z.object({
    location: z.string().describe('City name or zip code'),
    unit: z.enum(['celsius', 'fahrenheit']).default('fahrenheit'),
  }),
  execute: async ({ location, unit }) => {
    // Simulate API call
    console.log(`[Tool] Fetching weather for ${location}...`);

    // Mock response
    const mockData = {
      location,
      temperature: unit === 'celsius' ? 22 : 72,
      unit,
      condition: 'sunny',
      humidity: 45,
      windSpeed: 10,
    };

    return mockData;
  },
});

const calculatorTool = defineTool({
  name: 'calculator',
  description: 'Perform mathematical calculations',
  parameters: z.object({
    expression: z.string().describe('Mathematical expression to evaluate'),
  }),
  execute: async ({ expression }) => {
    console.log(`[Tool] Calculating: ${expression}`);

    try {
      // Simple eval for demo (use a proper math parser in production)
      const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');
      const result = Function(`"use strict"; return (${sanitized})`)();
      return { expression, result };
    } catch (error) {
      return { expression, error: 'Invalid expression' };
    }
  },
});

const searchTool = defineTool({
  name: 'search',
  description: 'Search for information on a topic',
  parameters: z.object({
    query: z.string().describe('Search query'),
    maxResults: z.number().min(1).max(10).default(3),
  }),
  execute: async ({ query, maxResults }) => {
    console.log(`[Tool] Searching for: ${query}`);

    // Mock search results
    return {
      query,
      results: [
        { title: `Result 1 for "${query}"`, snippet: 'This is a mock result...' },
        { title: `Result 2 for "${query}"`, snippet: 'Another mock result...' },
        { title: `Result 3 for "${query}"`, snippet: 'Yet another result...' },
      ].slice(0, maxResults),
    };
  },
});

async function main() {
  // Check for API key
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  OPENAI_API_KEY not found in environment variables');
    console.log('');
    console.log('To run this example:');
    console.log('  export OPENAI_API_KEY=your-api-key-here');
    console.log('  npx ts-node examples/basic-agent/index.ts');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Running in demo mode with mock responses...');
    console.log('');

    // Demo the tool definitions
    console.log('📦 Registered Tools:');
    console.log('');
    [weatherTool, calculatorTool, searchTool].forEach((tool) => {
      console.log(`  • ${tool.name}: ${tool.description}`);
    });
    console.log('');

    // Demo tool execution
    console.log('🔧 Tool Execution Demo:');
    console.log('');

    const weatherResult = await weatherTool.execute({
      location: 'Boston',
      unit: 'fahrenheit',
    });
    console.log('  Weather result:', JSON.stringify(weatherResult, null, 2));

    const calcResult = await calculatorTool.execute({
      expression: '(10 + 5) * 3',
    });
    console.log('  Calculator result:', JSON.stringify(calcResult, null, 2));

    return;
  }

  // Create the agent
  const agent = new Agent({
    provider: new OpenAIProvider({
      apiKey,
      model: 'gpt-4-turbo',
    }),
    tools: [weatherTool, calculatorTool, searchTool],
    systemPrompt: `You are a helpful assistant with access to tools for weather, calculations, and search.
Use tools when they would help answer the user's question accurately.
Be concise and friendly in your responses.`,
    memory: {
      maxMessages: 20,
      strategy: 'sliding-window',
    },
  });

  console.log('🤖 AgentForge Basic Example');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Example queries
  const queries = [
    "What's the weather like in Boston?",
    'Calculate 15% of 250',
    'Search for information about TypeScript generics',
  ];

  for (const query of queries) {
    console.log(`📝 User: ${query}`);
    console.log('');

    try {
      const response = await agent.run(query);
      console.log(`🤖 Assistant: ${response.content}`);

      if (response.toolResults && response.toolResults.length > 0) {
        console.log('');
        console.log('   Tools used:', response.toolResults.map((r) => r.toolCallId).join(', '));
      }

      if (response.usage) {
        console.log(`   Tokens: ${response.usage.totalTokens}`);
      }
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : error);
    }

    console.log('');
    console.log('─────────────────────────────────────────────────────────────');
    console.log('');
  }
}

main().catch(console.error);
