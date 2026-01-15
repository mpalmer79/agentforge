import { z } from 'zod';
import { ValidationError, ConfigurationError } from './errors';
import type { ProviderConfig, MemoryConfig, Message } from './types';

// ============================================
// Zod Schemas for Configuration
// ============================================

/**
 * Schema for provider configuration
 */
export const providerConfigSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  model: z.string().optional(),
  baseURL: z.string().url().optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  timeout: z.number().int().min(1000).max(300000).optional(),
});

/**
 * Schema for memory configuration
 */
export const memoryConfigSchema = z.object({
  maxMessages: z.number().int().min(1).max(1000).optional(),
  maxTokens: z.number().int().min(100).max(128000).optional(),
  strategy: z.enum(['sliding-window', 'summarize', 'trim-oldest']).optional(),
});

/**
 * Schema for message
 */
export const messageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  timestamp: z.number().int().positive(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Schema for tool call
 */
export const toolCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Invalid tool name format'),
  arguments: z.record(z.unknown()),
});

// ============================================
// Validation Functions
// ============================================

/**
 * Validate provider configuration
 */
export function validateProviderConfig(config: unknown): ProviderConfig {
  try {
    return providerConfigSchema.parse(config) as ProviderConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      throw new ConfigurationError(
        `Invalid provider configuration: ${firstError.path.join('.')} - ${firstError.message}`
      );
    }
    throw error;
  }
}

/**
 * Validate memory configuration
 */
export function validateMemoryConfig(config: unknown): MemoryConfig {
  try {
    return memoryConfigSchema.parse(config) as MemoryConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      throw new ConfigurationError(
        `Invalid memory configuration: ${firstError.path.join('.')} - ${firstError.message}`
      );
    }
    throw error;
  }
}

/**
 * Validate a message object
 */
export function validateMessage(message: unknown): Message {
  try {
    return messageSchema.parse(message) as Message;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      throw ValidationError.invalidField(firstError.path.join('.'), firstError.message, message);
    }
    throw error;
  }
}

/**
 * Validate an array of messages
 */
export function validateMessages(messages: unknown): Message[] {
  if (!Array.isArray(messages)) {
    throw ValidationError.invalidField('messages', 'array', messages);
  }

  return messages.map((msg, index) => {
    try {
      return validateMessage(msg);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new ValidationError(`Invalid message at index ${index}: ${error.message}`, {
          cause: error,
        });
      }
      throw error;
    }
  });
}

// ============================================
// Runtime Validators
// ============================================

/**
 * Validate that a value is within a range
 */
export function validateRange(value: number, min: number, max: number, fieldName: string): number {
  if (value < min || value > max) {
    throw ValidationError.invalidField(fieldName, `number between ${min} and ${max}`, value);
  }
  return value;
}

/**
 * Validate that a string matches a pattern
 */
export function validatePattern(
  value: string,
  pattern: RegExp,
  fieldName: string,
  formatDescription: string
): string {
  if (!pattern.test(value)) {
    throw ValidationError.invalidFormat(fieldName, formatDescription);
  }
  return value;
}

/**
 * Validate that a value is one of allowed values
 */
export function validateOneOf<T>(value: T, allowedValues: readonly T[], fieldName: string): T {
  if (!allowedValues.includes(value)) {
    throw ValidationError.invalidField(fieldName, `one of: ${allowedValues.join(', ')}`, value);
  }
  return value;
}

/**
 * Validate that a string is not empty
 */
export function validateNonEmpty(value: string, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw ValidationError.missingRequired(fieldName);
  }
  return value;
}

/**
 * Validate that a value is defined
 */
export function validateDefined<T>(value: T | null | undefined, fieldName: string): T {
  if (value === null || value === undefined) {
    throw ValidationError.missingRequired(fieldName);
  }
  return value;
}

// ============================================
// Sanitization Functions
// ============================================

/**
 * Sanitize a tool name to be valid
 */
export function sanitizeToolName(name: string): string {
  // Replace invalid characters with underscores
  let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');

  // Ensure it starts with a letter or underscore
  if (/^[0-9]/.test(sanitized)) {
    sanitized = '_' + sanitized;
  }

  return sanitized;
}

/**
 * Sanitize content for safe display
 */
export function sanitizeContent(content: string, maxLength?: number): string {
  let sanitized = content;

  // Trim whitespace
  sanitized = sanitized.trim();

  // Truncate if needed
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength - 3) + '...';
  }

  return sanitized;
}

// ============================================
// Safe Parsers
// ============================================

/**
 * Safely parse JSON with error handling
 */
export function safeParseJSON<T>(json: string, fallback?: T): T | undefined {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Safely stringify with error handling
 */
export function safeStringify(value: unknown, space?: number): string {
  try {
    return JSON.stringify(value, null, space);
  } catch {
    return String(value);
  }
}

/**
 * Parse a number with validation
 */
export function parseNumber(value: unknown, fieldName: string): number {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  throw ValidationError.invalidField(fieldName, 'number', value);
}

/**
 * Parse a boolean with validation
 */
export function parseBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true' || value === '1') {
    return true;
  }

  if (value === 'false' || value === '0') {
    return false;
  }

  throw ValidationError.invalidField(fieldName, 'boolean', value);
}
