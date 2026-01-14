import type { z } from 'zod';

// ============================================
// Message Types
// ============================================

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ToolMessage extends Message {
  role: 'tool';
  toolCallId: string;
  toolName: string;
}

export interface AssistantMessage extends Message {
  role: 'assistant';
  toolCalls?: ToolCall[];
}

// ============================================
// Tool Types
// ============================================

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  result: unknown;
  error?: string;
}

export interface ToolDefinition<TParams extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  parameters: TParams;
  execute: (params: z.infer<TParams>) => Promise<unknown>;
}

export interface Tool<TParams extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  parameters: TParams;
  execute: (params: z.infer<TParams>) => Promise<unknown>;
  toJSON: () => ToolSchema;
}

export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// ============================================
// Provider Types
// ============================================

export interface ProviderConfig {
  apiKey: string;
  model?: string;
  baseURL?: string;
  maxRetries?: number;
  timeout?: number;
}

export interface CompletionRequest {
  messages: Message[];
  tools?: ToolSchema[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface CompletionResponse {
  id: string;
  content: string;
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error' | 'content_filter';
}

export interface StreamChunk {
  id: string;
  delta: {
    content?: string;
    toolCalls?: Partial<ToolCall>[];
  };
  finishReason?: CompletionResponse['finishReason'];
}

export interface Provider {
  name: string;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;
}

// ============================================
// Agent Types
// ============================================

export type MemoryStrategy = 'sliding-window' | 'summarize' | 'trim-oldest';

export interface MemoryConfig {
  maxMessages?: number;
  maxTokens?: number;
  strategy?: MemoryStrategy;
}

export interface AgentConfig {
  provider: Provider;
  tools?: Tool[];
  systemPrompt?: string;
  middleware?: Middleware[];
  memory?: MemoryConfig;
  maxIterations?: number;
  temperature?: number;
  maxTokens?: number;
}

export interface AgentContext {
  messages: Message[];
  tools: Tool[];
  systemPrompt?: string;
  metadata: Record<string, unknown>;
}

export interface AgentResponse {
  id: string;
  content: string;
  messages: Message[];
  toolResults?: ToolResult[];
  usage?: CompletionResponse['usage'];
}

// ============================================
// Middleware Types
// ============================================

export interface MiddlewareContext extends AgentContext {
  request: CompletionRequest;
}

export interface Middleware {
  name: string;
  beforeRequest?: (context: MiddlewareContext) => Promise<MiddlewareContext>;
  afterResponse?: (
    response: CompletionResponse,
    context: MiddlewareContext
  ) => Promise<CompletionResponse>;
  onError?: (error: Error, context: MiddlewareContext) => Promise<void>;
  onToolCall?: (
    toolCall: ToolCall,
    context: MiddlewareContext
  ) => Promise<ToolCall>;
  onToolResult?: (
    result: ToolResult,
    context: MiddlewareContext
  ) => Promise<ToolResult>;
}

// ============================================
// Error Types
// ============================================

export class AgentForgeError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'AgentForgeError';
  }
}

export class ProviderError extends AgentForgeError {
  constructor(
    message: string,
    public statusCode?: number,
    cause?: Error
  ) {
    super(message, 'PROVIDER_ERROR', cause);
    this.name = 'ProviderError';
  }
}

export class ToolExecutionError extends AgentForgeError {
  constructor(
    message: string,
    public toolName: string,
    cause?: Error
  ) {
    super(message, 'TOOL_EXECUTION_ERROR', cause);
    this.name = 'ToolExecutionError';
  }
}

export class ValidationError extends AgentForgeError {
  constructor(
    message: string,
    public field: string,
    cause?: Error
  ) {
    super(message, 'VALIDATION_ERROR', cause);
    this.name = 'ValidationError';
  }
}

// ============================================
// Utility Types
// ============================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type Awaitable<T> = T | Promise<T>;
