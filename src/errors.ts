import type { Message, ToolCall } from './types';

// ============================================
// Error Codes
// ============================================

export const ErrorCode = {
  // Provider Errors
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PROVIDER_RATE_LIMITED: 'PROVIDER_RATE_LIMITED',
  PROVIDER_AUTHENTICATION_FAILED: 'PROVIDER_AUTHENTICATION_FAILED',
  PROVIDER_INVALID_RESPONSE: 'PROVIDER_INVALID_RESPONSE',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  PROVIDER_CONTENT_FILTERED: 'PROVIDER_CONTENT_FILTERED',

  // Agent Errors
  AGENT_MAX_ITERATIONS: 'AGENT_MAX_ITERATIONS',
  AGENT_ABORTED: 'AGENT_ABORTED',
  AGENT_NOT_INITIALIZED: 'AGENT_NOT_INITIALIZED',

  // Tool Errors
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  TOOL_EXECUTION_FAILED: 'TOOL_EXECUTION_FAILED',
  TOOL_VALIDATION_FAILED: 'TOOL_VALIDATION_FAILED',
  TOOL_TIMEOUT: 'TOOL_TIMEOUT',
  TOOL_INVALID_NAME: 'TOOL_INVALID_NAME',

  // Validation Errors
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_CONFIGURATION: 'INVALID_CONFIGURATION',
  INVALID_MESSAGE_FORMAT: 'INVALID_MESSAGE_FORMAT',

  // Network Errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',

  // Unknown
  UNKNOWN: 'UNKNOWN',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// ============================================
// Error Context
// ============================================

export interface ErrorContext {
  /** The operation that was being performed */
  operation?: string;
  /** Provider name if applicable */
  provider?: string;
  /** Tool name if applicable */
  toolName?: string;
  /** The request that caused the error */
  request?: unknown;
  /** HTTP status code if applicable */
  statusCode?: number;
  /** Timestamp when error occurred */
  timestamp: number;
  /** Unique error ID for tracking */
  errorId: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================
// Base Error Class
// ============================================

/**
 * Base error class for all AgentForge errors
 */
export class AgentForgeError extends Error {
  /** Error code for programmatic handling */
  readonly code: ErrorCode;

  /** Original error that caused this error */
  readonly cause?: Error;

  /** Context about when/where the error occurred */
  readonly context: ErrorContext;

  /** Whether this error is retryable */
  readonly retryable: boolean;

  /** Suggested retry delay in ms */
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    code: ErrorCode,
    options?: {
      cause?: Error;
      context?: Partial<ErrorContext>;
      retryable?: boolean;
      retryAfterMs?: number;
    }
  ) {
    super(message);
    this.name = 'AgentForgeError';
    this.code = code;
    this.cause = options?.cause;
    this.retryable = options?.retryable ?? false;
    this.retryAfterMs = options?.retryAfterMs;
    this.context = {
      timestamp: Date.now(),
      errorId: generateErrorId(),
      ...options?.context,
    };

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Get a user-friendly error message
   */
  getUserMessage(): string {
    return getHumanReadableMessage(this.code, this.message);
  }

  /**
   * Get diagnostic information for debugging
   */
  getDiagnostics(): string {
    const lines = [
      `Error: ${this.message}`,
      `Code: ${this.code}`,
      `Error ID: ${this.context.errorId}`,
      `Timestamp: ${new Date(this.context.timestamp).toISOString()}`,
      `Retryable: ${this.retryable}`,
    ];

    if (this.context.operation) {
      lines.push(`Operation: ${this.context.operation}`);
    }

    if (this.context.provider) {
      lines.push(`Provider: ${this.context.provider}`);
    }

    if (this.context.toolName) {
      lines.push(`Tool: ${this.context.toolName}`);
    }

    if (this.context.statusCode) {
      lines.push(`Status Code: ${this.context.statusCode}`);
    }

    if (this.cause) {
      lines.push(`Caused by: ${this.cause.message}`);
    }

    return lines.join('\n');
  }

  /**
   * Convert to JSON for logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
      cause: this.cause?.message,
      stack: this.stack,
    };
  }
}

// ============================================
// Specialized Error Classes
// ============================================

/**
 * Error from LLM provider (OpenAI, Anthropic, etc.)
 */
export class ProviderError extends AgentForgeError {
  readonly statusCode?: number;
  readonly providerName: string;
  readonly rawResponse?: unknown;

  constructor(
    message: string,
    providerName: string,
    options?: {
      statusCode?: number;
      cause?: Error;
      rawResponse?: unknown;
      retryable?: boolean;
      retryAfterMs?: number;
    }
  ) {
    const code = mapStatusCodeToErrorCode(options?.statusCode);
    const retryable = options?.retryable ?? isRetryableStatusCode(options?.statusCode);

    super(message, code, {
      cause: options?.cause,
      retryable,
      retryAfterMs: options?.retryAfterMs,
      context: {
        provider: providerName,
        statusCode: options?.statusCode,
        operation: 'provider_request',
      },
    });

    this.name = 'ProviderError';
    this.statusCode = options?.statusCode;
    this.providerName = providerName;
    this.rawResponse = options?.rawResponse;
  }

  static rateLimited(
    providerName: string,
    retryAfterMs?: number
  ): ProviderError {
    return new ProviderError(
      `Rate limit exceeded for ${providerName}. ${retryAfterMs ? `Retry after ${retryAfterMs}ms.` : 'Please wait before retrying.'}`,
      providerName,
      {
        statusCode: 429,
        retryable: true,
        retryAfterMs,
      }
    );
  }

  static authenticationFailed(providerName: string): ProviderError {
    return new ProviderError(
      `Authentication failed for ${providerName}. Please check your API key.`,
      providerName,
      {
        statusCode: 401,
        retryable: false,
      }
    );
  }

  static timeout(providerName: string, timeoutMs: number): ProviderError {
    return new ProviderError(
      `Request to ${providerName} timed out after ${timeoutMs}ms.`,
      providerName,
      {
        retryable: true,
      }
    );
  }

  static invalidResponse(
    providerName: string,
    details: string,
    rawResponse?: unknown
  ): ProviderError {
    return new ProviderError(
      `Invalid response from ${providerName}: ${details}`,
      providerName,
      {
        rawResponse,
        retryable: false,
      }
    );
  }
}

/**
 * Error during tool execution
 */
export class ToolExecutionError extends AgentForgeError {
  readonly toolName: string;
  readonly toolCall?: ToolCall;
  readonly executionTimeMs?: number;

  constructor(
    message: string,
    toolName: string,
    options?: {
      cause?: Error;
      toolCall?: ToolCall;
      executionTimeMs?: number;
      retryable?: boolean;
    }
  ) {
    super(message, ErrorCode.TOOL_EXECUTION_FAILED, {
      cause: options?.cause,
      retryable: options?.retryable ?? false,
      context: {
        toolName,
        operation: 'tool_execution',
        metadata: {
          toolCall: options?.toolCall,
          executionTimeMs: options?.executionTimeMs,
        },
      },
    });

    this.name = 'ToolExecutionError';
    this.toolName = toolName;
    this.toolCall = options?.toolCall;
    this.executionTimeMs = options?.executionTimeMs;
  }

  static notFound(toolName: string): ToolExecutionError {
    const error = new ToolExecutionError(
      `Tool "${toolName}" not found. Available tools may have changed.`,
      toolName
    );
    (error as { code: ErrorCode }).code = ErrorCode.TOOL_NOT_FOUND;
    return error;
  }

  static validationFailed(
    toolName: string,
    validationError: Error
  ): ToolExecutionError {
    const error = new ToolExecutionError(
      `Validation failed for tool "${toolName}": ${validationError.message}`,
      toolName,
      { cause: validationError }
    );
    (error as { code: ErrorCode }).code = ErrorCode.TOOL_VALIDATION_FAILED;
    return error;
  }

  static timeout(toolName: string, timeoutMs: number): ToolExecutionError {
    const error = new ToolExecutionError(
      `Tool "${toolName}" timed out after ${timeoutMs}ms.`,
      toolName,
      { retryable: true }
    );
    (error as { code: ErrorCode }).code = ErrorCode.TOOL_TIMEOUT;
    return error;
  }
}

/**
 * Error during input validation
 */
export class ValidationError extends AgentForgeError {
  readonly field?: string;
  readonly expectedType?: string;
  readonly receivedValue?: unknown;

  constructor(
    message: string,
    options?: {
      field?: string;
      expectedType?: string;
      receivedValue?: unknown;
      cause?: Error;
    }
  ) {
    super(message, ErrorCode.VALIDATION_FAILED, {
      cause: options?.cause,
      retryable: false,
      context: {
        operation: 'validation',
        metadata: {
          field: options?.field,
          expectedType: options?.expectedType,
        },
      },
    });

    this.name = 'ValidationError';
    this.field = options?.field;
    this.expectedType = options?.expectedType;
    this.receivedValue = options?.receivedValue;
  }

  static invalidField(
    field: string,
    expectedType: string,
    receivedValue: unknown
  ): ValidationError {
    const receivedType = typeof receivedValue;
    return new ValidationError(
      `Invalid value for "${field}": expected ${expectedType}, received ${receivedType}.`,
      { field, expectedType, receivedValue }
    );
  }

  static missingRequired(field: string): ValidationError {
    return new ValidationError(`Missing required field: "${field}".`, {
      field,
    });
  }

  static invalidFormat(field: string, format: string): ValidationError {
    return new ValidationError(
      `Invalid format for "${field}": expected ${format}.`,
      { field, expectedType: format }
    );
  }
}

/**
 * Error during agent execution
 */
export class AgentExecutionError extends AgentForgeError {
  readonly iterationCount?: number;
  readonly lastMessages?: Message[];

  constructor(
    message: string,
    code: ErrorCode,
    options?: {
      cause?: Error;
      iterationCount?: number;
      lastMessages?: Message[];
      retryable?: boolean;
    }
  ) {
    super(message, code, {
      cause: options?.cause,
      retryable: options?.retryable ?? false,
      context: {
        operation: 'agent_execution',
        metadata: {
          iterationCount: options?.iterationCount,
        },
      },
    });

    this.name = 'AgentExecutionError';
    this.iterationCount = options?.iterationCount;
    this.lastMessages = options?.lastMessages;
  }

  static maxIterationsExceeded(
    maxIterations: number,
    lastMessages?: Message[]
  ): AgentExecutionError {
    return new AgentExecutionError(
      `Agent exceeded maximum iterations (${maxIterations}). This may indicate a loop in tool calls or an unresolvable query.`,
      ErrorCode.AGENT_MAX_ITERATIONS,
      { iterationCount: maxIterations, lastMessages }
    );
  }

  static aborted(): AgentExecutionError {
    return new AgentExecutionError(
      'Agent execution was aborted by user request.',
      ErrorCode.AGENT_ABORTED
    );
  }

  static notInitialized(reason: string): AgentExecutionError {
    return new AgentExecutionError(
      `Agent not properly initialized: ${reason}`,
      ErrorCode.AGENT_NOT_INITIALIZED
    );
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends AgentForgeError {
  constructor(message: string, options?: { cause?: Error }) {
    super(message, ErrorCode.INVALID_CONFIGURATION, {
      cause: options?.cause,
      retryable: false,
      context: {
        operation: 'configuration',
      },
    });

    this.name = 'ConfigurationError';
  }

  static missingApiKey(providerName: string): ConfigurationError {
    return new ConfigurationError(
      `API key is required for ${providerName}. Set it in the provider configuration.`
    );
  }

  static invalidOption(
    option: string,
    reason: string
  ): ConfigurationError {
    return new ConfigurationError(
      `Invalid configuration option "${option}": ${reason}`
    );
  }
}

// ============================================
// Helper Functions
// ============================================

function generateErrorId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `err_${timestamp}_${random}`;
}

function mapStatusCodeToErrorCode(statusCode?: number): ErrorCode {
  if (!statusCode) return ErrorCode.UNKNOWN;

  switch (statusCode) {
    case 401:
    case 403:
      return ErrorCode.PROVIDER_AUTHENTICATION_FAILED;
    case 429:
      return ErrorCode.PROVIDER_RATE_LIMITED;
    case 408:
      return ErrorCode.PROVIDER_TIMEOUT;
    case 500:
    case 502:
    case 503:
    case 504:
      return ErrorCode.PROVIDER_UNAVAILABLE;
    default:
      return ErrorCode.UNKNOWN;
  }
}

function isRetryableStatusCode(statusCode?: number): boolean {
  if (!statusCode) return false;
  return statusCode === 429 || statusCode >= 500;
}

function getHumanReadableMessage(code: ErrorCode, originalMessage: string): string {
  const messages: Record<ErrorCode, string> = {
    [ErrorCode.PROVIDER_UNAVAILABLE]:
      'The AI service is temporarily unavailable. Please try again in a moment.',
    [ErrorCode.PROVIDER_RATE_LIMITED]:
      'Too many requests. Please wait a moment before trying again.',
    [ErrorCode.PROVIDER_AUTHENTICATION_FAILED]:
      'Authentication failed. Please check your API credentials.',
    [ErrorCode.PROVIDER_INVALID_RESPONSE]:
      'Received an unexpected response from the AI service.',
    [ErrorCode.PROVIDER_TIMEOUT]:
      'The request took too long. Please try again.',
    [ErrorCode.PROVIDER_CONTENT_FILTERED]:
      'The content was filtered by the AI service safety systems.',
    [ErrorCode.AGENT_MAX_ITERATIONS]:
      'The assistant took too many steps to complete the task.',
    [ErrorCode.AGENT_ABORTED]:
      'The operation was cancelled.',
    [ErrorCode.AGENT_NOT_INITIALIZED]:
      'The assistant is not ready. Please try again.',
    [ErrorCode.TOOL_NOT_FOUND]:
      'A required tool is not available.',
    [ErrorCode.TOOL_EXECUTION_FAILED]:
      'An error occurred while running a tool.',
    [ErrorCode.TOOL_VALIDATION_FAILED]:
      'Invalid input was provided to a tool.',
    [ErrorCode.TOOL_TIMEOUT]:
      'A tool took too long to respond.',
    [ErrorCode.TOOL_INVALID_NAME]:
      'Invalid tool name format.',
    [ErrorCode.VALIDATION_FAILED]:
      'Invalid input provided.',
    [ErrorCode.INVALID_CONFIGURATION]:
      'There is a configuration issue.',
    [ErrorCode.INVALID_MESSAGE_FORMAT]:
      'Invalid message format.',
    [ErrorCode.NETWORK_ERROR]:
      'A network error occurred. Please check your connection.',
    [ErrorCode.REQUEST_TIMEOUT]:
      'The request timed out. Please try again.',
    [ErrorCode.UNKNOWN]:
      originalMessage,
  };

  return messages[code] || originalMessage;
}

// ============================================
// Error Handling Utilities
// ============================================

/**
 * Check if an error is an AgentForge error
 */
export function isAgentForgeError(error: unknown): error is AgentForgeError {
  return error instanceof AgentForgeError;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (isAgentForgeError(error)) {
    return error.retryable;
  }
  return false;
}

/**
 * Wrap any error into an AgentForge error
 */
export function wrapError(error: unknown, context?: Partial<ErrorContext>): AgentForgeError {
  if (isAgentForgeError(error)) {
    return error;
  }

  const originalError = error instanceof Error ? error : new Error(String(error));

  return new AgentForgeError(originalError.message, ErrorCode.UNKNOWN, {
    cause: originalError,
    context,
  });
}

/**
 * Create an error handler that logs and optionally rethrows
 */
export function createErrorHandler(options?: {
  onError?: (error: AgentForgeError) => void;
  rethrow?: boolean;
  logDiagnostics?: boolean;
}): (error: unknown) => AgentForgeError {
  return (error: unknown) => {
    const wrappedError = wrapError(error);

    if (options?.logDiagnostics) {
      console.error(wrappedError.getDiagnostics());
    }

    options?.onError?.(wrappedError);

    if (options?.rethrow !== false) {
      throw wrappedError;
    }

    return wrappedError;
  };
}
