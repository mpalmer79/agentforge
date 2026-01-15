import type {
  Provider,
  ProviderConfig,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
} from '../types';
import { ProviderError } from '../errors';
import { retry } from '../utils';

/**
 * Base provider class with common functionality
 */
export abstract class BaseProvider implements Provider {
  abstract name: string;

  protected apiKey: string;
  protected model: string;
  protected baseURL: string;
  protected maxRetries: number;
  protected timeout: number;

  constructor(config: ProviderConfig) {
    if (!config.apiKey) {
      throw ProviderError.authenticationFailed(this.constructor.name);
    }

    this.apiKey = config.apiKey;
    this.model = config.model ?? this.getDefaultModel();
    this.baseURL = config.baseURL ?? this.getDefaultBaseURL();
    this.maxRetries = config.maxRetries ?? 3;
    this.timeout = config.timeout ?? 30000;
  }

  protected abstract getDefaultModel(): string;
  protected abstract getDefaultBaseURL(): string;

  abstract complete(request: CompletionRequest): Promise<CompletionResponse>;
  abstract stream(request: CompletionRequest): AsyncIterable<StreamChunk>;

  /**
   * Make an HTTP request with retries
   */
  protected async fetch<T>(
    endpoint: string,
    options: RequestInit
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;

    const makeRequest = async (): Promise<T> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...this.getAuthHeaders(),
            ...options.headers,
          },
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new ProviderError(
            `${this.name} API error: ${response.status} - ${errorBody}`,
            this.name,
            {
              statusCode: response.status,
              rawResponse: errorBody,
            }
          );
        }

        return response.json();
      } finally {
        clearTimeout(timeoutId);
      }
    };

    return retry(makeRequest, {
      maxRetries: this.maxRetries,
      shouldRetry: (error) => {
        if (error instanceof ProviderError) {
          // Retry on rate limits (429) and server errors (5xx)
          return (
            error.statusCode === 429 || (error.statusCode ?? 0) >= 500
          );
        }
        return false;
      },
    });
  }

  /**
   * Make a streaming request
   */
  protected async *fetchStream(
    endpoint: string,
    options: RequestInit
  ): AsyncIterable<string> {
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
      throw new ProviderError(
        `${this.name} API error: ${response.status} - ${errorBody}`,
        this.name,
        {
          statusCode: response.status,
          rawResponse: errorBody,
        }
      );
    }

    if (!response.body) {
      throw ProviderError.invalidResponse(
        this.name,
        'Response body is null'
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && trimmed !== 'data: [DONE]') {
            if (trimmed.startsWith('data: ')) {
              yield trimmed.slice(6);
            }
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim() && buffer.trim() !== 'data: [DONE]') {
        if (buffer.trim().startsWith('data: ')) {
          yield buffer.trim().slice(6);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Get auth headers for requests
   */
  protected abstract getAuthHeaders(): Record<string, string>;
}
