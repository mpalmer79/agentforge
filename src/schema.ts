/**
 * Runtime schema validation for provider responses
 *
 * Validates responses from LLM providers to catch malformed data early
 * and provide helpful error messages.
 */

import { z } from 'zod';
import { ValidationError } from './errors';
import { getTelemetry } from './telemetry';
import type { CompletionResponse, ToolCall } from './types';

// ============================================
// Schema Definitions
// ============================================

/**
 * Tool call schema
 */
export const ToolCallSchema = z.object({
  id: z.string().min(1, 'Tool call ID is required'),
  name: z.string().min(1, 'Tool name is required'),
  arguments: z.record(z.unknown()),
});

/**
 * Usage statistics schema
 */
export const UsageSchema = z
  .object({
    promptTokens: z.number().nonnegative(),
    completionTokens: z.number().nonnegative(),
    totalTokens: z.number().nonnegative(),
  })
  .optional();

/**
 * Completion response schema
 */
export const CompletionResponseSchema = z.object({
  id: z.string().min(1, 'Response ID is required'),
  content: z.string(),
  toolCalls: z.array(ToolCallSchema).optional(),
  usage: UsageSchema,
  finishReason: z.enum(['stop', 'tool_calls', 'length', 'error', 'content_filter']),
});

/**
 * Stream chunk schema
 */
export const StreamChunkSchema = z.object({
  id: z.string(),
  delta: z.object({
    content: z.string().optional(),
    toolCalls: z
      .array(
        z.object({
          id: z.string().optional(),
          name: z.string().optional(),
          arguments: z.record(z.unknown()).optional(),
        })
      )
      .optional(),
  }),
  finishReason: z
    .enum(['stop', 'tool_calls', 'length', 'error', 'content_filter'])
    .nullable()
    .optional(),
});

/**
 * Message schema
 */
export const MessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  timestamp: z.number().positive(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Provider configuration schema
 */
export const ProviderConfigSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  model: z.string().optional(),
  baseURL: z.string().url().optional(),
  maxRetries: z.number().int().positive().max(10).optional(),
  timeout: z.number().int().positive().max(300000).optional(),
});

/**
 * Agent configuration schema
 */
export const AgentConfigSchema = z.object({
  provider: z.object({
    name: z.string(),
    complete: z.function(),
    stream: z.function(),
  }),
  tools: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        parameters: z.any(),
        execute: z.function(),
        toJSON: z.function(),
      })
    )
    .optional(),
  systemPrompt: z.string().optional(),
  middleware: z
    .array(
      z.object({
        name: z.string(),
      })
    )
    .optional(),
  memory: z
    .object({
      maxMessages: z.number().int().positive().optional(),
      maxTokens: z.number().int().positive().optional(),
      strategy: z.enum(['sliding-window', 'summarize', 'trim-oldest']).optional(),
    })
    .optional(),
  maxIterations: z.number().int().positive().max(100).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
});

// ============================================
// Validation Functions
// ============================================

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: z.ZodError['errors'];
  errorMessage?: string;
}

/**
 * Validate data against a schema with detailed error reporting
 */
export function validate<T>(
  schema: z.ZodType<T>,
  data: unknown,
  context?: string
): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.errors;
  const errorMessage = formatValidationErrors(errors, context);

  getTelemetry().incrementCounter('validation.failure', {
    context: context ?? 'unknown',
  });

  return {
    success: false,
    errors,
    errorMessage,
  };
}

/**
 * Validate and throw on failure
 */
export function validateOrThrow<T>(schema: z.ZodType<T>, data: unknown, context?: string): T {
  const result = validate(schema, data, context);

  if (!result.success) {
    throw new ValidationError(result.errorMessage!, {
      field: result.errors?.[0]?.path.join('.'),
    });
  }

  return result.data!;
}

/**
 * Validate completion response from provider
 */
export function validateCompletionResponse(response: unknown): CompletionResponse {
  return validateOrThrow(
    CompletionResponseSchema,
    response,
    'CompletionResponse'
  ) as CompletionResponse;
}

/**
 * Validate stream chunk from provider
 */
export function validateStreamChunk(chunk: unknown): z.infer<typeof StreamChunkSchema> {
  return validateOrThrow(StreamChunkSchema, chunk, 'StreamChunk');
}

/**
 * Validate message
 */
export function validateMessage(message: unknown): z.infer<typeof MessageSchema> {
  return validateOrThrow(MessageSchema, message, 'Message');
}

/**
 * Validate provider configuration
 */
export function validateProviderConfig(config: unknown): z.infer<typeof ProviderConfigSchema> {
  return validateOrThrow(ProviderConfigSchema, config, 'ProviderConfig');
}

// ============================================
// Sanitization Functions
// ============================================

/**
 * Sanitize and normalize completion response
 * Handles edge cases and malformed data gracefully
 */
export function sanitizeCompletionResponse(response: unknown): CompletionResponse {
  const raw = response as Record<string, unknown>;

  // Ensure we have required fields with defaults
  const sanitized: CompletionResponse = {
    id: String(raw.id ?? `generated_${Date.now()}`),
    content: String(raw.content ?? ''),
    finishReason: normalizeFinishReason(raw.finishReason),
    toolCalls: sanitizeToolCalls(raw.toolCalls),
    usage: sanitizeUsage(raw.usage),
  };

  // Log sanitization if we made changes
  if (sanitized.id !== raw.id || sanitized.finishReason !== raw.finishReason) {
    getTelemetry().debug('Sanitized completion response', {
      originalId: raw.id,
      sanitizedId: sanitized.id,
      originalFinishReason: raw.finishReason,
      sanitizedFinishReason: sanitized.finishReason,
    });
  }

  return sanitized;
}

function normalizeFinishReason(
  reason: unknown
): 'stop' | 'tool_calls' | 'length' | 'error' | 'content_filter' {
  if (typeof reason !== 'string') return 'stop';

  const normalized = reason.toLowerCase();

  // Map various provider-specific values
  const mapping: Record<string, 'stop' | 'tool_calls' | 'length' | 'error' | 'content_filter'> = {
    stop: 'stop',
    end: 'stop',
    end_turn: 'stop',
    tool_calls: 'tool_calls',
    function_call: 'tool_calls',
    tool_use: 'tool_calls',
    length: 'length',
    max_tokens: 'length',
    error: 'error',
    content_filter: 'content_filter',
    safety: 'content_filter',
  };

  return mapping[normalized] ?? 'stop';
}

function sanitizeToolCalls(toolCalls: unknown): ToolCall[] | undefined {
  if (!Array.isArray(toolCalls)) return undefined;
  if (toolCalls.length === 0) return undefined;

  const result = toolCalls
    .filter((tc): tc is Record<string, unknown> => tc && typeof tc === 'object')
    .map((tc, index) => {
      // Handle OpenAI's function property structure
      const functionProp = tc.function as Record<string, unknown> | undefined;
      const toolCall: ToolCall = {
        id: String(tc.id ?? `tc_${index}_${Date.now()}`),
        name: String(tc.name ?? functionProp?.name ?? 'unknown'),
        arguments: parseArguments(tc.arguments ?? functionProp?.arguments),
      };
      return toolCall;
    })
    .filter((tc) => tc.name !== 'unknown');

  return result.length > 0 ? result : undefined;
}

function parseArguments(args: unknown): Record<string, unknown> {
  if (!args) return {};

  if (typeof args === 'string') {
    try {
      return JSON.parse(args);
    } catch {
      getTelemetry().warn('Failed to parse tool call arguments', { args });
      return {};
    }
  }

  if (typeof args === 'object' && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }

  return {};
}

function sanitizeUsage(usage: unknown): CompletionResponse['usage'] {
  if (!usage || typeof usage !== 'object') return undefined;

  const raw = usage as Record<string, unknown>;

  return {
    promptTokens: Number(raw.promptTokens ?? raw.prompt_tokens ?? 0),
    completionTokens: Number(raw.completionTokens ?? raw.completion_tokens ?? 0),
    totalTokens: Number(raw.totalTokens ?? raw.total_tokens ?? 0),
  };
}

// ============================================
// Error Formatting
// ============================================

function formatValidationErrors(errors: z.ZodError['errors'], context?: string): string {
  const prefix = context ? `Validation failed for ${context}: ` : 'Validation failed: ';

  const messages = errors.map((error) => {
    const path = error.path.length > 0 ? `${error.path.join('.')}: ` : '';
    return `${path}${error.message}`;
  });

  return prefix + messages.join('; ');
}

// ============================================
// Custom Validators
// ============================================

/**
 * Create a validator for tool parameters using Zod schema
 */
export function createToolValidator<T extends z.ZodType>(
  schema: T
): (params: unknown) => z.infer<T> {
  return (params: unknown) => {
    return validateOrThrow(schema, params, 'ToolParameters');
  };
}

/**
 * Validate that a string is valid JSON and optionally matches a schema
 */
export function validateJSON<T = unknown>(
  jsonString: string,
  schema?: z.ZodType<T>
): ValidationResult<T> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    return {
      success: false,
      errorMessage: `Invalid JSON: ${e instanceof Error ? e.message : 'Parse error'}`,
    };
  }

  if (schema) {
    return validate(schema, parsed, 'JSON');
  }

  return { success: true, data: parsed as T };
}

/**
 * Partial validation - validates present fields but doesn't require all fields
 */
export function validatePartial<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  data: unknown,
  context?: string
): ValidationResult<Partial<z.infer<z.ZodObject<T>>>> {
  const partialSchema = schema.partial();
  return validate(partialSchema, data, context);
}

// ============================================
// Assertion Helpers
// ============================================

/**
 * Assert that a value is defined
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message = 'Value is required'
): asserts value is T {
  if (value === null || value === undefined) {
    throw new ValidationError(message);
  }
}

/**
 * Assert that a string is not empty
 */
export function assertNonEmpty(
  value: string | null | undefined,
  field: string
): asserts value is string {
  if (!value || value.trim().length === 0) {
    throw new ValidationError(`${field} cannot be empty`, { field });
  }
}

/**
 * Assert that a number is within range
 */
export function assertInRange(value: number, min: number, max: number, field: string): void {
  if (value < min || value > max) {
    throw new ValidationError(`${field} must be between ${min} and ${max}, got ${value}`, {
      field,
      expectedType: `number (${min}-${max})`,
    });
  }
}
