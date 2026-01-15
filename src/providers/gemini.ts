/**
 * Google Gemini Provider
 *
 * Supports Gemini Pro, Gemini Pro Vision, and Gemini 1.5 models
 */

import type {
  ProviderConfig,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  Message,
} from '../types';
import { BaseProvider } from './base';

interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

interface GeminiRequest {
  contents: GeminiContent[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    topK?: number;
  };
  tools?: Array<{
    functionDeclarations: Array<{
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    }>;
  }>;
  systemInstruction?: {
    parts: Array<{ text: string }>;
  };
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text?: string;
        functionCall?: {
          name: string;
          args: Record<string, unknown>;
        };
      }>;
      role: string;
    };
    finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

interface GeminiStreamChunk {
  candidates: Array<{
    content: {
      parts: Array<{
        text?: string;
        functionCall?: {
          name: string;
          args: Record<string, unknown>;
        };
      }>;
      role: string;
    };
    finishReason?: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export interface GeminiProviderConfig extends ProviderConfig {
  /** Google Cloud project ID (optional) */
  projectId?: string;
  /** Safety settings threshold */
  safetyThreshold?:
    | 'BLOCK_NONE'
    | 'BLOCK_LOW_AND_ABOVE'
    | 'BLOCK_MEDIUM_AND_ABOVE'
    | 'BLOCK_ONLY_HIGH';
}

/**
 * Google Gemini provider implementation
 *
 * @example
 * ```typescript
 * const gemini = new GeminiProvider({
 *   apiKey: process.env.GOOGLE_API_KEY,
 *   model: 'gemini-1.5-pro',
 * });
 *
 * const response = await gemini.complete({
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */
export class GeminiProvider extends BaseProvider {
  name = 'gemini';

  constructor(config: GeminiProviderConfig) {
    super(config);
    // projectId and safetyThreshold reserved for future Vertex AI integration
  }

  protected getDefaultModel(): string {
    return 'gemini-1.5-pro';
  }

  protected getDefaultBaseURL(): string {
    return 'https://generativelanguage.googleapis.com/v1beta';
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'x-goog-api-key': this.apiKey,
    };
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const body = this.buildRequestBody(request);
    const endpoint = `/models/${this.model}:generateContent`;

    const response = await this.fetch<GeminiResponse>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return this.parseResponse(response);
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const body = this.buildRequestBody(request);
    const endpoint = `/models/${this.model}:streamGenerateContent?alt=sse`;

    for await (const data of this.fetchStreamGemini(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    })) {
      try {
        const chunk: GeminiStreamChunk = JSON.parse(data);
        const candidate = chunk.candidates?.[0];

        if (!candidate) continue;

        const streamChunk: StreamChunk = {
          id: `gemini-${Date.now()}`,
          delta: {},
          finishReason: this.mapFinishReason(candidate.finishReason),
        };

        // Extract text content
        const textPart = candidate.content?.parts?.find((p) => p.text);
        if (textPart?.text) {
          streamChunk.delta.content = textPart.text;
        }

        // Extract function calls
        const functionPart = candidate.content?.parts?.find((p) => p.functionCall);
        if (functionPart?.functionCall) {
          streamChunk.delta.toolCalls = [
            {
              id: `call-${Date.now()}`,
              name: functionPart.functionCall.name,
              arguments: functionPart.functionCall.args,
            },
          ];
        }

        yield streamChunk;
      } catch {
        continue;
      }
    }
  }

  /**
   * Gemini uses a different SSE format
   */
  private async *fetchStreamGemini(endpoint: string, options: RequestInit): AsyncIterable<string> {
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
      throw new Error(`Gemini API error: ${response.status} - ${errorBody}`);
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

        // Gemini streams JSON objects separated by newlines
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && trimmed.startsWith('data: ')) {
            yield trimmed.slice(6);
          } else if (trimmed && trimmed.startsWith('{')) {
            yield trimmed;
          }
        }
      }

      if (buffer.trim()) {
        if (buffer.trim().startsWith('data: ')) {
          yield buffer.trim().slice(6);
        } else if (buffer.trim().startsWith('{')) {
          yield buffer.trim();
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private buildRequestBody(request: CompletionRequest): GeminiRequest {
    const body: GeminiRequest = {
      contents: this.convertMessages(request.messages),
    };

    // Extract system instruction
    const systemMessage = request.messages.find((m) => m.role === 'system');
    if (systemMessage) {
      body.systemInstruction = {
        parts: [{ text: systemMessage.content }],
      };
    }

    // Generation config
    body.generationConfig = {};
    if (request.temperature !== undefined) {
      body.generationConfig.temperature = request.temperature;
    }
    if (request.maxTokens !== undefined) {
      body.generationConfig.maxOutputTokens = request.maxTokens;
    }

    // Convert tools
    if (request.tools && request.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: request.tools.map((tool) => ({
            name: tool.function.name,
            description: tool.function.description ?? '',
            parameters: tool.function.parameters as Record<string, unknown>,
          })),
        },
      ];
    }

    return body;
  }

  private convertMessages(messages: Message[]): GeminiContent[] {
    return messages
      .filter((msg) => msg.role !== 'system') // System is handled separately
      .map((msg) => ({
        role: this.mapRole(msg.role),
        parts: [{ text: msg.content }],
      }));
  }

  private mapRole(role: string): 'user' | 'model' {
    switch (role) {
      case 'assistant':
        return 'model';
      case 'user':
      default:
        return 'user';
    }
  }

  private parseResponse(response: GeminiResponse): CompletionResponse {
    const candidate = response.candidates?.[0];

    if (!candidate) {
      throw new Error('No response candidates returned');
    }

    const textPart = candidate.content.parts.find((p) => p.text);
    const functionPart = candidate.content.parts.find((p) => p.functionCall);

    const result: CompletionResponse = {
      id: `gemini-${Date.now()}`,
      content: textPart?.text ?? '',
      finishReason: this.mapFinishReason(candidate.finishReason),
    };

    if (functionPart?.functionCall) {
      result.toolCalls = [
        {
          id: `call-${Date.now()}`,
          name: functionPart.functionCall.name,
          arguments: functionPart.functionCall.args,
        },
      ];
    }

    if (response.usageMetadata) {
      result.usage = {
        promptTokens: response.usageMetadata.promptTokenCount,
        completionTokens: response.usageMetadata.candidatesTokenCount,
        totalTokens: response.usageMetadata.totalTokenCount,
      };
    }

    return result;
  }

  private mapFinishReason(reason?: string): CompletionResponse['finishReason'] {
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      default:
        return 'stop';
    }
  }
}
