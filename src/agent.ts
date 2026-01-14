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
import { generateId, estimateTokens } from './utils';

/**
 * The main Agent class for orchestrating AI interactions with tools.
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

  async run(input: string | Message[], options?: { signal?: AbortSignal }): Promise<AgentResponse> {
    const messages = this.initializeMessages(input);
    const context = this.createContext(messages);

    let iterations = 0;
    let allToolResults: ToolResult[] = [];

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
      };

      const middlewareContext: MiddlewareContext = {
        ...context,
        messages: managedMessages,
        request,
      };

      try {
        const processedContext = await this.middleware.runBeforeRequest(middlewareContext);

        if (processedContext.metadata.__cacheHit && processedContext.metadata.__cachedResponse) {
          return {
            id: generateId('resp'),
            content: (processedContext.metadata.__cachedResponse as { content: string }).content,
            messages: context.messages,
          };
        }

        const response = await this.provider.complete({
          ...processedContext.request,
          messages: processedContext.messages,
        });

        const processedResponse = await this.middleware.runAfterResponse(response, processedContext);

        const assistantMessage: Message = {
          id: generateId('msg'),
          role: 'assistant',
          content: processedResponse.content,
          timestamp: Date.now(),
        };
        context.messages.push(assistantMessage);

        // No tool calls - we're done
        if (!processedResponse.toolCalls || processedResponse.toolCalls.length === 0) {
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
          processedContext
        );

        allToolResults = [...allToolResults, ...toolResults];

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

        // Continue loop to get next response after tool execution

      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        await this.middleware.runOnError(err, middlewareContext);
        throw err;
      }
    }

    // Exceeded max iterations
    throw new AgentForgeError(
      `Agent exceeded maximum iterations (${this.maxIterations})`,
      'AGENT_MAX_ITERATIONS'
    );
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
        totalTokens += estimateTokens(msg.content);
        filteredMessages.push(msg);
      }

      // Add other messages from newest to oldest until we hit the token limit
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

        toolResult = await this.middleware.runOnToolResult(toolResult, context);
        results.push(toolResult);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        const toolError = new ToolExecutionError(
          `Tool "${processedToolCall.name}" failed: ${err.message}`,
          processedToolCall.name,
          { cause: err }
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
