# AgentForge Examples

Runnable examples demonstrating AgentForge features.

## Prerequisites
```bash
npm install agentforge zod
```

Set your API keys:
```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
```

## Examples

| Example | Description |
|---------|-------------|
| [openai-tool-calls](./openai-tool-calls) | Type-safe tool definitions with OpenAI |
| [anthropic-streaming](./anthropic-streaming) | Real-time streaming with Claude |
| [production-template](./production-template) | Production-ready config with retry, circuit breaker, logging |

## Running Examples
```bash
npx ts-node examples/openai-tool-calls/index.ts
npx ts-node examples/anthropic-streaming/index.ts
npx ts-node examples/production-template/index.ts
```
```

---

**Folder structure:**
```
examples/
├── README.md
├── openai-tool-calls/
│   └── index.ts
├── anthropic-streaming/
│   └── index.ts
└── production-template/
    └── index.ts
