/**
 * Graceful Degradation System
 *
 * Patterns for maintaining service availability when components fail:
 * - Feature flags
 * - Capability degradation
 * - Fallback responses
 * - Service health awareness
 * - Progressive enhancement/degradation
 */

import type { Tool, Message, CompletionResponse } from './types';
import { getLogger } from './logging';
import { getTelemetry } from './telemetry';

// ============================================
// Types
// ============================================

export interface FeatureFlags {
  /** Enable tool execution */
  toolsEnabled: boolean;
  /** Enable streaming responses */
  streamingEnabled: boolean;
  /** Enable response caching */
  cachingEnabled: boolean;
  /** Enable conversation memory */
  memoryEnabled: boolean;
  /** Maximum complexity level (1-10) */
  complexityLevel: number;
  /** Custom feature flags */
  custom: Record<string, boolean>;
}

export interface DegradationLevel {
  level: 'full' | 'reduced' | 'minimal' | 'offline';
  features: FeatureFlags;
  description: string;
}

export interface CapabilityStatus {
  name: string;
  available: boolean;
  degraded: boolean;
  reason?: string;
  lastChecked: number;
}

export interface FallbackResponse {
  content: string;
  metadata?: Record<string, unknown>;
}

export type FallbackStrategy =
  | 'cached' // Return cached response
  | 'static' // Return static fallback
  | 'simplified' // Simplify the request and retry
  | 'error'; // Return error message

// ============================================
// Degradation Manager
// ============================================

export class DegradationManager {
  private currentLevel: DegradationLevel;
  private capabilities: Map<string, CapabilityStatus> = new Map();
  private fallbackResponses: Map<string, FallbackResponse> = new Map();
  private logger = getLogger().child({ component: 'DegradationManager' });
  private telemetry = getTelemetry();

  // Predefined degradation levels
  private static readonly LEVELS: Record<string, DegradationLevel> = {
    full: {
      level: 'full',
      description: 'All features available',
      features: {
        toolsEnabled: true,
        streamingEnabled: true,
        cachingEnabled: true,
        memoryEnabled: true,
        complexityLevel: 10,
        custom: {},
      },
    },
    reduced: {
      level: 'reduced',
      description: 'Some features limited',
      features: {
        toolsEnabled: true,
        streamingEnabled: false,
        cachingEnabled: true,
        memoryEnabled: true,
        complexityLevel: 7,
        custom: {},
      },
    },
    minimal: {
      level: 'minimal',
      description: 'Minimal functionality',
      features: {
        toolsEnabled: false,
        streamingEnabled: false,
        cachingEnabled: true,
        memoryEnabled: false,
        complexityLevel: 3,
        custom: {},
      },
    },
    offline: {
      level: 'offline',
      description: 'Service unavailable',
      features: {
        toolsEnabled: false,
        streamingEnabled: false,
        cachingEnabled: false,
        memoryEnabled: false,
        complexityLevel: 0,
        custom: {},
      },
    },
  };

  constructor(initialLevel: DegradationLevel['level'] = 'full') {
    this.currentLevel = DegradationManager.LEVELS[initialLevel];
  }

  // ---- Level Management ----

  /**
   * Get current degradation level
   */
  getLevel(): DegradationLevel {
    return this.currentLevel;
  }

  /**
   * Set degradation level
   */
  setLevel(level: DegradationLevel['level']): void {
    const newLevel = DegradationManager.LEVELS[level];
    if (!newLevel) {
      throw new Error(`Unknown degradation level: ${level}`);
    }

    const oldLevel = this.currentLevel;
    this.currentLevel = newLevel;

    this.logger.info('Degradation level changed', {
      from: oldLevel.level,
      to: newLevel.level,
    });

    this.telemetry.incrementCounter('degradation.level_change', {
      from: oldLevel.level,
      to: newLevel.level,
    });
  }

  /**
   * Automatically adjust level based on error rate
   */
  adjustLevelBasedOnHealth(errorRate: number, latencyMs: number): void {
    let newLevel: DegradationLevel['level'];

    if (errorRate > 0.5 || latencyMs > 30000) {
      newLevel = 'offline';
    } else if (errorRate > 0.3 || latencyMs > 10000) {
      newLevel = 'minimal';
    } else if (errorRate > 0.1 || latencyMs > 5000) {
      newLevel = 'reduced';
    } else {
      newLevel = 'full';
    }

    if (newLevel !== this.currentLevel.level) {
      this.setLevel(newLevel);
    }
  }

  // ---- Feature Flags ----

  /**
   * Check if a feature is enabled
   */
  isFeatureEnabled(feature: keyof FeatureFlags | string): boolean {
    if (feature in this.currentLevel.features) {
      return this.currentLevel.features[feature as keyof FeatureFlags] as boolean;
    }
    return this.currentLevel.features.custom[feature] ?? false;
  }

  /**
   * Get complexity level
   */
  getComplexityLevel(): number {
    return this.currentLevel.features.complexityLevel;
  }

  // ---- Capability Management ----

  /**
   * Register a capability
   */
  registerCapability(name: string, available = true): void {
    this.capabilities.set(name, {
      name,
      available,
      degraded: false,
      lastChecked: Date.now(),
    });
  }

  /**
   * Update capability status
   */
  updateCapability(
    name: string,
    status: Partial<Omit<CapabilityStatus, 'name' | 'lastChecked'>>
  ): void {
    const current = this.capabilities.get(name);
    if (!current) {
      this.registerCapability(name);
    }

    this.capabilities.set(name, {
      ...this.capabilities.get(name)!,
      ...status,
      lastChecked: Date.now(),
    });
  }

  /**
   * Check if capability is available
   */
  isCapabilityAvailable(name: string): boolean {
    const capability = this.capabilities.get(name);
    return capability?.available ?? false;
  }

  /**
   * Get all capability statuses
   */
  getCapabilities(): CapabilityStatus[] {
    return Array.from(this.capabilities.values());
  }

  // ---- Fallback Management ----

  /**
   * Register a fallback response for a specific scenario
   */
  registerFallback(key: string, response: FallbackResponse): void {
    this.fallbackResponses.set(key, response);
  }

  /**
   * Get fallback response
   */
  getFallback(key: string): FallbackResponse | undefined {
    return this.fallbackResponses.get(key);
  }

  /**
   * Get fallback or default
   */
  getFallbackOrDefault(key: string, defaultResponse: FallbackResponse): FallbackResponse {
    return this.fallbackResponses.get(key) ?? defaultResponse;
  }
}

// ============================================
// Degraded Tool Wrapper
// ============================================

/**
 * Wrap a tool with graceful degradation
 */
export function createDegradedTool(
  tool: Tool,
  options: {
    degradationManager: DegradationManager;
    fallbackResult?: unknown;
    timeout?: number;
    retries?: number;
  }
): Tool {
  const {
    degradationManager,
    fallbackResult = { error: 'Tool temporarily unavailable' },
    timeout = 30000,
    retries = 1,
  } = options;

  const logger = getLogger().child({ tool: tool.name });

  return {
    ...tool,
    async execute(args: Record<string, unknown>): Promise<unknown> {
      // Check if tools are enabled
      if (!degradationManager.isFeatureEnabled('toolsEnabled')) {
        logger.warn('Tool execution disabled by degradation level');
        return fallbackResult;
      }

      // Check capability
      if (!degradationManager.isCapabilityAvailable(`tool:${tool.name}`)) {
        logger.warn('Tool capability unavailable');
        return fallbackResult;
      }

      let lastError: Error | undefined;

      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          // Execute with timeout
          const result = await Promise.race([
            tool.execute(args),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Tool execution timeout')), timeout)
            ),
          ]);

          // Success - ensure capability is marked available
          degradationManager.updateCapability(`tool:${tool.name}`, {
            available: true,
            degraded: false,
          });

          return result;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          logger.warn(`Tool execution failed (attempt ${attempt + 1})`, {
            error: lastError.message,
          });
        }
      }

      // All retries failed - mark as degraded
      degradationManager.updateCapability(`tool:${tool.name}`, {
        available: true,
        degraded: true,
        reason: lastError?.message,
      });

      return fallbackResult;
    },
  };
}

// ============================================
// Response Degradation
// ============================================

/**
 * Simplify a response for degraded mode
 */
export function simplifyResponse(response: CompletionResponse): CompletionResponse {
  return {
    id: response.id,
    content: response.content,
    finishReason: response.finishReason,
    // Strip tool calls in degraded mode
    toolCalls: undefined,
    // Preserve usage for tracking
    usage: response.usage,
  };
}

/**
 * Create a degraded response
 */
export function createDegradedResponse(
  _originalRequest: { messages: Message[] },
  reason: string
): CompletionResponse {
  return {
    id: `degraded_${Date.now()}`,
    content: `I apologize, but I'm currently operating with limited capabilities. ${reason}`,
    finishReason: 'stop',
  };
}

// ============================================
// Health-Aware Execution
// ============================================

export interface HealthAwareConfig {
  degradationManager: DegradationManager;
  healthThresholds: {
    errorRateWarning: number;
    errorRateCritical: number;
    latencyWarning: number;
    latencyCritical: number;
  };
}

/**
 * Execute with health awareness
 */
export async function executeWithHealthAwareness<T>(
  fn: () => Promise<T>,
  config: HealthAwareConfig,
  fallback: () => T
): Promise<T> {
  const { degradationManager } = config;
  const startTime = Date.now();

  // Check if we're in offline mode
  if (degradationManager.getLevel().level === 'offline') {
    return fallback();
  }

  try {
    const result = await fn();

    // Record success
    const latency = Date.now() - startTime;
    getTelemetry().recordLatency('health_aware.execution', latency);

    return result;
  } catch (error) {
    // Record failure and potentially degrade
    getTelemetry().incrementCounter('health_aware.failure');

    // In minimal mode, return fallback on any error
    if (degradationManager.getLevel().level === 'minimal') {
      return fallback();
    }

    throw error;
  }
}

// ============================================
// Circuit State Integration
// ============================================

/**
 * Sync degradation level with circuit breaker state
 */
export function syncWithCircuitBreaker(
  degradationManager: DegradationManager,
  circuitState: 'closed' | 'open' | 'half-open'
): void {
  switch (circuitState) {
    case 'open':
      if (degradationManager.getLevel().level !== 'offline') {
        degradationManager.setLevel('offline');
      }
      break;
    case 'half-open':
      if (degradationManager.getLevel().level === 'offline') {
        degradationManager.setLevel('minimal');
      }
      break;
    case 'closed':
      if (degradationManager.getLevel().level !== 'full') {
        // Gradually restore - don't jump to full immediately
        const currentLevel = degradationManager.getLevel().level;
        if (currentLevel === 'offline') {
          degradationManager.setLevel('minimal');
        } else if (currentLevel === 'minimal') {
          degradationManager.setLevel('reduced');
        } else if (currentLevel === 'reduced') {
          degradationManager.setLevel('full');
        }
      }
      break;
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a degradation manager with common fallbacks
 */
export function createDegradationManager(
  initialLevel: DegradationLevel['level'] = 'full'
): DegradationManager {
  const manager = new DegradationManager(initialLevel);

  // Register common fallbacks
  manager.registerFallback('provider_unavailable', {
    content:
      "I'm currently experiencing some difficulties connecting to my backend services. Please try again in a moment.",
  });

  manager.registerFallback('rate_limited', {
    content:
      "I'm receiving a high volume of requests right now. Please wait a moment before trying again.",
  });

  manager.registerFallback('tool_unavailable', {
    content:
      "Some of my capabilities are temporarily limited. I'll do my best to help with what's available.",
  });

  manager.registerFallback('offline', {
    content: "I'm currently offline for maintenance. Please check back shortly.",
  });

  return manager;
}

/**
 * Create degraded versions of all tools
 */
export function createDegradedTools(
  tools: Tool[],
  degradationManager: DegradationManager,
  options: { timeout?: number; retries?: number } = {}
): Tool[] {
  return tools.map((tool) => {
    degradationManager.registerCapability(`tool:${tool.name}`, true);
    return createDegradedTool(tool, { degradationManager, ...options });
  });
}
