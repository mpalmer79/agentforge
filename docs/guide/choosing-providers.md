# Choosing Providers

Guide to selecting the right LLM provider for your use case.

## Provider Comparison

| Provider | Best For | Tool Support | Streaming | Cost |
|----------|----------|--------------|-----------|------|
| **OpenAI** | General purpose, tool-heavy apps | Excellent | Yes | $$ |
| **Anthropic** | Long context, safety-critical | Good | Yes | $$ |
| **Cohere** | Enterprise, RAG applications | Good | Yes | $$ |
| **Gemini** | Multimodal, Google ecosystem | Good | Yes | $ |
| **Together** | Open source models, cost savings | Varies | Yes | $ |

## Provider-Specific Considerations

### OpenAI
```typescript
import { OpenAIProvider } from 'agentforge';

const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4-turbo-preview',
  temperature: 0.7,
  maxTokens: 4096,
});
```

**Strengths:**
- Best-in-class tool/function calling
- Reliable and well-documented
- JSON mode for structured outputs

**Pitfalls:**
- Rate limits can be aggressive on new accounts
- `gpt-4` is slower than `gpt-3.5-turbo`
- Costs add up quickly with high volume

**Recommended settings:**
```typescript
// For tool-heavy applications
{ model: 'gpt-4-turbo-preview', temperature: 0 }

// For creative applications
{ model: 'gpt-4', temperature: 0.8 }

// For cost-sensitive applications
{ model: 'gpt-3.5-turbo', temperature: 0.5 }
```

### Anthropic
```typescript
import { AnthropicProvider } from 'agentforge';

const provider = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-sonnet-20240229',
});
```

**Strengths:**
- 200K context window (Claude 3)
- Strong reasoning and safety
- Excellent at following complex instructions

**Pitfalls:**
- Tool calling syntax differs from OpenAI
- Can be overly cautious/refuse valid requests
- Streaming chunks can be smaller

**Recommended settings:**
```typescript
// For long documents
{ model: 'claude-3-sonnet-20240229', maxTokens: 4096 }

// For complex reasoning
{ model: 'claude-3-opus-20240229', temperature: 0 }

// For speed
{ model: 'claude-3-haiku-20240307' }
```

### Cohere
```typescript
import { CohereProvider } from 'agentforge';

const provider = new CohereProvider({
  apiKey: process.env.COHERE_API_KEY,
  model: 'command-r-plus',
});
```

**Strengths:**
- Built-in RAG capabilities
- Enterprise-focused features
- Good multilingual support

**Pitfalls:**
- Smaller community/fewer examples
- Tool calling less mature than OpenAI

### Gemini
```typescript
import { GeminiProvider } from 'agentforge';

const provider = new GeminiProvider({
  apiKey: process.env.GOOGLE_API_KEY,
  model: 'gemini-pro',
});
```

**Strengths:**
- Competitive pricing
- Good multimodal support
- Fast inference

**Pitfalls:**
- API can be less stable
- Safety filters can be aggressive

### Together
```typescript
import { TogetherProvider } from 'agentforge';

const provider = new TogetherProvider({
  apiKey: process.env.TOGETHER_API_KEY,
  model: 'meta-llama/Llama-3-70b-chat-hf',
});
```

**Strengths:**
- Access to open source models
- Very cost effective
- No vendor lock-in

**Pitfalls:**
- Tool calling support varies by model
- Quality varies significantly between models

## Common Pitfalls

### Rate Limits

All providers have rate limits. Always implement retry logic:
```typescript
import { RetryMiddleware } from 'agentforge';

const agent = new Agent({
  provider,
  middleware: [
    new RetryMiddleware({
      maxRetries: 3,
      baseDelay: 1000,
      retryableErrors: ['RATE_LIMIT'],
    }),
  ],
});
```

### Timeouts

LLM calls can be slow. Set appropriate timeouts:
```typescript
const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4',
  timeout: 30000, // 30 seconds
});
```

### Context Length

Each model has a maximum context length. Monitor usage:
```typescript
agent.on('tokens:used', ({ prompt, completion, total }) => {
  if (total > 3000) {
    console.warn('Approaching context limit');
  }
});
```

### Cost Management

Track costs across providers:
```typescript
agent.on('request:complete', ({ usage }) => {
  const cost = calculateCost(provider, usage);
  metrics.recordCost(cost);
});
```

## Multi-Provider Setup

Use fallbacks for reliability:
```typescript
import { Agent, OpenAIProvider, AnthropicProvider } from 'agentforge';

const primary = new OpenAIProvider({ /* ... */ });
const fallback = new AnthropicProvider({ /* ... */ });

const agent = new Agent({
  provider: primary,
  fallbackProvider: fallback,
});
```
