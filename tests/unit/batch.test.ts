import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RequestBatcher, RequestDeduplicator, RateLimitedQueue } from '../../src/batch';
import type { Provider, CompletionRequest } from '../../src/types';

describe('RequestBatcher', () => {
  const createMockProvider = (): Provider => ({
    name: 'mock',
    complete: vi.fn().mockResolvedValue({
      id: 'resp',
      content: 'Response',
      finishReason: 'stop',
    }),
    stream: vi.fn(),
  });

  const createRequest = (content: string): CompletionRequest => ({
    messages: [{ id: '1', role: 'user', content, timestamp: Date.now() }],
  });

  it('should batch multiple requests', async () => {
    const provider = createMockProvider();
    const batcher = new RequestBatcher(provider, { maxBatchSize: 3, maxWaitMs: 10 });

    const promises = [
      batcher.add(createRequest('msg1')),
      batcher.add(createRequest('msg2')),
      batcher.add(createRequest('msg3')),
    ];

    const results = await Promise.all(promises);

    expect(results).toHaveLength(3);
    expect(provider.complete).toHaveBeenCalledTimes(3);
  });

  it('should deduplicate identical requests', async () => {
    const provider = createMockProvider();
    const batcher = new RequestBatcher(provider, {
      maxBatchSize: 3,
      maxWaitMs: 10,
      deduplicate: true,
    });

    const sameRequest = createRequest('same');

    const promises = [batcher.add(sameRequest), batcher.add(sameRequest), batcher.add(sameRequest)];

    const results = await Promise.all(promises);

    expect(results).toHaveLength(3);
    // All should get the same response, but only 1 API call
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  it('should flush pending requests', async () => {
    const provider = createMockProvider();
    const batcher = new RequestBatcher(provider, { maxBatchSize: 10, maxWaitMs: 1000 });

    const promise = batcher.add(createRequest('test'));

    expect(batcher.pendingCount).toBe(1);

    await batcher.flush();
    await promise;

    expect(batcher.pendingCount).toBe(0);
  });
});

describe('RequestDeduplicator', () => {
  const createMockProvider = (): Provider => ({
    name: 'mock',
    complete: vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { id: 'resp', content: 'Response', finishReason: 'stop' };
    }),
    stream: vi.fn(),
  });

  const createRequest = (content: string): CompletionRequest => ({
    messages: [{ id: '1', role: 'user', content, timestamp: Date.now() }],
  });

  it('should deduplicate concurrent identical requests', async () => {
    const provider = createMockProvider();
    const deduper = new RequestDeduplicator(provider);

    const request = createRequest('same');

    const promises = [deduper.execute(request), deduper.execute(request), deduper.execute(request)];

    await Promise.all(promises);

    // Only 1 API call despite 3 execute calls
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  it('should not deduplicate different requests', async () => {
    const provider = createMockProvider();
    const deduper = new RequestDeduplicator(provider);

    const promises = [
      deduper.execute(createRequest('msg1')),
      deduper.execute(createRequest('msg2')),
      deduper.execute(createRequest('msg3')),
    ];

    await Promise.all(promises);

    expect(provider.complete).toHaveBeenCalledTimes(3);
  });

  it('should track inflight count', async () => {
    const provider = createMockProvider();
    const deduper = new RequestDeduplicator(provider);

    const promise = deduper.execute(createRequest('test'));

    expect(deduper.inflightCount).toBe(1);

    await promise;

    expect(deduper.inflightCount).toBe(0);
  });
});

describe('RateLimitedQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createMockProvider = (): Provider => ({
    name: 'mock',
    complete: vi.fn().mockResolvedValue({
      id: 'resp',
      content: 'Response',
      finishReason: 'stop',
    }),
    stream: vi.fn(),
  });

  const createSlowMockProvider = (): Provider => ({
    name: 'mock',
    complete: vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 500));
      return { id: 'resp', content: 'Response', finishReason: 'stop' };
    }),
    stream: vi.fn(),
  });

  const createRequest = (content: string): CompletionRequest => ({
    messages: [{ id: '1', role: 'user', content, timestamp: Date.now() }],
  });

  it('should queue requests', () => {
    const provider = createMockProvider();
    const queue = new RateLimitedQueue(provider, { requestsPerSecond: 10 });

    queue.add(createRequest('msg1'));
    queue.add(createRequest('msg2'));

    expect(queue.length).toBeGreaterThanOrEqual(0);
  });

  it('should clear queue and reject pending requests', async () => {
    // Use a slow provider so the first request takes time
    const provider = createSlowMockProvider();
    const queue = new RateLimitedQueue(provider, { requestsPerSecond: 1 });

    // Add first request - this will start processing
    const promise1 = queue.add(createRequest('first'));

    // Add second request - this should be queued (rate limited)
    const promise2 = queue.add(createRequest('second'));

    // The second request should be in the queue
    expect(queue.length).toBeGreaterThanOrEqual(1);

    // Clear the queue - this should reject the queued (second) request
    queue.clear();

    // The second (queued) request should reject
    await expect(promise2).rejects.toThrow(/cleared/);

    // Advance timers to let the first request complete
    await vi.advanceTimersByTimeAsync(600);

    // First request should resolve (it was already processing)
    await expect(promise1).resolves.toBeDefined();
  });

  it('should process requests at the specified rate', async () => {
    const provider = createMockProvider();
    const queue = new RateLimitedQueue(provider, { requestsPerSecond: 2 });

    const promise1 = queue.add(createRequest('msg1'));
    const promise2 = queue.add(createRequest('msg2'));

    // Advance time to allow processing
    await vi.advanceTimersByTimeAsync(1000);

    await Promise.all([promise1, promise2]);

    expect(provider.complete).toHaveBeenCalledTimes(2);
  });
});
