/**
 * Request Interceptor System
 * 
 * Advanced request/response manipulation pipeline:
 * - Pre-request transformation
 * - Post-response transformation
 * - Error interception and recovery
 * - Request/response logging
 * - Metrics collection
 * - Content modification
 */

import type { CompletionRequest, CompletionResponse, Message } from './types';
import { getLogger } from './logging';
import { getTelemetry } from './telemetry';

// ============================================
// Types
// ============================================

export interface RequestContext {
  /** Unique request ID */
  requestId: string;
  /** Request start time */
  startTime: number;
  /** Original request before any modifications */
  originalRequest: CompletionRequest;
  /** Mutable metadata that flows through the pipeline */
  metadata: Record<string, unknown>;
  /** Signal for cancellation */
  signal?: AbortSignal;
}

export interface InterceptorResult<T> {
  /** The data (request or response) */
  data: T;
  /** Whether to continue processing or short-circuit */
  continue: boolean;
  /** Optional error to throw instead of continuing */
  error?: Error;
}

export type RequestInterceptor = (
  request: CompletionRequest,
  context: RequestContext
) => Promise<InterceptorResult<CompletionRequest>> | InterceptorResult<CompletionRequest>;

export type ResponseInterceptor = (
  response: CompletionResponse,
  context: RequestContext
) => Promise<InterceptorResult<CompletionResponse>> | InterceptorResult<CompletionResponse>;

export type ErrorInterceptor = (
  error: Error,
  context: RequestContext
) => Promise<{ retry: boolean; error?: Error; delay?: number }>;

export interface InterceptorChainConfig {
  requestInterceptors?: RequestInterceptor[];
  responseInterceptors?: ResponseInterceptor[];
  errorInterceptors?: ErrorInterceptor[];
}

// ============================================
// Interceptor Chain
// ============================================

export class InterceptorChain {
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];
  private logger = getLogger().child({ component: 'InterceptorChain' });

  constructor(config: InterceptorChainConfig = {}) {
    this.requestInterceptors = config.requestInterceptors ?? [];
    this.responseInterceptors = config.responseInterceptors ?? [];
    this.errorInterceptors = config.errorInterceptors ?? [];
  }

  /**
   * Add a request interceptor
   */
  addRequestInterceptor(interceptor: RequestInterceptor): this {
    this.requestInterceptors.push(interceptor);
    return this;
  }

  /**
   * Add a response interceptor
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): this {
    this.responseInterceptors.push(interceptor);
    return this;
  }

  /**
   * Add an error interceptor
   */
  addErrorInterceptor(interceptor: ErrorInterceptor): this {
    this.errorInterceptors.push(interceptor);
    return this;
  }

  /**
   * Process request through interceptor chain
   */
  async processRequest(
    request: CompletionRequest,
    context: RequestContext
  ): Promise<CompletionRequest> {
    let currentRequest = request;

    for (const interceptor of this.requestInterceptors) {
      try {
        const result = await interceptor(currentRequest, context);

        if (result.error) {
          throw result.error;
        }

        currentRequest = result.data;

        if (!result.continue) {
          this.logger.debug('Request interceptor short-circuited', {
            requestId: context.requestId,
          });
          break;
        }
      } catch (error) {
        this.logger.error('Request interceptor failed', error instanceof Error ? error : undefined);
        throw error;
      }
    }

    return currentRequest;
  }

  /**
   * Process response through interceptor chain
   */
  async processResponse(
    response: CompletionResponse,
    context: RequestContext
  ): Promise<CompletionResponse> {
    let currentResponse = response;

    // Run response interceptors in reverse order (like middleware afterResponse)
    for (const interceptor of [...this.responseInterceptors].reverse()) {
      try {
        const result = await interceptor(currentResponse, context);

        if (result.error) {
          throw result.error;
        }

        currentResponse = result.data;

        if (!result.continue) {
          break;
        }
      } catch (error) {
        this.logger.error('Response interceptor failed', error instanceof Error ? error : undefined);
        throw error;
      }
    }

    return currentResponse;
  }

  /**
   * Process error through interceptor chain
   */
  async processError(
    error: Error,
    context: RequestContext
  ): Promise<{ retry: boolean; error: Error; delay?: number }> {
    let currentError = error;
    let shouldRetry = false;
    let delay: number | undefined;

    for (const interceptor of this.errorInterceptors) {
      try {
        const result = await interceptor(currentError, context);

        if (result.error) {
          currentError = result.error;
        }

        if (result.retry) {
          shouldRetry = true;
          delay = result.delay;
          break;
        }
      } catch (e) {
        this.logger.error('Error interceptor failed', e instanceof Error ? e : undefined);
      }
    }

    return { retry: shouldRetry, error: currentError, delay };
  }
}

// ============================================
// Built-in Interceptors
// ============================================

/**
 * Logging interceptor - logs all requests and responses
 */
export function createLoggingInterceptor(options: {
  logRequests?: boolean;
  logResponses?: boolean;
  redactContent?: boolean;
} = {}): { request: RequestInterceptor; response: ResponseInterceptor } {
  const { logRequests = true, logResponses = true, redactContent = false } = options;
  const logger = getLogger().child({ interceptor: 'logging' });

  return {
    request: async (request, context) => {
      if (logRequests) {
        logger.info('Outgoing request', {
          requestId: context.requestId,
          messageCount: request.messages.length,
          tools: request.tools?.length ?? 0,
          lastMessage: redactContent 
            ? '[REDACTED]' 
            : request.messages[request.messages.length - 1]?.content.substring(0, 100),
        });
      }
      return { data: request, continue: true };
    },
    response: async (response, context) => {
      if (logResponses) {
        logger.info('Incoming response', {
          requestId: context.requestId,
          duration: Date.now() - context.startTime,
          contentLength: response.content.length,
          finishReason: response.finishReason,
          toolCalls: response.toolCalls?.length ?? 0,
        });
      }
      return { data: response, continue: true };
    },
  };
}

/**
 * Metrics interceptor - collects timing and usage metrics
 */
export function createMetricsInterceptor(): { request: RequestInterceptor; response: ResponseInterceptor } {
  const telemetry = getTelemetry();

  return {
    request: async (request, context) => {
      telemetry.incrementCounter('interceptor.requests', { 
        messageCount: String(request.messages.length),
      });
      return { data: request, continue: true };
    },
    response: async (response, context) => {
      const duration = Date.now() - context.startTime;
      telemetry.recordLatency('interceptor.response_time', duration);

      if (response.usage) {
        telemetry.recordTokens('interceptor.prompt_tokens', response.usage.promptTokens);
        telemetry.recordTokens('interceptor.completion_tokens', response.usage.completionTokens);
      }

      return { data: response, continue: true };
    },
  };
}

/**
 * Content filter interceptor - filters sensitive content
 */
export function createContentFilterInterceptor(options: {
  blockedPatterns?: RegExp[];
  replacementText?: string;
  filterInput?: boolean;
  filterOutput?: boolean;
}): { request: RequestInterceptor; response: ResponseInterceptor } {
  const {
    blockedPatterns = [],
    replacementText = '[FILTERED]',
    filterInput = true,
    filterOutput = true,
  } = options;

  const filterContent = (content: string): string => {
    let filtered = content;
    for (const pattern of blockedPatterns) {
      filtered = filtered.replace(pattern, replacementText);
    }
    return filtered;
  };

  return {
    request: async (request, context) => {
      if (!filterInput) return { data: request, continue: true };

      const filteredMessages = request.messages.map(msg => ({
        ...msg,
        content: filterContent(msg.content),
      }));

      return {
        data: { ...request, messages: filteredMessages },
        continue: true,
      };
    },
    response: async (response, context) => {
      if (!filterOutput) return { data: response, continue: true };

      return {
        data: {
          ...response,
          content: filterContent(response.content),
        },
        continue: true,
      };
    },
  };
}

/**
 * Prompt injection detection interceptor
 */
export function createInjectionDetectionInterceptor(options: {
  patterns?: RegExp[];
  action?: 'warn' | 'block' | 'sanitize';
  onDetection?: (message: Message, pattern: RegExp) => void;
} = {}): RequestInterceptor {
  const {
    patterns = [
      /ignore\s+(previous|all)\s+(instructions?|prompts?)/i,
      /you\s+are\s+now\s+in\s+['"](jailbreak|developer|admin)/i,
      /disregard\s+.*?(rules?|guidelines?|instructions?)/i,
      /pretend\s+you\s+are/i,
      /\bDAN\b.*\bmode\b/i,
    ],
    action = 'warn',
    onDetection,
  } = options;

  const logger = getLogger().child({ interceptor: 'injection-detection' });

  return async (request, context) => {
    for (const message of request.messages) {
      for (const pattern of patterns) {
        if (pattern.test(message.content)) {
          logger.warn('Potential prompt injection detected', {
            requestId: context.requestId,
            messageId: message.id,
            pattern: pattern.source,
          });

          onDetection?.(message, pattern);

          if (action === 'block') {
            return {
              data: request,
              continue: false,
              error: new Error('Potential prompt injection detected'),
            };
          }

          if (action === 'sanitize') {
            const sanitizedMessages = request.messages.map(m => 
              m.id === message.id
                ? { ...m, content: m.content.replace(pattern, '[REMOVED]') }
                : m
            );
            return {
              data: { ...request, messages: sanitizedMessages },
              continue: true,
            };
          }
        }
      }
    }

    return { data: request, continue: true };
  };
}

/**
 * Request transformation interceptor - modify requests
 */
export function createTransformInterceptor(options: {
  transformRequest?: (request: CompletionRequest) => CompletionRequest;
  transformResponse?: (response: CompletionResponse) => CompletionResponse;
}): { request?: RequestInterceptor; response?: ResponseInterceptor } {
  return {
    request: options.transformRequest
      ? async (request, _context) => ({
          data: options.transformRequest!(request),
          continue: true,
        })
      : undefined,
    response: options.transformResponse
      ? async (response, _context) => ({
          data: options.transformResponse!(response),
          continue: true,
        })
      : undefined,
  };
}

/**
 * Retry interceptor - handles retryable errors
 */
export function createRetryErrorInterceptor(options: {
  maxRetries?: number;
  retryableErrors?: (error: Error) => boolean;
  baseDelay?: number;
  maxDelay?: number;
} = {}): ErrorInterceptor {
  const {
    maxRetries = 3,
    retryableErrors = (error) => {
      const msg = error.message.toLowerCase();
      return msg.includes('timeout') || 
             msg.includes('rate limit') || 
             msg.includes('503') ||
             msg.includes('429');
    },
    baseDelay = 1000,
    maxDelay = 30000,
  } = options;

  const retryCounts = new Map<string, number>();

  return async (error, context) => {
    if (!retryableErrors(error)) {
      return { retry: false };
    }

    const currentCount = retryCounts.get(context.requestId) ?? 0;
    
    if (currentCount >= maxRetries) {
      retryCounts.delete(context.requestId);
      return { retry: false };
    }

    retryCounts.set(context.requestId, currentCount + 1);

    // Calculate delay with exponential backoff
    const delay = Math.min(baseDelay * Math.pow(2, currentCount), maxDelay);

    return { retry: true, delay };
  };
}

/**
 * Circuit breaker error interceptor
 */
export function createCircuitBreakerErrorInterceptor(options: {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  onOpen?: () => void;
  onClose?: () => void;
} = {}): ErrorInterceptor {
  const {
    failureThreshold = 5,
    resetTimeoutMs = 30000,
    onOpen,
    onClose,
  } = options;

  let failures = 0;
  let circuitOpen = false;
  let lastFailureTime = 0;

  return async (error, _context) => {
    const now = Date.now();

    // Check if we should reset
    if (circuitOpen && now - lastFailureTime > resetTimeoutMs) {
      circuitOpen = false;
      failures = 0;
      onClose?.();
    }

    if (circuitOpen) {
      return {
        retry: false,
        error: new Error('Circuit breaker is open'),
      };
    }

    failures++;
    lastFailureTime = now;

    if (failures >= failureThreshold) {
      circuitOpen = true;
      onOpen?.();
    }

    return { retry: false };
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Create a request context
 */
export function createRequestContext(
  request: CompletionRequest,
  signal?: AbortSignal
): RequestContext {
  return {
    requestId: generateRequestId(),
    startTime: Date.now(),
    originalRequest: { ...request },
    metadata: {},
    signal,
  };
}

/**
 * Compose multiple interceptors into one
 */
export function composeRequestInterceptors(
  ...interceptors: RequestInterceptor[]
): RequestInterceptor {
  return async (request, context) => {
    let current = request;
    
    for (const interceptor of interceptors) {
      const result = await interceptor(current, context);
      
      if (result.error || !result.continue) {
        return result;
      }
      
      current = result.data;
    }
    
    return { data: current, continue: true };
  };
}

/**
 * Compose multiple response interceptors into one
 */
export function composeResponseInterceptors(
  ...interceptors: ResponseInterceptor[]
): ResponseInterceptor {
  return async (response, context) => {
    let current = response;
    
    for (const interceptor of interceptors) {
      const result = await interceptor(current, context);
      
      if (result.error || !result.continue) {
        return result;
      }
      
      current = result.data;
    }
    
    return { data: current, continue: true };
  };
}
