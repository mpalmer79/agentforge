import { ProviderError } from './errors';
import { getTelemetry } from './telemetry';

// ============================================
// Circuit Breaker
// ============================================

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time in ms before attempting recovery */
  resetTimeoutMs: number;
  /** Number of successful calls in half-open to close circuit */
  successThreshold: number;
  /** Optional: specific errors to count as failures */
  failureFilter?: (error: Error) => boolean;
  /** Called when state changes */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly config: Required<CircuitBreakerConfig>;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      resetTimeoutMs: config.resetTimeoutMs ?? 30000,
      successThreshold: config.successThreshold ?? 2,
      failureFilter: config.failureFilter ?? (() => true),
      onStateChange: config.onStateChange ?? (() => {}),
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      getTelemetry().incrementCounter('circuit_breaker.rejected', { state: this.state });
      throw new ProviderError(
        'Circuit breaker is open - service unavailable',
        'circuit_breaker',
        { statusCode: 503, retryable: true }
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats(): { state: CircuitState; failures: number; successes: number } {
    return {
      state: this.state,
      failures: this.failureCount,
      successes: this.successCount,
    };
  }

  reset(): void {
    this.transitionTo('closed');
    this.failureCount = 0;
    this.successCount = 0;
  }

  private canExecute(): boolean {
    switch (this.state) {
      case 'closed':
        return true;

      case 'open':
        // Check if we should transition to half-open
        if (Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs) {
          this.transitionTo('half-open');
          return true;
        }
        return false;

      case 'half-open':
        return true;

      default:
        return false;
    }
  }

  private onSuccess(): void {
    getTelemetry().incrementCounter('circuit_breaker.success', { state: this.state });

    switch (this.state) {
      case 'half-open':
        this.successCount++;
        if (this.successCount >= this.config.successThreshold) {
          this.transitionTo('closed');
        }
        break;

      case 'closed':
        // Reset failure count on success
        this.failureCount = 0;
        break;
    }
  }

  private onFailure(error: Error): void {
    if (!this.config.failureFilter(error)) {
      return; // Don't count this error
    }

    getTelemetry().incrementCounter('circuit_breaker.failure', { state: this.state });
    this.lastFailureTime = Date.now();

    switch (this.state) {
      case 'closed':
        this.failureCount++;
        if (this.failureCount >= this.config.failureThreshold) {
          this.transitionTo('open');
        }
        break;

      case 'half-open':
        // Any failure in half-open immediately opens circuit
        this.transitionTo('open');
        break;
    }
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) return;

    const oldState = this.state;
    this.state = newState;

    if (newState === 'closed') {
      this.failureCount = 0;
      this.successCount = 0;
    } else if (newState === 'half-open') {
      this.successCount = 0;
    }

    getTelemetry().info('Circuit breaker state change', { from: oldState, to: newState });
    this.config.onStateChange(oldState, newState);
  }
}

// ============================================
// Request Deduplication
// ============================================

interface PendingRequest<T> {
  promise: Promise<T>;
  subscribers: number;
  timestamp: number;
}

export class RequestDeduplicator<T> {
  private pending: Map<string, PendingRequest<T>> = new Map();
  private readonly ttlMs: number;

  constructor(ttlMs = 5000) {
    this.ttlMs = ttlMs;
  }

  /**
   * Execute a request with deduplication
   * If an identical request is in-flight, return the same promise
   */
  async execute(key: string, fn: () => Promise<T>): Promise<T> {
    // Clean up stale entries
    this.cleanup();

    const existing = this.pending.get(key);
    if (existing) {
      existing.subscribers++;
      getTelemetry().incrementCounter('request_dedup.hit');
      return existing.promise;
    }

    getTelemetry().incrementCounter('request_dedup.miss');

    const promise = fn().finally(() => {
      // Remove from pending after completion
      const entry = this.pending.get(key);
      if (entry && entry.promise === promise) {
        this.pending.delete(key);
      }
    });

    this.pending.set(key, {
      promise,
      subscribers: 1,
      timestamp: Date.now(),
    });

    return promise;
  }

  /**
   * Generate a cache key from request parameters
   */
  static generateKey(params: Record<string, unknown>): string {
    return JSON.stringify(params, Object.keys(params).sort());
  }

  getPendingCount(): number {
    return this.pending.size;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.pending) {
      if (now - entry.timestamp > this.ttlMs) {
        this.pending.delete(key);
      }
    }
  }
}

// ============================================
// Bulkhead Pattern (Concurrency Limiter)
// ============================================

export class Bulkhead {
  private running = 0;
  private queue: Array<{
    resolve: (value: void) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueue: number = 100,
    private readonly queueTimeoutMs: number = 30000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  getStats(): { running: number; queued: number; maxConcurrent: number } {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
    };
  }

  private async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      getTelemetry().recordMetric('bulkhead.running', this.running, 'count');
      return;
    }

    if (this.queue.length >= this.maxQueue) {
      getTelemetry().incrementCounter('bulkhead.rejected');
      throw new ProviderError(
        'Bulkhead queue full - too many concurrent requests',
        'bulkhead',
        { statusCode: 429, retryable: true }
      );
    }

    getTelemetry().recordMetric('bulkhead.queued', this.queue.length + 1, 'count');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const idx = this.queue.findIndex((e) => e.resolve === resolve);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
          reject(new ProviderError(
            'Bulkhead queue timeout',
            'bulkhead',
            { statusCode: 408, retryable: true }
          ));
        }
      }, this.queueTimeoutMs);

      this.queue.push({ resolve, reject, timeout });
    });
  }

  private release(): void {
    this.running--;

    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      clearTimeout(next.timeout);
      this.running++;
      next.resolve();
    }

    getTelemetry().recordMetric('bulkhead.running', this.running, 'count');
  }
}

// ============================================
// Retry with Jitter
// ============================================

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Jitter factor 0-1, adds randomness to delay */
  jitter: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Function to determine if error is retryable */
  isRetryable: (error: Error, attempt: number) => boolean;
  /** Called before each retry */
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitter: 0.2,
  backoffMultiplier: 2,
  isRetryable: (error) => {
    if (error instanceof ProviderError) {
      return error.retryable;
    }
    const msg = error.message.toLowerCase();
    return msg.includes('timeout') || msg.includes('rate limit') || msg.includes('503');
  },
};

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === cfg.maxRetries || !cfg.isRetryable(lastError, attempt)) {
        throw lastError;
      }

      const delay = calculateBackoffDelay(attempt, cfg);
      
      getTelemetry().incrementCounter('retry.attempt', { attempt: String(attempt) });
      getTelemetry().recordLatency('retry.delay', delay);
      
      cfg.onRetry?.(lastError, attempt, delay);
      
      await sleep(delay);
    }
  }

  throw lastError;
}

function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  // Exponential backoff
  let delay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
  
  // Apply max cap
  delay = Math.min(delay, config.maxDelayMs);
  
  // Apply jitter
  const jitterRange = delay * config.jitter;
  delay = delay - jitterRange + (Math.random() * jitterRange * 2);
  
  return Math.floor(delay);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// Timeout Wrapper
// ============================================

export class TimeoutError extends Error {
  constructor(message: string, public readonly timeoutMs: number) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message = 'Operation timed out'
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(`${message} after ${timeoutMs}ms`, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

// ============================================
// Health Check
// ============================================

export interface HealthStatus {
  healthy: boolean;
  latencyMs: number;
  lastCheck: number;
  consecutiveFailures: number;
  message?: string;
}

export class HealthChecker {
  private status: HealthStatus = {
    healthy: true,
    latencyMs: 0,
    lastCheck: 0,
    consecutiveFailures: 0,
  };
  
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly checkFn: () => Promise<void>,
    private readonly intervalMs: number = 30000,
    private readonly unhealthyThreshold: number = 3
  ) {}

  start(): void {
    this.check(); // Initial check
    this.checkInterval = setInterval(() => this.check(), this.intervalMs);
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  getStatus(): HealthStatus {
    return { ...this.status };
  }

  isHealthy(): boolean {
    return this.status.healthy;
  }

  private async check(): Promise<void> {
    const startTime = Date.now();
    
    try {
      await withTimeout(this.checkFn(), 10000, 'Health check');
      
      this.status = {
        healthy: true,
        latencyMs: Date.now() - startTime,
        lastCheck: Date.now(),
        consecutiveFailures: 0,
      };
      
      getTelemetry().recordLatency('health_check.latency', this.status.latencyMs);
    } catch (error) {
      this.status.consecutiveFailures++;
      this.status.latencyMs = Date.now() - startTime;
      this.status.lastCheck = Date.now();
      this.status.message = error instanceof Error ? error.message : String(error);
      
      if (this.status.consecutiveFailures >= this.unhealthyThreshold) {
        this.status.healthy = false;
      }
      
      getTelemetry().incrementCounter('health_check.failure');
    }
  }
}

// ============================================
// Fallback Chain
// ============================================

export interface FallbackProvider<T> {
  name: string;
  execute: () => Promise<T>;
  isAvailable?: () => boolean;
}

export async function withFallback<T>(
  providers: FallbackProvider<T>[],
  onFallback?: (from: string, to: string, error: Error) => void
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    
    // Skip unavailable providers
    if (provider.isAvailable && !provider.isAvailable()) {
      getTelemetry().incrementCounter('fallback.skipped', { provider: provider.name });
      continue;
    }

    try {
      const result = await provider.execute();
      
      if (i > 0) {
        getTelemetry().incrementCounter('fallback.used', { provider: provider.name });
      }
      
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (i < providers.length - 1) {
        const nextProvider = providers[i + 1];
        onFallback?.(provider.name, nextProvider.name, lastError);
        getTelemetry().info('Falling back to next provider', {
          from: provider.name,
          to: nextProvider.name,
          error: lastError.message,
        });
      }
    }
  }

  throw lastError ?? new Error('No providers available');
}
