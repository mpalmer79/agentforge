/**
 * Provider Factory and Multi-Provider Management
 *
 * Advanced provider abstraction with:
 * - Factory pattern for provider creation
 * - Multi-provider failover
 * - Load balancing
 * - Provider health monitoring
 * - Automatic provider selection
 */

import type { Provider, CompletionRequest, CompletionResponse, StreamChunk } from './types';
import { OpenAIProvider, AnthropicProvider } from './providers';
import type { OpenAIProviderConfig, AnthropicProviderConfig } from './providers';
import { CircuitBreaker, HealthChecker, withFallback } from './resilience';
import { getTelemetry } from './telemetry';
import { getLogger } from './logging';

// ============================================
// Types
// ============================================

export type ProviderType = 'openai' | 'anthropic' | 'azure' | 'custom';

export interface ProviderFactoryConfig {
  openai?: OpenAIProviderConfig;
  anthropic?: AnthropicProviderConfig;
  azure?: AzureOpenAIConfig;
  custom?: CustomProviderConfig[];
}

export interface AzureOpenAIConfig {
  apiKey: string;
  endpoint: string;
  deploymentId: string;
  apiVersion?: string;
}

export interface CustomProviderConfig {
  name: string;
  provider: Provider;
}

export interface MultiProviderConfig {
  /** Primary provider to use */
  primary: ProviderType;

  /** Fallback providers in order of preference */
  fallbacks?: ProviderType[];

  /** Enable circuit breaker per provider */
  circuitBreaker?: boolean;

  /** Enable health checks */
  healthCheck?: boolean;

  /** Load balancing strategy */
  loadBalancing?: 'round-robin' | 'least-latency' | 'random' | 'none';

  /** Provider-specific overrides */
  providers: ProviderFactoryConfig;
}

export interface ProviderStats {
  name: string;
  type: ProviderType;
  healthy: boolean;
  latencyMs: number;
  requestCount: number;
  errorCount: number;
  lastUsed?: number;
  circuitState?: 'closed' | 'open' | 'half-open';
}

// ============================================
// Provider Factory
// ============================================

export class ProviderFactory {
  private providers: Map<ProviderType, Provider> = new Map();
  private circuitBreakers: Map<ProviderType, CircuitBreaker> = new Map();
  private healthCheckers: Map<ProviderType, HealthChecker> = new Map();
  private stats: Map<ProviderType, ProviderStats> = new Map();
  private config: MultiProviderConfig;
  private roundRobinIndex = 0;
  private logger = getLogger().child({ component: 'ProviderFactory' });

  constructor(config: MultiProviderConfig) {
    this.config = config;
    this.initializeProviders();
  }

  // ---- Provider Management ----

  private initializeProviders(): void {
    const { providers, circuitBreaker, healthCheck } = this.config;

    // Initialize OpenAI
    if (providers.openai) {
      const provider = new OpenAIProvider(providers.openai);
      this.registerProvider('openai', provider, circuitBreaker, healthCheck);
    }

    // Initialize Anthropic
    if (providers.anthropic) {
      const provider = new AnthropicProvider(providers.anthropic);
      this.registerProvider('anthropic', provider, circuitBreaker, healthCheck);
    }

    // Initialize Azure OpenAI
    if (providers.azure) {
      const provider = this.createAzureProvider(providers.azure);
      this.registerProvider('azure', provider, circuitBreaker, healthCheck);
    }

    // Initialize custom providers
    if (providers.custom) {
      for (const custom of providers.custom) {
        this.registerProvider('custom', custom.provider, circuitBreaker, healthCheck);
      }
    }
  }

  private registerProvider(
    type: ProviderType,
    provider: Provider,
    enableCircuitBreaker = true,
    enableHealthCheck = true
  ): void {
    this.providers.set(type, provider);

    // Initialize stats
    this.stats.set(type, {
      name: provider.name,
      type,
      healthy: true,
      latencyMs: 0,
      requestCount: 0,
      errorCount: 0,
    });

    // Initialize circuit breaker
    if (enableCircuitBreaker) {
      const cb = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeoutMs: 30000,
        onStateChange: (from, to) => {
          this.logger.info(`Circuit breaker state change for ${type}`, { from, to });
          const stats = this.stats.get(type);
          if (stats) {
            stats.circuitState = to;
            stats.healthy = to !== 'open';
          }
        },
      });
      this.circuitBreakers.set(type, cb);
    }

    // Initialize health checker
    if (enableHealthCheck) {
      const hc = new HealthChecker(
        async () => {
          // Simple health check - try a minimal completion
          await provider.complete({
            messages: [{ id: 'hc', role: 'user', content: 'Hi', timestamp: Date.now() }],
            maxTokens: 1,
          });
        },
        60000, // Check every minute
        2
      );
      this.healthCheckers.set(type, hc);
      hc.start();
    }
  }

  private createAzureProvider(config: AzureOpenAIConfig): Provider {
    // Create Azure OpenAI compatible provider
    const baseURL = `${config.endpoint}/openai/deployments/${config.deploymentId}`;

    return new OpenAIProvider({
      apiKey: config.apiKey,
      baseURL,
      model: config.deploymentId,
      defaultHeaders: {
        'api-key': config.apiKey,
      },
    } as OpenAIProviderConfig);
  }

  // ---- Provider Selection ----

  /**
   * Get the best available provider based on configuration
   */
  getProvider(): Provider {
    const { primary, fallbacks = [], loadBalancing = 'none' } = this.config;

    // Get all candidate providers
    const candidates = [primary, ...fallbacks].filter((type) => {
      const provider = this.providers.get(type);
      const stats = this.stats.get(type);
      return provider && stats?.healthy;
    });

    if (candidates.length === 0) {
      throw new Error('No healthy providers available');
    }

    // Select based on load balancing strategy
    let selectedType: ProviderType;

    switch (loadBalancing) {
      case 'round-robin':
        selectedType = candidates[this.roundRobinIndex % candidates.length];
        this.roundRobinIndex++;
        break;

      case 'least-latency':
        selectedType = candidates.reduce((best, type) => {
          const bestStats = this.stats.get(best)!;
          const typeStats = this.stats.get(type)!;
          return typeStats.latencyMs < bestStats.latencyMs ? type : best;
        });
        break;

      case 'random':
        selectedType = candidates[Math.floor(Math.random() * candidates.length)];
        break;

      default:
        selectedType = candidates[0];
    }

    return this.providers.get(selectedType)!;
  }

  /**
   * Get a specific provider by type
   */
  getProviderByType(type: ProviderType): Provider | undefined {
    return this.providers.get(type);
  }

  // ---- Completion with Failover ----

  /**
   * Execute completion with automatic failover
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const { primary, fallbacks = [] } = this.config;
    const providerOrder = [primary, ...fallbacks];

    const fallbackProviders = providerOrder
      .map((type) => {
        const provider = this.providers.get(type);
        const cb = this.circuitBreakers.get(type);
        const stats = this.stats.get(type);

        if (!provider || !stats) return null;

        return {
          name: type,
          isAvailable: () => stats.healthy && cb?.getState() !== 'open',
          execute: async () => {
            const startTime = Date.now();
            stats.requestCount++;
            stats.lastUsed = startTime;

            try {
              const executeFn = () => provider.complete(request);
              const response = cb ? await cb.execute(executeFn) : await executeFn();

              stats.latencyMs = Date.now() - startTime;
              getTelemetry().recordLatency(`provider.${type}.latency`, stats.latencyMs);

              return response;
            } catch (error) {
              stats.errorCount++;
              stats.latencyMs = Date.now() - startTime;
              throw error;
            }
          },
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    return withFallback(fallbackProviders, (from, to, error) => {
      this.logger.warn(`Provider ${from} failed, falling back to ${to}`, { error: error.message });
      getTelemetry().incrementCounter('provider.failover', { from, to });
    });
  }

  /**
   * Execute streaming completion with automatic failover
   */
  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const { primary, fallbacks = [] } = this.config;
    const providerOrder = [primary, ...fallbacks];

    let lastError: Error | undefined;

    for (const type of providerOrder) {
      const provider = this.providers.get(type);
      const cb = this.circuitBreakers.get(type);
      const stats = this.stats.get(type);

      if (!provider || !stats?.healthy) continue;
      if (cb?.getState() === 'open') continue;

      try {
        const startTime = Date.now();
        stats.requestCount++;
        stats.lastUsed = startTime;

        for await (const chunk of provider.stream(request)) {
          yield chunk;
        }

        stats.latencyMs = Date.now() - startTime;
        return; // Success, exit
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        stats.errorCount++;
        this.logger.warn(`Stream from ${type} failed`, { error: lastError.message });
      }
    }

    throw lastError ?? new Error('No providers available for streaming');
  }

  // ---- Status & Monitoring ----

  /**
   * Get status of all providers
   */
  getStats(): ProviderStats[] {
    return Array.from(this.stats.values()).map((stats) => ({
      ...stats,
      circuitState: this.circuitBreakers.get(stats.type)?.getState(),
    }));
  }

  /**
   * Get health status
   */
  isHealthy(): boolean {
    return Array.from(this.stats.values()).some((s) => s.healthy);
  }

  /**
   * Reset a specific provider's circuit breaker
   */
  resetCircuitBreaker(type: ProviderType): void {
    this.circuitBreakers.get(type)?.reset();
    const stats = this.stats.get(type);
    if (stats) {
      stats.healthy = true;
      stats.circuitState = 'closed';
    }
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    for (const hc of this.healthCheckers.values()) {
      hc.stop();
    }
    this.healthCheckers.clear();
    this.circuitBreakers.clear();
    this.providers.clear();
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a simple single-provider factory
 */
export function createSingleProvider(type: 'openai', config: OpenAIProviderConfig): Provider;
export function createSingleProvider(type: 'anthropic', config: AnthropicProviderConfig): Provider;
export function createSingleProvider(
  type: ProviderType,
  config: OpenAIProviderConfig | AnthropicProviderConfig
): Provider {
  switch (type) {
    case 'openai':
      return new OpenAIProvider(config as OpenAIProviderConfig);
    case 'anthropic':
      return new AnthropicProvider(config as AnthropicProviderConfig);
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

/**
 * Create a multi-provider factory with failover
 */
export function createMultiProvider(config: MultiProviderConfig): ProviderFactory {
  return new ProviderFactory(config);
}

/**
 * Quick setup for OpenAI + Anthropic failover
 */
export function createFailoverProvider(
  openaiKey: string,
  anthropicKey: string,
  options: {
    primaryModel?: string;
    fallbackModel?: string;
  } = {}
): ProviderFactory {
  return new ProviderFactory({
    primary: 'openai',
    fallbacks: ['anthropic'],
    circuitBreaker: true,
    healthCheck: false, // Disable for cost savings
    providers: {
      openai: {
        apiKey: openaiKey,
        model: options.primaryModel ?? 'gpt-4-turbo',
      },
      anthropic: {
        apiKey: anthropicKey,
        model: options.fallbackModel ?? 'claude-3-sonnet-20240229',
      },
    },
  });
}

// ============================================
// Provider Wrapper with Instrumentation
// ============================================

/**
 * Wrap a provider with telemetry and logging
 */
export function instrumentProvider(provider: Provider): Provider {
  const telemetry = getTelemetry();
  const logger = getLogger().child({ provider: provider.name });

  return {
    name: provider.name,

    async complete(request: CompletionRequest): Promise<CompletionResponse> {
      const traceId = telemetry.startTrace({ provider: provider.name, operation: 'complete' });
      const spanId = telemetry.startSpan(traceId, 'provider.complete');
      const startTime = Date.now();

      logger.debug('Starting completion request', {
        messageCount: request.messages.length,
        tools: request.tools?.length ?? 0,
      });

      try {
        const response = await provider.complete(request);
        const duration = Date.now() - startTime;

        telemetry.endSpan(spanId, 'ok', { duration });
        telemetry.recordLatency('provider.complete.duration', duration, {
          provider: provider.name,
        });

        if (response.usage) {
          telemetry.recordTokens('provider.tokens.prompt', response.usage.promptTokens);
          telemetry.recordTokens('provider.tokens.completion', response.usage.completionTokens);
        }

        logger.info('Completion successful', {
          duration,
          finishReason: response.finishReason,
          usage: response.usage,
        });

        return response;
      } catch (error) {
        const duration = Date.now() - startTime;
        telemetry.endSpan(spanId, 'error');
        telemetry.incrementCounter('provider.complete.error', { provider: provider.name });
        logger.error('Completion failed', error instanceof Error ? error : undefined, { duration });
        throw error;
      } finally {
        telemetry.endTrace(traceId);
      }
    },

    async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
      const traceId = telemetry.startTrace({ provider: provider.name, operation: 'stream' });
      const spanId = telemetry.startSpan(traceId, 'provider.stream');
      const startTime = Date.now();
      let chunkCount = 0;

      logger.debug('Starting stream request');

      try {
        for await (const chunk of provider.stream(request)) {
          chunkCount++;
          yield chunk;
        }

        const duration = Date.now() - startTime;
        telemetry.endSpan(spanId, 'ok', { duration, chunkCount });
        logger.info('Stream completed', { duration, chunkCount });
      } catch (error) {
        telemetry.endSpan(spanId, 'error');
        logger.error('Stream failed', error instanceof Error ? error : undefined);
        throw error;
      } finally {
        telemetry.endTrace(traceId);
      }
    },
  };
}
