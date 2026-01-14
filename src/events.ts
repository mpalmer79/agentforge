/**
 * Type-safe event emitter for agent lifecycle events
 */

import type { Message, ToolCall, ToolResult, CompletionResponse } from './types';

// ============================================
// Event Types
// ============================================

export interface AgentEvents {
  /** Emitted before a request is sent to the provider */
  'request:start': { messages: Message[]; timestamp: number };
  
  /** Emitted after a response is received */
  'request:end': { response: CompletionResponse; durationMs: number; timestamp: number };
  
  /** Emitted when a request fails */
  'request:error': { error: Error; timestamp: number };
  
  /** Emitted before a tool is executed */
  'tool:start': { toolCall: ToolCall; timestamp: number };
  
  /** Emitted after a tool completes */
  'tool:end': { toolCall: ToolCall; result: ToolResult; durationMs: number; timestamp: number };
  
  /** Emitted when a tool fails */
  'tool:error': { toolCall: ToolCall; error: Error; timestamp: number };
  
  /** Emitted when streaming content is received */
  'stream:chunk': { content: string; timestamp: number };
  
  /** Emitted when streaming completes */
  'stream:end': { fullContent: string; timestamp: number };
  
  /** Emitted when memory is trimmed */
  'memory:trim': { before: number; after: number; strategy: string; timestamp: number };
  
  /** Emitted when agent run starts */
  'agent:start': { input: string | Message[]; timestamp: number };
  
  /** Emitted when agent run completes */
  'agent:end': { iterations: number; durationMs: number; timestamp: number };
  
  /** Emitted for custom plugin events */
  'plugin:event': { pluginName: string; eventName: string; data: unknown; timestamp: number };
}

export type EventName = keyof AgentEvents;
export type EventPayload<E extends EventName> = AgentEvents[E];
export type EventListener<E extends EventName> = (payload: EventPayload<E>) => void | Promise<void>;

// ============================================
// Event Emitter Class
// ============================================

/**
 * Type-safe event emitter for AgentForge
 * 
 * @example
 * ```typescript
 * const emitter = new EventEmitter();
 * 
 * emitter.on('tool:start', ({ toolCall }) => {
 *   console.log(`Executing tool: ${toolCall.name}`);
 * });
 * 
 * emitter.on('request:end', ({ durationMs }) => {
 *   console.log(`Request took ${durationMs}ms`);
 * });
 * ```
 */
export class EventEmitter {
  private listeners: Map<EventName, Set<EventListener<EventName>>> = new Map();
  private onceListeners: Map<EventName, Set<EventListener<EventName>>> = new Map();

  /**
   * Subscribe to an event
   */
  on<E extends EventName>(event: E, listener: EventListener<E>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as EventListener<EventName>);

    // Return unsubscribe function
    return () => this.off(event, listener);
  }

  /**
   * Subscribe to an event once
   */
  once<E extends EventName>(event: E, listener: EventListener<E>): () => void {
    if (!this.onceListeners.has(event)) {
      this.onceListeners.set(event, new Set());
    }
    this.onceListeners.get(event)!.add(listener as EventListener<EventName>);

    return () => {
      this.onceListeners.get(event)?.delete(listener as EventListener<EventName>);
    };
  }

  /**
   * Unsubscribe from an event
   */
  off<E extends EventName>(event: E, listener: EventListener<E>): void {
    this.listeners.get(event)?.delete(listener as EventListener<EventName>);
    this.onceListeners.get(event)?.delete(listener as EventListener<EventName>);
  }

  /**
   * Emit an event to all listeners
   */
  async emit<E extends EventName>(event: E, payload: EventPayload<E>): Promise<void> {
    const regularListeners = this.listeners.get(event) ?? new Set();
    const onceListeners = this.onceListeners.get(event) ?? new Set();

    // Clear once listeners before executing
    this.onceListeners.set(event, new Set());

    const allListeners = [...regularListeners, ...onceListeners];

    await Promise.all(
      allListeners.map(async (listener) => {
        try {
          await listener(payload);
        } catch (error) {
          console.error(`Error in event listener for "${event}":`, error);
        }
      })
    );
  }

  /**
   * Remove all listeners for an event (or all events)
   */
  removeAllListeners(event?: EventName): void {
    if (event) {
      this.listeners.delete(event);
      this.onceListeners.delete(event);
    } else {
      this.listeners.clear();
      this.onceListeners.clear();
    }
  }

  /**
   * Get the count of listeners for an event
   */
  listenerCount(event: EventName): number {
    const regular = this.listeners.get(event)?.size ?? 0;
    const once = this.onceListeners.get(event)?.size ?? 0;
    return regular + once;
  }

  /**
   * Get all event names that have listeners
   */
  eventNames(): EventName[] {
    const names = new Set<EventName>();
    for (const key of this.listeners.keys()) {
      names.add(key);
    }
    for (const key of this.onceListeners.keys()) {
      names.add(key);
    }
    return Array.from(names);
  }
}

// ============================================
// Global Event Bus
// ============================================

/**
 * Global event bus for cross-agent communication
 */
export const globalEventBus = new EventEmitter();

// ============================================
// Event Utilities
// ============================================

/**
 * Create a promise that resolves when an event is emitted
 */
export function waitForEvent<E extends EventName>(
  emitter: EventEmitter,
  event: E,
  timeoutMs?: number
): Promise<EventPayload<E>> {
  return new Promise((resolve, reject) => {
    const cleanup = emitter.once(event, (payload) => {
      if (timer) clearTimeout(timer);
      resolve(payload as EventPayload<E>);
    });

    let timer: ReturnType<typeof setTimeout> | undefined;

    if (timeoutMs) {
      timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout waiting for event "${event}"`));
      }, timeoutMs);
    }
  });
}

/**
 * Create an async iterator from events
 */
export function eventIterator<E extends EventName>(
  emitter: EventEmitter,
  event: E
): AsyncIterable<EventPayload<E>> {
  const queue: EventPayload<E>[] = [];
  let resolve: ((value: EventPayload<E>) => void) | null = null;
  let done = false;

  emitter.on(event, (payload) => {
    if (resolve) {
      resolve(payload as EventPayload<E>);
      resolve = null;
    } else {
      queue.push(payload as EventPayload<E>);
    }
  });

  return {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          if (done) {
            return { done: true, value: undefined };
          }

          if (queue.length > 0) {
            return { done: false, value: queue.shift()! };
          }

          const value = await new Promise<EventPayload<E>>((r) => {
            resolve = r;
          });

          return { done: false, value };
        },
        async return() {
          done = true;
          return { done: true, value: undefined };
        },
      };
    },
  };
}
