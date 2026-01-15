import type {
  ProviderConfig,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  Message,
  ToolSchema,
} from '../types';
import { BaseProvider } from './base';
import { generateId } from '../utils';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicStreamEvent {
  type: string;
  index?: number;
  content_block?: AnthropicContentBlock;
  delta?: {
    type: string;
    text?: string;
    partial_json?: string;
  };
  message?: AnthropicResponse;
}

export interface AnthropicProviderConfig extends ProviderConfig {
  anthropicVersion?: string;
}

/**
 * Anthropic Claude provider implementation
 */
export class AnthropicProvider extends BaseProvider {
  name = 'anthropic';
  private anthropicVersion: string;

  constructor(config: AnthropicProviderConfig) {
    super(config);
    this.anthropicVersion = config.anthropicVersion ?? '2023-06-01';
  }

  protected getDefaultModel(): string {
    return 'claude-3-5-sonnet-20241022';
  }

  protected getDefaultBaseURL(): string {
    return 'https://api.anthropic.com';
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'x-api-key': this.apiKey,
      'anthropic-version': this.anthropicVersion,
    };
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const body = this.buildRequestBody(request);
    const response = await this.fetch<AnthropicResponse>('/v1/messages', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return this.parseResponse(response);
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const body = {
      ...this.buildRequestBody(request),
      stream: true,
    };

    const currentId = generateId('stream');
    let _currentContent = '';
    const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
    let currentToolIndex = -1;

    for await (const data of this.fetchStream('/v1/messages', {
      method: 'POST',
      body: JSON.stringify(body),
    })) {
      try {
        const event: AnthropicStreamEvent = JSON.parse(data);

        switch (event.type) {
          case 'content_block_start': {
            if (event.content_block?.type === 'tool_use') {
              currentToolIndex++;
              toolCalls[currentToolIndex] = {
                id: event.content_block.id ?? generateId('tool'),
                name: event.content_block.name ?? '',
                arguments: '',
              };
            }
            break;
          }

          case 'content_block_delta': {
            if (event.delta?.type === 'text_delta' && event.delta.text) {
              _currentContent += event.delta.text;
              yield {
                id: currentId,
                delta: { content: event.delta.text },
              };
            } else if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
              if (currentToolIndex >= 0) {
                toolCalls[currentToolIndex].arguments += event.delta.partial_json;
              }
            }
            break;
          }

          case 'message_stop': {
            const finishReason = toolCalls.length > 0 ? 'tool_calls' : 'stop';
            yield {
              id: currentId,
              delta: {
                toolCalls:
                  toolCalls.length > 0
                    ? toolCalls.map((tc) => ({
                        id: tc.id,
                        name: tc.name,
                        arguments: JSON.parse(tc.arguments || '{}'),
                      }))
                    : undefined,
              },
              finishReason,
            };
            break;
          }
        }
      } catch {
        // Skip invalid events
        continue;
      }
    }
  }

  private buildRequestBody(request: CompletionRequest): Record<string, unknown> {
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const otherMessages = request.messages.filter((m) => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: this.model,
      messages: this.convertMessages(otherMessages),
      max_tokens: request.maxTokens ?? 4096,
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = this.convertTools(request.tools);
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    return body;
  }

  private convertMessages(messages: Message[]): AnthropicMessage[] {
    const result: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        result.push({
          role: 'user',
          content: msg.content,
        });
      } else if (msg.role === 'assistant') {
        result.push({
          role: 'assistant',
          content: msg.content,
        });
      } else if (msg.role === 'tool') {
        // Tool results need to be part of a user message
        const toolResult: AnthropicContentBlock = {
          type: 'tool_result',
          tool_use_id: msg.metadata?.toolCallId as string,
          content: msg.content,
        };

        // Check if last message is a user message we can append to
        const lastMsg = result[result.length - 1];
        if (lastMsg?.role === 'user' && Array.isArray(lastMsg.content)) {
          lastMsg.content.push(toolResult);
        } else {
          result.push({
            role: 'user',
            content: [toolResult],
          });
        }
      }
    }

    return result;
  }

  private convertTools(tools: ToolSchema[]): AnthropicTool[] {
    return tools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters,
    }));
  }

  private parseResponse(response: AnthropicResponse): CompletionResponse {
    let textContent = '';
    const toolCalls: CompletionResponse['toolCalls'] = [];

    for (const block of response.content) {
      if (block.type === 'text' && block.text) {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id ?? generateId('tool'),
          name: block.name ?? '',
          arguments: block.input ?? {},
        });
      }
    }

    return {
      id: response.id,
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      finishReason: this.mapFinishReason(response.stop_reason),
    };
  }

  private mapFinishReason(
    reason: AnthropicResponse['stop_reason']
  ): CompletionResponse['finishReason'] {
    switch (reason) {
      case 'end_turn':
      case 'stop_sequence':
        return 'stop';
      case 'tool_use':
        return 'tool_calls';
      case 'max_tokens':
        return 'length';
      default:
        return 'stop';
    }
  }
}
