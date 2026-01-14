import { vi } from 'vitest';
import type {
  Provider,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
} from '../../src/types';

/**
 * Create a mock provider for testing
 */
export function createMockProvider(overrides?: Partial<Provider>): Provider {
  return {
    name: 'mock',
    complete: vi.fn().mockResolvedValue({
      id: 'mock-response-id',
      content: 'Mock response content',
      finishReason: 'stop',
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    } as CompletionResponse),
    stream: vi.fn().mockImplementation(async function* () {
      yield {
        id: 'mock-stream-id',
        delta: { content: 'Mock ' },
      } as StreamChunk;
      yield {
        id: 'mock-stream-id',
        delta: { content: 'streaming ' },
      } as StreamChunk;
      yield {
        id: 'mock-stream-id',
        delta: { content: 'response' },
        finishReason: 'stop',
      } as StreamChunk;
    }),
    ...overrides,
  };
}

/**
 * Create a mock provider that returns tool calls
 */
export function createToolCallingMockProvider(
  toolName: string,
  toolArgs: Record<string, unknown>
): Provider {
  let callCount = 0;

  return {
    name: 'mock-tool-calling',
    complete: vi.fn().mockImplementation(async (request: CompletionRequest) => {
      callCount++;

      // First call returns tool call
      if (callCount === 1) {
        return {
          id: 'mock-response-1',
          content: '',
          toolCalls: [
            {
              id: 'tool-call-1',
              name: toolName,
              arguments: toolArgs,
            },
          ],
          finishReason: 'tool_calls',
        } as CompletionResponse;
      }

      // Second call returns final response
      return {
        id: 'mock-response-2',
        content: 'Final response after tool call',
        finishReason: 'stop',
      } as CompletionResponse;
    }),
    stream: vi.fn().mockImplementation(async function* () {
      yield {
        id: 'mock-stream-id',
        delta: { content: 'Streaming response' },
        finishReason: 'stop',
      } as StreamChunk;
    }),
  };
}

/**
 * Create a mock provider that throws errors
 */
export function createErrorMockProvider(errorMessage: string): Provider {
  return {
    name: 'mock-error',
    complete: vi.fn().mockRejectedValue(new Error(errorMessage)),
    stream: vi.fn().mockImplementation(async function* () {
      throw new Error(errorMessage);
    }),
  };
}
