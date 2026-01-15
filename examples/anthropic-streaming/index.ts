/**
 * Anthropic Streaming Example
 *
 * Run with: npx ts-node examples/anthropic-streaming/index.ts
 * Requires: ANTHROPIC_API_KEY environment variable
 */

import { Agent, AnthropicProvider } from 'agentforge';

async function main() {
  const provider = new AnthropicProvider({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: 'claude-3-sonnet-20240229',
  });

  const agent = new Agent({ provider });

  console.log('Streaming response:\n');

  const stream = agent.stream(
    'Explain how neural networks learn in 3 short paragraphs.'
  );

  for await (const chunk of stream) {
    process.stdout.write(chunk.content);
  }

  console.log('\n\nStream complete.');
}

main().catch(console.error);
