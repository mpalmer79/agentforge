/**
 * Request batching and deduplication for improved performance
 */

import type { CompletionRequest, CompletionResponse, Provider } from './types';
import { generateId } from './utils';

// ============================================
// Types
// ============================================

interface PendingRequest {
  id: string;
  request: CompletionRequest;
  resolve: (response: CompletionResponse) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

interface BatchConfig {
  /** Maximum requests per batch */
  maxBatchSize?: number;
  /** Maximum wait time before processing batch (ms) */
  maxWaitMs?: number;
  /** Enable request deduplication */
  deduplicate?: boolean;
  /** Custom key function for deduplication */
  dedupeKeyFn?: (request: CompletionRequest) => string;
}

// ============================================
// Request Batcher
// ============================================

/**
 * Batches multiple requests together for efficiency
 *
 * @remarks
 * Useful when making many similar requests that can be combined
 * or when implementing request coalescing.
 *
 * @example
 * ```typescript
 * const batcher = new RequestBatcher(provider, {
 *   maxBatchSize: 5,
 *   maxWaitMs: 100,
 * });
 *
 * // These requests will be batched together
 * const [r1, r2, r3] = await Promise.all([
 *   batcher.add(request1),
 *   batcher.add(request2),
 *   batcher.add(request3),
 * ]);
 * ```
 */
export class RequestBatcher {
  private provider: Provider;
  private config: Required<BatchConfig>;
  private pending: PendingRequest[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private processing = false;

  constructor(provider: Provider, config: BatchConfig = {}) {
    this.provider = provider;
    this.config = {
      maxBatchSize: config.maxBatchSize ?? 10,
      maxWaitMs: config.maxWaitMs ?? 50,
      deduplicate: config.deduplicate ?? true,
      dedupeKeyFn: config.dedupeKeyFn ?? this.defaultDedupeKey,
    };
  }

  /**
   * Add a request to the batch
   */
  add(request: CompletionRequest): Promise<CompletionResponse> {
    return new Promise((resolve, reject) => {
      const pendingRequest: PendingRequest = {
        id: generateId('batch'),
        request,
        resolve,
        reject,
        timestamp: Date.now(),
      };

      this.pending.push(pendingRequest);

      // Check if we should process immediately
      if (this.pending.length >= this.config.maxBatchSize) {
        this.processNow();
      } else {
        this.scheduleProcess();
      }
    });
  }

  /**
   * Process all pending requests immediately
   */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.processBatch();
  }

  /**
   * Get number of pending requests
   */
  get pendingCount(): number {
    return this.pending.length;
  }

  private scheduleProcess(): void {
    if (this.timer) return;

    this.timer = setTimeout(() => {
      this.timer = null;
      this.processBatch();
    }, this.config.maxWaitMs);
  }

  private processNow(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.processBatch();
  }

  private async processBatch(): Promise<void> {
    if (this.processing || this.pending.length === 0) return;

    this.processing = true;

    // Take current batch
    const batch = this.pending.splice(0, this.config.maxBatchSize);

    // Deduplicate if enabled
    const deduped = this.config.deduplicate
      ? this.deduplicateBatch(batch)
      : { unique: batch, duplicates: new Map<string, PendingRequest[]>() };

    // Process each unique request
    const results = await Promise.allSettled(
      deduped.unique.map(async (req) => {
        const response = await this.provider.complete(req.request);
        return { request: req, response };
      })
    );

    // Resolve promises
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { request: req, response } = result.value;

        // Resolve the original request
        req.resolve(response);

        // Resolve any duplicates
        const key = this.config.dedupeKeyFn(req.request);
        const duplicates = deduped.duplicates.get(key) ?? [];
        for (const dup of duplicates) {
          dup.resolve(response);
        }
      } else {
        // Reject on error
        const error =
          result.reason instanceof Error ? result.reason : new Error(String(result.reason));

        // Find which request failed and reject it
        // In a real implementation, we'd track this better
        for (const req of batch) {
          req.reject(error);
        }
      }
    }

    this.processing = false;

    // Process next batch if any
    if (this.pending.length > 0) {
      this.scheduleProcess();
    }
  }

  private deduplicateBatch(batch: PendingRequest[]): {
    unique: PendingRequest[];
    duplicates: Map<string, PendingRequest[]>;
  } {
    const unique: PendingRequest[] = [];
    const duplicates = new Map<string, PendingRequest[]>();
    const seen = new Map<string, PendingRequest>();

    for (const req of batch) {
      const key = this.config.dedupeKeyFn(req.request);

      if (seen.has(key)) {
        // This is a duplicate
        if (!duplicates.has(key)) {
          duplicates.set(key, []);
        }
        duplicates.get(key)!.push(req);
      } else {
        // First occurrence
        seen.set(key, req);
        unique.push(req);
      }
    }

    return { unique, duplicates };
  }

  private defaultDedupeKey(request: CompletionRequest): string {
    const lastMessage = request.messages[request.messages.length - 1];
    return `${lastMessage?.role}:${lastMessage?.content}`;
  }
}

// ============================================
// Request Deduplicator
// ============================================

/**
 * Deduplicates concurrent identical requests
 *
 * @remarks
 * When multiple identical requests come in at the same time,
 * only one is actually sent and the result is shared.
 *
 * @example
 * ```typescript
 * const deduper = new RequestDeduplicator(provider);
 *
 * // These identical requests result in only ONE API call
 * const [r1, r2] = await Promise.all([
 *   deduper.execute(sameRequest),
 *   deduper.execute(sameRequest),
 * ]);
 *
 * // r1 === r2 (same response object)
 * ```
 */
export class RequestDeduplicator {
  private provider: Provider;
  private inflight: Map<string, Promise<CompletionResponse>> = new Map();
  private keyFn: (request: CompletionRequest) => string;

  constructor(provider: Provider, keyFn?: (request: CompletionRequest) => string) {
    this.provider = provider;
    this.keyFn = keyFn ?? this.defaultKeyFn;
  }

  /**
   * Execute a request with deduplication
   */
  async execute(request: CompletionRequest): Promise<CompletionResponse> {
    const key = this.keyFn(request);

    // Check if there's already an inflight request
    const existing = this.inflight.get(key);
    if (existing) {
      return existing;
    }

    // Create new request promise
    const promise = this.provider.complete(request).finally(() => {
      this.inflight.delete(key);
    });

    this.inflight.set(key, promise);
    return promise;
  }

  /**
   * Get number of inflight requests
   */
  get inflightCount(): number {
    return this.inflight.size;
  }

  /**
   * Clear all inflight tracking (doesn't cancel requests)
   */
  clear(): void {
    this.inflight.clear();
  }

  private defaultKeyFn(request: CompletionRequest): string {
    // Create a key based on messages content
    const messagesKey = request.messages
      .map((m) => `${m.role}:${m.content.slice(0, 100)}`)
      .join('|');

    return messagesKey;
  }
}

// ============================================
// Rate-Limited Queue
// ============================================

/**
 * Queue that processes requests at a controlled rate
 *
 * @example
 * ```typescript
 * const queue = new RateLimitedQueue(provider, {
 *   requestsPerSecond: 10,
 * });
 *
 * // Requests are automatically throttled
 * for (const req of requests) {
 *   queue.add(req).then(handleResponse);
 * }
 * ```
 */
export class RateLimitedQueue {
  private provider: Provider;
  private queue: PendingRequest[] = [];
  private requestsPerSecond: number;
  private processing = false;
  private lastProcessTime = 0;

  constructor(provider: Provider, config: { requestsPerSecond: number }) {
    this.provider = provider;
    this.requestsPerSecond = config.requestsPerSecond;
  }

  /**
   * Add a request to the queue
   */
  add(request: CompletionRequest): Promise<CompletionResponse> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        id: generateId('queue'),
        request,
        resolve,
        reject,
        timestamp: Date.now(),
      });

      this.processQueue();
    });
  }

  /**
   * Get queue length
   */
  get length(): number {
    return this.queue.length;
  }

  /**
   * Clear the queue (rejects all pending)
   */
  clear(): void {
    const error = new Error('Queue cleared');
    for (const req of this.queue) {
      req.reject(error);
    }
    this.queue = [];
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      // Calculate delay needed
      const now = Date.now();
      const minInterval = 1000 / this.requestsPerSecond;
      const elapsed = now - this.lastProcessTime;
      const delay = Math.max(0, minInterval - elapsed);

      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const req = this.queue.shift();
      if (!req) continue;

      this.lastProcessTime = Date.now();

      try {
        const response = await this.provider.complete(req.request);
        req.resolve(response);
      } catch (error) {
        req.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.processing = false;
  }
}
