import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Agent } from '../../src/agent';
import type { ExtendedAgentConfig } from '../../src/agent';
import type { Provider, CompletionResponse, Message } from '../../src/types';
import { TelemetryCollector } from '../../src/telemetry';
import { ConversationManager, MemoryStorageAdapter } from '../../src/persistence';
import { ProviderFactory } from '../../src/provider-factory';

// ============================================
// Mock Provider
// ============================================

function createMockProvider(options: {
  name?: string;
  responses?: Array<Partial<CompletionResponse>>;
  failCount?: number;
  latencyMs?: number;
} = {}): Provider {
  const {
    name = 'mock-provider',
    responses = [{ id: 'resp_1', content: 'Hello!', finishReason: 'stop' as const }],
    failCount = 0,
    latencyMs = 0,
  } = options;

  let callCount = 0;
  let responseIndex = 0;

  return {
    name,
    async complete() {
      callCount++;
      
      if (latencyMs > 0) {
        await new Promise(resolve => setTimeout(resolve, latencyMs));
      }

      if (callCount <= failCount) {
        throw new Error(`Mock failure ${callCount}`);
      }

      const response = responses[responseIndex % responses.length];
      responseIndex++;

      return {
        id: response.id ?? `resp_${callCount}`,
        content: response.content ?? '',
        finishReason: response.finishReason ?? 'stop',
        toolCalls: response.toolCalls,
        usage: response.usage ?? { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      };
    },
    async *stream() {
      yield { id: 'chunk_1', delta: { content: 'Hello' } };
      yield { id: 'chunk_2', delta: { content: ' World!' }, finishReason: 'stop' as const };
    },
  };
}

// ============================================
// Integration Tests
// ============================================

describe('Agent with Staff-Level Features', () => {
  let telemetry: TelemetryCollector;
  let telemetryHooks: {
    onSpan: ReturnType<typeof vi.fn>;
    onMetric: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    telemetryHooks = {
      onSpan: vi.fn(),
      onMetric: vi.fn(),
    };
    telemetry = new TelemetryCollector(telemetryHooks);
  });

  describe('Telemetry Integration', () => {
    it('should emit telemetry spans for agent run', async () => {
      const agent = new Agent({
        provider: createMockProvider(),
        telemetry,
      });

      await agent.run('Hello');

      expect(telemetryHooks.onSpan).toHaveBeenCalled();
      const spans = telemetryHooks.onSpan.mock.calls.map(call => call[0]);
      
      expect(spans.some(s => s.name === 'agent.run')).toBe(true);
      expect(spans.some(s => s.name.includes('provider'))).toBe(true);
    });

    it('should track token usage metrics', async () => {
      const agent = new Agent({
        provider: createMockProvider({
          responses: [{
            id: 'resp_1',
            content: 'Hello',
            finishReason: 'stop',
            usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          }],
        }),
        telemetry,
      });

      await agent.run('Test');

      expect(telemetryHooks.onMetric).toHaveBeenCalled();
      const metrics = telemetryHooks.onMetric.mock.calls.map(call => call[0]);
      
      const tokenMetrics = metrics.filter(m => m.name.includes('tokens'));
      expect(tokenMetrics.length).toBeGreaterThan(0);
    });

    it('should track latency metrics', async () => {
      const agent = new Agent({
        provider: createMockProvider({ latencyMs: 50 }),
        telemetry,
      });

      await agent.run('Test');

      const metrics = telemetryHooks.onMetric.mock.calls.map(call => call[0]);
      const latencyMetrics = metrics.filter(m => m.unit === 'ms');
      expect(latencyMetrics.length).toBeGreaterThan(0);
    });
  });

  describe('Circuit Breaker Integration', () => {
    it('should trip circuit breaker after failures', async () => {
      const agent = new Agent({
        provider: createMockProvider({ failCount: 100 }), // Always fail
        telemetry,
        circuitBreaker: {
          enabled: true,
          failureThreshold: 3,
          resetTimeoutMs: 10000, // Long timeout so it stays open
        },
        // Disable retries so each call counts as one failure
        retry: {
          maxRetries: 0,
        },
      });

      // First few failures should go through and trip the breaker
      for (let i = 0; i < 3; i++) {
        await expect(agent.run('Test')).rejects.toThrow(/Mock failure/);
      }

      // Circuit should be open now
      const health = agent.getHealth();
      expect(health.circuitBreaker?.state).toBe('open');

      // Subsequent requests should fail fast with circuit breaker error
      await expect(agent.run('Test')).rejects.toThrow(/Circuit breaker is open/);
    });

    it('should recover after reset timeout', async () => {
      // Create a provider that fails first 2 times, then succeeds
      let callCount = 0;
      const provider: Provider = {
        name: 'recovering-provider',
        async complete() {
          callCount++;
          if (callCount <= 2) {
            throw new Error(`Mock failure ${callCount}`);
          }
          return { id: 'resp', content: 'Success after recovery', finishReason: 'stop' };
        },
        async *stream() {
          yield { id: 'chunk', delta: { content: 'Hi' } };
        },
      };

      const agent = new Agent({
        provider,
        telemetry,
        circuitBreaker: {
          enabled: true,
          failureThreshold: 2,
          resetTimeoutMs: 50, // Short timeout for test
        },
        retry: {
          maxRetries: 0, // Disable retries
        },
      });

      // Trip the breaker with 2 failures
      await expect(agent.run('Test')).rejects.toThrow(/Mock failure 1/);
      await expect(agent.run('Test')).rejects.toThrow(/Mock failure 2/);

      // Verify circuit is open
      expect(agent.getHealth().circuitBreaker?.state).toBe('open');

      // Wait for reset timeout (half-open state)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Next request should go through (half-open allows one request)
      // Provider now succeeds (callCount > 2)
      const result = await agent.run('Test');
      expect(result.content).toBe('Success after recovery');
      
      // Circuit should be closed again after success
      expect(agent.getHealth().circuitBreaker?.state).toBe('closed');
    });
  });

  describe('Request Deduplication', () => {
    it('should deduplicate identical concurrent requests', async () => {
      let callCount = 0;
      const provider: Provider = {
        name: 'counting-provider',
        async complete() {
          callCount++;
          await new Promise(resolve => setTimeout(resolve, 50));
          return { id: 'resp_1', content: 'Hello', finishReason: 'stop' };
        },
        async *stream() {
          yield { id: 'chunk', delta: { content: 'Hi' } };
        },
      };

      const agent = new Agent({
        provider,
        telemetry,
        deduplication: { enabled: true },
      });

      // Fire two identical requests concurrently
      const [result1, result2] = await Promise.all([
        agent.run('Hello'),
        agent.run('Hello'),
      ]);

      expect(result1.content).toBe(result2.content);
      expect(callCount).toBe(1); // Only one actual call
    });
  });

  describe('Persistence Integration', () => {
    let persistence: ConversationManager;

    beforeEach(async () => {
      persistence = new ConversationManager(new MemoryStorageAdapter());
      await persistence.initialize();
    });

    afterEach(async () => {
      await persistence.close();
    });

    it('should persist conversation messages', async () => {
      persistence.create();
      
      const agent = new Agent({
        provider: createMockProvider(),
        telemetry,
        persistence: { manager: persistence },
      });

      await agent.run('Hello world');

      const conv = persistence.getCurrent();
      expect(conv?.messages.length).toBeGreaterThanOrEqual(2); // user + assistant
    });

    it('should track token usage in persistence', async () => {
      persistence.create();
      
      const agent = new Agent({
        provider: createMockProvider({
          responses: [{
            id: 'resp_1',
            content: 'Hi',
            finishReason: 'stop',
            usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
          }],
        }),
        telemetry,
        persistence: { manager: persistence },
      });

      await agent.run('Test');

      const conv = persistence.getCurrent();
      expect(conv?.metadata.totalTokens).toBe(75);
    });

    it('should record tool calls in persistence', async () => {
      persistence.create();
      
      const agent = new Agent({
        provider: createMockProvider({
          responses: [
            {
              id: 'resp_1',
              content: '',
              finishReason: 'tool_calls',
              toolCalls: [{ id: 'tc_1', name: 'get_time', arguments: {} }],
            },
            {
              id: 'resp_2',
              content: 'The time is noon.',
              finishReason: 'stop',
            },
          ],
        }),
        tools: [{
          name: 'get_time',
          description: 'Get the current time',
          parameters: { type: 'object', properties: {} },
          execute: async () => ({ time: '12:00' }),
          toJSON: () => ({ name: 'get_time', description: 'Get time', parameters: {} }),
        }],
        telemetry,
        persistence: { manager: persistence },
      });

      await agent.run('What time is it?');

      const conv = persistence.getCurrent();
      expect(conv?.metadata.toolCallCount).toBe(1);
    });
  });

  describe('Tool Execution with Timeouts', () => {
    it('should timeout slow tools', async () => {
      const agent = new Agent({
        provider: createMockProvider({
          responses: [
            {
              id: 'resp_1',
              content: '',
              finishReason: 'tool_calls',
              toolCalls: [{ id: 'tc_1', name: 'slow_tool', arguments: {} }],
            },
            {
              id: 'resp_2',
              content: 'Done',
              finishReason: 'stop',
            },
          ],
        }),
        tools: [{
          name: 'slow_tool',
          description: 'A slow tool',
          parameters: { type: 'object', properties: {} },
          execute: async () => {
            await new Promise(resolve => setTimeout(resolve, 200));
            return { result: 'done' };
          },
          toJSON: () => ({ name: 'slow_tool', description: 'Slow', parameters: {} }),
        }],
        telemetry,
        timeouts: {
          toolExecutionMs: 50, // Very short timeout
        },
      });

      const result = await agent.run('Run slow tool');
      
      // Tool should have timed out, but agent continues with error message
      expect(result.messages.some(m => 
        m.role === 'tool' && m.content.includes('timed out')
      )).toBe(true);
    });
  });

  describe('Health Monitoring', () => {
    it('should report health status', () => {
      const agent = new Agent({
        provider: createMockProvider(),
        telemetry,
        circuitBreaker: { enabled: true },
        concurrency: { maxConcurrent: 5 },
        deduplication: { enabled: true },
      });

      const health = agent.getHealth();

      expect(health.circuitBreaker).toBeDefined();
      expect(health.bulkhead).toBeDefined();
      expect(health.deduplicator).toBeDefined();
    });

    it('should allow circuit breaker reset', async () => {
      const agent = new Agent({
        provider: createMockProvider({ failCount: 5 }),
        telemetry,
        circuitBreaker: {
          enabled: true,
          failureThreshold: 2,
        },
        retry: {
          maxRetries: 0,
        },
      });

      // Trip the breaker
      await expect(agent.run('Test')).rejects.toThrow();
      await expect(agent.run('Test')).rejects.toThrow();

      expect(agent.getHealth().circuitBreaker?.state).toBe('open');

      // Reset it
      agent.resetCircuitBreaker();
      expect(agent.getHealth().circuitBreaker?.state).toBe('closed');
    });
  });
});

describe('ProviderFactory Integration', () => {
  it('should create multi-provider with failover', async () => {
    const primaryCalls: string[] = [];
    const fallbackCalls: string[] = [];

    const primaryProvider: Provider = {
      name: 'primary',
      async complete() {
        primaryCalls.push('call');
        throw new Error('Primary failed');
      },
      async *stream() {},
    };

    const fallbackProvider: Provider = {
      name: 'fallback',
      async complete() {
        fallbackCalls.push('call');
        return { id: 'resp', content: 'From fallback', finishReason: 'stop' };
      },
      async *stream() {},
    };

    const factory = new ProviderFactory({
      primary: 'openai',
      fallbacks: ['anthropic'],
      circuitBreaker: false,
      healthCheck: false,
      providers: {
        custom: [
          { name: 'primary', provider: primaryProvider },
          { name: 'fallback', provider: fallbackProvider },
        ],
      },
    });

    // Override with our mock providers
    (factory as any).providers.set('openai', primaryProvider);
    (factory as any).providers.set('anthropic', fallbackProvider);
    (factory as any).stats.set('openai', { name: 'openai', type: 'openai', healthy: true, latencyMs: 0, requestCount: 0, errorCount: 0 });
    (factory as any).stats.set('anthropic', { name: 'anthropic', type: 'anthropic', healthy: true, latencyMs: 0, requestCount: 0, errorCount: 0 });

    const result = await factory.complete({
      messages: [{ id: 'msg', role: 'user', content: 'Test', timestamp: Date.now() }],
    });

    expect(primaryCalls.length).toBe(1);
    expect(fallbackCalls.length).toBe(1);
    expect(result.content).toBe('From fallback');
  });

  it('should track provider stats', async () => {
    const mockProvider: Provider = {
      name: 'mock',
      async complete() {
        await new Promise(r => setTimeout(r, 10));
        return { id: 'resp', content: 'OK', finishReason: 'stop' };
      },
      async *stream() {},
    };

    const factory = new ProviderFactory({
      primary: 'openai',
      circuitBreaker: false,
      healthCheck: false,
      providers: {},
    });

    // Inject mock
    (factory as any).providers.set('openai', mockProvider);
    (factory as any).stats.set('openai', { 
      name: 'mock', type: 'openai', healthy: true, 
      latencyMs: 0, requestCount: 0, errorCount: 0 
    });

    await factory.complete({
      messages: [{ id: 'msg', role: 'user', content: 'Test', timestamp: Date.now() }],
    });

    const stats = factory.getStats();
    const openaiStats = stats.find(s => s.type === 'openai');
    
    expect(openaiStats?.requestCount).toBe(1);
    expect(openaiStats?.latencyMs).toBeGreaterThan(0);
  });
});

describe('End-to-End Resilience', () => {
  it('should handle cascading failures gracefully', async () => {
    const telemetry = new TelemetryCollector();
    let attempt = 0;

    const unreliableProvider: Provider = {
      name: 'unreliable',
      async complete() {
        attempt++;
        if (attempt <= 2) {
          throw new Error(`Transient failure ${attempt}`);
        }
        return { id: 'resp', content: 'Success on retry', finishReason: 'stop' };
      },
      async *stream() {},
    };

    const agent = new Agent({
      provider: unreliableProvider,
      telemetry,
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5, // High threshold so it doesn't trip
      },
      retry: {
        maxRetries: 3, // Allow retries to eventually succeed
        initialDelayMs: 10,
        maxDelayMs: 50,
      },
    });

    // Should eventually succeed through retry
    const result = await agent.run('Test');
    expect(result.content).toBe('Success on retry');
    expect(attempt).toBe(3);
  });
});
