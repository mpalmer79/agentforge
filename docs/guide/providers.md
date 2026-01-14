[providers.md](https://github.com/user-attachments/files/24618632/providers.md)
# Providers

Providers connect AgentForge to LLM APIs. Switch between models with a single line change.

## Built-in Providers

### OpenAI

```typescript
import { OpenAIProvider } from 'agentforge';

const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4-turbo',         // Optional, default: 'gpt-4-turbo'
  organization: 'org-...',       // Optional
  baseURL: 'https://...',        // Optional, for proxies
  maxRetries: 3,                 // Optional, default: 3
  timeout: 30000,                // Optional, default: 30000ms
});
```

**Supported Models:**
- `gpt-4-turbo` (recommended)
- `gpt-4`
- `gpt-4-32k`
- `gpt-3.5-turbo`

### Anthropic

```typescript
import { AnthropicProvider } from 'agentforge';

const provider = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-3-5-sonnet-20241022',  // Optional
  maxRetries: 3,
  timeout: 30000,
});
```

**Supported Models:**
- `claude-3-5-sonnet-20241022` (recommended)
- `claude-3-opus-20240229`
- `claude-3-sonnet-20240229`
- `claude-3-haiku-20240307`

## Provider Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | Required | API key for authentication |
| `model` | `string` | Provider default | Model to use |
| `baseURL` | `string` | Provider default | API base URL |
| `maxRetries` | `number` | `3` | Retry attempts for failed requests |
| `timeout` | `number` | `30000` | Request timeout in ms |

## Switching Providers

Your tools and agent logic work with any provider:

```typescript
import { Agent, OpenAIProvider, AnthropicProvider } from 'agentforge';

// Same tools work with both
const tools = [calculatorTool, searchTool];

// OpenAI version
const openaiAgent = new Agent({
  provider: new OpenAIProvider({ apiKey: '...' }),
  tools,
});

// Anthropic version
const anthropicAgent = new Agent({
  provider: new AnthropicProvider({ apiKey: '...' }),
  tools,
});
```

## Custom Providers

Extend `BaseProvider` to add new LLM support:

```typescript
import { BaseProvider } from 'agentforge';
import type { CompletionRequest, CompletionResponse, StreamChunk } from 'agentforge';

class CustomProvider extends BaseProvider {
  name = 'custom';

  protected getDefaultModel(): string {
    return 'custom-model-v1';
  }

  protected getDefaultBaseURL(): string {
    return 'https://api.custom-llm.com/v1';
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'X-Custom-Header': 'value',
    };
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const body = this.buildRequestBody(request);
    
    const response = await this.fetch<CustomAPIResponse>('/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    
    return this.parseResponse(response);
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const body = { ...this.buildRequestBody(request), stream: true };
    
    for await (const data of this.fetchStream('/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    })) {
      yield this.parseStreamChunk(data);
    }
  }

  private buildRequestBody(request: CompletionRequest) {
    return {
      model: this.model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      tools: request.tools,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
    };
  }

  private parseResponse(response: CustomAPIResponse): CompletionResponse {
    return {
      id: response.id,
      content: response.message.content,
      toolCalls: response.message.tool_calls?.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      })),
      finishReason: response.finish_reason,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.total_tokens,
      },
    };
  }
}
```

## Proxy Configuration

Use a proxy or custom endpoint:

```typescript
const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: 'https://my-proxy.example.com/v1',
});
```

This works for:
- Corporate proxies
- Azure OpenAI Service
- Local LLM servers (Ollama, llama.cpp)
- Rate limiting proxies

## Azure OpenAI

```typescript
const provider = new OpenAIProvider({
  apiKey: process.env.AZURE_OPENAI_KEY!,
  baseURL: `https://${RESOURCE_NAME}.openai.azure.com/openai/deployments/${DEPLOYMENT_NAME}`,
});
```

## Testing with Mock Providers

Create mock providers for testing:

```typescript
const mockProvider = {
  name: 'mock',
  complete: vi.fn().mockResolvedValue({
    id: 'test-response',
    content: 'Mock response',
    finishReason: 'stop',
  }),
  stream: vi.fn(),
};

const agent = new Agent({ provider: mockProvider });
```

## Provider Events

Listen to provider-level events:

```typescript
import { EventEmitter } from 'agentforge';

const events = new EventEmitter();

events.on('request:start', ({ messages }) => {
  console.log(`Sending ${messages.length} messages`);
});

events.on('request:end', ({ durationMs }) => {
  console.log(`Request completed in ${durationMs}ms`);
});

events.on('request:error', ({ error }) => {
  console.error('Provider error:', error.message);
});
```

## Next Steps

- **[Middleware](/guide/middleware)** — Add logging and caching
- **[Streaming](/guide/streaming)** — Real-time responses
- **[Error Handling](/guide/error-handling)** — Handle provider errors
