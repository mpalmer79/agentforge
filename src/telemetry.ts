import type { CompletionRequest, CompletionResponse, ToolResult } from './types';

// ============================================
// Telemetry Types
// ============================================

export interface Span {
  id: string;
  traceId: string;
  parentId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'ok' | 'error' | 'timeout';
  attributes: Record<string, unknown>;
  events: SpanEvent[];
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

export interface Metric {
  name: string;
  value: number;
  unit: MetricUnit;
  timestamp: number;
  tags: Record<string, string>;
}

export type MetricUnit = 
  | 'ms' 
  | 'bytes' 
  | 'tokens' 
  | 'count' 
  | 'percent' 
  | 'requests_per_second';

export interface TelemetryEvent {
  type: 'span' | 'metric' | 'log';
  data: Span | Metric | LogEntry;
}

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
  traceId?: string;
  spanId?: string;
  attributes?: Record<string, unknown>;
}

// ============================================
// Telemetry Hooks Interface
// ============================================

export interface TelemetryHooks {
  /** Called when a new trace starts */
  onTraceStart?: (traceId: string, metadata: Record<string, unknown>) => void;
  
  /** Called when a trace ends */
  onTraceEnd?: (traceId: string, spans: Span[]) => void;
  
  /** Called for each span */
  onSpan?: (span: Span) => void;
  
  /** Called for each metric */
  onMetric?: (metric: Metric) => void;
  
  /** Called for logs */
  onLog?: (entry: LogEntry) => void;
  
  /** Called on provider request start */
  onProviderRequest?: (provider: string, request: CompletionRequest) => void;
  
  /** Called on provider response */
  onProviderResponse?: (provider: string, response: CompletionResponse, durationMs: number) => void;
  
  /** Called on provider error */
  onProviderError?: (provider: string, error: Error, durationMs: number) => void;
  
  /** Called on tool execution start */
  onToolStart?: (toolName: string, args: Record<string, unknown>) => void;
  
  /** Called on tool execution end */
  onToolEnd?: (toolName: string, result: ToolResult, durationMs: number) => void;
  
  /** Called on token usage */
  onTokenUsage?: (usage: { prompt: number; completion: number; total: number }) => void;
}

// ============================================
// Telemetry Collector
// ============================================

export class TelemetryCollector {
  private hooks: TelemetryHooks;
  private spans: Map<string, Span[]> = new Map();
  private activeSpans: Map<string, Span> = new Map();
  private metrics: Metric[] = [];
  private enabled: boolean;

  constructor(hooks: TelemetryHooks = {}, enabled = true) {
    this.hooks = hooks;
    this.enabled = enabled;
  }

  // ---- Tracing ----

  startTrace(metadata: Record<string, unknown> = {}): string {
    if (!this.enabled) return '';
    
    const traceId = this.generateTraceId();
    this.spans.set(traceId, []);
    this.hooks.onTraceStart?.(traceId, metadata);
    return traceId;
  }

  endTrace(traceId: string): Span[] {
    if (!this.enabled) return [];
    
    const spans = this.spans.get(traceId) ?? [];
    this.hooks.onTraceEnd?.(traceId, spans);
    this.spans.delete(traceId);
    return spans;
  }

  startSpan(
    traceId: string,
    name: string,
    attributes: Record<string, unknown> = {},
    parentId?: string
  ): string {
    if (!this.enabled) return '';
    
    const span: Span = {
      id: this.generateSpanId(),
      traceId,
      parentId,
      name,
      startTime: Date.now(),
      status: 'ok',
      attributes,
      events: [],
    };

    this.activeSpans.set(span.id, span);
    return span.id;
  }

  endSpan(spanId: string, status: Span['status'] = 'ok', attributes: Record<string, unknown> = {}): void {
    if (!this.enabled) return;
    
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status;
    span.attributes = { ...span.attributes, ...attributes };

    const traceSpans = this.spans.get(span.traceId);
    if (traceSpans) {
      traceSpans.push(span);
    }

    this.activeSpans.delete(spanId);
    this.hooks.onSpan?.(span);
  }

  addSpanEvent(spanId: string, name: string, attributes?: Record<string, unknown>): void {
    if (!this.enabled) return;
    
    const span = this.activeSpans.get(spanId);
    if (span) {
      span.events.push({ name, timestamp: Date.now(), attributes });
    }
  }

  // ---- Metrics ----

  recordMetric(
    name: string,
    value: number,
    unit: MetricUnit,
    tags: Record<string, string> = {}
  ): void {
    if (!this.enabled) return;
    
    const metric: Metric = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      tags,
    };

    this.metrics.push(metric);
    this.hooks.onMetric?.(metric);

    // Keep metrics buffer bounded
    if (this.metrics.length > 10000) {
      this.metrics = this.metrics.slice(-5000);
    }
  }

  recordLatency(name: string, durationMs: number, tags: Record<string, string> = {}): void {
    this.recordMetric(name, durationMs, 'ms', tags);
  }

  recordTokens(name: string, count: number, tags: Record<string, string> = {}): void {
    this.recordMetric(name, count, 'tokens', tags);
  }

  incrementCounter(name: string, tags: Record<string, string> = {}, delta = 1): void {
    this.recordMetric(name, delta, 'count', tags);
  }

  // ---- Logging ----

  log(level: LogEntry['level'], message: string, attributes?: Record<string, unknown>): void {
    if (!this.enabled) return;
    
    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      attributes,
    };

    this.hooks.onLog?.(entry);
  }

  debug(message: string, attributes?: Record<string, unknown>): void {
    this.log('debug', message, attributes);
  }

  info(message: string, attributes?: Record<string, unknown>): void {
    this.log('info', message, attributes);
  }

  warn(message: string, attributes?: Record<string, unknown>): void {
    this.log('warn', message, attributes);
  }

  error(message: string, attributes?: Record<string, unknown>): void {
    this.log('error', message, attributes);
  }

  // ---- Provider Hooks ----

  trackProviderRequest(provider: string, request: CompletionRequest): void {
    this.hooks.onProviderRequest?.(provider, request);
  }

  trackProviderResponse(provider: string, response: CompletionResponse, durationMs: number): void {
    this.hooks.onProviderResponse?.(provider, response, durationMs);
    this.recordLatency('provider.request.duration', durationMs, { provider });
    
    if (response.usage) {
      this.hooks.onTokenUsage?.({
        prompt: response.usage.promptTokens,
        completion: response.usage.completionTokens,
        total: response.usage.totalTokens,
      });
      this.recordTokens('provider.tokens.prompt', response.usage.promptTokens, { provider });
      this.recordTokens('provider.tokens.completion', response.usage.completionTokens, { provider });
    }
  }

  trackProviderError(provider: string, error: Error, durationMs: number): void {
    this.hooks.onProviderError?.(provider, error, durationMs);
    this.incrementCounter('provider.errors', { provider, error_type: error.name });
  }

  // ---- Tool Hooks ----

  trackToolStart(toolName: string, args: Record<string, unknown>): void {
    this.hooks.onToolStart?.(toolName, args);
  }

  trackToolEnd(toolName: string, result: ToolResult, durationMs: number): void {
    this.hooks.onToolEnd?.(toolName, result, durationMs);
    this.recordLatency('tool.execution.duration', durationMs, { tool: toolName });
    
    if (result.error) {
      this.incrementCounter('tool.errors', { tool: toolName });
    }
  }

  // ---- Utilities ----

  getMetrics(): Metric[] {
    return [...this.metrics];
  }

  clearMetrics(): void {
    this.metrics = [];
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private generateTraceId(): string {
    return `trace_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
  }

  private generateSpanId(): string {
    return `span_${Math.random().toString(36).substring(2, 14)}`;
  }
}

// ============================================
// Pre-built Telemetry Exporters
// ============================================

/**
 * Console exporter for development
 */
export function createConsoleExporter(): TelemetryHooks {
  return {
    onSpan: (span) => {
      console.log(`[Span] ${span.name} - ${span.duration}ms - ${span.status}`);
    },
    onMetric: (metric) => {
      console.log(`[Metric] ${metric.name}: ${metric.value}${metric.unit}`);
    },
    onLog: (entry) => {
      const fn = console[entry.level] || console.log;
      fn(`[${entry.level.toUpperCase()}] ${entry.message}`, entry.attributes || '');
    },
    onProviderError: (provider, error) => {
      console.error(`[Provider Error] ${provider}: ${error.message}`);
    },
  };
}

/**
 * Create a batching exporter that buffers events
 */
export function createBatchingExporter(
  flush: (events: TelemetryEvent[]) => Promise<void>,
  options: { batchSize?: number; flushIntervalMs?: number } = {}
): TelemetryHooks & { flush: () => Promise<void> } {
  const { batchSize = 100, flushIntervalMs = 5000 } = options;
  const buffer: TelemetryEvent[] = [];
  let flushTimer: ReturnType<typeof setInterval> | null = null;

  const doFlush = async () => {
    if (buffer.length === 0) return;
    const events = buffer.splice(0, buffer.length);
    await flush(events);
  };

  // Start flush timer
  flushTimer = setInterval(doFlush, flushIntervalMs);

  const addEvent = (type: TelemetryEvent['type'], data: TelemetryEvent['data']) => {
    buffer.push({ type, data });
    if (buffer.length >= batchSize) {
      doFlush();
    }
  };

  return {
    onSpan: (span) => addEvent('span', span),
    onMetric: (metric) => addEvent('metric', metric),
    onLog: (entry) => addEvent('log', entry),
    flush: async () => {
      if (flushTimer) clearInterval(flushTimer);
      await doFlush();
    },
  };
}

/**
 * Create OpenTelemetry-compatible exporter
 */
export function createOTLPExporter(endpoint: string, headers: Record<string, string> = {}): TelemetryHooks {
  const sendSpans = async (spans: Span[]) => {
    try {
      await fetch(`${endpoint}/v1/traces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          resourceSpans: [{
            resource: { attributes: [] },
            scopeSpans: [{
              scope: { name: 'agentforge' },
              spans: spans.map(span => ({
                traceId: span.traceId,
                spanId: span.id,
                parentSpanId: span.parentId,
                name: span.name,
                startTimeUnixNano: span.startTime * 1_000_000,
                endTimeUnixNano: (span.endTime ?? span.startTime) * 1_000_000,
                status: { code: span.status === 'ok' ? 1 : 2 },
                attributes: Object.entries(span.attributes).map(([k, v]) => ({
                  key: k,
                  value: { stringValue: String(v) },
                })),
              })),
            }],
          }],
        }),
      });
    } catch {
      // Silent fail for telemetry
    }
  };

  const spanBuffer: Span[] = [];

  return {
    onSpan: (span) => {
      spanBuffer.push(span);
      if (spanBuffer.length >= 50) {
        const spans = spanBuffer.splice(0, spanBuffer.length);
        sendSpans(spans);
      }
    },
  };
}

// ============================================
// Global Telemetry Instance
// ============================================

let globalTelemetry: TelemetryCollector | null = null;

export function initTelemetry(hooks: TelemetryHooks = {}, enabled = true): TelemetryCollector {
  globalTelemetry = new TelemetryCollector(hooks, enabled);
  return globalTelemetry;
}

export function getTelemetry(): TelemetryCollector {
  if (!globalTelemetry) {
    globalTelemetry = new TelemetryCollector();
  }
  return globalTelemetry;
}
