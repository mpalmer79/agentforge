/**
 * Branded types for enhanced type safety
 *
 * Branded types prevent accidental misuse of similar primitive types
 * by adding a phantom type brand at compile time.
 */

// ============================================
// Brand Symbol
// ============================================

declare const brand: unique symbol;

/**
 * Creates a branded type from a base type
 */
export type Brand<T, B> = T & { readonly [brand]: B };

// ============================================
// ID Types
// ============================================

/** Unique message identifier */
export type MessageId = Brand<string, 'MessageId'>;

/** Unique tool call identifier */
export type ToolCallId = Brand<string, 'ToolCallId'>;

/** Unique response identifier */
export type ResponseId = Brand<string, 'ResponseId'>;

/** Unique error identifier */
export type ErrorId = Brand<string, 'ErrorId'>;

/** Unique conversation/session identifier */
export type SessionId = Brand<string, 'SessionId'>;

// ============================================
// ID Creators
// ============================================

/**
 * Create a MessageId from a string
 */
export function messageId(id: string): MessageId {
  return id as MessageId;
}

/**
 * Create a ToolCallId from a string
 */
export function toolCallId(id: string): ToolCallId {
  return id as ToolCallId;
}

/**
 * Create a ResponseId from a string
 */
export function responseId(id: string): ResponseId {
  return id as ResponseId;
}

/**
 * Create an ErrorId from a string
 */
export function errorId(id: string): ErrorId {
  return id as ErrorId;
}

/**
 * Create a SessionId from a string
 */
export function sessionId(id: string): SessionId {
  return id as SessionId;
}

// ============================================
// Value Types
// ============================================

/** Non-negative integer */
export type NonNegativeInteger = Brand<number, 'NonNegativeInteger'>;

/** Positive integer (> 0) */
export type PositiveInteger = Brand<number, 'PositiveInteger'>;

/** Percentage (0-100) */
export type Percentage = Brand<number, 'Percentage'>;

/** Temperature setting (0-2) */
export type Temperature = Brand<number, 'Temperature'>;

/** Token count */
export type TokenCount = Brand<number, 'TokenCount'>;

/** Timestamp in milliseconds */
export type Timestamp = Brand<number, 'Timestamp'>;

// ============================================
// Value Creators with Validation
// ============================================

/**
 * Create a NonNegativeInteger with validation
 */
export function nonNegativeInteger(value: number): NonNegativeInteger {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Expected non-negative integer, got ${value}`);
  }
  return value as NonNegativeInteger;
}

/**
 * Create a PositiveInteger with validation
 */
export function positiveInteger(value: number): PositiveInteger {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Expected positive integer, got ${value}`);
  }
  return value as PositiveInteger;
}

/**
 * Create a Percentage with validation
 */
export function percentage(value: number): Percentage {
  if (value < 0 || value > 100) {
    throw new Error(`Expected percentage (0-100), got ${value}`);
  }
  return value as Percentage;
}

/**
 * Create a Temperature with validation
 */
export function temperature(value: number): Temperature {
  if (value < 0 || value > 2) {
    throw new Error(`Expected temperature (0-2), got ${value}`);
  }
  return value as Temperature;
}

/**
 * Create a TokenCount with validation
 */
export function tokenCount(value: number): TokenCount {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Expected token count (non-negative integer), got ${value}`);
  }
  return value as TokenCount;
}

/**
 * Create a Timestamp
 */
export function timestamp(value?: number): Timestamp {
  return (value ?? Date.now()) as Timestamp;
}

// ============================================
// String Types
// ============================================

/** Non-empty string */
export type NonEmptyString = Brand<string, 'NonEmptyString'>;

/** Tool name (alphanumeric + underscore) */
export type ToolName = Brand<string, 'ToolName'>;

/** API key */
export type ApiKey = Brand<string, 'ApiKey'>;

/** Model identifier */
export type ModelId = Brand<string, 'ModelId'>;

// ============================================
// String Creators with Validation
// ============================================

/**
 * Create a NonEmptyString with validation
 */
export function nonEmptyString(value: string): NonEmptyString {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Expected non-empty string');
  }
  return value as NonEmptyString;
}

/**
 * Create a ToolName with validation
 */
export function toolName(value: string): ToolName {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(
      `Invalid tool name "${value}". Must start with letter/underscore and contain only alphanumeric/underscore.`
    );
  }
  return value as ToolName;
}

/**
 * Create an ApiKey with validation
 */
export function apiKey(value: string): ApiKey {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('API key cannot be empty');
  }
  return value as ApiKey;
}

/**
 * Create a ModelId
 */
export function modelId(value: string): ModelId {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Model ID cannot be empty');
  }
  return value as ModelId;
}

// ============================================
// Type Guards
// ============================================

/**
 * Check if a value is a valid MessageId
 */
export function isMessageId(value: unknown): value is MessageId {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Check if a value is a valid ToolCallId
 */
export function isToolCallId(value: unknown): value is ToolCallId {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Check if a value is a non-negative integer
 */
export function isNonNegativeInteger(value: unknown): value is NonNegativeInteger {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Check if a value is a positive integer
 */
export function isPositiveInteger(value: unknown): value is PositiveInteger {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Check if a value is a valid temperature
 */
export function isTemperature(value: unknown): value is Temperature {
  return typeof value === 'number' && value >= 0 && value <= 2;
}

/**
 * Check if a value is a valid tool name
 */
export function isToolName(value: unknown): value is ToolName {
  return typeof value === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);
}
