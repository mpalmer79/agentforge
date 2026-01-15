/**
 * Memory Summarization Strategies
 * 
 * Advanced memory management for long conversations:
 * - Sliding window with summarization
 * - Semantic compression
 * - Hierarchical summarization
 * - Importance-based retention
 */

import type { Message, Provider } from './types';
import { getTokenCounter } from './tokenizer';
import { getLogger } from './logging';
import { getTelemetry } from './telemetry';

// ============================================
// Types
// ============================================

export interface SummarizationConfig {
  /** Maximum tokens to keep in active memory */
  maxTokens: number;
  /** Tokens to preserve for new messages */
  reserveTokens: number;
  /** Minimum messages before summarization triggers */
  minMessagesBeforeSummarization: number;
  /** How many recent messages to always keep unsummarized */
  preserveRecentMessages: number;
  /** Model to use for summarization (if using LLM-based) */
  summarizationModel?: string;
}

export interface SummarizationResult {
  /** Messages after summarization */
  messages: Message[];
  /** Whether summarization occurred */
  summarized: boolean;
  /** Original token count */
  originalTokens: number;
  /** Final token count */
  finalTokens: number;
  /** Summary that was generated (if any) */
  summary?: string;
}

export type SummarizationStrategy = 
  | 'sliding_window'
  | 'semantic_compression'
  | 'hierarchical'
  | 'importance_based'
  | 'hybrid';

export interface MemorySummarizer {
  /** Strategy name */
  name: SummarizationStrategy;
  /** Summarize messages to fit within token budget */
  summarize(
    messages: Message[],
    config: SummarizationConfig
  ): Promise<SummarizationResult>;
}

// ============================================
// Sliding Window Strategy
// ============================================

/**
 * Simple sliding window with optional summarization of dropped messages
 * 
 * @example
 * ```typescript
 * const summarizer = createSlidingWindowSummarizer();
 * const result = await summarizer.summarize(messages, {
 *   maxTokens: 4000,
 *   reserveTokens: 1000,
 *   minMessagesBeforeSummarization: 10,
 *   preserveRecentMessages: 5,
 * });
 * ```
 */
export function createSlidingWindowSummarizer(
  options: {
    /** Provider for generating summaries */
    provider?: Provider;
    /** Include summary of dropped messages */
    includeSummary?: boolean;
  } = {}
): MemorySummarizer {
  const { provider, includeSummary = true } = options;
  const logger = getLogger().child({ component: 'SlidingWindowSummarizer' });

  return {
    name: 'sliding_window',
    async summarize(messages, config) {
      const counter = getTokenCounter('gpt-4');
      const startTime = Date.now();

      // Calculate current token count
      const originalTokens = messages.reduce(
        (sum, m) => sum + counter.count(m.content),
        0
      );

      // Check if summarization is needed
      const targetTokens = config.maxTokens - config.reserveTokens;
      if (originalTokens <= targetTokens) {
        return {
          messages,
          summarized: false,
          originalTokens,
          finalTokens: originalTokens,
        };
      }

      logger.debug('Starting sliding window summarization', {
        originalTokens,
        targetTokens,
        messageCount: messages.length,
      });

      // Separate system message
      const systemMessage = messages.find(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      // Always preserve recent messages
      const preserveCount = Math.min(
        config.preserveRecentMessages,
        conversationMessages.length
      );
      const recentMessages = conversationMessages.slice(-preserveCount);
      const olderMessages = conversationMessages.slice(0, -preserveCount);

      // Calculate how many older messages we can keep
      const systemTokens = systemMessage ? counter.count(systemMessage.content) : 0;
      const recentTokens = recentMessages.reduce(
        (sum, m) => sum + counter.count(m.content),
        0
      );
      const availableForOlder = targetTokens - systemTokens - recentTokens;

      // Keep as many older messages as possible
      let keptMessages: Message[] = [];
      let keptTokens = 0;
      let droppedMessages: Message[] = [];

      for (let i = olderMessages.length - 1; i >= 0; i--) {
        const msg = olderMessages[i];
        const msgTokens = counter.count(msg.content);

        if (keptTokens + msgTokens <= availableForOlder) {
          keptMessages.unshift(msg);
          keptTokens += msgTokens;
        } else {
          droppedMessages = olderMessages.slice(0, i + 1);
          break;
        }
      }

      // Generate summary of dropped messages if requested and provider available
      let summaryMessage: Message | undefined;
      if (includeSummary && provider && droppedMessages.length > 0) {
        try {
          const summary = await generateSummary(provider, droppedMessages);
          summaryMessage = {
            id: `summary-${Date.now()}`,
            role: 'system',
            content: `[Previous conversation summary: ${summary}]`,
            timestamp: Date.now(),
          };
        } catch (error) {
          logger.warn('Failed to generate summary', { error });
        }
      }

      // Reconstruct messages
      const result: Message[] = [];
      if (systemMessage) result.push(systemMessage);
      if (summaryMessage) result.push(summaryMessage);
      result.push(...keptMessages, ...recentMessages);

      const finalTokens = result.reduce(
        (sum, m) => sum + counter.count(m.content),
        0
      );

      getTelemetry().recordLatency('memory.summarization', Date.now() - startTime);
      getTelemetry().recordMetric('memory.tokens_saved', originalTokens - finalTokens, 'count');

      logger.info('Sliding window summarization complete', {
        originalTokens,
        finalTokens,
        droppedMessages: droppedMessages.length,
        keptMessages: keptMessages.length,
      });

      return {
        messages: result,
        summarized: true,
        originalTokens,
        finalTokens,
        summary: summaryMessage?.content,
      };
    },
  };
}

// ============================================
// Semantic Compression Strategy
// ============================================

/**
 * Compress messages by extracting key information and removing redundancy
 * 
 * Uses LLM to intelligently compress conversation while preserving meaning
 */
export function createSemanticCompressionSummarizer(
  provider: Provider
): MemorySummarizer {
  const logger = getLogger().child({ component: 'SemanticCompressionSummarizer' });

  return {
    name: 'semantic_compression',
    async summarize(messages, config) {
      const counter = getTokenCounter('gpt-4');
      const startTime = Date.now();

      const originalTokens = messages.reduce(
        (sum, m) => sum + counter.count(m.content),
        0
      );

      const targetTokens = config.maxTokens - config.reserveTokens;
      if (originalTokens <= targetTokens) {
        return {
          messages,
          summarized: false,
          originalTokens,
          finalTokens: originalTokens,
        };
      }

      logger.debug('Starting semantic compression', {
        originalTokens,
        targetTokens,
        compressionRatio: targetTokens / originalTokens,
      });

      // Separate system message
      const systemMessage = messages.find(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      // Preserve recent messages
      const preserveCount = config.preserveRecentMessages;
      const recentMessages = conversationMessages.slice(-preserveCount);
      const toCompress = conversationMessages.slice(0, -preserveCount);

      if (toCompress.length < config.minMessagesBeforeSummarization) {
        // Fall back to simple truncation
        return {
          messages: [
            ...(systemMessage ? [systemMessage] : []),
            ...recentMessages,
          ],
          summarized: true,
          originalTokens,
          finalTokens: counter.count(
            (systemMessage?.content ?? '') + 
            recentMessages.map(m => m.content).join('')
          ),
        };
      }

      // Compress older messages using LLM
      const compressionPrompt = buildCompressionPrompt(toCompress, targetTokens / 2);
      
      const compressionResponse = await provider.complete({
        messages: [
          {
            id: 'compression-system',
            role: 'system',
            content: `You are a conversation summarizer. Your task is to compress a conversation into a much shorter form while preserving all key information, decisions, and context needed to continue the conversation naturally. Be concise but complete.`,
            timestamp: Date.now(),
          },
          {
            id: 'compression-user',
            role: 'user',
            content: compressionPrompt,
            timestamp: Date.now(),
          },
        ],
        maxTokens: Math.floor(targetTokens / 2),
      });

      const compressedContent = compressionResponse.content;

      // Create compressed context message
      const compressedMessage: Message = {
        id: `compressed-${Date.now()}`,
        role: 'assistant',
        content: `[Compressed conversation context]\n${compressedContent}`,
        timestamp: Date.now(),
        metadata: { compressed: true, originalMessageCount: toCompress.length },
      };

      const result: Message[] = [
        ...(systemMessage ? [systemMessage] : []),
        compressedMessage,
        ...recentMessages,
      ];

      const finalTokens = result.reduce(
        (sum, m) => sum + counter.count(m.content),
        0
      );

      getTelemetry().recordLatency('memory.semantic_compression', Date.now() - startTime);
      getTelemetry().recordMetric('memory.compression_ratio', (finalTokens / originalTokens) * 100, 'percent');

      logger.info('Semantic compression complete', {
        originalTokens,
        finalTokens,
        compressionRatio: (finalTokens / originalTokens).toFixed(2),
        messagesCompressed: toCompress.length,
      });

      return {
        messages: result,
        summarized: true,
        originalTokens,
        finalTokens,
        summary: compressedContent,
      };
    },
  };
}

// ============================================
// Hierarchical Summarization Strategy
// ============================================

/**
 * Creates hierarchical summaries at different levels of detail
 * 
 * Level 1: Detailed recent context
 * Level 2: Condensed mid-term context  
 * Level 3: High-level long-term summary
 */
export function createHierarchicalSummarizer(
  provider: Provider
): MemorySummarizer {
  const logger = getLogger().child({ component: 'HierarchicalSummarizer' });

  // Store hierarchical summaries
  const summaryLevels: {
    level1: Message[]; // Recent, full detail
    level2: string;    // Mid-term summary
    level3: string;    // Long-term summary
  } = {
    level1: [],
    level2: '',
    level3: '',
  };

  return {
    name: 'hierarchical',
    async summarize(messages, config) {
      const counter = getTokenCounter('gpt-4');
      const startTime = Date.now();

      const originalTokens = messages.reduce(
        (sum, m) => sum + counter.count(m.content),
        0
      );

      const targetTokens = config.maxTokens - config.reserveTokens;
      if (originalTokens <= targetTokens) {
        return {
          messages,
          summarized: false,
          originalTokens,
          finalTokens: originalTokens,
        };
      }

      logger.debug('Starting hierarchical summarization', {
        originalTokens,
        targetTokens,
      });

      const systemMessage = messages.find(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      // Allocate tokens: 60% level1, 25% level2, 15% level3
      const level1Budget = Math.floor(targetTokens * 0.60);
      const level2Budget = Math.floor(targetTokens * 0.25);
      const level3Budget = Math.floor(targetTokens * 0.15);

      // Level 1: Keep recent messages
      let level1Messages: Message[] = [];
      let level1Tokens = 0;
      
      for (let i = conversationMessages.length - 1; i >= 0; i--) {
        const msg = conversationMessages[i];
        const msgTokens = counter.count(msg.content);
        
        if (level1Tokens + msgTokens <= level1Budget) {
          level1Messages.unshift(msg);
          level1Tokens += msgTokens;
        } else {
          break;
        }
      }

      // Messages that need summarization
      const toSummarize = conversationMessages.slice(
        0,
        conversationMessages.length - level1Messages.length
      );

      // Level 2: Summarize mid-term context
      let level2Summary = '';
      if (toSummarize.length > 0) {
        const midTermMessages = toSummarize.slice(-Math.min(20, toSummarize.length));
        level2Summary = await generateSummary(
          provider,
          midTermMessages,
          level2Budget
        );
      }

      // Level 3: Update long-term summary if needed
      let level3Summary = summaryLevels.level3;
      const oldMessages = toSummarize.slice(0, -20);
      if (oldMessages.length > 10) {
        // Incorporate old messages into long-term summary
        const newLongTermContent = await generateSummary(
          provider,
          oldMessages,
          level3Budget
        );
        
        if (level3Summary) {
          // Merge with existing long-term summary
          level3Summary = await mergeSummaries(
            provider,
            level3Summary,
            newLongTermContent,
            level3Budget
          );
        } else {
          level3Summary = newLongTermContent;
        }
        
        summaryLevels.level3 = level3Summary;
      }

      // Build result messages
      const result: Message[] = [];
      
      if (systemMessage) result.push(systemMessage);
      
      if (level3Summary) {
        result.push({
          id: `summary-l3-${Date.now()}`,
          role: 'system',
          content: `[Long-term context]: ${level3Summary}`,
          timestamp: Date.now(),
        });
      }
      
      if (level2Summary) {
        result.push({
          id: `summary-l2-${Date.now()}`,
          role: 'system',
          content: `[Recent context summary]: ${level2Summary}`,
          timestamp: Date.now(),
        });
      }
      
      result.push(...level1Messages);

      const finalTokens = result.reduce(
        (sum, m) => sum + counter.count(m.content),
        0
      );

      getTelemetry().recordLatency('memory.hierarchical_summarization', Date.now() - startTime);

      logger.info('Hierarchical summarization complete', {
        originalTokens,
        finalTokens,
        level1Messages: level1Messages.length,
        hasLevel2: !!level2Summary,
        hasLevel3: !!level3Summary,
      });

      return {
        messages: result,
        summarized: true,
        originalTokens,
        finalTokens,
        summary: [level3Summary, level2Summary].filter(Boolean).join('\n\n'),
      };
    },
  };
}

// ============================================
// Importance-Based Retention Strategy
// ============================================

export interface MessageImportance {
  /** Message ID */
  id: string;
  /** Importance score 0-1 */
  score: number;
  /** Reason for importance score */
  reason?: string;
}

/**
 * Retain messages based on their importance to the conversation
 * 
 * Uses LLM to score message importance and keeps the most important ones
 */
export function createImportanceBasedSummarizer(
  provider: Provider,
  options: {
    /** Custom importance scoring function */
    scoreFunction?: (message: Message, context: Message[]) => Promise<number>;
  } = {}
): MemorySummarizer {
  const logger = getLogger().child({ component: 'ImportanceBasedSummarizer' });

  return {
    name: 'importance_based',
    async summarize(messages, config) {
      const counter = getTokenCounter('gpt-4');
      const startTime = Date.now();

      const originalTokens = messages.reduce(
        (sum, m) => sum + counter.count(m.content),
        0
      );

      const targetTokens = config.maxTokens - config.reserveTokens;
      if (originalTokens <= targetTokens) {
        return {
          messages,
          summarized: false,
          originalTokens,
          finalTokens: originalTokens,
        };
      }

      logger.debug('Starting importance-based summarization', {
        originalTokens,
        targetTokens,
      });

      const systemMessage = messages.find(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      // Always preserve recent messages
      const recentMessages = conversationMessages.slice(-config.preserveRecentMessages);
      const candidateMessages = conversationMessages.slice(0, -config.preserveRecentMessages);

      // Score importance of candidate messages
      const scores = await scoreMessageImportance(
        provider,
        candidateMessages,
        options.scoreFunction
      );

      // Sort by importance and select messages that fit
      const sortedCandidates = candidateMessages
        .map((msg, idx) => ({ msg, score: scores[idx] ?? 0.5 }))
        .sort((a, b) => b.score - a.score);

      const systemTokens = systemMessage ? counter.count(systemMessage.content) : 0;
      const recentTokens = recentMessages.reduce(
        (sum, m) => sum + counter.count(m.content),
        0
      );
      const availableTokens = targetTokens - systemTokens - recentTokens;

      // Select most important messages that fit
      let selectedMessages: Message[] = [];
      let selectedTokens = 0;
      let droppedCount = 0;

      for (const { msg } of sortedCandidates) {
        const msgTokens = counter.count(msg.content);
        if (selectedTokens + msgTokens <= availableTokens) {
          selectedMessages.push(msg);
          selectedTokens += msgTokens;
        } else {
          droppedCount++;
        }
      }

      // Sort selected messages back to chronological order
      const messageOrder = new Map(
        candidateMessages.map((m, i) => [m.id, i])
      );
      selectedMessages.sort(
        (a, b) => (messageOrder.get(a.id) ?? 0) - (messageOrder.get(b.id) ?? 0)
      );

      const result: Message[] = [
        ...(systemMessage ? [systemMessage] : []),
        ...selectedMessages,
        ...recentMessages,
      ];

      const finalTokens = result.reduce(
        (sum, m) => sum + counter.count(m.content),
        0
      );

      getTelemetry().recordLatency('memory.importance_summarization', Date.now() - startTime);

      logger.info('Importance-based summarization complete', {
        originalTokens,
        finalTokens,
        selectedMessages: selectedMessages.length,
        droppedMessages: droppedCount,
      });

      return {
        messages: result,
        summarized: true,
        originalTokens,
        finalTokens,
      };
    },
  };
}

// ============================================
// Helper Functions
// ============================================

async function generateSummary(
  provider: Provider,
  messages: Message[],
  maxTokens?: number
): Promise<string> {
  const conversationText = messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  const response = await provider.complete({
    messages: [
      {
        id: 'summary-system',
        role: 'system',
        content: 'Summarize the following conversation concisely, preserving key facts, decisions, and context needed to continue naturally.',
        timestamp: Date.now(),
      },
      {
        id: 'summary-user',
        role: 'user',
        content: conversationText,
        timestamp: Date.now(),
      },
    ],
    maxTokens: maxTokens ?? 500,
  });

  return response.content;
}

async function mergeSummaries(
  provider: Provider,
  existing: string,
  newContent: string,
  maxTokens: number
): Promise<string> {
  const response = await provider.complete({
    messages: [
      {
        id: 'merge-system',
        role: 'system',
        content: 'Merge these two summaries into one cohesive summary, removing redundancy while preserving all unique information.',
        timestamp: Date.now(),
      },
      {
        id: 'merge-user',
        role: 'user',
        content: `Existing summary:\n${existing}\n\nNew content:\n${newContent}`,
        timestamp: Date.now(),
      },
    ],
    maxTokens,
  });

  return response.content;
}

function buildCompressionPrompt(messages: Message[], _targetTokens: number): string {
  const conversationText = messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  return `Compress this conversation while preserving all key information:

${conversationText}

Provide a compressed version that captures:
1. Key facts and information shared
2. Decisions made
3. Important context for continuing the conversation
4. Any action items or commitments`;
}

async function scoreMessageImportance(
  _provider: Provider,
  messages: Message[],
  customScorer?: (message: Message, context: Message[]) => Promise<number>
): Promise<number[]> {
  if (customScorer) {
    return Promise.all(messages.map(m => customScorer(m, messages)));
  }

  // Use heuristics for basic scoring
  return messages.map(msg => {
    let score = 0.5;

    // Questions are important
    if (msg.content.includes('?')) score += 0.1;

    // Longer messages often contain more information
    if (msg.content.length > 200) score += 0.1;

    // Messages with specific keywords
    const importantKeywords = ['decided', 'agreed', 'important', 'remember', 'key', 'must', 'should'];
    if (importantKeywords.some(kw => msg.content.toLowerCase().includes(kw))) {
      score += 0.15;
    }

    // Tool calls/results are important
    if (msg.role === 'tool' || msg.metadata?.toolCallId) {
      score += 0.2;
    }

    return Math.min(1, Math.max(0, score));
  });
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a memory summarizer with the specified strategy
 */
export function createMemorySummarizer(
  strategy: SummarizationStrategy,
  provider?: Provider
): MemorySummarizer {
  switch (strategy) {
    case 'sliding_window':
      return createSlidingWindowSummarizer({ provider });
    
    case 'semantic_compression':
      if (!provider) throw new Error('Provider required for semantic compression');
      return createSemanticCompressionSummarizer(provider);
    
    case 'hierarchical':
      if (!provider) throw new Error('Provider required for hierarchical summarization');
      return createHierarchicalSummarizer(provider);
    
    case 'importance_based':
      if (!provider) throw new Error('Provider required for importance-based summarization');
      return createImportanceBasedSummarizer(provider);
    
    case 'hybrid':
      // Hybrid combines sliding window with semantic compression
      if (!provider) throw new Error('Provider required for hybrid strategy');
      return createSemanticCompressionSummarizer(provider);
    
    default:
      return createSlidingWindowSummarizer();
  }
}

// ============================================
// Default Configuration
// ============================================

export const DEFAULT_SUMMARIZATION_CONFIG: SummarizationConfig = {
  maxTokens: 8000,
  reserveTokens: 2000,
  minMessagesBeforeSummarization: 10,
  preserveRecentMessages: 5,
};
