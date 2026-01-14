[customer-support.md](https://github.com/user-attachments/files/24618564/customer-support.md)
# Customer Support Agent

A multi-tool agent for handling customer inquiries with order lookup, FAQ search, and ticket creation.

## Overview

This example demonstrates:
- Multiple coordinated tools
- Sentiment-aware middleware
- Error handling and fallbacks
- Real-world business logic

## Full Code

```typescript
import { Agent, OpenAIProvider, defineTool, createMiddleware } from 'agentforge';
import { z } from 'zod';

// ============================================
// Mock Database
// ============================================

const orders = new Map([
  ['ORD-001', { id: 'ORD-001', status: 'shipped', item: 'Laptop' }],
  ['ORD-002', { id: 'ORD-002', status: 'processing', item: 'Headphones' }],
  ['ORD-003', { id: 'ORD-003', status: 'delivered', item: 'Keyboard' }],
]);

const faqDatabase = [
  { question: 'What is your return policy?', answer: 'We offer 30-day returns.' },
  { question: 'How long does shipping take?', answer: '5-7 business days.' },
  { question: 'Do you ship internationally?', answer: 'Yes, to 50+ countries.' },
];

const tickets: Array<{ id: string; issue: string; priority: string }> = [];

// ============================================
// Tools
// ============================================

const orderLookupTool = defineTool({
  name: 'lookup_order',
  description: 'Look up the status of a customer order by order ID',
  parameters: z.object({
    orderId: z.string().describe('The order ID (e.g., ORD-001)'),
  }),
  execute: async ({ orderId }) => {
    const order = orders.get(orderId.toUpperCase());
    
    if (!order) {
      return { found: false, message: `Order ${orderId} not found.` };
    }

    return {
      found: true,
      order: {
        id: order.id,
        status: order.status,
        item: order.item,
        estimatedDelivery: order.status === 'shipped' ? '2-3 days' : null,
      },
    };
  },
});

const faqSearchTool = defineTool({
  name: 'search_faq',
  description: 'Search the FAQ database for answers to common questions',
  parameters: z.object({
    query: z.string().describe('The search query or question'),
  }),
  execute: async ({ query }) => {
    const matches = faqDatabase.filter(
      (faq) =>
        faq.question.toLowerCase().includes(query.toLowerCase()) ||
        faq.answer.toLowerCase().includes(query.toLowerCase())
    );

    return matches.length > 0
      ? { found: true, results: matches }
      : { found: false, message: 'No FAQ entries found.' };
  },
});

const createTicketTool = defineTool({
  name: 'create_ticket',
  description: 'Create a support ticket for issues that need human attention',
  parameters: z.object({
    issue: z.string().describe('Description of the customer issue'),
    priority: z.enum(['low', 'medium', 'high']).describe('Ticket priority'),
  }),
  execute: async ({ issue, priority }) => {
    const ticketId = `TKT-${String(tickets.length + 1).padStart(4, '0')}`;
    tickets.push({ id: ticketId, issue, priority });

    return {
      success: true,
      ticketId,
      message: `Ticket ${ticketId} created. Response within 24 hours.`,
    };
  },
});

// ============================================
// Middleware
// ============================================

const sentimentMiddleware = createMiddleware({
  name: 'sentiment',
  beforeRequest: async (context) => {
    const lastMessage = context.messages.at(-1);
    
    if (lastMessage?.role === 'user') {
      const content = lastMessage.content.toLowerCase();
      const negativeWords = ['angry', 'frustrated', 'terrible', 'awful'];
      const isNegative = negativeWords.some((w) => content.includes(w));
      
      context.metadata.sentiment = isNegative ? 'negative' : 'neutral';
    }

    return context;
  },
});

// ============================================
// Agent
// ============================================

const agent = new Agent({
  provider: new OpenAIProvider({
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4-turbo',
  }),
  tools: [orderLookupTool, faqSearchTool, createTicketTool],
  middleware: [sentimentMiddleware],
  systemPrompt: `You are a friendly customer support agent.

Your capabilities:
- Look up order status using order IDs
- Search the FAQ database
- Create support tickets for complex issues

Guidelines:
- Be empathetic and understanding
- Offer specific solutions when possible
- Create tickets for issues you cannot resolve
- If a customer seems frustrated, acknowledge their feelings`,
  memory: {
    maxMessages: 20,
    strategy: 'sliding-window',
  },
});

// ============================================
// Usage
// ============================================

async function handleCustomerQuery(query: string) {
  console.log(`Customer: ${query}\n`);
  
  try {
    const response = await agent.run(query);
    console.log(`Support: ${response.content}\n`);
    
    if (response.toolResults?.length) {
      console.log(`[Used ${response.toolResults.length} tool(s)]`);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Example queries
await handleCustomerQuery("Hi, I'd like to check on my order ORD-001");
await handleCustomerQuery("What's your return policy?");
await handleCustomerQuery("I'm frustrated - my package hasn't arrived!");
```

## Key Patterns

### 1. Tool Composition

The agent decides which tools to use based on the query:

- Order questions → `lookup_order`
- General questions → `search_faq`
- Complex issues → `create_ticket`

### 2. Sentiment-Aware Middleware

```typescript
const sentimentMiddleware = createMiddleware({
  name: 'sentiment',
  beforeRequest: async (context) => {
    // Detect negative sentiment
    context.metadata.sentiment = detectSentiment(lastMessage);
    return context;
  },
});
```

The agent can access `context.metadata.sentiment` to adjust its tone.

### 3. Graceful Tool Failures

```typescript
execute: async ({ orderId }) => {
  const order = orders.get(orderId);
  
  if (!order) {
    return { found: false, message: 'Order not found.' };
  }

  return { found: true, order };
}
```

Return structured responses instead of throwing errors so the LLM can handle gracefully.

## Try It

```bash
# Clone the repo
git clone https://github.com/mpalmer79/agentforge.git
cd agentforge

# Install dependencies
npm install

# Set your API key
export OPENAI_API_KEY=your-key

# Run the example
npx ts-node examples/customer-support/index.ts
```
