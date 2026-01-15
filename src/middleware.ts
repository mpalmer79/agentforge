import type {
  Middleware,
  MiddlewareContext,
  CompletionResponse,
  ToolCall,
  ToolResult,
} from './types';

/**
 * Create a middleware with partial implementation
 */
export function createMiddleware(config: Middleware): Middleware {
  return {
    name: config.name,
    beforeRequest: config.beforeRequest,
    afterResponse: config.afterResponse,
    onError: config.onError,
    onToolCall: config.onToolCall,
    onToolResult: config.onToolResult,
  };
}

/**
 * Compose multiple middleware into a single middleware chain
 */
export function composeMiddleware(middlewares: Middleware[]): {
  runBeforeRequest: (context: MiddlewareContext) => Promise<MiddlewareContext>;
  runAfterResponse: (
    response: CompletionResponse,
    context: MiddlewareContext
  ) => Promise<CompletionResponse>;
  runOnError: (error: Error, context: MiddlewareContext) => Promise<void>;
  runOnToolCall: (toolCall: ToolCall, context: MiddlewareContext) => Promise<ToolCall>;
  runOnToolResult: (result: ToolResult, context: MiddlewareContext) => Promise<ToolResult>;
} {
  return {
    runBeforeRequest: async (context: MiddlewareContext) => {
      let result = context;
      for (const middleware of middlewares) {
        if (middleware.beforeRequest) {
          result = await middleware.beforeRequest(result);
        }
      }
      return result;
    },

    runAfterResponse: async (response: CompletionResponse, context: MiddlewareContext) => {
      let result = response;
      // Run in reverse order for after hooks
      for (const middleware of [...middlewares].reverse()) {
        if (middleware.afterResponse) {
          result = await middleware.afterResponse(result, context);
        }
      }
      return result;
    },

    runOnError: async (error: Error, context: MiddlewareContext) => {
      for (const middleware of middlewares) {
        if (middleware.onError) {
          await middleware.onError(error, context);
        }
      }
    },

    runOnToolCall: async (toolCall: ToolCall, context: MiddlewareContext) => {
      let result = toolCall;
      for (const middleware of middlewares) {
        if (middleware.onToolCall) {
          result = await middleware.onToolCall(result, context);
        }
      }
      return result;
    },

    runOnToolResult: async (toolResult: ToolResult, context: MiddlewareContext) => {
      let result = toolResult;
      for (const middleware of middlewares) {
        if (middleware.onToolResult) {
          result = await middleware.onToolResult(result, context);
        }
      }
      return result;
    },
  };
}

// ============================================
// Built-in Middleware
// ============================================

/**
 * Logging middleware for debugging
 */
export const loggingMiddleware = createMiddleware({
  name: 'logging',
  beforeRequest: async (context) => {
    console.log('[AgentForge] Request:', {
      messageCount: context.messages.length,
      toolCount: context.tools.length,
      lastMessage: context.messages[context.messages.length - 1]?.content.slice(0, 100),
    });
    return context;
  },
  afterResponse: async (response, _context) => {
    console.log('[AgentForge] Response:', {
      id: response.id,
      contentLength: response.content.length,
      toolCalls: response.toolCalls?.length ?? 0,
      finishReason: response.finishReason,
      usage: response.usage,
    });
    return response;
  },
  onError: async (error) => {
    console.error('[AgentForge] Error:', error.message);
  },
  onToolCall: async (toolCall) => {
    console.log('[AgentForge] Tool Call:', {
      name: toolCall.name,
      arguments: toolCall.arguments,
    });
    return toolCall;
  },
  onToolResult: async (result) => {
    console.log('[AgentForge] Tool Result:', {
      toolCallId: result.toolCallId,
      hasError: !!result.error,
    });
    return result;
  },
});

/**
 * Rate limiting middleware
 */
export function createRateLimitMiddleware(options: {
  maxRequestsPerMinute: number;
  onRateLimited?: () => void;
}): Middleware {
  const requests: number[] = [];
  const { maxRequestsPerMinute, onRateLimited } = options;

  return createMiddleware({
    name: 'rate-limit',
    beforeRequest: async (context) => {
      const now = Date.now();
      const oneMinuteAgo = now - 60000;

      // Clean old requests
      while (requests.length > 0 && requests[0] < oneMinuteAgo) {
        requests.shift();
      }

      if (requests.length >= maxRequestsPerMinute) {
        onRateLimited?.();
        throw new Error(`Rate limit exceeded: ${maxRequestsPerMinute} requests per minute`);
      }

      requests.push(now);
      return context;
    },
  });
}

/**
 * Caching middleware for repeated queries
 */
export function createCacheMiddleware(options: {
  ttlMs?: number;
  maxSize?: number;
  keyFn?: (context: MiddlewareContext) => string;
}): Middleware {
  const { ttlMs = 300000, maxSize = 100, keyFn } = options;
  const cache = new Map<string, { response: CompletionResponse; timestamp: number }>();

  const defaultKeyFn = (context: MiddlewareContext): string => {
    const lastMessage = context.messages[context.messages.length - 1];
    return `${lastMessage?.role}:${lastMessage?.content}`;
  };

  const getKey = keyFn ?? defaultKeyFn;

  return createMiddleware({
    name: 'cache',
    beforeRequest: async (context) => {
      const key = getKey(context);
      const cached = cache.get(key);

      if (cached && Date.now() - cached.timestamp < ttlMs) {
        // Store in metadata to signal cache hit
        context.metadata.__cacheHit = true;
        context.metadata.__cachedResponse = cached.response;
      }

      return context;
    },
    afterResponse: async (response, context) => {
      if (!context.metadata.__cacheHit) {
        const key = getKey(context);

        // Enforce max size
        if (cache.size >= maxSize) {
          const firstKey = cache.keys().next().value;
          if (firstKey) cache.delete(firstKey);
        }

        cache.set(key, { response, timestamp: Date.now() });
      }

      return response;
    },
  });
}

/**
 * Retry middleware with exponential backoff
 */
export function createRetryMiddleware(options: {
  maxRetries?: number;
  baseDelayMs?: number;
  shouldRetry?: (error: Error) => boolean;
}): Middleware {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    shouldRetry = (error) => {
      // Retry on rate limits and server errors
      const message = error.message.toLowerCase();
      return (
        message.includes('rate limit') || message.includes('503') || message.includes('timeout')
      );
    },
  } = options;

  return createMiddleware({
    name: 'retry',
    onError: async (error, context) => {
      const retryCount = (context.metadata.__retryCount as number) ?? 0;

      if (retryCount < maxRetries && shouldRetry(error)) {
        context.metadata.__retryCount = retryCount + 1;
        context.metadata.__shouldRetry = true;

        const delay = baseDelayMs * Math.pow(2, retryCount);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    },
  });
}
