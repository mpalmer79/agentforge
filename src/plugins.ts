/**
 * Plugin system for extending AgentForge functionality
 */

import type { Agent } from './agent';
import type { Middleware, Tool } from './types';
import type { EventEmitter, EventName, EventListener } from './events';

// ============================================
// Plugin Types
// ============================================

/**
 * Plugin metadata
 */
export interface PluginMetadata {
  /** Unique plugin name */
  name: string;
  /** Plugin version */
  version: string;
  /** Plugin description */
  description?: string;
  /** Plugin author */
  author?: string;
  /** Plugin dependencies */
  dependencies?: string[];
}

/**
 * Plugin context passed to plugin lifecycle hooks
 */
export interface PluginContext {
  /** The agent instance */
  agent: Agent;
  /** Event emitter for subscribing to events */
  events: EventEmitter;
  /** Plugin-specific storage */
  storage: Map<string, unknown>;
  /** Logger scoped to the plugin */
  logger: PluginLogger;
}

/**
 * Plugin logger interface
 */
export interface PluginLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Plugin event handlers type
 */
export type PluginEventHandlers = {
  [E in EventName]?: EventListener<E>;
};

/**
 * Plugin definition
 */
export interface Plugin {
  /** Plugin metadata */
  metadata: PluginMetadata;

  /** Called when plugin is registered */
  onRegister?(context: PluginContext): void | Promise<void>;

  /** Called when plugin is unregistered */
  onUnregister?(context: PluginContext): void | Promise<void>;

  /** Tools provided by the plugin */
  tools?: Tool[];

  /** Middleware provided by the plugin */
  middleware?: Middleware[];

  /** Event subscriptions */
  events?: PluginEventHandlers;
}

// ============================================
// Plugin Manager
// ============================================

/**
 * Manages plugin registration and lifecycle
 *
 * @example
 * ```typescript
 * const manager = new PluginManager(agent, eventEmitter);
 *
 * await manager.register(analyticsPlugin);
 * await manager.register(loggingPlugin);
 *
 * // Later
 * await manager.unregister('analytics');
 * ```
 */
export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private contexts: Map<string, PluginContext> = new Map();
  private eventCleanups: Map<string, Array<() => void>> = new Map();
  private agent: Agent;
  private events: EventEmitter;

  constructor(agent: Agent, events: EventEmitter) {
    this.agent = agent;
    this.events = events;
  }

  /**
   * Register a plugin
   */
  async register(plugin: Plugin): Promise<void> {
    const { name, version, dependencies } = plugin.metadata;

    // Check if already registered
    if (this.plugins.has(name)) {
      throw new Error(`Plugin "${name}" is already registered`);
    }

    // Check dependencies
    if (dependencies) {
      for (const dep of dependencies) {
        if (!this.plugins.has(dep)) {
          throw new Error(`Plugin "${name}" requires "${dep}" to be registered first`);
        }
      }
    }

    // Create plugin context
    const context: PluginContext = {
      agent: this.agent,
      events: this.events,
      storage: new Map(),
      logger: this.createLogger(name),
    };

    // Register tools
    if (plugin.tools) {
      for (const tool of plugin.tools) {
        this.agent.addTool(tool);
      }
    }

    // Subscribe to events and track cleanup functions
    const cleanups: Array<() => void> = [];
    if (plugin.events) {
      const eventEntries = Object.entries(plugin.events) as Array<
        [EventName, EventListener<EventName>]
      >;
      for (const [eventName, listener] of eventEntries) {
        if (listener) {
          const unsubscribe = this.events.on(eventName, listener);
          cleanups.push(unsubscribe);
        }
      }
    }
    this.eventCleanups.set(name, cleanups);

    // Call onRegister hook
    if (plugin.onRegister) {
      await plugin.onRegister(context);
    }

    // Store plugin and context
    this.plugins.set(name, plugin);
    this.contexts.set(name, context);

    context.logger.info(`Plugin "${name}" v${version} registered`);
  }

  /**
   * Unregister a plugin
   */
  async unregister(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    const context = this.contexts.get(name);

    if (!plugin || !context) {
      throw new Error(`Plugin "${name}" is not registered`);
    }

    // Check if other plugins depend on this one
    for (const [otherName, otherPlugin] of this.plugins) {
      if (otherName !== name && otherPlugin.metadata.dependencies?.includes(name)) {
        throw new Error(`Cannot unregister "${name}": "${otherName}" depends on it`);
      }
    }

    // Call onUnregister hook
    if (plugin.onUnregister) {
      await plugin.onUnregister(context);
    }

    // Unsubscribe from events using stored cleanup functions
    const cleanups = this.eventCleanups.get(name) ?? [];
    for (const cleanup of cleanups) {
      cleanup();
    }
    this.eventCleanups.delete(name);

    // Remove tools
    if (plugin.tools) {
      for (const tool of plugin.tools) {
        this.agent.removeTool(tool.name);
      }
    }

    // Clean up
    this.plugins.delete(name);
    this.contexts.delete(name);

    context.logger.info(`Plugin "${name}" unregistered`);
  }

  /**
   * Get a registered plugin
   */
  get(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Check if a plugin is registered
   */
  has(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Get all registered plugins
   */
  getAll(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugin context
   */
  getContext(name: string): PluginContext | undefined {
    return this.contexts.get(name);
  }

  private createLogger(pluginName: string): PluginLogger {
    const prefix = `[Plugin:${pluginName}]`;

    return {
      debug: (message, ...args) => console.debug(prefix, message, ...args),
      info: (message, ...args) => console.info(prefix, message, ...args),
      warn: (message, ...args) => console.warn(prefix, message, ...args),
      error: (message, ...args) => console.error(prefix, message, ...args),
    };
  }
}

// ============================================
// Plugin Factory
// ============================================

/**
 * Create a plugin with type safety
 */
export function definePlugin(plugin: Plugin): Plugin {
  return plugin;
}

// ============================================
// Built-in Plugins
// ============================================

/**
 * Analytics plugin that tracks agent usage
 */
export const analyticsPlugin = definePlugin({
  metadata: {
    name: 'analytics',
    version: '1.0.0',
    description: 'Tracks agent usage and performance metrics',
  },

  onRegister({ storage, logger }) {
    storage.set('metrics', {
      totalRequests: 0,
      totalToolCalls: 0,
      totalErrors: 0,
      avgResponseTimeMs: 0,
      responseTimes: [] as number[],
    });

    logger.info('Analytics tracking enabled');
  },

  events: {
    'request:end': ({ durationMs }) => {
      console.log(`[Analytics] Request completed in ${durationMs}ms`);
    },

    'tool:end': ({ toolCall, durationMs }) => {
      console.log(`[Analytics] Tool "${toolCall.name}" completed in ${durationMs}ms`);
    },

    'request:error': ({ error }) => {
      console.log(`[Analytics] Error: ${error.message}`);
    },
  },
});

/**
 * Telemetry plugin for debugging
 */
export const telemetryPlugin = definePlugin({
  metadata: {
    name: 'telemetry',
    version: '1.0.0',
    description: 'Detailed telemetry for debugging',
  },

  events: {
    'agent:start': ({ input }) => {
      const inputPreview =
        typeof input === 'string' ? input.slice(0, 100) : `[${input.length} messages]`;
      console.log(`[Telemetry] Agent started: ${inputPreview}`);
    },

    'agent:end': ({ iterations, durationMs }) => {
      console.log(`[Telemetry] Agent completed: ${iterations} iterations, ${durationMs}ms`);
    },

    'tool:start': ({ toolCall }) => {
      console.log(`[Telemetry] Tool starting: ${toolCall.name}`);
    },

    'stream:chunk': ({ content }) => {
      process.stdout.write(content);
    },
  },
});
