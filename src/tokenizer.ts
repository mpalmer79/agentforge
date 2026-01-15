/**
 * Token counting and management utilities
 *
 * Provides accurate token counting for different model families.
 * Falls back to estimation when exact counting isn't available.
 */

// ============================================
// Types
// ============================================

export type ModelFamily = 'gpt-4' | 'gpt-3.5' | 'claude' | 'gemini' | 'unknown';

export interface TokenCounter {
  count(text: string): number;
  countMessages(messages: Array<{ role: string; content: string }>): number;
  encode(text: string): number[];
  decode(tokens: number[]): string;
  modelFamily: ModelFamily;
}

export interface TokenBudget {
  total: number;
  used: number;
  remaining: number;
  percentUsed: number;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Check if a string contains only ASCII characters (code points 0-127)
 */
function isAsciiOnly(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 127) {
      return false;
    }
  }
  return true;
}

/**
 * Count non-ASCII characters in a string
 */
function countNonAscii(str: string): number {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 127) {
      count++;
    }
  }
  return count;
}

// ============================================
// Token Counting Implementations
// ============================================

/**
 * Byte-Pair Encoding approximation
 * More accurate than simple character counting
 */
class BPEApproximation implements TokenCounter {
  modelFamily: ModelFamily;

  // Overhead per message for chat format
  private readonly messageOverhead: number;

  // Average characters per token for different content types (used for simple estimation fallback)
  private readonly charsPerToken: number;

  constructor(modelFamily: ModelFamily = 'gpt-4') {
    this.modelFamily = modelFamily;

    // Different models have different tokenization characteristics
    switch (modelFamily) {
      case 'gpt-4':
      case 'gpt-3.5':
        this.charsPerToken = 3.5;
        this.messageOverhead = 4; // <|im_start|>{role}\n ... <|im_end|>
        break;

      case 'claude':
        this.charsPerToken = 3.8;
        this.messageOverhead = 3;
        break;

      case 'gemini':
        this.charsPerToken = 4.0;
        this.messageOverhead = 2;
        break;

      default:
        this.charsPerToken = 4.0;
        this.messageOverhead = 4;
    }
  }

  count(text: string): number {
    if (!text) return 0;

    // For very short strings, use simple character-based estimation
    if (text.length < 10) {
      return Math.ceil(text.length / this.charsPerToken);
    }

    // More sophisticated estimation for longer text
    let tokens = 0;

    // Count words (roughly 1.3 tokens per word for English)
    const words = text.split(/\s+/).filter(Boolean);
    tokens += words.length * 1.3;

    // Add tokens for punctuation and special characters
    const specialChars = text.match(/[^\w\s]/g) || [];
    tokens += specialChars.length * 0.5;

    // Add tokens for numbers (often tokenized per digit)
    const numbers = text.match(/\d+/g) || [];
    for (const num of numbers) {
      tokens += Math.ceil(num.length / 2);
    }

    // Adjust for code (typically more tokens)
    if (this.looksLikeCode(text)) {
      tokens *= 1.2;
    }

    // Adjust for non-ASCII (typically more tokens)
    const nonAsciiCount = countNonAscii(text);
    tokens += nonAsciiCount * 0.5;

    return Math.ceil(tokens);
  }

  countMessages(messages: Array<{ role: string; content: string }>): number {
    let total = 0;

    for (const msg of messages) {
      total += this.messageOverhead;
      total += this.count(msg.role);
      total += this.count(msg.content);
    }

    // Add priming tokens
    total += 3;

    return total;
  }

  encode(text: string): number[] {
    // Approximate encoding - just return sequential numbers based on estimated count
    const count = this.count(text);
    return Array.from({ length: count }, (_, i) => i);
  }

  decode(_tokens: number[]): string {
    // Cannot accurately decode without real tokenizer
    return '[Decoding not supported with approximation]';
  }

  private looksLikeCode(text: string): boolean {
    const codeIndicators = [
      /function\s+\w+\s*\(/,
      /const\s+\w+\s*=/,
      /let\s+\w+\s*=/,
      /import\s+.*from/,
      /class\s+\w+/,
      /=>/,
      /\{\s*\n/,
      /\[\s*\n/,
    ];

    return codeIndicators.some((pattern) => pattern.test(text));
  }
}

/**
 * Unicode-aware token counter
 * Better for multilingual content
 */
class UnicodeTokenCounter implements TokenCounter {
  modelFamily: ModelFamily = 'unknown';

  count(text: string): number {
    if (!text) return 0;

    let tokens = 0;
    const graphemes = [...new Intl.Segmenter().segment(text)];

    for (const { segment } of graphemes) {
      // ASCII characters: roughly 4 chars per token
      if (isAsciiOnly(segment)) {
        tokens += segment.length / 4;
      }
      // CJK characters: roughly 1-2 chars per token
      else if (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(segment)) {
        tokens += segment.length * 0.7;
      }
      // Other Unicode: roughly 2-3 chars per token
      else {
        tokens += segment.length / 2;
      }
    }

    return Math.ceil(tokens);
  }

  countMessages(messages: Array<{ role: string; content: string }>): number {
    let total = 0;

    for (const msg of messages) {
      total += 4; // message overhead
      total += this.count(msg.role);
      total += this.count(msg.content);
    }

    return total + 3; // priming
  }

  encode(text: string): number[] {
    const count = this.count(text);
    return Array.from({ length: count }, (_, i) => i);
  }

  decode(_tokens: number[]): string {
    return '[Decoding not supported]';
  }
}

// ============================================
// Token Counter Factory
// ============================================

const counterCache = new Map<ModelFamily, TokenCounter>();

/**
 * Get a token counter for a specific model
 */
export function getTokenCounter(model: string): TokenCounter {
  const family = getModelFamily(model);

  let counter = counterCache.get(family);
  if (!counter) {
    counter = new BPEApproximation(family);
    counterCache.set(family, counter);
  }

  return counter;
}

/**
 * Determine model family from model name
 */
export function getModelFamily(model: string): ModelFamily {
  const normalized = model.toLowerCase();

  if (normalized.includes('gpt-4') || normalized.includes('gpt4')) {
    return 'gpt-4';
  }

  if (normalized.includes('gpt-3') || normalized.includes('gpt3')) {
    return 'gpt-3.5';
  }

  if (normalized.includes('claude')) {
    return 'claude';
  }

  if (normalized.includes('gemini') || normalized.includes('palm')) {
    return 'gemini';
  }

  return 'unknown';
}

// ============================================
// Token Budget Management
// ============================================

/**
 * Model context window sizes
 */
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // GPT-4 family
  'gpt-4': 8192,
  'gpt-4-32k': 32768,
  'gpt-4-turbo': 128000,
  'gpt-4-turbo-preview': 128000,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,

  // GPT-3.5 family
  'gpt-3.5-turbo': 16385,
  'gpt-3.5-turbo-16k': 16385,

  // Claude family
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,
  'claude-2': 100000,
  'claude-2.1': 200000,
  'claude-instant': 100000,

  // Gemini family
  'gemini-pro': 32760,
  'gemini-1.5-pro': 1000000,
  'gemini-1.5-flash': 1000000,
};

/**
 * Get context window size for a model
 */
export function getContextWindow(model: string): number {
  const normalized = model.toLowerCase();

  // Exact match
  if (MODEL_CONTEXT_WINDOWS[normalized]) {
    return MODEL_CONTEXT_WINDOWS[normalized];
  }

  // Partial match
  for (const [key, value] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  // Default fallback
  return 8192;
}

/**
 * Calculate token budget
 */
export function calculateBudget(
  model: string,
  messages: Array<{ role: string; content: string }>,
  reserveForResponse: number = 1000
): TokenBudget {
  const contextWindow = getContextWindow(model);
  const counter = getTokenCounter(model);
  const used = counter.countMessages(messages);
  const total = contextWindow - reserveForResponse;

  return {
    total,
    used,
    remaining: Math.max(0, total - used),
    percentUsed: Math.min(100, (used / total) * 100),
  };
}

// ============================================
// Message Truncation
// ============================================

export interface TruncationOptions {
  /** Maximum tokens allowed */
  maxTokens: number;

  /** Strategy for truncation */
  strategy: 'end' | 'middle' | 'smart';

  /** Text to indicate truncation occurred */
  truncationIndicator?: string;

  /** Preserve at least this many tokens at start */
  preserveStart?: number;

  /** Preserve at least this many tokens at end */
  preserveEnd?: number;
}

/**
 * Truncate text to fit within token budget
 */
export function truncateToTokens(
  text: string,
  options: TruncationOptions
): { text: string; truncated: boolean; originalTokens: number; finalTokens: number } {
  const counter = getTokenCounter('gpt-4');
  const originalTokens = counter.count(text);

  if (originalTokens <= options.maxTokens) {
    return { text, truncated: false, originalTokens, finalTokens: originalTokens };
  }

  const indicator = options.truncationIndicator ?? '... [truncated] ...';
  const indicatorTokens = counter.count(indicator);
  const availableTokens = options.maxTokens - indicatorTokens;

  let result: string;

  switch (options.strategy) {
    case 'end': {
      result = truncateFromEnd(text, availableTokens, counter) + indicator;
      break;
    }

    case 'middle': {
      const preserveStart = options.preserveStart ?? Math.floor(availableTokens * 0.7);
      const preserveEnd = options.preserveEnd ?? availableTokens - preserveStart;
      result = truncateFromMiddle(text, preserveStart, preserveEnd, indicator, counter);
      break;
    }

    case 'smart': {
      result = smartTruncate(text, availableTokens, indicator, counter);
      break;
    }

    default: {
      result = truncateFromEnd(text, availableTokens, counter) + indicator;
    }
  }

  return {
    text: result,
    truncated: true,
    originalTokens,
    finalTokens: counter.count(result),
  };
}

function truncateFromEnd(text: string, maxTokens: number, counter: TokenCounter): string {
  // Binary search for the right length
  let low = 0;
  let high = text.length;
  let bestLength = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const substring = text.substring(0, mid);
    const tokens = counter.count(substring);

    if (tokens <= maxTokens) {
      bestLength = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  // Try to break at word boundary
  let breakPoint = bestLength;
  for (let i = bestLength; i > Math.max(0, bestLength - 50); i--) {
    if (/\s/.test(text[i])) {
      breakPoint = i;
      break;
    }
  }

  return text.substring(0, breakPoint).trim();
}

function truncateFromMiddle(
  text: string,
  startTokens: number,
  endTokens: number,
  indicator: string,
  counter: TokenCounter
): string {
  const startText = truncateFromEnd(text, startTokens, counter);

  // Work backwards from the end
  let endStart = text.length;
  let endText = '';

  while (endStart > 0) {
    const candidate = text.substring(endStart);
    if (counter.count(candidate) >= endTokens) {
      endText = candidate;
      break;
    }
    endStart--;
  }

  // Find word boundary for end text
  for (let i = 0; i < Math.min(50, endText.length); i++) {
    if (/\s/.test(endText[i])) {
      endText = endText.substring(i + 1);
      break;
    }
  }

  return `${startText}\n${indicator}\n${endText.trim()}`;
}

function smartTruncate(
  text: string,
  maxTokens: number,
  indicator: string,
  counter: TokenCounter
): string {
  // Try to preserve complete sentences/paragraphs
  const paragraphs = text.split(/\n\n+/);
  let result = '';
  let currentTokens = 0;

  for (const para of paragraphs) {
    const paraTokens = counter.count(para);

    if (currentTokens + paraTokens <= maxTokens) {
      result += (result ? '\n\n' : '') + para;
      currentTokens += paraTokens;
    } else {
      // Try to fit partial paragraph by sentences
      const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];

      for (const sentence of sentences) {
        const sentTokens = counter.count(sentence);

        if (currentTokens + sentTokens <= maxTokens) {
          result += (result ? ' ' : '') + sentence.trim();
          currentTokens += sentTokens;
        } else {
          break;
        }
      }

      break;
    }
  }

  if (result.length < text.length) {
    result += '\n' + indicator;
  }

  return result;
}

// ============================================
// Exports
// ============================================

export { BPEApproximation, UnicodeTokenCounter };
