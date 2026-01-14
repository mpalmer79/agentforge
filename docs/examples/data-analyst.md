[data-analyst.md](https://github.com/user-attachments/files/24618567/data-analyst.md)
# Data Analyst Agent

An agent that queries databases, performs calculations, and generates insights.

## Overview

This example demonstrates:
- Database query tools
- Statistical aggregation
- Comparative analysis
- Trend detection

## Full Code

```typescript
import { Agent, OpenAIProvider, defineTool } from 'agentforge';
import { z } from 'zod';

// ============================================
// Mock Database
// ============================================

interface SalesRecord {
  id: string;
  date: string;
  product: string;
  category: string;
  quantity: number;
  revenue: number;
  region: string;
}

const salesData: SalesRecord[] = [
  { id: '1', date: '2024-01-15', product: 'Widget A', category: 'Widgets', quantity: 150, revenue: 4500, region: 'North' },
  { id: '2', date: '2024-01-15', product: 'Gadget B', category: 'Gadgets', quantity: 75, revenue: 3750, region: 'South' },
  { id: '3', date: '2024-01-16', product: 'Widget A', category: 'Widgets', quantity: 200, revenue: 6000, region: 'East' },
  { id: '4', date: '2024-01-16', product: 'Widget C', category: 'Widgets', quantity: 100, revenue: 5000, region: 'West' },
  { id: '5', date: '2024-01-17', product: 'Gadget B', category: 'Gadgets', quantity: 120, revenue: 6000, region: 'North' },
  // ... more records
];

// ============================================
// Tools
// ============================================

const querySalesTool = defineTool({
  name: 'query_sales',
  description: 'Query the sales database with optional filters',
  parameters: z.object({
    startDate: z.string().optional().describe('Start date (YYYY-MM-DD)'),
    endDate: z.string().optional().describe('End date (YYYY-MM-DD)'),
    category: z.string().optional().describe('Product category'),
    region: z.string().optional().describe('Sales region'),
    limit: z.number().default(10).describe('Max records'),
  }),
  execute: async ({ startDate, endDate, category, region, limit }) => {
    let results = [...salesData];

    if (startDate) results = results.filter((r) => r.date >= startDate);
    if (endDate) results = results.filter((r) => r.date <= endDate);
    if (category) results = results.filter((r) => 
      r.category.toLowerCase() === category.toLowerCase()
    );
    if (region) results = results.filter((r) => 
      r.region.toLowerCase() === region.toLowerCase()
    );

    return { totalRecords: results.length, records: results.slice(0, limit) };
  },
});

const calculateStatsTool = defineTool({
  name: 'calculate_stats',
  description: 'Calculate aggregate statistics on sales data',
  parameters: z.object({
    metric: z.enum(['revenue', 'quantity']).describe('Metric to calculate'),
    operation: z.enum(['sum', 'average', 'min', 'max', 'count']),
    groupBy: z.enum(['category', 'region', 'product', 'date']).optional(),
    filters: z.object({
      category: z.string().optional(),
      region: z.string().optional(),
    }).optional(),
  }),
  execute: async ({ metric, operation, groupBy, filters }) => {
    let data = [...salesData];

    // Apply filters
    if (filters?.category) {
      data = data.filter((r) => 
        r.category.toLowerCase() === filters.category!.toLowerCase()
      );
    }
    if (filters?.region) {
      data = data.filter((r) => 
        r.region.toLowerCase() === filters.region!.toLowerCase()
      );
    }

    const calculate = (values: number[]): number => {
      switch (operation) {
        case 'sum': return values.reduce((a, b) => a + b, 0);
        case 'average': return values.reduce((a, b) => a + b, 0) / values.length;
        case 'min': return Math.min(...values);
        case 'max': return Math.max(...values);
        case 'count': return values.length;
      }
    };

    if (groupBy) {
      const groups = new Map<string, number[]>();
      
      for (const record of data) {
        const key = record[groupBy as keyof SalesRecord] as string;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(record[metric]);
      }

      const results: Record<string, number> = {};
      for (const [key, values] of groups) {
        results[key] = calculate(values);
      }

      return { metric, operation, groupBy, results };
    }

    return {
      metric,
      operation,
      result: calculate(data.map((r) => r[metric])),
      recordCount: data.length,
    };
  },
});

const compareTool = defineTool({
  name: 'compare_metrics',
  description: 'Compare metrics between two categories or regions',
  parameters: z.object({
    metric: z.enum(['revenue', 'quantity']),
    compareBy: z.enum(['category', 'region']),
    value1: z.string().describe('First value to compare'),
    value2: z.string().describe('Second value to compare'),
  }),
  execute: async ({ metric, compareBy, value1, value2 }) => {
    const getData = (filterValue: string) => {
      return salesData
        .filter((r) => {
          const field = r[compareBy as keyof SalesRecord] as string;
          return field.toLowerCase() === filterValue.toLowerCase();
        })
        .reduce((sum, r) => sum + r[metric], 0);
    };

    const total1 = getData(value1);
    const total2 = getData(value2);
    const difference = total1 - total2;
    const percentDiff = total2 !== 0 
      ? ((difference / total2) * 100).toFixed(2) 
      : 'N/A';

    return {
      comparison: { [value1]: total1, [value2]: total2 },
      difference,
      percentageDifference: percentDiff + '%',
      winner: total1 > total2 ? value1 : total2 > total1 ? value2 : 'tie',
    };
  },
});

const trendAnalysisTool = defineTool({
  name: 'analyze_trend',
  description: 'Analyze trends over time for a metric',
  parameters: z.object({
    metric: z.enum(['revenue', 'quantity']),
    category: z.string().optional().describe('Filter by category'),
  }),
  execute: async ({ metric, category }) => {
    let data = [...salesData];
    
    if (category) {
      data = data.filter((r) => 
        r.category.toLowerCase() === category.toLowerCase()
      );
    }

    // Group by date
    const byDate = new Map<string, number>();
    for (const record of data) {
      const current = byDate.get(record.date) || 0;
      byDate.set(record.date, current + record[metric]);
    }

    const sorted = Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]));
    
    const values = sorted.map(([, v]) => v);
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    const trend = avgSecond > avgFirst ? 'increasing' 
      : avgSecond < avgFirst ? 'decreasing' 
      : 'stable';

    return {
      metric,
      category: category || 'all',
      dataPoints: sorted.map(([date, value]) => ({ date, value })),
      trend,
      changePercent: ((avgSecond - avgFirst) / avgFirst * 100).toFixed(2) + '%',
    };
  },
});

// ============================================
// Agent
// ============================================

const agent = new Agent({
  provider: new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! }),
  tools: [querySalesTool, calculateStatsTool, compareTool, trendAnalysisTool],
  systemPrompt: `You are a data analyst assistant. Help users understand their sales data by:
- Querying the database for specific information
- Calculating statistics and aggregates
- Comparing metrics across dimensions
- Identifying trends and patterns

Always explain your findings clearly and suggest follow-up analyses.`,
});

// ============================================
// Usage
// ============================================

async function analyze(question: string) {
  console.log(`Question: ${question}\n`);
  const response = await agent.run(question);
  console.log(`Analysis: ${response.content}\n`);
}

await analyze('What was our total revenue last week?');
await analyze('Compare revenue between North and South regions');
await analyze('Show me the revenue trend for Gadgets');
```

## Key Patterns

### 1. Flexible Filtering

```typescript
parameters: z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  category: z.string().optional(),
  region: z.string().optional(),
}),
```

Optional parameters let the LLM build targeted queries.

### 2. Grouping and Aggregation

```typescript
if (groupBy) {
  const groups = new Map<string, number[]>();
  // Group values by dimension
  // Calculate aggregate for each group
}
```

### 3. Comparative Analysis

```typescript
return {
  comparison: { [value1]: total1, [value2]: total2 },
  difference,
  percentageDifference,
  winner,
};
```

Structured output helps the LLM explain results clearly.

## Try It

```bash
export OPENAI_API_KEY=your-key
npx ts-node examples/data-analyst/index.ts
```
