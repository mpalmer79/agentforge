/**
 * Data Analyst Agent Example
 *
 * Demonstrates an agent that can query databases, perform calculations,
 * and generate insights from data.
 */

import { Agent, OpenAIProvider, defineTool } from '../../src';
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
  { id: '6', date: '2024-01-17', product: 'Gadget D', category: 'Gadgets', quantity: 80, revenue: 4800, region: 'South' },
  { id: '7', date: '2024-01-18', product: 'Widget A', category: 'Widgets', quantity: 180, revenue: 5400, region: 'East' },
  { id: '8', date: '2024-01-18', product: 'Widget C', category: 'Widgets', quantity: 90, revenue: 4500, region: 'West' },
  { id: '9', date: '2024-01-19', product: 'Gadget B', category: 'Gadgets', quantity: 200, revenue: 10000, region: 'North' },
  { id: '10', date: '2024-01-19', product: 'Gadget D', category: 'Gadgets', quantity: 150, revenue: 9000, region: 'South' },
];

// ============================================
// Tools
// ============================================

const querySalesTool = defineTool({
  name: 'query_sales',
  description: 'Query the sales database with optional filters for date range, category, region, or product',
  parameters: z.object({
    startDate: z.string().optional().describe('Start date (YYYY-MM-DD)'),
    endDate: z.string().optional().describe('End date (YYYY-MM-DD)'),
    category: z.string().optional().describe('Product category to filter'),
    region: z.string().optional().describe('Sales region to filter'),
    product: z.string().optional().describe('Specific product name'),
    limit: z.number().optional().default(100).describe('Max records to return'),
  }),
  execute: async ({ startDate, endDate, category, region, product, limit }) => {
    let results = [...salesData];

    if (startDate) {
      results = results.filter((r) => r.date >= startDate);
    }
    if (endDate) {
      results = results.filter((r) => r.date <= endDate);
    }
    if (category) {
      results = results.filter((r) => r.category.toLowerCase() === category.toLowerCase());
    }
    if (region) {
      results = results.filter((r) => r.region.toLowerCase() === region.toLowerCase());
    }
    if (product) {
      results = results.filter((r) => r.product.toLowerCase().includes(product.toLowerCase()));
    }

    return {
      totalRecords: results.length,
      records: results.slice(0, limit),
    };
  },
});

const calculateStatsTool = defineTool({
  name: 'calculate_stats',
  description: 'Calculate aggregate statistics (sum, average, min, max, count) on sales data',
  parameters: z.object({
    metric: z.enum(['revenue', 'quantity']).describe('The metric to calculate'),
    operation: z.enum(['sum', 'average', 'min', 'max', 'count']).describe('The operation to perform'),
    groupBy: z.enum(['category', 'region', 'product', 'date']).optional().describe('Group results by field'),
    filters: z.object({
      category: z.string().optional(),
      region: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).optional(),
  }),
  execute: async ({ metric, operation, groupBy, filters }) => {
    let data = [...salesData];

    if (filters) {
      if (filters.category) {
        data = data.filter((r) => r.category.toLowerCase() === filters.category!.toLowerCase());
      }
      if (filters.region) {
        data = data.filter((r) => r.region.toLowerCase() === filters.region!.toLowerCase());
      }
      if (filters.startDate) {
        data = data.filter((r) => r.date >= filters.startDate!);
      }
      if (filters.endDate) {
        data = data.filter((r) => r.date <= filters.endDate!);
      }
    }

    const calculate = (values: number[]): number => {
      switch (operation) {
        case 'sum':
          return values.reduce((a, b) => a + b, 0);
        case 'average':
          return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        case 'min':
          return Math.min(...values);
        case 'max':
          return Math.max(...values);
        case 'count':
          return values.length;
      }
    };

    if (groupBy) {
      const groups = new Map<string, number[]>();
      
      for (const record of data) {
        const key = record[groupBy as keyof SalesRecord] as string;
        const value = record[metric];
        
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(value);
      }

      const results: Record<string, number> = {};
      for (const [key, values] of groups) {
        results[key] = calculate(values);
      }

      return {
        metric,
        operation,
        groupBy,
        results,
      };
    }

    const values = data.map((r) => r[metric]);
    
    return {
      metric,
      operation,
      result: calculate(values),
      recordCount: data.length,
    };
  },
});

const compareTool = defineTool({
  name: 'compare_metrics',
  description: 'Compare metrics between two categories, regions, or time periods',
  parameters: z.object({
    metric: z.enum(['revenue', 'quantity']).describe('Metric to compare'),
    compareBy: z.enum(['category', 'region']).describe('Dimension to compare'),
    value1: z.string().describe('First value to compare'),
    value2: z.string().describe('Second value to compare'),
  }),
  execute: async ({ metric, compareBy, value1, value2 }) => {
    const getData = (filterValue: string) => {
      return salesData
        .filter((r) => {
          const fieldValue = r[compareBy as keyof SalesRecord] as string;
          return fieldValue.toLowerCase() === filterValue.toLowerCase();
        })
        .reduce((sum, r) => sum + r[metric], 0);
    };

    const total1 = getData(value1);
    const total2 = getData(value2);
    const difference = total1 - total2;
    const percentDiff = total2 !== 0 ? ((difference / total2) * 100).toFixed(2) : 'N/A';

    return {
      comparison: {
        [value1]: total1,
        [value2]: total2,
      },
      difference,
      percentageDifference: percentDiff + '%',
      winner: total1 > total2 ? value1 : total2 > total1 ? value2 : 'tie',
    };
  },
});

const trendAnalysisTool = defineTool({
  name: 'analyze_trend',
  description: 'Analyze trends over time for a specific metric',
  parameters: z.object({
    metric: z.enum(['revenue', 'quantity']).describe('Metric to analyze'),
    category: z.string().optional().describe('Filter by category'),
  }),
  execute: async ({ metric, category }) => {
    let data = [...salesData];
    
    if (category) {
      data = data.filter((r) => r.category.toLowerCase() === category.toLowerCase());
    }

    const byDate = new Map<string, number>();
    for (const record of data) {
      const current = byDate.get(record.date) || 0;
      byDate.set(record.date, current + record[metric]);
    }

    const sortedDates = Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const values = sortedDates.map(([, v]) => v);

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    const trend = avgSecond > avgFirst ? 'increasing' : avgSecond < avgFirst ? 'decreasing' : 'stable';
    const changePercent = ((avgSecond - avgFirst) / avgFirst * 100).toFixed(2);

    return {
      metric,
      category: category || 'all',
      dataPoints: sortedDates.map(([date, value]) => ({ date, value })),
      trend,
      changePercent: changePercent + '%',
      summary: `${metric} is ${trend} with a ${changePercent}% change`,
    };
  },
});

// ============================================
// Main
// ============================================

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Data Analyst Agent Demo (Mock Mode)');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('Available tools:');
    console.log('  • query_sales - Query sales database with filters');
    console.log('  • calculate_stats - Calculate aggregates (sum, avg, etc.)');
    console.log('  • compare_metrics - Compare between categories/regions');
    console.log('  • analyze_trend - Analyze trends over time');
    console.log('');

    console.log('Demo: Total revenue by region...');
    const statsResult = await calculateStatsTool.execute({
      metric: 'revenue',
      operation: 'sum',
      groupBy: 'region',
    });
    console.log(JSON.stringify(statsResult, null, 2));

    return;
  }

  const agent = new Agent({
    provider: new OpenAIProvider({ apiKey, model: 'gpt-4-turbo' }),
    tools: [querySalesTool, calculateStatsTool, compareTool, trendAnalysisTool],
    systemPrompt: `You are a data analyst assistant. Help users understand their sales data by:
- Querying the database for specific information
- Calculating statistics and aggregates
- Comparing metrics across dimensions
- Identifying trends and patterns

Always explain your findings clearly and suggest follow-up analyses when relevant.`,
  });

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Data Analyst Agent');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  const queries = [
    'What was our total revenue last week?',
    'Compare revenue between North and South regions',
    'Show me the revenue trend for Gadgets',
  ];

  for (const query of queries) {
    console.log(`Analyst: ${query}`);
    console.log('');

    try {
      const response = await agent.run(query);
      console.log(`AI: ${response.content}`);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
    }

    console.log('');
    console.log('─────────────────────────────────────────────────────────────');
    console.log('');
  }
}

main().catch(console.error);
