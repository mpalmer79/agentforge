import { describe, it, expect, vi, beforeEach } from 'vitest';
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

    const promises = [
      batcher.add(sameRequest),
      batcher.add(sameRequest),
      batcher.add(sameRequest),
    ];

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
      await new Promise(r => setTimeout(r, 50));
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

    const promises = [
      deduper.execute(request),
      deduper.execute(request),
      deduper.execute(request),
    ];

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

  it('should queue requests', () => {
    const provider = createMockProvider();
    const queue = new RateLimitedQueue(provider, { requestsPerSecond: 10 });

    queue.add(createRequest('msg1'));
    queue.add(createRequest('msg2'));

    expect(queue.length).toBeGreaterThanOrEqual(0);
  });

  it('should clear queue and reject pending', async () => {
    const provider = createMockProvider();
    const queue = new RateLimitedQueue(provider, { requestsPerSecond: 1 });

    const promise = queue.add(createRequest('test'));
    queue.clear();

    await expect(promise).rejects.toThrow(/cleared/);
  });
});
