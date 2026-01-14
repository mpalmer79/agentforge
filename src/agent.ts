import type {
  AgentConfig,
  AgentContext,
  AgentResponse,
  CompletionRequest,
  Message,
  Tool,
  ToolCall,
  ToolResult,
  MiddlewareContext,
} from './types';
import { AgentForgeError, ToolExecutionError } from './errors';
import { composeMiddleware } from './middleware';
import { generateId } from './utils';
import { getTelemetry, TelemetryCollector } from './telemetry';
import { CircuitBreaker, RequestDeduplicator, Bulkhead, retryWithBackoff, withTimeout } from './resilience';
import { getTokenCounter, calculateBudget, truncateToTokens } from './tokenizer';
import { sanitizeCompletionResponse, validateCompletionResponse } from './schema';
import { ConversationManager } from './persistence';

// ============================================
// Extended Configuration Types
// ============================================

export interface ExtendedAgentConfig extends AgentConfig {
  /** Enable circuit breaker for provider calls */
  circuitBreaker?: {
    enabled?: boolean;
    failureThreshold?: number;
    resetTimeoutMs?: number;
  };
  /** Enable request deduplication */
  deduplication?: {
    enabled?: boolean;
    ttlMs?: number;
  };
  /** Concurrency limits */
  concurrency?: {
    maxConcurrent?: number;
    maxQueue?: number;
  };
  /** Timeout settings */
  timeouts?: {
    requestMs?: number;
    toolExecutionMs?: number;
  };
  /** Conversation persistence */
  persistence?: {
    manager?: ConversationManager;
    autoSave?: boolean;
  };
  /** Custom telemetry collector */
  telemetry?: TelemetryCollector;
  /** Validate provider responses */
  validateResponses?: boolean;
  /** Token budget management */
  tokenBudget?: {
    /** Reserve tokens for response */
    reserveForResponse?: number;
    /** Auto-truncate if over budget */
    autoTruncate?: boolean;
  };
}

/**
 * The main Agent class for orchestrating AI interactions with tools.
 * 
 * Staff-level features:
 * - Circuit breaker for fault tolerance
 * - Request deduplication
 * - Concurrency control via bulkhead
 * - Distributed tracing/telemetry
 * - Proper tokenization
 * - Response validation
 * - Conversation persistence
 */
export class Agent {
  private provider: AgentConfig['provider'];
  private tools: Map<string, Tool>;
  private systemPrompt?: string;
  private middleware: ReturnType<typeof composeMiddleware>;
  private memoryConfig: AgentConfig['memory'];
  private maxIterations: number;
  private temperature?: number;
  private maxTokens?: number;
  
  // Staff-level additions
  private circuitBreaker?: CircuitBreaker;
  private deduplicator?: RequestDeduplicator<AgentResponse>;
  private bulkhead?: Bulkhead;
  private telemetry: TelemetryCollector;
  private persistence?: ConversationManager;
  private validateResponses: boolean;
  private requestTimeoutMs: number;
  private toolTimeoutMs: number;
  private tokenBudgetConfig: ExtendedAgentConfig['tokenBudget'];

  constructor(config: ExtendedAgentConfig) {
    this.provider = config.provider;
    this.tools = new Map(config.tools?.map((t) => [t.name, t]) ?? []);
    this.systemPrompt = config.systemPrompt;
    this.middleware = composeMiddleware(config.middleware ?? []);
    this.memoryConfig = config.memory;
    this.maxIterations = config.maxIterations ?? 10;
    this.temperature = config.temperature;
    this.maxTokens = config.maxTokens;
    
    // Initialize telemetry
    this.telemetry = config.telemetry ?? getTelemetry();
    
    // Initialize circuit breaker
    if (config.circuitBreaker?.enabled !== false) {
      this.circuitBreaker = new CircuitBreaker({
        failureThreshold: config.circuitBreaker?.failureThreshold ?? 5,
        resetTimeoutMs: config.circuitBreaker?.resetTimeoutMs ?? 30000,
        onStateChange: (from, to) => {
          this.telemetry.info('Circuit breaker state change', { from, to, provider: this.provider.name });
        },
      });
    }
    
    // Initialize deduplication
    if (config.deduplication?.enabled !== false) {
      this.deduplicator = new RequestDeduplicator(config.deduplication?.ttlMs ?? 5000);
    }
    
    // Initialize bulkhead
    if (config.concurrency) {
      this.bulkhead = new Bulkhead(
        config.concurrency.maxConcurrent ?? 10,
        config.concurrency.maxQueue ?? 100
      );
    }
    
    // Initialize persistence
    this.persistence = config.persistence?.manager;
    
    // Other settings
    this.validateResponses = config.validateResponses ?? true;
    this.requestTimeoutMs = config.timeouts?.requestMs ?? 60000;
    this.toolTimeoutMs = config.timeouts?.toolExecutionMs ?? 30000;
    this.tokenBudgetConfig = config.tokenBudget;
  }

  async run(input: string | Message[], options?: { signal?: AbortSignal }): Promise<AgentResponse> {
    // Start trace for this agent run
    const traceId = this.telemetry.startTrace({
      provider: this.provider.name,
      toolCount: this.tools.size,
      maxIterations: this.maxIterations,
    });
    
    const runSpanId = this.telemetry.startSpan(traceId, 'agent.run', {
      inputType: typeof input === 'string' ? 'string' : 'messages',
    });

    try {
      // Check for deduplication opportunity
      if (this.deduplicator && typeof input === 'string') {
        const dedupKey = RequestDeduplicator.generateKey({
          input,
          systemPrompt: this.systemPrompt,
          tools: Array.from(this.tools.keys()),
          temperature: this.temperature,
        });
        
        return await this.deduplicator.execute(dedupKey, () => 
          this.executeRun(input, options, traceId)
        );
      }
      
      return await this.executeRun(input, options, traceId);
      
    } catch (error) {
      this.telemetry.endSpan(runSpanId, 'error', { 
        errorMessage: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    } finally {
      this.telemetry.endSpan(runSpanId, 'ok');
      this.telemetry.endTrace(traceId);
    }
  }

  private async executeRun(
    input: string | Message[],
    options?: { signal?: AbortSignal },
    traceId?: string
  ): Promise<AgentResponse> {
    const messages = this.initializeMessages(input);
    const context = this.createContext(messages);

    // Record to persistence if enabled
    if (this.persistence) {
      this.persistence.addMessages(messages);
    }

    let iterations = 0;
    let allToolResults: ToolResult[] = [];

    while (iterations < this.maxIterations) {
      if (options?.signal?.aborted) {
        throw new AgentForgeError('Agent execution aborted', 'AGENT_ABORTED');
      }

      iterations++;
      
      const iterationSpanId = traceId 
        ? this.telemetry.startSpan(traceId, `agent.iteration.${iterations}`)
        : '';

      const managedMessages = this.applyMemoryStrategy(context.messages);
      
      // Check token budget
      if (this.tokenBudgetConfig) {
        const budget = calculateBudget(
          this.provider.name,
          managedMessages.map(m => ({ role: m.role, content: m.content })),
          this.tokenBudgetConfig.reserveForResponse ?? 1000
        );
        
        this.telemetry.recordMetric('agent.token_budget.used', budget.used, 'tokens');
        this.telemetry.recordMetric('agent.token_budget.remaining', budget.remaining, 'tokens');
        
        if (budget.remaining < 0 && this.tokenBudgetConfig.autoTruncate) {
          this.telemetry.warn('Token budget exceeded, truncating messages', { budget });
          // Truncate older messages (this is handled by memory strategy)
        }
      }

      const request: CompletionRequest = {
        messages: managedMessages,
        tools: this.getToolSchemas(),
        temperature: this.temperature,
        maxTokens: this.maxTokens,
      };

      const middlewareContext: MiddlewareContext = {
        ...context,
        messages: managedMessages,
        request,
      };

      try {
        const processedContext = await this.middleware.runBeforeRequest(middlewareContext);

        if (processedContext.metadata.__cacheHit && processedContext.metadata.__cachedResponse) {
          this.telemetry.incrementCounter('agent.cache.hit');
          return {
            id: generateId('resp'),
            content: (processedContext.metadata.__cachedResponse as { content: string }).content,
            messages: context.messages,
          };
        }

        // Execute provider call with circuit breaker, bulkhead, retry, and timeout
        const response = await this.executeProviderCall(processedContext, traceId);

        // Validate and sanitize response
        const validatedResponse = this.validateResponses
          ? sanitizeCompletionResponse(response)
          : response;

        const processedResponse = await this.middleware.runAfterResponse(validatedResponse, processedContext);

        // Track token usage
        if (processedResponse.usage) {
          this.telemetry.recordTokens('agent.tokens.prompt', processedResponse.usage.promptTokens);
          this.telemetry.recordTokens('agent.tokens.completion', processedResponse.usage.completionTokens);
          
          if (this.persistence) {
            this.persistence.updateTokenCount(processedResponse.usage.totalTokens);
          }
        }

        const assistantMessage: Message = {
          id: generateId('msg'),
          role: 'assistant',
          content: processedResponse.content,
          timestamp: Date.now(),
        };
        context.messages.push(assistantMessage);
        
        if (this.persistence) {
          this.persistence.addMessage(assistantMessage);
        }

        // No tool calls - we're done
        if (!processedResponse.toolCalls || processedResponse.toolCalls.length === 0) {
          if (iterationSpanId) this.telemetry.endSpan(iterationSpanId, 'ok');
          
          return {
            id: processedResponse.id,
            content: processedResponse.content,
            messages: context.messages,
            toolResults: allToolResults.length > 0 ? allToolResults : undefined,
            usage: processedResponse.usage,
          };
        }

        // Execute tool calls
        const toolResults = await this.executeToolCalls(
          processedResponse.toolCalls,
          processedContext,
          traceId
        );

        allToolResults = [...allToolResults, ...toolResults];
        
        if (this.persistence) {
          this.persistence.recordToolResults(toolResults);
        }

        // Add tool results to messages
        for (const result of toolResults) {
          const toolMessage: Message = {
            id: generateId('msg'),
            role: 'tool',
            content: result.error ?? JSON.stringify(result.result),
            timestamp: Date.now(),
            metadata: {
              toolCallId: result.toolCallId,
            },
          };
          context.messages.push(toolMessage);
          
          if (this.persistence) {
            this.persistence.addMessage(toolMessage);
          }
        }

        if (iterationSpanId) this.telemetry.endSpan(iterationSpanId, 'ok');

      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        await this.middleware.runOnError(err, middlewareContext);
        
        if (iterationSpanId) this.telemetry.endSpan(iterationSpanId, 'error');
        
        throw err;
      }
    }

    // Exceeded max iterations
    this.telemetry.incrementCounter('agent.max_iterations_exceeded');
    throw new AgentForgeError(
      `Agent exceeded maximum iterations (${this.maxIterations})`,
      'AGENT_MAX_ITERATIONS'
    );
  }

  /**
   * Execute provider call with all resilience patterns
   */
  private async executeProviderCall(
    context: MiddlewareContext,
    traceId?: string
  ): Promise<any> {
    const spanId = traceId 
      ? this.telemetry.startSpan(traceId, 'provider.complete', { provider: this.provider.name })
      : '';
    
    const startTime = Date.now();
    
    const executeCall = async () => {
      this.telemetry.trackProviderRequest(this.provider.name, context.request);
      
      const response = await withTimeout(
        this.provider.complete({
          ...context.request,
          messages: context.messages,
        }),
        this.requestTimeoutMs,
        `Provider ${this.provider.name} request timed out`
      );
      
      const duration = Date.now() - startTime;
      this.telemetry.trackProviderResponse(this.provider.name, response, duration);
      
      return response;
    };

    try {
      // Apply bulkhead if configured
      let callFn = executeCall;
      if (this.bulkhead) {
        callFn = () => this.bulkhead!.execute(executeCall);
      }

      // Apply circuit breaker if configured
      if (this.circuitBreaker) {
        callFn = ((originalFn) => () => this.circuitBreaker!.execute(originalFn))(callFn);
      }

      // Apply retry with backoff
      const response = await retryWithBackoff(callFn, {
        maxRetries: 3,
        baseDelayMs: 1000,
        onRetry: (error, attempt, delay) => {
          this.telemetry.warn('Retrying provider call', {
            provider: this.provider.name,
            attempt,
            delay,
            error: error.message,
          });
        },
      });

      if (spanId) this.telemetry.endSpan(spanId, 'ok');
      return response;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.telemetry.trackProviderError(
        this.provider.name, 
        error instanceof Error ? error : new Error(String(error)),
        duration
      );
      
      if (spanId) this.telemetry.endSpan(spanId, 'error');
      throw error;
    }
  }

  async *stream(
    input: string | Message[],
    options?: { signal?: AbortSignal }
  ): AsyncIterable<{ type: 'content' | 'tool_call' | 'tool_result' | 'done'; data: unknown }> {
    const messages = this.initializeMessages(input);
    const context = this.createContext(messages);

    let iterations = 0;

    while (iterations < this.maxIterations) {
      if (options?.signal?.aborted) {
        throw new AgentForgeError('Agent execution aborted', 'AGENT_ABORTED');
      }

      iterations++;

      const managedMessages = this.applyMemoryStrategy(context.messages);

      const request: CompletionRequest = {
        messages: managedMessages,
        tools: this.getToolSchemas(),
        temperature: this.temperature,
        maxTokens: this.maxTokens,
        stream: true,
      };

      const middlewareContext: MiddlewareContext = {
        ...context,
        messages: managedMessages,
        request,
      };

      const processedContext = await this.middleware.runBeforeRequest(middlewareContext);

      let fullContent = '';
      const toolCalls: ToolCall[] = [];

      for await (const chunk of this.provider.stream({
        ...processedContext.request,
        messages: processedContext.messages,
      })) {
        if (chunk.delta.content) {
          fullContent += chunk.delta.content;
          yield { type: 'content', data: chunk.delta.content };
        }

        if (chunk.delta.toolCalls) {
          for (const tc of chunk.delta.toolCalls) {
            if (tc.id && tc.name) {
              toolCalls.push(tc as ToolCall);
              yield { type: 'tool_call', data: tc };
            }
          }
        }

        if (chunk.finishReason === 'stop' || chunk.finishReason === 'tool_calls') {
          break;
        }
      }

      context.messages.push({
        id: generateId('msg'),
        role: 'assistant',
        content: fullContent,
        timestamp: Date.now(),
      });

      if (toolCalls.length === 0) {
        yield { type: 'done', data: { content: fullContent } };
        break;
      }

      const toolResults = await this.executeToolCalls(toolCalls, processedContext);

      for (const result of toolResults) {
        yield { type: 'tool_result', data: result };

        context.messages.push({
          id: generateId('msg'),
          role: 'tool',
          content: result.error ?? JSON.stringify(result.result),
          timestamp: Date.now(),
          metadata: { toolCallId: result.toolCallId },
        });
      }
    }
  }

  addTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  removeTool(name: string): boolean {
    return this.tools.delete(name);
  }

  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  private initializeMessages(input: string | Message[]): Message[] {
    const messages: Message[] = [];

    if (this.systemPrompt) {
      messages.push({
        id: generateId('msg'),
        role: 'system',
        content: this.systemPrompt,
        timestamp: Date.now(),
      });
    }

    if (typeof input === 'string') {
      messages.push({
        id: generateId('msg'),
        role: 'user',
        content: input,
        timestamp: Date.now(),
      });
    } else {
      messages.push(...input);
    }

    return messages;
  }

  private createContext(messages: Message[]): AgentContext {
    return {
      messages,
      tools: Array.from(this.tools.values()),
      systemPrompt: this.systemPrompt,
      metadata: {},
    };
  }

  private getToolSchemas() {
    return Array.from(this.tools.values()).map((t) => t.toJSON());
  }

  private applyMemoryStrategy(messages: Message[]): Message[] {
    if (!this.memoryConfig) return messages;

    const { maxMessages, maxTokens, strategy = 'sliding-window' } = this.memoryConfig;
    const tokenCounter = getTokenCounter(this.provider.name);

    let result = [...messages];

    if (maxMessages && result.length > maxMessages) {
      const systemMessages = result.filter((m) => m.role === 'system');
      const otherMessages = result.filter((m) => m.role !== 'system');
      const availableSlots = maxMessages - systemMessages.length;

      switch (strategy) {
        case 'sliding-window':
          // Keep most recent messages (sliding window)
          result = [...systemMessages, ...otherMessages.slice(-availableSlots)];
          break;

        case 'trim-oldest':
          // Remove oldest user/assistant pairs first, keeping tool messages with their context
          const trimmed: Message[] = [];
          let kept = 0;
          // Iterate from newest to oldest
          for (let i = otherMessages.length - 1; i >= 0 && kept < availableSlots; i--) {
            trimmed.unshift(otherMessages[i]);
            kept++;
          }
          result = [...systemMessages, ...trimmed];
          break;

        case 'summarize':
          // For summarize strategy: keep first message, last N-1 messages
          // The idea is the first user message often contains important context
          // A real implementation would call the LLM to summarize older messages
          if (otherMessages.length > 0 && availableSlots > 1) {
            const firstMessage = otherMessages[0];
            const recentMessages = otherMessages.slice(-(availableSlots - 1));
            // Avoid duplicating if first message is in recent
            if (recentMessages[0]?.id !== firstMessage.id) {
              result = [...systemMessages, firstMessage, ...recentMessages];
            } else {
              result = [...systemMessages, ...recentMessages];
            }
          } else {
            result = [...systemMessages, ...otherMessages.slice(-availableSlots)];
          }
          break;

        default:
          result = [...systemMessages, ...otherMessages.slice(-availableSlots)];
      }
    }

    if (maxTokens) {
      let totalTokens = 0;
      const filteredMessages: Message[] = [];

      // Always include system messages first
      const systemMessages = result.filter((m) => m.role === 'system');
      for (const msg of systemMessages) {
        totalTokens += tokenCounter.count(msg.content);
        filteredMessages.push(msg);
      }

      // Add other messages from newest to oldest until we hit the token limit
      const otherMessages = result.filter((m) => m.role !== 'system').reverse();
      for (const msg of otherMessages) {
        const msgTokens = tokenCounter.count(msg.content);
        if (totalTokens + msgTokens <= maxTokens) {
          totalTokens += msgTokens;
          filteredMessages.push(msg);
        } else {
          break;
        }
      }

      result = [
        ...filteredMessages.filter((m) => m.role === 'system'),
        ...filteredMessages.filter((m) => m.role !== 'system').reverse(),
      ];
      
      this.telemetry.recordMetric('agent.memory.tokens_used', totalTokens, 'tokens');
    }

    this.telemetry.recordMetric('agent.memory.message_count', result.length, 'count');
    return result;
  }

  private async executeToolCalls(
    toolCalls: ToolCall[],
    context: MiddlewareContext,
    traceId?: string
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    // Execute tool calls with controlled concurrency
    const executeToolCall = async (toolCall: ToolCall): Promise<ToolResult> => {
      const spanId = traceId 
        ? this.telemetry.startSpan(traceId, `tool.${toolCall.name}`, {
            toolCallId: toolCall.id,
            arguments: toolCall.arguments,
          })
        : '';
      
      const startTime = Date.now();
      this.telemetry.trackToolStart(toolCall.name, toolCall.arguments);

      const processedToolCall = await this.middleware.runOnToolCall(toolCall, context);
      const tool = this.tools.get(processedToolCall.name);

      if (!tool) {
        const result: ToolResult = {
          toolCallId: processedToolCall.id,
          result: null,
          error: `Tool "${processedToolCall.name}" not found`,
        };
        
        this.telemetry.trackToolEnd(processedToolCall.name, result, Date.now() - startTime);
        if (spanId) this.telemetry.endSpan(spanId, 'error', { error: 'Tool not found' });
        
        return result;
      }

      try {
        // Execute tool with timeout
        const result = await withTimeout(
          tool.execute(processedToolCall.arguments),
          this.toolTimeoutMs,
          `Tool "${processedToolCall.name}" timed out`
        );
        
        let toolResult: ToolResult = {
          toolCallId: processedToolCall.id,
          result,
        };

        toolResult = await this.middleware.runOnToolResult(toolResult, context);
        
        const duration = Date.now() - startTime;
        this.telemetry.trackToolEnd(processedToolCall.name, toolResult, duration);
        if (spanId) this.telemetry.endSpan(spanId, 'ok', { duration });
        
        return toolResult;
        
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        const toolError = new ToolExecutionError(
          `Tool "${processedToolCall.name}" failed: ${err.message}`,
          processedToolCall.name,
          { cause: err }
        );

        const result: ToolResult = {
          toolCallId: processedToolCall.id,
          result: null,
          error: toolError.message,
        };
        
        const duration = Date.now() - startTime;
        this.telemetry.trackToolEnd(processedToolCall.name, result, duration);
        if (spanId) this.telemetry.endSpan(spanId, 'error', { error: err.message, duration });
        
        return result;
      }
    };

    // Execute all tool calls (could be parallelized with bulkhead control)
    for (const toolCall of toolCalls) {
      const result = await executeToolCall(toolCall);
      results.push(result);
    }

    return results;
  }

  // ---- Public API ----

  /**
   * Get agent health status including circuit breaker and bulkhead stats
   */
  getHealth(): {
    circuitBreaker?: { state: string; failures: number };
    bulkhead?: { running: number; queued: number; maxConcurrent: number };
    deduplicator?: { pending: number };
  } {
    return {
      circuitBreaker: this.circuitBreaker?.getStats(),
      bulkhead: this.bulkhead?.getStats(),
      deduplicator: this.deduplicator ? { pending: this.deduplicator.getPendingCount() } : undefined,
    };
  }

  /**
   * Reset circuit breaker if in open state
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker?.reset();
  }
}
