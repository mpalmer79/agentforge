[providers.md](https://github.com/user-attachments/files/24618539/providers.md)
# Providers API

LLM provider implementations and base class for custom providers.

## OpenAIProvider

```typescript
import { OpenAIProvider } from 'agentforge';

const provider = new OpenAIProvider(config: OpenAIProviderConfig);
```

### OpenAIProviderConfig

```typescript
interface OpenAIProviderConfig {
  apiKey: string;
  model?: string;           // Default: 'gpt-4-turbo'
  organization?: string;    // OpenAI organization ID
  baseURL?: string;         // Default: 'https://api.openai.com/v1'
  maxRetries?: number;      // Default: 3
  timeout?: number;         // Default: 30000 (ms)
}
```

### Supported Models

- `gpt-4-turbo` (default)
- `gpt-4`
- `gpt-4-32k`
- `gpt-3.5-turbo`
- `gpt-3.5-turbo-16k`

## AnthropicProvider

```typescript
import { AnthropicProvider } from 'agentforge';

const provider = new AnthropicProvider(config: AnthropicProviderConfig);
```

### AnthropicProviderConfig

```typescript
interface AnthropicProviderConfig {
  apiKey: string;
  model?: string;           // Default: 'claude-3-5-sonnet-20241022'
  anthropicVersion?: string; // Default: '2023-06-01'
  baseURL?: string;         // Default: 'https://api.anthropic.com'
  maxRetries?: number;      // Default: 3
  timeout?: number;         // Default: 30000 (ms)
}
```

### Supported Models

- `claude-3-5-sonnet-20241022` (default)
- `claude-3-opus-20240229`
- `claude-3-sonnet-20240229`
- `claude-3-haiku-20240307`

## BaseProvider

Extend to create custom providers:

```typescript
import { BaseProvider } from 'agentforge';

class CustomProvider extends BaseProvider {
  name = 'custom';

  protected getDefaultModel(): string {
    return 'custom-model';
  }

  protected getDefaultBaseURL(): string {
    return 'https://api.custom.com/v1';
  }

  protected getAuthHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    // Implementation
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    // Implementation
  }
}
```

### Protected Methods

| Method | Description |
|--------|-------------|
| `getDefaultModel()` | Returns default model name |
| `getDefaultBaseURL()` | Returns API base URL |
| `getAuthHeaders()` | Returns auth headers |
| `fetch<T>(path, options)` | Make HTTP request |
| `fetchStream(path, options)` | Make streaming request |

## Provider Interface

```typescript
interface Provider {
  name: string;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;
}
```

## CompletionRequest

```typescript
interface CompletionRequest {
  messages: Message[];
  tools?: ToolSchema[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}
```

## CompletionResponse

```typescript
interface CompletionResponse {
  id: string;
  content: string;
  toolCalls?: ToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
```

## StreamChunk

```typescript
interface StreamChunk {
  id: string;
  delta: {
    content?: string;
    toolCalls?: Partial<ToolCall>[];
  };
  finishReason?: 'stop' | 'tool_calls' | 'length';
}
```

## ProviderConfig

```typescript
interface ProviderConfig {
  apiKey: string;
  model?: string;
  baseURL?: string;
  maxRetries?: number;
  timeout?: number;
}
```
