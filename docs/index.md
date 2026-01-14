---
layout: home

hero:
  name: "AgentForge"
  text: "Build AI Agents That Actually Work"
  tagline: Production-ready TypeScript framework for building AI agents with type-safe tools, streaming responses, and multi-provider support.
  image:
    src: /hero-illustration.svg
    alt: AgentForge
  actions:
    - theme: brand
      text: Get Started →
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/mpalmer79/agentforge

features:
  - icon: 🛠️
    title: Type-Safe Tools
    details: Define tools with Zod schemas for full TypeScript inference. Parameters are validated at runtime and compile time.
  - icon: ⚡
    title: Streaming Built-In
    details: Real-time token streaming with async iterators. Build responsive UIs that show content as it generates.
  - icon: 🔌
    title: Multi-Provider
    details: Seamlessly switch between OpenAI, Anthropic, or build custom providers. Same API, any LLM.
  - icon: 🔗
    title: Middleware Pipeline
    details: Extensible request/response pipeline for logging, caching, rate limiting, and custom processing.
  - icon: ⚛️
    title: React Hooks
    details: First-class React integration with useAgent, useChat, and useStreamingAgent hooks.
  - icon: 🛡️
    title: Enterprise Ready
    details: Comprehensive error handling, Result types, branded types, and production-grade patterns.
---

<style>
.home-content {
  max-width: 1152px;
  margin: 0 auto;
  padding: 0 24px;
}

.code-preview {
  margin: 4rem 0;
}

.code-preview h2 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 2rem;
  font-weight: 600;
  text-align: center;
  margin-bottom: 0.5rem;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.code-preview p {
  text-align: center;
  color: var(--vp-c-text-2);
  margin-bottom: 2rem;
  font-size: 1.1rem;
}

.install-section {
  margin: 4rem 0;
  text-align: center;
}

.install-section h2 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
  color: var(--vp-c-text-1);
}

.install-command {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 1rem;
  color: var(--vp-c-text-1);
}

.install-command code {
  color: var(--vp-c-brand-1);
}

.why-section {
  margin: 6rem 0;
  padding: 4rem 0;
  border-top: 1px solid var(--vp-c-divider);
  border-bottom: 1px solid var(--vp-c-divider);
}

.why-section h2 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 2rem;
  font-weight: 600;
  text-align: center;
  margin-bottom: 3rem;
}

.why-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
}

.why-item {
  padding: 1.5rem;
}

.why-item h3 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: var(--vp-c-brand-1);
}

.why-item p {
  color: var(--vp-c-text-2);
  line-height: 1.7;
}

.cta-section {
  margin: 6rem 0;
  text-align: center;
}

.cta-section h2 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: 1rem;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.cta-section p {
  color: var(--vp-c-text-2);
  font-size: 1.25rem;
  margin-bottom: 2rem;
}

.cta-buttons {
  display: flex;
  justify-content: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.cta-button {
  display: inline-flex;
  align-items: center;
  padding: 0.875rem 2rem;
  border-radius: 10px;
  font-family: 'Outfit', sans-serif;
  font-weight: 600;
  font-size: 1rem;
  text-decoration: none;
  transition: all 0.3s ease;
}

.cta-button.primary {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);
  color: white;
  box-shadow: 0 4px 20px rgba(99, 102, 241, 0.3);
}

.cta-button.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 30px rgba(99, 102, 241, 0.4);
}

.cta-button.secondary {
  background: transparent;
  color: var(--vp-c-brand-1);
  border: 1px solid var(--vp-c-brand-1);
}

.cta-button.secondary:hover {
  background: var(--vp-c-brand-soft);
}
</style>

<div class="home-content">

<div class="code-preview">
<h2>Simple, Powerful API</h2>
<p>Build an AI agent with tools in under 30 lines of code</p>

```typescript
import { Agent, OpenAIProvider, defineTool } from 'agentforge';
import { z } from 'zod';

// Define a type-safe tool
const weatherTool = defineTool({
  name: 'get_weather',
  description: 'Get current weather for a location',
  parameters: z.object({
    location: z.string().describe('City name'),
  }),
  execute: async ({ location }) => {
    // Your implementation here
    return { temperature: 72, condition: 'sunny', location };
  },
});

// Create an agent
const agent = new Agent({
  provider: new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY }),
  tools: [weatherTool],
  systemPrompt: 'You are a helpful weather assistant.',
});

// Run it
const response = await agent.run('What is the weather in Boston?');
console.log(response.content);
// → "The current weather in Boston is 72°F and sunny!"
```

</div>

<div class="install-section">
<h2>Quick Install</h2>
<div class="install-command">
  <span>$</span>
  <code>npm install agentforge zod</code>
</div>
</div>

<div class="why-section">
<h2>Why AgentForge?</h2>
<div class="why-grid">
<div class="why-item">
<h3>🎯 Type Safety First</h3>
<p>Every tool parameter, every response, every error — fully typed. Catch bugs at compile time, not in production.</p>
</div>
<div class="why-item">
<h3>🏗️ Production Architecture</h3>
<p>Built with patterns from real production systems: middleware pipelines, error boundaries, retry logic, and graceful degradation.</p>
</div>
<div class="why-item">
<h3>🔄 Framework Agnostic</h3>
<p>Works with any frontend or backend. First-class React hooks included, but the core is pure TypeScript.</p>
</div>
<div class="why-item">
<h3>📦 Zero Lock-in</h3>
<p>Switch between OpenAI, Anthropic, or any provider with a single line change. Your tools work everywhere.</p>
</div>
<div class="why-item">
<h3>🧪 Testable by Design</h3>
<p>Mock providers, test tools in isolation, verify middleware behavior. Testing AI agents shouldn't be hard.</p>
</div>
<div class="why-item">
<h3>📚 Extensively Documented</h3>
<p>Comprehensive guides, API reference, and real-world examples. Learn once, build anything.</p>
</div>
</div>
</div>

<div class="cta-section">
<h2>Ready to Build?</h2>
<p>Start building production-ready AI agents in minutes.</p>
<div class="cta-buttons">
<a href="/agentforge/guide/getting-started" class="cta-button primary">Get Started →</a>
<a href="https://github.com/mpalmer79/agentforge" class="cta-button secondary">View Source</a>
</div>
</div>

</div>
