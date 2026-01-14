import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CircuitBreaker,
  RequestDeduplicator,
  Bulkhead,
  retryWithBackoff,
  withTimeout,
  TimeoutError,
  HealthChecker,
  withFallback,
} from '../../src/resilience';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 100,
      successThreshold: 2,
    });
  });

  it('should start in closed state', () => {
    expect(circuitBreaker.getState()).toBe('closed');
  });

  it('should allow requests in closed state', async () => {
    const result = await circuitBreaker.execute(() => Promise.resolve('success'));
    expect(result).toBe('success');
  });

  it('should open after threshold failures', async () => {
    const failingFn = () => Promise.reject(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      await expect(circuitBreaker.execute(failingFn)).rejects.toThrow();
    }

    expect(circuitBreaker.getState()).toBe('open');
  });

  it('should reject requests when open', async () => {
    // Force open state
    const failingFn = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await expect(circuitBreaker.execute(failingFn)).rejects.toThrow();
    }

    await expect(
      circuitBreaker.execute(() => Promise.resolve('success'))
    ).rejects.toThrow(/Circuit breaker is open/);
  });

  it('should transition to half-open after timeout', async () => {
    // Force open state
    const failingFn = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await expect(circuitBreaker.execute(failingFn)).rejects.toThrow();
    }

    // Wait for reset timeout
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Should allow request (half-open)
    const result = await circuitBreaker.execute(() => Promise.resolve('success'));
    expect(result).toBe('success');
    expect(circuitBreaker.getState()).toBe('half-open');
  });

  it('should close after success threshold in half-open', async () => {
    // Force open state
    const failingFn = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await expect(circuitBreaker.execute(failingFn)).rejects.toThrow();
    }

    // Wait for reset timeout
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Succeed twice (threshold is 2)
    await circuitBreaker.execute(() => Promise.resolve('success'));
    await circuitBreaker.execute(() => Promise.resolve('success'));

    expect(circuitBreaker.getState()).toBe('closed');
  });

  it('should call onStateChange callback', async () => {
    const onStateChange = vi.fn();
    const cb = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 100,
      onStateChange,
    });

    const failingFn = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 2; i++) {
      await expect(cb.execute(failingFn)).rejects.toThrow();
    }

    expect(onStateChange).toHaveBeenCalledWith('closed', 'open');
  });

  it('should reset state', async () => {
    // Force open state
    const failingFn = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await expect(circuitBreaker.execute(failingFn)).rejects.toThrow();
    }

    circuitBreaker.reset();
    expect(circuitBreaker.getState()).toBe('closed');
    expect(circuitBreaker.getStats().failures).toBe(0);
  });
});

describe('RequestDeduplicator', () => {
  it('should return same promise for identical concurrent requests', async () => {
    const deduplicator = new RequestDeduplicator<string>();
    let callCount = 0;

    const fn = async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'result';
    };

    const [result1, result2] = await Promise.all([
      deduplicator.execute('key1', fn),
      deduplicator.execute('key1', fn),
    ]);

    expect(result1).toBe('result');
    expect(result2).toBe('result');
    expect(callCount).toBe(1);
  });

  it('should execute separately for different keys', async () => {
    const deduplicator = new RequestDeduplicator<string>();
    let callCount = 0;

    const fn = async () => {
      callCount++;
      return 'result';
    };

    await Promise.all([
      deduplicator.execute('key1', fn),
      deduplicator.execute('key2', fn),
    ]);

    expect(callCount).toBe(2);
  });

  it('should execute again after request completes', async () => {
    const deduplicator = new RequestDeduplicator<string>();
    let callCount = 0;

    const fn = async () => {
      callCount++;
      return 'result';
    };

    await deduplicator.execute('key1', fn);
    await deduplicator.execute('key1', fn);

    expect(callCount).toBe(2);
  });

  it('should generate consistent keys', () => {
    const key1 = RequestDeduplicator.generateKey({ a: 1, b: 2 });
    const key2 = RequestDeduplicator.generateKey({ b: 2, a: 1 });
    expect(key1).toBe(key2);
  });
});

describe('Bulkhead', () => {
  it('should limit concurrent executions', async () => {
    const bulkhead = new Bulkhead(2, 10);
    let concurrent = 0;
    let maxConcurrent = 0;

    const fn = async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 50));
      concurrent--;
      return 'done';
    };

    await Promise.all([
      bulkhead.execute(fn),
      bulkhead.execute(fn),
      bulkhead.execute(fn),
      bulkhead.execute(fn),
    ]);

    expect(maxConcurrent).toBe(2);
  });

  it('should reject when queue is full', async () => {
    const bulkhead = new Bulkhead(1, 1);
    
    const slowFn = async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return 'done';
    };

    // Start two requests (one running, one queued)
    const p1 = bulkhead.execute(slowFn);
    const p2 = bulkhead.execute(slowFn);

    // Third should be rejected (queue full)
    await expect(bulkhead.execute(slowFn)).rejects.toThrow(/queue full/);

    await Promise.all([p1, p2]);
  });

  it('should report stats', () => {
    const bulkhead = new Bulkhead(5, 10);
    const stats = bulkhead.getStats();
    
    expect(stats.maxConcurrent).toBe(5);
    expect(stats.running).toBe(0);
    expect(stats.queued).toBe(0);
  });
});

describe('retryWithBackoff', () => {
  it('should succeed on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await retryWithBackoff(fn, { maxRetries: 3 });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const result = await retryWithBackoff(fn, { 
      maxRetries: 3,
      baseDelayMs: 10,
    });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      retryWithBackoff(fn, { maxRetries: 2, baseDelayMs: 10 })
    ).rejects.toThrow('always fails');
    
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('should call onRetry callback', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    await retryWithBackoff(fn, { 
      maxRetries: 2,
      baseDelayMs: 10,
      onRetry,
    });
    
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 0, expect.any(Number));
  });

  it('should respect isRetryable predicate', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('not retryable'));

    await expect(
      retryWithBackoff(fn, { 
        maxRetries: 3,
        isRetryable: () => false,
      })
    ).rejects.toThrow('not retryable');
    
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('withTimeout', () => {
  it('should resolve if function completes in time', async () => {
    const fn = new Promise<string>((resolve) => {
      setTimeout(() => resolve('success'), 10);
    });

    const result = await withTimeout(fn, 100);
    expect(result).toBe('success');
  });

  it('should reject with TimeoutError if function takes too long', async () => {
    const fn = new Promise<string>((resolve) => {
      setTimeout(() => resolve('success'), 200);
    });

    await expect(withTimeout(fn, 50)).rejects.toThrow(TimeoutError);
  });

  it('should include custom message', async () => {
    const fn = new Promise<string>((resolve) => {
      setTimeout(() => resolve('success'), 200);
    });

    await expect(
      withTimeout(fn, 50, 'Custom timeout message')
    ).rejects.toThrow(/Custom timeout message/);
  });
});

describe('HealthChecker', () => {
  let healthChecker: HealthChecker;

  afterEach(() => {
    healthChecker?.stop();
  });

  it('should report healthy on success', async () => {
    healthChecker = new HealthChecker(
      async () => {},
      100,
      2
    );

    healthChecker.start();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(healthChecker.isHealthy()).toBe(true);
    expect(healthChecker.getStatus().consecutiveFailures).toBe(0);
  });

  it('should report unhealthy after threshold failures', async () => {
    let shouldFail = true;
    healthChecker = new HealthChecker(
      async () => {
        if (shouldFail) throw new Error('unhealthy');
      },
      50,
      2
    );

    healthChecker.start();
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(healthChecker.isHealthy()).toBe(false);
    expect(healthChecker.getStatus().consecutiveFailures).toBeGreaterThanOrEqual(2);
  });
});

describe('withFallback', () => {
  it('should use first available provider', async () => {
    const result = await withFallback([
      { name: 'primary', execute: async () => 'primary result' },
      { name: 'secondary', execute: async () => 'secondary result' },
    ]);

    expect(result).toBe('primary result');
  });

  it('should fallback on primary failure', async () => {
    const result = await withFallback([
      { name: 'primary', execute: async () => { throw new Error('fail'); } },
      { name: 'secondary', execute: async () => 'secondary result' },
    ]);

    expect(result).toBe('secondary result');
  });

  it('should skip unavailable providers', async () => {
    const result = await withFallback([
      { name: 'primary', execute: async () => 'primary', isAvailable: () => false },
      { name: 'secondary', execute: async () => 'secondary result' },
    ]);

    expect(result).toBe('secondary result');
  });

  it('should call onFallback callback', async () => {
    const onFallback = vi.fn();
    
    await withFallback(
      [
        { name: 'primary', execute: async () => { throw new Error('fail'); } },
        { name: 'secondary', execute: async () => 'secondary result' },
      ],
      onFallback
    );

    expect(onFallback).toHaveBeenCalledWith('primary', 'secondary', expect.any(Error));
  });

  it('should throw if all providers fail', async () => {
    await expect(
      withFallback([
        { name: 'primary', execute: async () => { throw new Error('fail 1'); } },
        { name: 'secondary', execute: async () => { throw new Error('fail 2'); } },
      ])
    ).rejects.toThrow('fail 2');
  });
});
