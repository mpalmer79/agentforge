/**
 * Customer Support Agent Example
 *
 * Demonstrates a multi-tool agent for handling customer inquiries
 * with order lookup, FAQ search, and ticket creation.
 */

import { Agent, OpenAIProvider, defineTool, createMiddleware } from '../../src';
import { z } from 'zod';

// ============================================
// Mock Database
// ============================================

const orders = new Map([
  ['ORD-001', { id: 'ORD-001', status: 'shipped', item: 'Laptop', customer: 'alice@example.com' }],
  ['ORD-002', { id: 'ORD-002', status: 'processing', item: 'Headphones', customer: 'bob@example.com' }],
  ['ORD-003', { id: 'ORD-003', status: 'delivered', item: 'Keyboard', customer: 'carol@example.com' }],
]);

const faqDatabase = [
  { question: 'What is your return policy?', answer: 'We offer 30-day returns on all items.' },
  { question: 'How long does shipping take?', answer: 'Standard shipping takes 5-7 business days.' },
  { question: 'Do you ship internationally?', answer: 'Yes, we ship to over 50 countries.' },
  { question: 'How do I track my order?', answer: 'Use the order lookup tool with your order ID.' },
];

const tickets: Array<{ id: string; issue: string; priority: string; status: string }> = [];

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
      return {
        found: false,
        message: `Order ${orderId} not found. Please verify the order ID.`,
      };
    }

    return {
      found: true,
      order: {
        id: order.id,
        status: order.status,
        item: order.item,
        estimatedDelivery: order.status === 'shipped' ? '2-3 business days' : null,
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
    const queryLower = query.toLowerCase();
    
    const matches = faqDatabase.filter(
      (faq) =>
        faq.question.toLowerCase().includes(queryLower) ||
        faq.answer.toLowerCase().includes(queryLower)
    );

    if (matches.length === 0) {
      return {
        found: false,
        message: 'No FAQ entries found. Consider creating a support ticket.',
      };
    }

    return {
      found: true,
      results: matches.map((faq) => ({
        question: faq.question,
        answer: faq.answer,
      })),
    };
  },
});

const createTicketTool = defineTool({
  name: 'create_ticket',
  description: 'Create a support ticket for issues that need human attention',
  parameters: z.object({
    issue: z.string().describe('Description of the customer issue'),
    priority: z.enum(['low', 'medium', 'high']).describe('Ticket priority level'),
    customerEmail: z.string().email().optional().describe('Customer email for follow-up'),
  }),
  execute: async ({ issue, priority, customerEmail }) => {
    const ticketId = `TKT-${String(tickets.length + 1).padStart(4, '0')}`;
    
    const ticket = {
      id: ticketId,
      issue,
      priority,
      status: 'open',
      customerEmail,
      createdAt: new Date().toISOString(),
    };

    tickets.push(ticket);

    return {
      success: true,
      ticketId,
      message: `Support ticket ${ticketId} created. A team member will respond within 24 hours.`,
      estimatedResponse: priority === 'high' ? '4 hours' : '24 hours',
    };
  },
});

const businessInfoTool = defineTool({
  name: 'get_business_info',
  description: 'Get business hours, contact information, and support channels',
  parameters: z.object({
    infoType: z.enum(['hours', 'contact', 'all']).default('all'),
  }),
  execute: async ({ infoType }) => {
    const info: Record<string, unknown> = {};

    if (infoType === 'hours' || infoType === 'all') {
      info.businessHours = {
        weekdays: '9 AM - 6 PM EST',
        weekends: '10 AM - 4 PM EST',
        holidays: 'Closed',
      };
    }

    if (infoType === 'contact' || infoType === 'all') {
      info.contact = {
        email: 'support@example.com',
        phone: '1-800-EXAMPLE',
        chat: 'Available on website',
      };
    }

    return info;
  },
});

// ============================================
// Middleware
// ============================================

const sentimentMiddleware = createMiddleware({
  name: 'sentiment',
  beforeRequest: async (context) => {
    const lastMessage = context.messages[context.messages.length - 1];
    
    if (lastMessage?.role === 'user') {
      const content = lastMessage.content.toLowerCase();
      const negativeWords = ['angry', 'frustrated', 'terrible', 'awful', 'hate'];
      const isNegative = negativeWords.some((word) => content.includes(word));
      
      context.metadata.sentiment = isNegative ? 'negative' : 'neutral';
      
      if (isNegative) {
        console.log('[Sentiment] Detected frustrated customer - prioritizing empathy');
      }
    }

    return context;
  },
});

const analyticsMiddleware = createMiddleware({
  name: 'analytics',
  onToolCall: async (toolCall) => {
    console.log(`[Analytics] Tool used: ${toolCall.name}`);
    return toolCall;
  },
  afterResponse: async (response, _context) => {
    console.log(`[Analytics] Response length: ${response.content.length} chars`);
    return response;
  },
});

// ============================================
// Main
// ============================================

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Customer Support Agent Demo (Mock Mode)');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('To run with real AI:');
    console.log('  export OPENAI_API_KEY=your-key');
    console.log('');
    console.log('Available tools:');
    console.log('  • lookup_order - Check order status');
    console.log('  • search_faq - Search knowledge base');
    console.log('  • create_ticket - Create support ticket');
    console.log('  • get_business_info - Get contact info');
    console.log('');

    console.log('Demo: Looking up order ORD-001...');
    const orderResult = await orderLookupTool.execute({ orderId: 'ORD-001' });
    console.log(JSON.stringify(orderResult, null, 2));

    console.log('');
    console.log('Demo: Searching FAQ for "return"...');
    const faqResult = await faqSearchTool.execute({ query: 'return' });
    console.log(JSON.stringify(faqResult, null, 2));

    return;
  }

  const agent = new Agent({
    provider: new OpenAIProvider({
      apiKey,
      model: 'gpt-4-turbo',
    }),
    tools: [orderLookupTool, faqSearchTool, createTicketTool, businessInfoTool],
    middleware: [sentimentMiddleware, analyticsMiddleware],
    systemPrompt: `You are a friendly and helpful customer support agent for an e-commerce company.

Your capabilities:
- Look up order status using order IDs
- Search the FAQ database for common questions
- Create support tickets for complex issues
- Provide business hours and contact information

Guidelines:
- Be empathetic and understanding
- Offer specific solutions when possible
- Create tickets for issues you cannot resolve
- Always confirm you've addressed the customer's concern

If a customer seems frustrated, acknowledge their feelings before problem-solving.`,
    memory: {
      maxMessages: 20,
      strategy: 'sliding-window',
    },
  });

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Customer Support Agent');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  const customerQueries = [
    "Hi, I'd like to check on my order ORD-001",
    "What's your return policy?",
    "I'm really frustrated - my package hasn't arrived and it's been 2 weeks!",
  ];

  for (const query of customerQueries) {
    console.log(`Customer: ${query}`);
    console.log('');

    try {
      const response = await agent.run(query);
      console.log(`Support Agent: ${response.content}`);
      
      if (response.toolResults && response.toolResults.length > 0) {
        console.log(`  [Used ${response.toolResults.length} tool(s)]`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
    }

    console.log('');
    console.log('─────────────────────────────────────────────────────────────');
    console.log('');
  }
}

main().catch(console.error);
