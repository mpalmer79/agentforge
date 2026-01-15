/**
 * Cohere Provider
 *
 * Supports Command, Command-R, and Command-R+ models
 */

import type {
  ProviderConfig,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  Message,
} from '../types';
import { BaseProvider } from './base';

interface CohereMessage {
  role: 'USER' | 'CHATBOT' | 'SYSTEM' | 'TOOL';
  message: string;
  tool_results?: Array<{
    call: { name: string; parameters: Record<string, unknown> };
    outputs: Array<Record<string, unknown>>;
  }>;
}

interface CohereRequest {
  message: string;
  model: string;
  preamble?: string;
  chat_history?: CohereMessage[];
  tools?: Array<{
    name: string;
    description: string;
    parameter_definitions: Record<
      string,
      {
        type: string;
        description?: string;
        required?: boolean;
      }
    >;
  }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface CohereResponse {
  response_id: string;
  text: string;
  generation_id: string;
  finish_reason: 'COMPLETE' | 'MAX_TOKENS' | 'ERROR' | 'ERROR_TOXIC' | 'ERROR_LIMIT';
  tool_calls?: Array<{
    name: string;
    parameters: Record<string, unknown>;
  }>;
  meta?: {
    tokens?: {
      input_tokens: number;
      output_tokens: number;
    };
    billed_units?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

interface CohereStreamEvent {
  event_type:
    | 'stream-start'
    | 'text-generation'
    | 'tool-calls-chunk'
    | 'tool-calls-generation'
    | 'stream-end';
  text?: string;
  response?: CohereResponse;
  tool_calls?: Array<{
    name: string;
    parameters: Record<string, unknown>;
  }>;
  finish_reason?: string;
}

export interface CohereProviderConfig extends ProviderConfig {
  /** Cohere API version */
  apiVersion?: string;
}

/**
 * Cohere provider implementation
 *
 * @example
 * ```typescript
 * const cohere = new CohereProvider({
 *   apiKey: process.env.COHERE_API_KEY,
 *   model: 'command-r-plus',
 * });
 *
 * const response = await cohere.complete({
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */
export class CohereProvider extends BaseProvider {
  name = 'cohere';
  private apiVersion: string;

  constructor(config: CohereProviderConfig) {
    super(config);
    this.apiVersion = config.apiVersion ?? '2024-01-01';
  }

  protected getDefaultModel(): string {
    return 'command-r-plus';
  }

  protected getDefaultBaseURL(): string {
    return 'https://api.cohere.ai/v1';
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'X-Client-Name': 'agentforge',
      'X-API-Version': this.apiVersion,
    };
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const body = this.buildRequestBody(request);
    const response = await this.fetch<CohereResponse>('/chat', {
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

    let _accumulatedText = '';
    let toolCalls: Array<{ name: string; parameters: Record<string, unknown> }> = [];

    for await (const data of this.fetchStreamCohere('/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    })) {
      try {
        const event: CohereStreamEvent = JSON.parse(data);

        const streamChunk: StreamChunk = {
          id: `cohere-${Date.now()}`,
          delta: {},
        };

        switch (event.event_type) {
          case 'text-generation':
            if (event.text) {
              streamChunk.delta.content = event.text;
              _accumulatedText += event.text;
            }
            break;

          case 'tool-calls-generation':
            if (event.tool_calls) {
              toolCalls = event.tool_calls;
              streamChunk.delta.toolCalls = toolCalls.map((tc, idx) => ({
                id: `call-${Date.now()}-${idx}`,
                name: tc.name,
                arguments: tc.parameters,
              }));
              streamChunk.finishReason = 'tool_calls';
            }
            break;

          case 'stream-end':
            streamChunk.finishReason = this.mapFinishReason(event.finish_reason);
            break;
        }

        yield streamChunk;
      } catch {
        continue;
      }
    }
  }

  /**
   * Cohere uses NDJSON streaming
   */
  private async *fetchStreamCohere(endpoint: string, options: RequestInit): AsyncIterable<string> {
    const url = `${this.baseURL}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Cohere API error: ${response.status} - ${errorBody}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // NDJSON - each line is a complete JSON object
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            yield trimmed;
          }
        }
      }

      if (buffer.trim()) {
        yield buffer.trim();
      }
    } finally {
      reader.releaseLock();
    }
  }

  private buildRequestBody(request: CompletionRequest): CohereRequest {
    const messages = request.messages;
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');

    const body: CohereRequest = {
      message: lastUserMessage?.content ?? '',
      model: this.model,
    };

    // Extract system message as preamble
    const systemMessage = messages.find((m) => m.role === 'system');
    if (systemMessage) {
      body.preamble = systemMessage.content;
    }

    // Build chat history (excluding last user message and system)
    const history = messages
      .filter((m) => m.role !== 'system' && m !== lastUserMessage)
      .map((m) => this.convertMessage(m));

    if (history.length > 0) {
      body.chat_history = history;
    }

    // Convert tools
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description ?? '',
        parameter_definitions: this.convertParameters(tool.function.parameters),
      }));
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (request.maxTokens !== undefined) {
      body.max_tokens = request.maxTokens;
    }

    return body;
  }

  private convertMessage(msg: Message): CohereMessage {
    return {
      role: this.mapRole(msg.role),
      message: msg.content,
    };
  }

  private mapRole(role: string): 'USER' | 'CHATBOT' | 'SYSTEM' | 'TOOL' {
    switch (role) {
      case 'user':
        return 'USER';
      case 'assistant':
        return 'CHATBOT';
      case 'system':
        return 'SYSTEM';
      case 'tool':
        return 'TOOL';
      default:
        return 'USER';
    }
  }

  private convertParameters(
    params: Record<string, unknown> | undefined
  ): Record<string, { type: string; description?: string; required?: boolean }> {
    if (!params || !params.properties) return {};

    const properties = params.properties as Record<string, { type: string; description?: string }>;
    const required = (params.required as string[]) ?? [];

    const result: Record<string, { type: string; description?: string; required?: boolean }> = {};

    for (const [key, value] of Object.entries(properties)) {
      result[key] = {
        type: value.type,
        description: value.description,
        required: required.includes(key),
      };
    }

    return result;
  }

  private parseResponse(response: CohereResponse): CompletionResponse {
    const result: CompletionResponse = {
      id: response.response_id,
      content: response.text,
      finishReason: this.mapFinishReason(response.finish_reason),
    };

    if (response.tool_calls && response.tool_calls.length > 0) {
      result.toolCalls = response.tool_calls.map((tc, idx) => ({
        id: `call-${response.generation_id}-${idx}`,
        name: tc.name,
        arguments: tc.parameters,
      }));
    }

    if (response.meta?.tokens) {
      result.usage = {
        promptTokens: response.meta.tokens.input_tokens,
        completionTokens: response.meta.tokens.output_tokens,
        totalTokens: response.meta.tokens.input_tokens + response.meta.tokens.output_tokens,
      };
    }

    return result;
  }

  private mapFinishReason(reason?: string): CompletionResponse['finishReason'] {
    switch (reason) {
      case 'COMPLETE':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      default:
        return 'stop';
    }
  }
}
