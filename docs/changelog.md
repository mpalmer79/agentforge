[changelog.md](https://github.com/user-attachments/files/24618420/changelog.md)
# Changelog

All notable changes to AgentForge.

## [0.1.0] - 2024-01-20

### 🎉 Initial Release

AgentForge is now available! A production-ready TypeScript framework for building AI agents.

### Features

#### Core
- **Agent class** - Orchestrates conversations with LLM providers
- **Tool system** - Type-safe tools with Zod validation
- **Streaming** - Real-time token streaming with async iterators
- **Memory management** - Configurable conversation history

#### Providers
- **OpenAI** - Full support for GPT-4 and GPT-3.5 models
- **Anthropic** - Full support for Claude 3 models
- **Custom providers** - Extensible base class

#### Middleware
- **createMiddleware** - Build custom middleware
- **loggingMiddleware** - Built-in request/response logging
- **createRateLimitMiddleware** - Rate limiting
- **createCacheMiddleware** - Response caching
- **createRetryMiddleware** - Automatic retries

#### React Integration
- **useAgent** - Full-featured agent hook
- **useChat** - Simplified chat hook
- **useStreamingAgent** - Streaming support
- **AgentProvider** - Context provider

#### Error Handling
- **Typed errors** - AgentForgeError, ProviderError, ToolExecutionError
- **Error codes** - Comprehensive error code enum
- **Result types** - Functional error handling

#### Type System
- **Branded types** - Type-safe IDs and values
- **Type guards** - Runtime type checking
- **Validation utilities** - Input validation helpers

#### Extensions
- **Event system** - Type-safe event emitter
- **Plugin system** - Extensible plugin architecture
- **Performance utilities** - Request batching, deduplication, rate limiting

### Documentation
- Complete API reference
- Getting started guide
- Core concepts explanation
- Real-world examples
- Interactive playground

---

## Roadmap

### [0.2.0] - Planned

- [ ] Memory summarization strategy
- [ ] Function calling validation improvements
- [ ] Additional provider support (Cohere, Together AI)
- [ ] WebSocket streaming support
- [ ] Enhanced React components

### [0.3.0] - Planned

- [ ] Agent composition patterns
- [ ] Conversation branching
- [ ] Tool dependencies
- [ ] Observability integrations
- [ ] Performance optimizations

---

## Contributing

See [CONTRIBUTING.md](https://github.com/mpalmer79/agentforge/blob/main/CONTRIBUTING.md) for guidelines.

## License

MIT © Michael Palmer
