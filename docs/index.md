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
    - theme: alt
      text: LinkedIn
      link: https://www.linkedin.com/in/mpalmer1234/

features:
  - title: Type-Safe Tools
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
/* LinkedIn Button Styling */
.VPHero .actions .VPButton[href*="linkedin"] {
  background: #0A66C2 !important;
  border-color: #0A66C2 !important;
  color: white !important;
}

.VPHero .actions .VPButton[href*="linkedin"]:hover {
  background: #004182 !important;
  border-color: #004182 !important;
}

.VPHero .actions .VPButton[href*="linkedin"]::before {
  content: '';
  display: inline-block;
  width: 18px;
  height: 18px;
  margin-right: 8px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'%3E%3Cpath d='M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z'/%3E%3C/svg%3E");
  background-size: contain;
  background-repeat: no-repeat;
  vertical-align: middle;
}

/* Type-Safe Tools Card - Background Image */
.VPFeatures .VPFeature:first-child,
.VPFeatures .items .item:first-child .VPFeature,
.VPFeatures .grid .item:first-child .VPFeature {
  background-image: url('/type.png') !important;
  background-size: cover !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
  position: relative;
  overflow: hidden;
}

.VPFeatures .VPFeature:first-child::before,
.VPFeatures .items .item:first-child .VPFeature::before,
.VPFeatures .grid .item:first-child .VPFeature::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.3) 100%);
  z-index: 0;
  pointer-events: none;
}

.VPFeatures .VPFeature:first-child .title,
.VPFeatures .VPFeature:first-child .details,
.VPFeatures .items .item:first-child .title,
.VPFeatures .items .item:first-child .details {
  position: relative;
  z-index: 1;
  color: white !important;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
}

/* Hide icon on first card */
.VPFeatures .VPFeature:first-child .icon,
.VPFeatures .VPFeature:first-child .VPImage,
.VPFeatures .items .item:first-child .icon,
.VPFeatures .items .item:first-child .VPImage,
.VPFeatures .VPFeature:first-child .box > .icon,
.VPFeatures .items .item:first-child .box > .icon {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
}

.home-content {
  max-width: 1152px;
  margin: 0 auto;
  padding: 0 24px;
}

/* Badges Section */
.badges-section {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin: 1.5rem 0 2rem 0;
}

.badges-section img {
  height: 24px;
}

/* Why Section */
.why-exists {
  margin: 3rem 0;
  padding: 2.5rem;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.08) 100%);
  border-radius: 16px;
  border: 1px solid var(--vp-c-divider);
  text-align: center;
}

.why-exists h2 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.75rem;
  font-weight: 600;
  margin-bottom: 1.25rem;
  color: var(--vp-c-text-1);
}

.why-exists p {
  color: var(--vp-c-text-2);
  font-size: 1.1rem;
  line-height: 1.8;
  max-width: 800px;
  margin: 0 auto 1rem auto;
}

.why-exists .highlight {
  color: var(--vp-c-brand-1);
  font-weight: 500;
}

.project-status {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1.5rem;
  padding: 0.5rem 1rem;
  background: var(--vp-c-bg-soft);
  border-radius: 20px;
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
}

.project-status .dot {
  width: 8px;
  height: 8px;
  background: #22c55e;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* What This Demonstrates */
.demonstrates-section {
  margin: 4rem 0;
  padding: 3rem;
  background: var(--vp-c-bg-soft);
  border-radius: 16px;
  border: 1px solid var(--vp-c-divider);
}

.demonstrates-section h2 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.75rem;
  font-weight: 600;
  text-align: center;
  margin-bottom: 2rem;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.demonstrates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.25rem;
}

.demonstrates-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--vp-c-bg);
  border-radius: 10px;
  border: 1px solid var(--vp-c-divider);
  transition: border-color 0.3s ease;
}

.demonstrates-item:hover {
  border-color: var(--vp-c-brand-1);
}

.demonstrates-item .icon {
  font-size: 1.25rem;
  line-height: 1;
}

.demonstrates-item p {
  color: var(--vp-c-text-1);
  font-size: 0.95rem;
  line-height: 1.5;
  margin: 0;
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

<script setup>
import { onMounted } from 'vue'

onMounted(() => {
  // Make LinkedIn link open in new tab
  const linkedinLink = document.querySelector('.VPHero .actions a[href*="linkedin"]')
  if (linkedinLink) {
    linkedinLink.setAttribute('target', '_blank')
    linkedinLink.setAttribute('rel', 'noopener noreferrer')
  }
})
</script>

<div class="home-content">

<!-- Badges -->
<div class="badges-section">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="MIT License" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome" />
  <img src="https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white" alt="Node.js 18+" />
</div>

<!-- Why This Exists -->
<div class="why-exists">
<h2>Why This Exists</h2>
<p>
AgentForge was built to solve a real problem: <span class="highlight">most AI agent frameworks break down when you try to ship them to production</span>.
</p>
<p>
This project demonstrates how to design a type-safe, provider-agnostic, streaming-first agent system using modern TypeScript, clean architecture, and production-grade patterns.
</p>
<div class="project-status">
  <span class="dot"></span>
  Active development · Designed with production patterns · Open source
</div>
</div>

<!-- What This Demonstrates -->
<div class="demonstrates-section">
<h2>What This Project Demonstrates</h2>
<div class="demonstrates-grid">
  <div class="demonstrates-item">
    <span class="icon">🏗️</span>
    <p>Designing modular, provider-agnostic architecture that scales</p>
  </div>
  <div class="demonstrates-item">
    <span class="icon">🔒</span>
    <p>Building type-safe APIs with runtime validation using Zod</p>
  </div>
  <div class="demonstrates-item">
    <span class="icon">⚡</span>
    <p>Implementing streaming systems with async iterators</p>
  </div>
  <div class="demonstrates-item">
    <span class="icon">🔗</span>
    <p>Designing middleware pipelines for extensibility</p>
  </div>
  <div class="demonstrates-item">
    <span class="icon">🛡️</span>
    <p>Production patterns: circuit breakers, retry logic, graceful degradation</p>
  </div>
  <div class="demonstrates-item">
    <span class="icon">📚</span>
    <p>Complete documentation with branding, SEO, and examples</p>
  </div>
</div>
</div>

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
