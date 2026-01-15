import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMiddleware,
  composeMiddleware,
  loggingMiddleware,
  createRateLimitMiddleware,
  createCacheMiddleware,
  createRetryMiddleware,
} from '../../src/middleware';
import type { MiddlewareContext, CompletionResponse, ToolCall, ToolResult } from '../../src/types';

describe('middleware', () => {
  const createMockContext = (): MiddlewareContext => ({
    messages: [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }],
    tools: [],
    metadata: {},
    request: {
      messages: [],
    },
  });

  const createMockResponse = (): CompletionResponse => ({
    id: 'resp-1',
    content: 'Test response',
    finishReason: 'stop',
  });

  describe('createMiddleware', () => {
    it('should create middleware with all hooks', () => {
      const middleware = createMiddleware({
        name: 'test',
        beforeRequest: async (ctx) => ctx,
        afterResponse: async (resp) => resp,
        onError: async () => {},
        onToolCall: async (tc) => tc,
        onToolResult: async (tr) => tr,
      });

      expect(middleware.name).toBe('test');
      expect(middleware.beforeRequest).toBeDefined();
      expect(middleware.afterResponse).toBeDefined();
      expect(middleware.onError).toBeDefined();
      expect(middleware.onToolCall).toBeDefined();
      expect(middleware.onToolResult).toBeDefined();
    });

    it('should allow partial middleware definition', () => {
      const middleware = createMiddleware({
        name: 'partial',
        beforeRequest: async (ctx) => ctx,
      });

      expect(middleware.name).toBe('partial');
      expect(middleware.beforeRequest).toBeDefined();
      expect(middleware.afterResponse).toBeUndefined();
    });
  });

  describe('composeMiddleware', () => {
    it('should run beforeRequest hooks in order', async () => {
      const order: number[] = [];

      const middleware1 = createMiddleware({
        name: 'm1',
        beforeRequest: async (ctx) => {
          order.push(1);
          return ctx;
        },
      });

      const middleware2 = createMiddleware({
        name: 'm2',
        beforeRequest: async (ctx) => {
          order.push(2);
          return ctx;
        },
      });

      const composed = composeMiddleware([middleware1, middleware2]);
      await composed.runBeforeRequest(createMockContext());

      expect(order).toEqual([1, 2]);
    });

    it('should run afterResponse hooks in reverse order', async () => {
      const order: number[] = [];

      const middleware1 = createMiddleware({
        name: 'm1',
        afterResponse: async (resp) => {
          order.push(1);
          return resp;
        },
      });

      const middleware2 = createMiddleware({
        name: 'm2',
        afterResponse: async (resp) => {
          order.push(2);
          return resp;
        },
      });

      const composed = composeMiddleware([middleware1, middleware2]);
      await composed.runAfterResponse(createMockResponse(), createMockContext());

      expect(order).toEqual([2, 1]);
    });

    it('should pass modified context through chain', async () => {
      const middleware1 = createMiddleware({
        name: 'm1',
        beforeRequest: async (ctx) => ({
          ...ctx,
          metadata: { ...ctx.metadata, step1: true },
        }),
      });

      const middleware2 = createMiddleware({
        name: 'm2',
        beforeRequest: async (ctx) => ({
          ...ctx,
          metadata: { ...ctx.metadata, step2: true },
        }),
      });

      const composed = composeMiddleware([middleware1, middleware2]);
      const result = await composed.runBeforeRequest(createMockContext());

      expect(result.metadata).toEqual({ step1: true, step2: true });
    });

    it('should run onError hooks for all middleware', async () => {
      const errorHandler1 = vi.fn();
      const errorHandler2 = vi.fn();

      const middleware1 = createMiddleware({
        name: 'm1',
        onError: errorHandler1,
      });

      const middleware2 = createMiddleware({
        name: 'm2',
        onError: errorHandler2,
      });

      const composed = composeMiddleware([middleware1, middleware2]);
      const error = new Error('test error');

      await composed.runOnError(error, createMockContext());

      expect(errorHandler1).toHaveBeenCalledWith(error, expect.any(Object));
      expect(errorHandler2).toHaveBeenCalledWith(error, expect.any(Object));
    });

    it('should run onToolCall hooks in order', async () => {
      const toolCall: ToolCall = {
        id: 'tc-1',
        name: 'test_tool',
        arguments: { input: 'test' },
      };

      const middleware = createMiddleware({
        name: 'm1',
        onToolCall: async (tc) => ({
          ...tc,
          arguments: { ...tc.arguments, modified: true },
        }),
      });

      const composed = composeMiddleware([middleware]);
      const result = await composed.runOnToolCall(toolCall, createMockContext());

      expect(result.arguments).toEqual({ input: 'test', modified: true });
    });
  });

  describe('loggingMiddleware', () => {
    it('should have all hooks defined', () => {
      expect(loggingMiddleware.name).toBe('logging');
      expect(loggingMiddleware.beforeRequest).toBeDefined();
      expect(loggingMiddleware.afterResponse).toBeDefined();
      expect(loggingMiddleware.onError).toBeDefined();
      expect(loggingMiddleware.onToolCall).toBeDefined();
      expect(loggingMiddleware.onToolResult).toBeDefined();
    });

    it('should pass through context unchanged', async () => {
      const context = createMockContext();
      const result = await loggingMiddleware.beforeRequest!(context);
      expect(result).toEqual(context);
    });

    it('should pass through response unchanged', async () => {
      const response = createMockResponse();
      const result = await loggingMiddleware.afterResponse!(response, createMockContext());
      expect(result).toEqual(response);
    });
  });

  describe('createRateLimitMiddleware', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should allow requests under the limit', async () => {
      const middleware = createRateLimitMiddleware({
        maxRequestsPerMinute: 5,
      });

      const composed = composeMiddleware([middleware]);

      // Should not throw for first 5 requests
      for (let i = 0; i < 5; i++) {
        await expect(composed.runBeforeRequest(createMockContext())).resolves.toBeDefined();
      }
    });

    it('should block requests over the limit', async () => {
      const middleware = createRateLimitMiddleware({
        maxRequestsPerMinute: 2,
      });

      const composed = composeMiddleware([middleware]);

      await composed.runBeforeRequest(createMockContext());
      await composed.runBeforeRequest(createMockContext());

      await expect(composed.runBeforeRequest(createMockContext())).rejects.toThrow(
        /Rate limit exceeded/
      );
    });

    it('should call onRateLimited callback', async () => {
      const onRateLimited = vi.fn();
      const middleware = createRateLimitMiddleware({
        maxRequestsPerMinute: 1,
        onRateLimited,
      });

      const composed = composeMiddleware([middleware]);

      await composed.runBeforeRequest(createMockContext());

      try {
        await composed.runBeforeRequest(createMockContext());
      } catch {
        // Expected
      }

      expect(onRateLimited).toHaveBeenCalled();
    });

    it('should reset after one minute', async () => {
      const middleware = createRateLimitMiddleware({
        maxRequestsPerMinute: 1,
      });

      const composed = composeMiddleware([middleware]);

      await composed.runBeforeRequest(createMockContext());

      // Advance time by 61 seconds
      vi.advanceTimersByTime(61000);

      // Should work again
      await expect(composed.runBeforeRequest(createMockContext())).resolves.toBeDefined();
    });
  });

  describe('createCacheMiddleware', () => {
    it('should cache responses', async () => {
      const middleware = createCacheMiddleware({
        ttlMs: 60000,
      });

      const composed = composeMiddleware([middleware]);
      const context = createMockContext();
      const response = createMockResponse();

      // First request
      await composed.runBeforeRequest(context);
      await composed.runAfterResponse(response, context);

      // Second request with same context
      const cachedContext = await composed.runBeforeRequest(createMockContext());

      expect(cachedContext.metadata.__cacheHit).toBe(true);
    });

    it('should use custom key function', async () => {
      const keyFn = vi.fn().mockReturnValue('custom-key');

      const middleware = createCacheMiddleware({
        keyFn,
      });

      const composed = composeMiddleware([middleware]);
      await composed.runBeforeRequest(createMockContext());

      expect(keyFn).toHaveBeenCalled();
    });

    it('should respect max cache size', async () => {
      const middleware = createCacheMiddleware({
        maxSize: 2,
      });

      const composed = composeMiddleware([middleware]);

      // Add 3 items to cache
      for (let i = 0; i < 3; i++) {
        const context: MiddlewareContext = {
          ...createMockContext(),
          messages: [{ id: `${i}`, role: 'user', content: `msg-${i}`, timestamp: Date.now() }],
        };
        await composed.runBeforeRequest(context);
        await composed.runAfterResponse(createMockResponse(), context);
      }

      // First item should be evicted
      const firstContext: MiddlewareContext = {
        ...createMockContext(),
        messages: [{ id: '0', role: 'user', content: 'msg-0', timestamp: Date.now() }],
      };
      const result = await composed.runBeforeRequest(firstContext);

      expect(result.metadata.__cacheHit).toBeFalsy();
    });
  });

  describe('createRetryMiddleware', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should set retry metadata on retryable error', async () => {
      const middleware = createRetryMiddleware({
        maxRetries: 3,
        baseDelayMs: 10,
      });

      const composed = composeMiddleware([middleware]);
      const context = createMockContext();
      const error = new Error('rate limit exceeded');

      const errorPromise = composed.runOnError(error, context);

      // Advance timers to complete the delay
      await vi.advanceTimersByTimeAsync(100);

      try {
        await errorPromise;
      } catch {
        // Expected - will throw after retries exhausted or on non-retry
      }

      expect(context.metadata.__retryCount).toBe(1);
      expect(context.metadata.__shouldRetry).toBe(true);
    });

    it('should not retry non-retryable errors', async () => {
      const middleware = createRetryMiddleware({
        shouldRetry: () => false,
      });

      const composed = composeMiddleware([middleware]);
      const context = createMockContext();
      const error = new Error('non-retryable');

      await expect(composed.runOnError(error, context)).rejects.toThrow('non-retryable');
      expect(context.metadata.__retryCount).toBeUndefined();
    });
  });
});
