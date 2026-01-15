// Core exports
export { Agent } from './agent';
export type { ExtendedAgentConfig } from './agent';
export { defineTool, createSimpleTool } from './tool';
export {
  createMiddleware,
  composeMiddleware,
  loggingMiddleware,
  createRateLimitMiddleware,
  createCacheMiddleware,
  createRetryMiddleware,
} from './middleware';

// Provider exports
export {
  BaseProvider,
  OpenAIProvider,
  AnthropicProvider,
  // v1.1.0 - New providers
  GeminiProvider,
  CohereProvider,
  TogetherProvider,
  TOGETHER_MODELS,
} from './providers';
export type {
  OpenAIProviderConfig,
  AnthropicProviderConfig,
  // v1.1.0 - New provider configs
  GeminiProviderConfig,
  CohereProviderConfig,
  TogetherProviderConfig,
} from './providers';

// Error exports
export {
  ErrorCode,
  AgentForgeError,
  ProviderError,
  ToolExecutionError,
  ValidationError,
  AgentExecutionError,
  ConfigurationError,
  isAgentForgeError,
  isRetryableError,
  wrapError,
  createErrorHandler,
} from './errors';
export type { ErrorContext } from './errors';

// Validation exports
export {
  validateProviderConfig,
  validateMemoryConfig,
  validateMessage,
  validateMessages,
  validateRange,
  validatePattern,
  validateOneOf,
  validateNonEmpty,
  validateDefined,
  sanitizeToolName,
  sanitizeContent,
  safeParseJSON,
  safeStringify,
  parseNumber,
  parseBoolean,
} from './validation';

// Result type exports
export {
  ok,
  err,
  errFrom,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  unwrapOrElse,
  map,
  mapErr,
  flatMap,
  combine,
  tryCatch,
  tryCatchAsync,
  match,
  fromPromise,
  toPromise,
  collectAsync,
  collectAsyncParallel,
} from './result';
export type { Ok, Err, Result } from './result';

// Branded type exports
export {
  messageId,
  toolCallId,
  responseId,
  errorId,
  sessionId,
  nonNegativeInteger,
  positiveInteger,
  percentage,
  temperature,
  tokenCount,
  timestamp,
  nonEmptyString,
  toolName,
  apiKey,
  modelId,
  isMessageId,
  isToolCallId,
  isNonNegativeInteger,
  isPositiveInteger,
  isTemperature,
  isToolName,
} from './types/branded';
export type {
  MessageId,
  ToolCallId,
  ResponseId,
  ErrorId,
  SessionId,
  NonNegativeInteger,
  PositiveInteger,
  Percentage,
  Temperature,
  TokenCount,
  Timestamp,
  NonEmptyString,
  ToolName,
  ApiKey,
  ModelId,
} from './types/branded';

// Type guard exports
export {
  isUserMessage,
  isAssistantMessage,
  isSystemMessage,
  isToolMessage,
  hasToolCalls,
  isMessage,
  isToolCall,
  isToolResult,
  isProvider,
  isTool,
  isCompletionResponse,
  isStreamChunk,
  isMessageArray,
  isToolCallArray,
  isToolArray,
  isObject,
  isNonEmptyString,
  isPositiveNumber,
  isNonNegativeNumber,
  isDefined,
  isNullish,
  assertMessage,
  assertProvider,
  assertTool,
  assertDefined,
  assertNonEmptyString,
} from './types/guards';

// Core type exports
export type {
  Message,
  MessageRole,
  ToolMessage,
  AssistantMessage,
  ToolCall,
  ToolResult,
  ToolDefinition,
  Tool,
  ToolSchema,
  Provider,
  ProviderConfig,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  AgentConfig,
  AgentContext,
  AgentResponse,
  MemoryConfig,
  MemoryStrategy,
  Middleware,
  MiddlewareContext,
  DeepPartial,
  Awaitable,
} from './types';

// Utility exports
export {
  generateId,
  sleep,
  retry,
  deepMerge,
  truncate,
  estimateTokens,
  createDeferred,
  isPlainObject,
  omit,
  pick,
} from './utils';

// Event system exports
export { EventEmitter, globalEventBus, waitForEvent, eventIterator } from './events';
export type { AgentEvents, EventName, EventPayload, EventListener } from './events';

// Plugin system exports
export { PluginManager, definePlugin, analyticsPlugin, telemetryPlugin } from './plugins';
export type { Plugin, PluginMetadata, PluginContext, PluginLogger } from './plugins';

// Batch/Performance exports
export {
  RequestBatcher,
  RequestDeduplicator as BatchRequestDeduplicator,
  RateLimitedQueue,
} from './batch';

// ============================================
// STAFF-LEVEL ADDITIONS
// ============================================

// Telemetry & Observability
export {
  TelemetryCollector,
  initTelemetry,
  getTelemetry,
  createConsoleExporter,
  createBatchingExporter,
  createOTLPExporter,
} from './telemetry';
export type {
  Span,
  SpanEvent,
  Metric,
  MetricUnit,
  TelemetryEvent,
  TelemetryHooks,
  LogEntry as TelemetryLogEntry,
} from './telemetry';

// Resilience Patterns
export {
  CircuitBreaker,
  RequestDeduplicator,
  Bulkhead,
  retryWithBackoff,
  withTimeout,
  TimeoutError,
  HealthChecker,
  withFallback,
} from './resilience';
export type {
  CircuitState,
  CircuitBreakerConfig,
  RetryConfig,
  HealthStatus,
  FallbackProvider,
} from './resilience';

// Tokenization
export {
  getTokenCounter,
  getModelFamily,
  getContextWindow,
  calculateBudget,
  truncateToTokens,
  MODEL_CONTEXT_WINDOWS,
} from './tokenizer';
export type { ModelFamily, TokenCounter, TokenBudget, TruncationOptions } from './tokenizer';

// Persistence
export {
  ConversationManager,
  MemoryStorageAdapter,
  FileStorageAdapter,
  createMemoryConversationManager,
  createFileConversationManager,
} from './persistence';
export type {
  Conversation,
  ConversationMetadata,
  ConversationSummary,
  SearchOptions,
  StorageStats,
  StorageAdapter,
} from './persistence';

// Schema Validation
export {
  validate,
  validateOrThrow,
  validateCompletionResponse,
  validateStreamChunk,
  sanitizeCompletionResponse,
  createToolValidator,
  validateJSON,
  validatePartial,
  assertInRange,
  CompletionResponseSchema,
  StreamChunkSchema,
  MessageSchema,
  ToolCallSchema,
  UsageSchema,
  ProviderConfigSchema,
  AgentConfigSchema,
} from './schema';
export type { ValidationResult } from './schema';

// Structured Logging
export {
  Logger,
  initLogger,
  getLogger,
  createModuleLogger,
  loggedOperation,
  createConsoleTransport,
  createJSONTransport,
  createBatchingTransport,
  createFilteringTransport,
  createMultiTransport,
} from './logging';
export type { LogLevel, LogEntry, LogTransport, LoggerConfig } from './logging';

// Provider Factory
export {
  ProviderFactory,
  createSingleProvider,
  createMultiProvider,
  createFailoverProvider,
  instrumentProvider,
} from './provider-factory';
export type {
  ProviderType,
  ProviderFactoryConfig,
  MultiProviderConfig,
  ProviderStats,
  AzureOpenAIConfig,
  CustomProviderConfig,
} from './provider-factory';

// Request Interceptors
export {
  InterceptorChain,
  createLoggingInterceptor,
  createMetricsInterceptor,
  createContentFilterInterceptor,
  createInjectionDetectionInterceptor,
  createTransformInterceptor,
  createRetryErrorInterceptor,
  createCircuitBreakerErrorInterceptor,
  generateRequestId,
  createRequestContext,
  composeRequestInterceptors,
  composeResponseInterceptors,
} from './interceptors';
export type {
  RequestContext,
  InterceptorResult,
  RequestInterceptor,
  ResponseInterceptor,
  ErrorInterceptor,
  InterceptorChainConfig,
} from './interceptors';

// Graceful Degradation
export {
  DegradationManager,
  createDegradedTool,
  simplifyResponse,
  createDegradedResponse,
  executeWithHealthAwareness,
  syncWithCircuitBreaker,
  createDegradationManager,
  createDegradedTools,
} from './degradation';
export type {
  FeatureFlags,
  DegradationLevel,
  CapabilityStatus,
  FallbackResponse,
  FallbackStrategy,
  HealthAwareConfig,
} from './degradation';

// ============================================
// v1.1.0 ADDITIONS
// ============================================

// Memory Summarization Strategies
export {
  createSlidingWindowSummarizer,
  createSemanticCompressionSummarizer,
  createHierarchicalSummarizer,
  createImportanceBasedSummarizer,
  createMemorySummarizer,
  DEFAULT_SUMMARIZATION_CONFIG,
} from './memory-summarization';
export type {
  SummarizationConfig,
  SummarizationResult,
  SummarizationStrategy,
  MemorySummarizer,
  MessageImportance,
} from './memory-summarization';
