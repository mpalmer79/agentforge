import type {
  Message,
  AssistantMessage,
  ToolMessage,
  ToolCall,
  ToolResult,
  Provider,
  Tool,
  CompletionResponse,
  StreamChunk,
} from '../types';

// ============================================
// Message Type Guards
// ============================================

/**
 * Check if a message is from the user
 */
export function isUserMessage(message: Message): boolean {
  return message.role === 'user';
}

/**
 * Check if a message is from the assistant
 */
export function isAssistantMessage(message: Message): message is AssistantMessage {
  return message.role === 'assistant';
}

/**
 * Check if a message is a system message
 */
export function isSystemMessage(message: Message): boolean {
  return message.role === 'system';
}

/**
 * Check if a message is a tool response
 */
export function isToolMessage(message: Message): message is ToolMessage {
  return message.role === 'tool';
}

/**
 * Check if a message has tool calls
 */
export function hasToolCalls(message: Message): message is AssistantMessage & { toolCalls: ToolCall[] } {
  return (
    isAssistantMessage(message) &&
    Array.isArray((message as AssistantMessage).toolCalls) &&
    (message as AssistantMessage).toolCalls!.length > 0
  );
}

// ============================================
// Object Type Guards
// ============================================

/**
 * Check if a value is a valid Message object
 */
export function isMessage(value: unknown): value is Message {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const msg = value as Record<string, unknown>;

  return (
    typeof msg.id === 'string' &&
    typeof msg.role === 'string' &&
    ['system', 'user', 'assistant', 'tool'].includes(msg.role as string) &&
    typeof msg.content === 'string' &&
    typeof msg.timestamp === 'number'
  );
}

/**
 * Check if a value is a valid ToolCall object
 */
export function isToolCall(value: unknown): value is ToolCall {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const tc = value as Record<string, unknown>;

  return (
    typeof tc.id === 'string' &&
    typeof tc.name === 'string' &&
    typeof tc.arguments === 'object' &&
    tc.arguments !== null
  );
}

/**
 * Check if a value is a valid ToolResult object
 */
export function isToolResult(value: unknown): value is ToolResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const tr = value as Record<string, unknown>;

  return (
    typeof tr.toolCallId === 'string' &&
    'result' in tr
  );
}

/**
 * Check if a value is a valid Provider object
 */
export function isProvider(value: unknown): value is Provider {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const p = value as Record<string, unknown>;

  return (
    typeof p.name === 'string' &&
    typeof p.complete === 'function' &&
    typeof p.stream === 'function'
  );
}

/**
 * Check if a value is a valid Tool object
 */
export function isTool(value: unknown): value is Tool {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const t = value as Record<string, unknown>;

  return (
    typeof t.name === 'string' &&
    typeof t.description === 'string' &&
    typeof t.execute === 'function' &&
    typeof t.toJSON === 'function'
  );
}

/**
 * Check if a value is a valid CompletionResponse
 */
export function isCompletionResponse(value: unknown): value is CompletionResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const r = value as Record<string, unknown>;

  return (
    typeof r.id === 'string' &&
    typeof r.content === 'string' &&
    typeof r.finishReason === 'string' &&
    ['stop', 'tool_calls', 'length', 'error'].includes(r.finishReason as string)
  );
}

/**
 * Check if a value is a valid StreamChunk
 */
export function isStreamChunk(value: unknown): value is StreamChunk {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const c = value as Record<string, unknown>;

  return (
    typeof c.id === 'string' &&
    typeof c.delta === 'object' &&
    c.delta !== null
  );
}

// ============================================
// Array Type Guards
// ============================================

/**
 * Check if all items in an array are Messages
 */
export function isMessageArray(value: unknown): value is Message[] {
  return Array.isArray(value) && value.every(isMessage);
}

/**
 * Check if all items in an array are ToolCalls
 */
export function isToolCallArray(value: unknown): value is ToolCall[] {
  return Array.isArray(value) && value.every(isToolCall);
}

/**
 * Check if all items in an array are Tools
 */
export function isToolArray(value: unknown): value is Tool[] {
  return Array.isArray(value) && value.every(isTool);
}

// ============================================
// Primitive Type Guards
// ============================================

/**
 * Check if a value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if a value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Check if a value is a positive number
 */
export function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && !Number.isNaN(value);
}

/**
 * Check if a value is a non-negative number
 */
export function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && !Number.isNaN(value);
}

/**
 * Check if a value is defined (not null or undefined)
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Check if a value is null or undefined
 */
export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

// ============================================
// Assertion Functions
// ============================================

/**
 * Assert that a value is a Message, throwing if not
 */
export function assertMessage(value: unknown, name = 'value'): asserts value is Message {
  if (!isMessage(value)) {
    throw new TypeError(`Expected ${name} to be a valid Message object`);
  }
}

/**
 * Assert that a value is a Provider, throwing if not
 */
export function assertProvider(value: unknown, name = 'value'): asserts value is Provider {
  if (!isProvider(value)) {
    throw new TypeError(`Expected ${name} to be a valid Provider object`);
  }
}

/**
 * Assert that a value is a Tool, throwing if not
 */
export function assertTool(value: unknown, name = 'value'): asserts value is Tool {
  if (!isTool(value)) {
    throw new TypeError(`Expected ${name} to be a valid Tool object`);
  }
}

/**
 * Assert that a value is defined
 */
export function assertDefined<T>(
  value: T | null | undefined,
  name = 'value'
): asserts value is T {
  if (!isDefined(value)) {
    throw new TypeError(`Expected ${name} to be defined, got ${value}`);
  }
}

/**
 * Assert that a value is a non-empty string
 */
export function assertNonEmptyString(
  value: unknown,
  name = 'value'
): asserts value is string {
  if (!isNonEmptyString(value)) {
    throw new TypeError(`Expected ${name} to be a non-empty string`);
  }
}
