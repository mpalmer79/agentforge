/**
 * Structured Logging System
 *
 * Production-grade logging with:
 * - Multiple log levels
 * - Structured JSON output
 * - Multiple transports (console, file, remote)
 * - Context propagation
 * - Log sampling for high-volume scenarios
 * - Sensitive data redaction
 */

// ============================================
// Types
// ============================================

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  traceId?: string;
  spanId?: string;
  duration?: number;
  tags?: string[];
}

export interface LogTransport {
  name: string;
  log(entry: LogEntry): void | Promise<void>;
  flush?(): Promise<void>;
  close?(): Promise<void>;
}

export interface LoggerConfig {
  level: LogLevel;
  transports: LogTransport[];
  /** Fields to redact from logs */
  redactFields?: string[];
  /** Sample rate 0-1 for debug/trace logs */
  sampleRate?: number;
  /** Default context added to all logs */
  defaultContext?: Record<string, unknown>;
  /** Format timestamps in ISO or Unix */
  timestampFormat?: 'iso' | 'unix';
}

// ============================================
// Log Level Utilities
// ============================================

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

function shouldLog(configLevel: LogLevel, messageLevel: LogLevel): boolean {
  return LOG_LEVELS[messageLevel] >= LOG_LEVELS[configLevel];
}

// ============================================
// Logger Implementation
// ============================================

export class Logger {
  private config: Required<LoggerConfig>;
  private contextStack: Record<string, unknown>[] = [];

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: config.level ?? 'info',
      transports: config.transports ?? [createConsoleTransport()],
      redactFields: config.redactFields ?? [
        'password',
        'apiKey',
        'token',
        'secret',
        'authorization',
      ],
      sampleRate: config.sampleRate ?? 1,
      defaultContext: config.defaultContext ?? {},
      timestampFormat: config.timestampFormat ?? 'iso',
    };
  }

  // ---- Core Logging Methods ----

  trace(message: string, context?: Record<string, unknown>): void {
    this.log('trace', message, context);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(
    message: string,
    error?: Error | Record<string, unknown>,
    context?: Record<string, unknown>
  ): void {
    if (error instanceof Error) {
      this.log('error', message, {
        ...context,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      });
    } else {
      this.log('error', message, { ...error, ...context });
    }
  }

  fatal(
    message: string,
    error?: Error | Record<string, unknown>,
    context?: Record<string, unknown>
  ): void {
    if (error instanceof Error) {
      this.log('fatal', message, {
        ...context,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      });
    } else {
      this.log('fatal', message, { ...error, ...context });
    }
  }

  // ---- Context Management ----

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, unknown>): Logger {
    const child = new Logger(this.config);
    child.contextStack = [...this.contextStack, context];
    return child;
  }

  /**
   * Add context that will be included in all subsequent logs
   */
  pushContext(context: Record<string, unknown>): void {
    this.contextStack.push(context);
  }

  /**
   * Remove the most recently added context
   */
  popContext(): Record<string, unknown> | undefined {
    return this.contextStack.pop();
  }

  /**
   * Run a function with temporary context
   */
  withContext<T>(context: Record<string, unknown>, fn: () => T): T {
    this.pushContext(context);
    try {
      return fn();
    } finally {
      this.popContext();
    }
  }

  /**
   * Async version of withContext
   */
  async withContextAsync<T>(context: Record<string, unknown>, fn: () => Promise<T>): Promise<T> {
    this.pushContext(context);
    try {
      return await fn();
    } finally {
      this.popContext();
    }
  }

  // ---- Timing Utilities ----

  /**
   * Create a timer for measuring operation duration
   */
  startTimer(operation: string): { end: (context?: Record<string, unknown>) => void } {
    const startTime = Date.now();
    return {
      end: (context?: Record<string, unknown>) => {
        const duration = Date.now() - startTime;
        this.info(`${operation} completed`, { ...context, duration, operation });
      },
    };
  }

  /**
   * Log with automatic timing
   */
  async timed<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: Record<string, unknown>
  ): Promise<T> {
    const timer = this.startTimer(operation);
    try {
      const result = await fn();
      timer.end({ ...context, success: true });
      return result;
    } catch (error) {
      timer.end({
        ...context,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // ---- Configuration ----

  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  addTransport(transport: LogTransport): void {
    this.config.transports.push(transport);
  }

  async flush(): Promise<void> {
    await Promise.all(this.config.transports.map((t) => t.flush?.()));
  }

  async close(): Promise<void> {
    await this.flush();
    await Promise.all(this.config.transports.map((t) => t.close?.()));
  }

  // ---- Private Methods ----

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!shouldLog(this.config.level, level)) return;

    // Apply sampling for trace/debug
    if ((level === 'trace' || level === 'debug') && this.config.sampleRate < 1) {
      if (Math.random() > this.config.sampleRate) return;
    }

    const entry = this.createEntry(level, message, context);

    for (const transport of this.config.transports) {
      try {
        transport.log(entry);
      } catch (err) {
        // Don't let transport errors break the application
        console.error(`Logger transport "${transport.name}" failed:`, err);
      }
    }
  }

  private createEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): LogEntry {
    // Merge all context layers
    const mergedContext = {
      ...this.config.defaultContext,
      ...this.contextStack.reduce((acc, ctx) => ({ ...acc, ...ctx }), {}),
      ...context,
    };

    // Redact sensitive fields
    const redactedContext = this.redactSensitiveData(mergedContext);

    // Extract special fields
    const { error, traceId, spanId, duration, tags, ...restContext } = redactedContext as any;

    return {
      level,
      message,
      timestamp:
        this.config.timestampFormat === 'iso' ? new Date().toISOString() : String(Date.now()),
      context: Object.keys(restContext).length > 0 ? restContext : undefined,
      error: error as LogEntry['error'],
      traceId,
      spanId,
      duration,
      tags,
    };
  }

  private redactSensitiveData(obj: Record<string, unknown>): Record<string, unknown> {
    const redacted: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();

      if (this.config.redactFields.some((field) => lowerKey.includes(field.toLowerCase()))) {
        redacted[key] = '[REDACTED]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        redacted[key] = this.redactSensitiveData(value as Record<string, unknown>);
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }
}

// ============================================
// Built-in Transports
// ============================================

/**
 * Console transport with colored output
 */
export function createConsoleTransport(
  options: {
    colors?: boolean;
    prettyPrint?: boolean;
  } = {}
): LogTransport {
  const { colors = true, prettyPrint = true } = options;

  const levelColors: Record<LogLevel, string> = {
    trace: '\x1b[90m', // gray
    debug: '\x1b[36m', // cyan
    info: '\x1b[32m', // green
    warn: '\x1b[33m', // yellow
    error: '\x1b[31m', // red
    fatal: '\x1b[35m', // magenta
  };
  const reset = '\x1b[0m';

  return {
    name: 'console',
    log(entry: LogEntry): void {
      const color = colors ? levelColors[entry.level] : '';
      const resetCode = colors ? reset : '';
      const levelStr = entry.level.toUpperCase().padEnd(5);

      if (prettyPrint) {
        const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
        const errorStr = entry.error
          ? `\n  Error: ${entry.error.message}${entry.error.stack ? `\n${entry.error.stack}` : ''}`
          : '';
        const durationStr = entry.duration !== undefined ? ` (${entry.duration}ms)` : '';

        console.log(
          `${color}[${levelStr}]${resetCode} ${entry.timestamp} - ${entry.message}${durationStr}${contextStr}${errorStr}`
        );
      } else {
        console.log(JSON.stringify(entry));
      }
    },
  };
}

/**
 * JSON transport for structured logging (useful for log aggregators)
 */
export function createJSONTransport(
  options: {
    stream?: { write: (data: string) => void };
  } = {}
): LogTransport {
  const stream = options.stream ?? { write: (data: string) => console.log(data) };

  return {
    name: 'json',
    log(entry: LogEntry): void {
      stream.write(JSON.stringify(entry) + '\n');
    },
  };
}

/**
 * Batching transport that buffers logs and flushes periodically
 */
export function createBatchingTransport(options: {
  flush: (entries: LogEntry[]) => Promise<void>;
  batchSize?: number;
  flushIntervalMs?: number;
}): LogTransport {
  const { flush, batchSize = 100, flushIntervalMs = 5000 } = options;
  const buffer: LogEntry[] = [];
  let flushTimer: ReturnType<typeof setInterval> | null = null;

  const doFlush = async () => {
    if (buffer.length === 0) return;
    const entries = buffer.splice(0, buffer.length);
    await flush(entries);
  };

  // Start periodic flush
  flushTimer = setInterval(doFlush, flushIntervalMs);

  return {
    name: 'batching',
    log(entry: LogEntry): void {
      buffer.push(entry);
      if (buffer.length >= batchSize) {
        doFlush();
      }
    },
    async flush(): Promise<void> {
      await doFlush();
    },
    async close(): Promise<void> {
      if (flushTimer) clearInterval(flushTimer);
      await doFlush();
    },
  };
}

/**
 * Filtering transport that only passes through matching logs
 */
export function createFilteringTransport(
  inner: LogTransport,
  filter: (entry: LogEntry) => boolean
): LogTransport {
  return {
    name: `filtered-${inner.name}`,
    log(entry: LogEntry): void {
      if (filter(entry)) {
        inner.log(entry);
      }
    },
    flush: inner.flush?.bind(inner),
    close: inner.close?.bind(inner),
  };
}

/**
 * Multi-transport that writes to multiple destinations
 */
export function createMultiTransport(transports: LogTransport[]): LogTransport {
  return {
    name: 'multi',
    log(entry: LogEntry): void {
      for (const transport of transports) {
        transport.log(entry);
      }
    },
    async flush(): Promise<void> {
      await Promise.all(transports.map((t) => t.flush?.()));
    },
    async close(): Promise<void> {
      await Promise.all(transports.map((t) => t.close?.()));
    },
  };
}

// ============================================
// Global Logger Instance
// ============================================

let globalLogger: Logger | null = null;

export function initLogger(config?: Partial<LoggerConfig>): Logger {
  globalLogger = new Logger(config);
  return globalLogger;
}

export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = new Logger();
  }
  return globalLogger;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Create a logger for a specific module/component
 */
export function createModuleLogger(moduleName: string, config?: Partial<LoggerConfig>): Logger {
  const logger = new Logger(config);
  logger.pushContext({ module: moduleName });
  return logger;
}

/**
 * Log helper for async operations with automatic error handling
 */
export async function loggedOperation<T>(
  logger: Logger,
  operation: string,
  fn: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<T> {
  const timer = logger.startTimer(operation);

  try {
    logger.debug(`Starting ${operation}`, context);
    const result = await fn();
    timer.end({ ...context, success: true });
    return result;
  } catch (error) {
    logger.error(`${operation} failed`, error instanceof Error ? error : undefined, context);
    throw error;
  }
}
