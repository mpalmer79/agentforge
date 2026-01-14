[multi-agent.md](https://github.com/user-attachments/files/24618572/multi-agent.md)
# Multi-Agent System

Multiple specialized agents working together with a coordinator.

## Overview

This example demonstrates:
- Agent orchestration
- Role-based specialization
- Agent-to-agent communication
- Task delegation

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Coordinator Agent                     │
│         (Understands intent, delegates tasks)           │
└──────────────┬──────────────┬──────────────┬───────────┘
               │              │              │
               ▼              ▼              ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ Research │   │  Writer  │   │ Reviewer │
        │  Agent   │   │  Agent   │   │  Agent   │
        └──────────┘   └──────────┘   └──────────┘
```

## Full Code

```typescript
import { Agent, OpenAIProvider, defineTool } from 'agentforge';
import { z } from 'zod';

const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4-turbo',
});

// ============================================
// Specialized Agents
// ============================================

// Research Agent - Gathers information
const researchAgent = new Agent({
  provider,
  systemPrompt: `You are a research specialist. Your job is to:
- Gather relevant information on topics
- Provide factual, well-organized research
- Include sources when available
- Be thorough but concise

Format your research as structured bullet points.`,
});

// Writer Agent - Creates content
const writerAgent = new Agent({
  provider,
  systemPrompt: `You are a professional writer. Your job is to:
- Write clear, engaging content
- Follow the specified tone and format
- Incorporate provided research
- Create polished, publication-ready text

Always write in a professional but accessible tone.`,
});

// Reviewer Agent - Reviews and improves
const reviewerAgent = new Agent({
  provider,
  systemPrompt: `You are an editor and reviewer. Your job is to:
- Review content for clarity and accuracy
- Suggest specific improvements
- Check for logical flow
- Ensure the content meets quality standards

Provide actionable feedback with specific suggestions.`,
});

// ============================================
// Coordinator Tools
// ============================================

const delegateResearchTool = defineTool({
  name: 'delegate_research',
  description: 'Delegate a research task to the research agent',
  parameters: z.object({
    topic: z.string().describe('Topic to research'),
    focus: z.string().optional().describe('Specific aspects to focus on'),
  }),
  execute: async ({ topic, focus }) => {
    const query = focus 
      ? `Research ${topic}. Focus on: ${focus}`
      : `Research ${topic}`;
    
    const response = await researchAgent.run(query);
    return { research: response.content };
  },
});

const delegateWritingTool = defineTool({
  name: 'delegate_writing',
  description: 'Delegate a writing task to the writer agent',
  parameters: z.object({
    task: z.string().describe('What to write'),
    context: z.string().optional().describe('Research or context to incorporate'),
    format: z.enum(['article', 'email', 'summary', 'report']).default('article'),
  }),
  execute: async ({ task, context, format }) => {
    let prompt = `Write a ${format}: ${task}`;
    if (context) {
      prompt += `\n\nUse this research:\n${context}`;
    }
    
    const response = await writerAgent.run(prompt);
    return { content: response.content };
  },
});

const delegateReviewTool = defineTool({
  name: 'delegate_review',
  description: 'Delegate a review task to the reviewer agent',
  parameters: z.object({
    content: z.string().describe('Content to review'),
    criteria: z.string().optional().describe('Specific criteria to evaluate'),
  }),
  execute: async ({ content, criteria }) => {
    let prompt = `Review this content:\n\n${content}`;
    if (criteria) {
      prompt += `\n\nEvaluate against these criteria: ${criteria}`;
    }
    
    const response = await reviewerAgent.run(prompt);
    return { feedback: response.content };
  },
});

// ============================================
// Coordinator Agent
// ============================================

const coordinatorAgent = new Agent({
  provider,
  tools: [delegateResearchTool, delegateWritingTool, delegateReviewTool],
  systemPrompt: `You are a project coordinator managing a team of AI specialists:

1. **Research Agent**: Gathers information and facts
2. **Writer Agent**: Creates written content
3. **Reviewer Agent**: Reviews and improves content

Your job is to:
- Understand what the user needs
- Break complex tasks into steps
- Delegate to the right specialist
- Combine results into a final deliverable

For complex content creation:
1. First delegate research
2. Then delegate writing with the research
3. Finally delegate review
4. Present the final result

Always explain what you're doing and present polished final results.`,
  maxIterations: 15, // Allow multiple delegation rounds
});

// ============================================
// Usage
// ============================================

async function runWorkflow(task: string) {
  console.log('═'.repeat(60));
  console.log(`Task: ${task}`);
  console.log('═'.repeat(60));
  console.log('');
  
  const response = await coordinatorAgent.run(task);
  
  console.log('Result:');
  console.log(response.content);
  console.log('');
  
  if (response.toolResults) {
    console.log(`[${response.toolResults.length} delegations made]`);
  }
}

// Example: Full content creation workflow
await runWorkflow(
  'Write a professional blog post about the benefits of TypeScript for large projects'
);

// Example: Research and summarize
await runWorkflow(
  'Research the latest trends in AI agents and give me a summary'
);
```

## Key Patterns

### 1. Role-Based Specialization

Each agent has a focused system prompt:

```typescript
const researchAgent = new Agent({
  systemPrompt: `You are a research specialist...`,
});

const writerAgent = new Agent({
  systemPrompt: `You are a professional writer...`,
});
```

### 2. Coordinator Orchestration

The coordinator uses tools to delegate:

```typescript
const delegateResearchTool = defineTool({
  name: 'delegate_research',
  execute: async ({ topic }) => {
    const response = await researchAgent.run(`Research ${topic}`);
    return { research: response.content };
  },
});
```

### 3. Multi-Step Workflows

The coordinator chains operations:
1. Research → gather information
2. Writing → create content with research
3. Review → improve quality

### 4. Context Passing

Results flow between agents:

```typescript
execute: async ({ task, context }) => {
  let prompt = `Write: ${task}`;
  if (context) {
    prompt += `\n\nUse this research:\n${context}`;
  }
  return writerAgent.run(prompt);
}
```

## Advanced Patterns

### Parallel Delegation

```typescript
const [research1, research2] = await Promise.all([
  researchAgent.run('Topic A'),
  researchAgent.run('Topic B'),
]);
```

### Feedback Loops

```typescript
let content = await writerAgent.run(task);
let feedback = await reviewerAgent.run(content);

// Iterate until approved
while (feedback.includes('needs improvement')) {
  content = await writerAgent.run(`Improve: ${content}\nFeedback: ${feedback}`);
  feedback = await reviewerAgent.run(content);
}
```

### Agent Memory Sharing

```typescript
const sharedContext = new Map();

// Research agent saves findings
sharedContext.set('research', findings);

// Writer agent uses them
const research = sharedContext.get('research');
```

## Use Cases

- **Content Pipeline**: Research → Write → Edit → Publish
- **Customer Support**: Triage → Specialist → Resolution
- **Data Analysis**: Collect → Analyze → Summarize
- **Code Review**: Analyze → Suggest → Verify

## Try It

```bash
export OPENAI_API_KEY=your-key
npx ts-node examples/multi-agent/index.ts
```
