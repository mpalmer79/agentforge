/**
 * Together AI Provider
 *
 * Supports open-source models like Llama, Mistral, Mixtral, and more
 */

import type {
  ProviderConfig,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  Message,
} from '../types';
import { BaseProvider } from './base';

interface TogetherMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
}

interface TogetherRequest {
  model: string;
  messages: TogetherMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  repetition_penalty?: number;
  stop?: string[];
  stream?: boolean;
  response_format?: { type: 'json_object' };
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    };
  }>;
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

interface TogetherResponse {
  id: string;
  object: string;
  created: number;
  model: string;
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
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'eos';
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface TogetherStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
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
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'eos' | null;
  }>;
}

export interface TogetherProviderConfig extends ProviderConfig {
  /** Enable JSON mode for structured output */
  jsonMode?: boolean;
  /** Repetition penalty (1.0 = no penalty) */
  repetitionPenalty?: number;
}

/**
 * Together AI provider implementation
 *
 * Supports popular open-source models including:
 * - Meta Llama 3, Llama 3.1
 * - Mistral 7B, Mixtral 8x7B
 * - DeepSeek Coder
 * - Qwen 2
 * - And many more
 *
 * @example
 * ```typescript
 * const together = new TogetherProvider({
 *   apiKey: process.env.TOGETHER_API_KEY,
 *   model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
 * });
 *
 * const response = await together.complete({
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */
export class TogetherProvider extends BaseProvider {
  name = 'together';
  private jsonMode: boolean;
  private repetitionPenalty?: number;

  constructor(config: TogetherProviderConfig) {
    super(config);
    this.jsonMode = config.jsonMode ?? false;
    this.repetitionPenalty = config.repetitionPenalty;
  }

  protected getDefaultModel(): string {
    return 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo';
  }

  protected getDefaultBaseURL(): string {
    return 'https://api.together.xyz/v1';
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const body = this.buildRequestBody(request);

    const response = await this.fetch<TogetherResponse>('/chat/completions', {
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

    const toolCallsAccumulator: Map<number, { id: string; name: string; arguments: string }> =
      new Map();

    for await (const data of this.fetchStream('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    })) {
      try {
        const chunk: TogetherStreamChunk = JSON.parse(data);
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

        if (choice.finish_reason === 'tool_calls') {
          streamChunk.delta.toolCalls = Array.from(toolCallsAccumulator.values()).map((tc) => ({
            id: tc.id,
            name: tc.name,
            arguments: JSON.parse(tc.arguments || '{}'),
          }));
        }

        yield streamChunk;
      } catch {
        continue;
      }
    }
  }

  private buildRequestBody(request: CompletionRequest): TogetherRequest {
    const body: TogetherRequest = {
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

    if (this.repetitionPenalty !== undefined) {
      body.repetition_penalty = this.repetitionPenalty;
    }

    if (this.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    return body;
  }

  private convertMessages(messages: Message[]): TogetherMessage[] {
    return messages.map((msg) => {
      const togetherMsg: TogetherMessage = {
        role: msg.role,
        content: msg.content,
      };

      if (msg.role === 'tool' && msg.metadata?.toolCallId) {
        togetherMsg.tool_call_id = msg.metadata.toolCallId as string;
      }

      return togetherMsg;
    });
  }

  private parseResponse(response: TogetherResponse): CompletionResponse {
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

  private mapFinishReason(reason: string | null): CompletionResponse['finishReason'] {
    switch (reason) {
      case 'stop':
      case 'eos':
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

/**
 * Popular Together AI models
 */
export const TOGETHER_MODELS = {
  // Meta Llama
  'llama-3.1-405b': 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
  'llama-3.1-70b': 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
  'llama-3.1-8b': 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  'llama-3-70b': 'meta-llama/Llama-3-70b-chat-hf',
  'llama-3-8b': 'meta-llama/Llama-3-8b-chat-hf',

  // Mistral
  'mixtral-8x22b': 'mistralai/Mixtral-8x22B-Instruct-v0.1',
  'mixtral-8x7b': 'mistralai/Mixtral-8x7B-Instruct-v0.1',
  'mistral-7b': 'mistralai/Mistral-7B-Instruct-v0.3',

  // DeepSeek
  'deepseek-coder-33b': 'deepseek-ai/deepseek-coder-33b-instruct',

  // Qwen
  'qwen-2-72b': 'Qwen/Qwen2-72B-Instruct',

  // Code models
  'codellama-70b': 'codellama/CodeLlama-70b-Instruct-hf',
  'codellama-34b': 'codellama/CodeLlama-34b-Instruct-hf',
} as const;
