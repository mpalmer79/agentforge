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

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

interface OpenAIResponse {
  id: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIStreamChunk {
  id: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter' | null;
  }>;
}

export interface OpenAIProviderConfig extends ProviderConfig {
  organization?: string;
}

/**
 * OpenAI provider implementation
 */
export class OpenAIProvider extends BaseProvider {
  name = 'openai';
  private organization?: string;

  constructor(config: OpenAIProviderConfig) {
    super(config);
    this.organization = config.organization;
  }

  protected getDefaultModel(): string {
    return 'gpt-4-turbo';
  }

  protected getDefaultBaseURL(): string {
    return 'https://api.openai.com/v1';
  }

  protected getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
    };

    if (this.organization) {
      headers['OpenAI-Organization'] = this.organization;
    }

    return headers;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const body = this.buildRequestBody(request);

    const response = await this.fetch<OpenAIResponse>('/chat/completions', {
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

    const toolCallsAccumulator: Map
      number,
      { id: string; name: string; arguments: string }
    > = new Map();

    for await (const data of this.fetchStream('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    })) {
      try {
        const chunk: OpenAIStreamChunk = JSON.parse(data);
        const choice = chunk.choices[0];

        if (!choice) continue;

        const streamChunk: StreamChunk = {
          id: chunk.id,
          delta: {},
          finishReason: this.mapFinishReason(choice.finish_reason),
        };

        if (choice.delta.content) {
          streamChunk.delta.content = choice.delta.content;
        }

        if (choice.delta.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            const existing = toolCallsAccumulator.get(tc.index) ?? {
              id: '',
              name: '',
              arguments: '',
            };

            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name = tc.function.name;
            if (tc.function?.arguments) existing.arguments += tc.function.arguments;

            toolCallsAccumulator.set(tc.index, existing);
          }
        }

        // If finished, emit accumulated tool calls
        if (choice.finish_reason === 'tool_calls') {
          streamChunk.delta.toolCalls = Array.from(toolCallsAccumulator.values()).map(
            (tc) => ({
              id: tc.id,
              name: tc.name,
              arguments: JSON.parse(tc.arguments || '{}'),
            })
          );
        }

        yield streamChunk;
      } catch {
        // Skip invalid JSON chunks
        continue;
      }
    }
  }

  private buildRequestBody(request: CompletionRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: this.convertMessages(request.messages),
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
      body.tool_choice = 'auto';
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (request.maxTokens !== undefined) {
      body.max_tokens = request.maxTokens;
    }

    return body;
  }

  private convertMessages(messages: Message[]): OpenAIMessage[] {
    return messages.map((msg) => {
      const openAIMsg: OpenAIMessage = {
        role: msg.role,
        content: msg.content,
      };

      if (msg.role === 'tool' && msg.metadata?.toolCallId) {
        openAIMsg.tool_call_id = msg.metadata.toolCallId as string;
      }

      return openAIMsg;
    });
  }

  private parseResponse(response: OpenAIResponse): CompletionResponse {
    const choice = response.choices[0];

    if (!choice) {
      throw new Error('No response choices returned');
    }

    const result: CompletionResponse = {
      id: response.id,
      content: choice.message.content ?? '',
      finishReason: this.mapFinishReason(choice.finish_reason),
    };

    if (choice.message.tool_calls) {
      result.toolCalls = choice.message.tool_calls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      }));
    }

    if (response.usage) {
      result.usage = {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      };
    }

    return result;
  }

  private mapFinishReason(
    reason: string | null
  ): CompletionResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'tool_calls':
        return 'tool_calls';
      case 'length':
        return 'length';
      default:
        return 'stop';
    }
  }
}
