/**
 * Production Template
 *
 * Recommended configuration for production deployments:
 * - Retry with exponential backoff
 * - Circuit breaker for fault tolerance
 * - Request/response logging
 * - Telemetry hooks
 *
 * Run with: npx ts-node examples/production-template/index.ts
 * Requires: OPENAI_API_KEY environment variable
 */

import {
  Agent,
  OpenAIProvider,
  RetryMiddleware,
  CircuitBreakerMiddleware,
  LoggingMiddleware,
  defineTool,
} from 'agentforge';
import { z } from 'zod';

// Simple logging implementation
const logger = {
  info: (msg: string, data?: unknown) =>
    console.log(`[INFO] ${msg}`, data ?? ''),
  warn: (msg: string, data?: unknown) =>
    console.warn(`[WARN] ${msg}`, data ?? ''),
  error: (msg: string, data?: unknown) =>
    console.error(`[ERROR] ${msg}`, data ?? ''),
};

// Example tool
const searchTool = defineTool({
  name: 'search',
  description: 'Search for information',
  schema: z.object({
    query: z.string(),
  }),
  execute: async ({ query }) => {
    logger.info('Search executed', { query });
    return { results: [`Result for: ${query}`] };
  },
});

async function main() {
  const provider = new OpenAIProvider({
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4-turbo-preview',
  });

  const agent = new Agent({
    provider,
    tools: [searchTool],
    middleware: [
      // Log all requests and responses
      new LoggingMiddleware({
        logger,
        logRequests: true,
        logResponses: true,
        redactKeys: ['apiKey', 'authorization'],
      }),

      // Retry failed requests with exponential backoff
      new RetryMiddleware({
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        retryableErrors: ['RATE_LIMIT', 'TIMEOUT', 'SERVER_ERROR'],
        onRetry: (attempt, error) => {
          logger.warn(`Retry attempt ${attempt}`, { error: error.message });
        },
      }),

      // Circuit breaker to prevent cascade failures
      new CircuitBreakerMiddleware({
        failureThreshold: 5,
        resetTimeout: 30000,
        onOpen: () => logger.error('Circuit breaker opened'),
        onClose: () => logger.info('Circuit breaker closed'),
        onHalfOpen: () => logger.info('Circuit breaker half-open'),
      }),
    ],
  });

  // Event hooks for telemetry
  agent.on('request:start', ({ requestId }) => {
    logger.info('Request started', { requestId });
  });

  agent.on('request:complete', ({ requestId, duration }) => {
    logger.info('Request completed', { requestId, duration: `${duration}ms` });
  });

  agent.on('request:error', ({ requestId, error }) => {
    logger.error('Request failed', { requestId, error: error.message });
  });

  agent.on('tool:execute', ({ tool, args }) => {
    logger.info('Tool executing', { tool, args });
  });

  // Run the agent
  const response = await agent.run('Search for TypeScript best practices');

  console.log('\nFinal response:', response.content);
}

main().catch(console.error);
