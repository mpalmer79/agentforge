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
import { AgentForgeError, ToolExecutionError } from './types';
import { composeMiddleware } from './middleware';
import { generateId, estimateTokens } from './utils';

/**
 * The main Agent class for orchestrating AI interactions with tools
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

  constructor(config: AgentConfig) {
    this.provider = config.provider;
    this.tools = new Map(config.tools?.map((t) => [t.name, t]) ?? []);
    this.systemPrompt = config.systemPrompt;
    this.middleware = composeMiddleware(config.middleware ?? []);
    this.memoryConfig = config.memory;
    this.maxIterations = config.maxIterations ?? 10;
    this.temperature = config.temperature;
    this.maxTokens = config.maxTokens;
  }

  /**
   * Run the agent with a user message
   */
  async run(input: string | Message[], options?: { signal?: AbortSignal }): Promise<AgentResponse> {
    const messages = this.initializeMessages(input);
    const context = this.createContext(messages);

    let iterations = 0;
    let lastResponse: AgentResponse | null = null;

    while (iterations < this.maxIterations) {
      // Check for abort signal
      if (options?.signal?.aborted) {
        throw new AgentForgeError('Agent execution aborted', 'ABORTED');
      }

      iterations++;

      // Apply memory management
      const managedMessages = this.applyMemoryStrategy(context.messages);

      // Build completion request
      const request: CompletionRequest = {
        messages: managedMessages,
        tools: this.getToolSchemas(),
        temperature: this.temperature,
        maxTokens: this.maxTokens,
      };

      // Create middleware context
      const middlewareContext: MiddlewareContext = {
        ...context,
        messages: managedMessages,
        request,
      };

      try {
        // Run before request middleware
        const processedContext = await this.middleware.runBeforeRequest(middlewareContext);

        // Check for cache hit
        if (processedContext.metadata.__cacheHit && processedContext.metadata.__cachedResponse) {
          return {
            id: generateId('resp'),
            content: (processedContext.metadata.__cachedResponse as { content: string }).content,
            messages: context.messages,
          };
        }

        // Make the completion request
        const response = await this.provider.complete({
          ...processedContext.request,
          messages: processedContext.messages,
        });

        // Run after response middleware
        const processedResponse = await this.middleware.runAfterResponse(response, processedContext);

        // Add assistant message to context
        const assistantMessage: Message = {
          id: generateId('msg'),
          role: 'assistant',
          content: processedResponse.content,
          timestamp: Date.now(),
        };
        context.messages.push(assistantMessage);

        // If no tool calls, we're done
        if (!processedResponse.toolCalls || processedResponse.toolCalls.length === 0) {
          lastResponse = {
            id: processedResponse.id,
            content: processedResponse.content,
            messages: context.messages,
            usage: processedResponse.usage,
          };
          break;
        }

        // Execute tool calls
        const toolResults = await this.executeToolCalls(
          processedResponse.toolCalls,
          processedContext
        );

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
        }

        lastResponse = {
          id: processedResponse.id,
          content: processedResponse.content,
          messages: context.messages,
          toolResults,
          usage: processedResponse.usage,
        };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        await this.middleware.runOnError(err, middlewareContext);
        throw err;
      }
    }

    if (!lastResponse) {
      throw new AgentForgeError(
        `Agent exceeded maximum iterations (${this.maxIterations})`,
        'MAX_ITERATIONS_EXCEEDED'
      );
    }

    return lastResponse;
  }

  /**
   * Stream the agent response
   */
  async *stream(
    input: string | Message[],
    options?: { signal?: AbortSignal }
  ): AsyncIterable<{ type: 'content' | 'tool_call' | 'tool_result' | 'done'; data: unknown }> {
    const messages = this.initializeMessages(input);
    const context = this.createContext(messages);

    let iterations = 0;

    while (iterations < this.maxIterations) {
      if (options?.signal?.aborted) {
        throw new AgentForgeError('Agent execution aborted', 'ABORTED');
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

      // Add assistant message
      context.messages.push({
        id: generateId('msg'),
        role: 'assistant',
        content: fullContent,
        timestamp: Date.now(),
      });

      // If no tool calls, we're done
      if (toolCalls.length === 0) {
        yield { type: 'done', data: { content: fullContent } };
        break;
      }

      // Execute tools and yield results
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

  /**
   * Add a tool to the agent
   */
  addTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Remove a tool from the agent
   */
  removeTool(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get all registered tools
   */
  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Update the system prompt
   */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  // ============================================
  // Private Methods
  // ============================================

  private initializeMessages(input: string | Message[]): Message[] {
    const messages: Message[] = [];

    // Add system prompt if defined
    if (this.systemPrompt) {
      messages.push({
        id: generateId('msg'),
        role: 'system',
        content: this.systemPrompt,
        timestamp: Date.now(),
      });
    }

    // Add input messages
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

    let result = [...messages];

    // Apply max messages limit
    if (maxMessages && result.length > maxMessages) {
      const systemMessages = result.filter((m) => m.role === 'system');
      const otherMessages = result.filter((m) => m.role !== 'system');

      switch (strategy) {
        case 'sliding-window':
          result = [...systemMessages, ...otherMessages.slice(-maxMessages + systemMessages.length)];
          break;
        case 'trim-oldest':
          result = [...systemMessages, ...otherMessages.slice(-maxMessages + systemMessages.length)];
          break;
        case 'summarize':
          // For now, just trim (summarization would require another LLM call)
          result = [...systemMessages, ...otherMessages.slice(-maxMessages + systemMessages.length)];
          break;
      }
    }

    // Apply max tokens limit
    if (maxTokens) {
      let totalTokens = 0;
      const filteredMessages: Message[] = [];

      // Always include system messages
      const systemMessages = result.filter((m) => m.role === 'system');
      for (const msg of systemMessages) {
        totalTokens += estimateTokens(msg.content);
        filteredMessages.push(msg);
      }

      // Add messages from the end until we hit the limit
      const otherMessages = result.filter((m) => m.role !== 'system').reverse();
      for (const msg of otherMessages) {
        const msgTokens = estimateTokens(msg.content);
        if (totalTokens + msgTokens <= maxTokens) {
          totalTokens += msgTokens;
          filteredMessages.push(msg);
        } else {
          break;
        }
      }

      // Restore chronological order
      result = [
        ...filteredMessages.filter((m) => m.role === 'system'),
        ...filteredMessages.filter((m) => m.role !== 'system').reverse(),
      ];
    }

    return result;
  }

  private async executeToolCalls(
    toolCalls: ToolCall[],
    context: MiddlewareContext
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const toolCall of toolCalls) {
      // Run middleware
      const processedToolCall = await this.middleware.runOnToolCall(toolCall, context);

      const tool = this.tools.get(processedToolCall.name);

      if (!tool) {
        results.push({
          toolCallId: processedToolCall.id,
          result: null,
          error: `Tool "${processedToolCall.name}" not found`,
        });
        continue;
      }

      try {
        const result = await tool.execute(processedToolCall.arguments);
        let toolResult: ToolResult = {
          toolCallId: processedToolCall.id,
          result,
        };

        // Run result middleware
        toolResult = await this.middleware.runOnToolResult(toolResult, context);
        results.push(toolResult);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        const toolError = new ToolExecutionError(
          `Tool "${processedToolCall.name}" failed: ${err.message}`,
          processedToolCall.name,
          err
        );

        results.push({
          toolCallId: processedToolCall.id,
          result: null,
          error: toolError.message,
        });
      }
    }

    return results;
  }
}
