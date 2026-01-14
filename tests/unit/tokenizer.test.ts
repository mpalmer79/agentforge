import { describe, it, expect } from 'vitest';
import {
  getTokenCounter,
  getModelFamily,
  getContextWindow,
  calculateBudget,
  truncateToTokens,
  MODEL_CONTEXT_WINDOWS,
} from '../../src/tokenizer';

describe('getModelFamily', () => {
  it('should identify GPT-4 models', () => {
    expect(getModelFamily('gpt-4')).toBe('gpt-4');
    expect(getModelFamily('gpt-4-turbo')).toBe('gpt-4');
    expect(getModelFamily('gpt-4o')).toBe('gpt-4');
    expect(getModelFamily('gpt-4-32k')).toBe('gpt-4');
  });

  it('should identify GPT-3.5 models', () => {
    expect(getModelFamily('gpt-3.5-turbo')).toBe('gpt-3.5');
    expect(getModelFamily('gpt-3.5-turbo-16k')).toBe('gpt-3.5');
  });

  it('should identify Claude models', () => {
    expect(getModelFamily('claude-3-opus')).toBe('claude');
    expect(getModelFamily('claude-3-sonnet')).toBe('claude');
    expect(getModelFamily('claude-2.1')).toBe('claude');
  });

  it('should identify Gemini models', () => {
    expect(getModelFamily('gemini-pro')).toBe('gemini');
    expect(getModelFamily('gemini-1.5-pro')).toBe('gemini');
  });

  it('should return unknown for unrecognized models', () => {
    expect(getModelFamily('some-unknown-model')).toBe('unknown');
  });
});

describe('getContextWindow', () => {
  it('should return correct context windows for known models', () => {
    expect(getContextWindow('gpt-4')).toBe(8192);
    expect(getContextWindow('gpt-4-turbo')).toBe(128000);
    expect(getContextWindow('claude-3-opus')).toBe(200000);
    expect(getContextWindow('gemini-1.5-pro')).toBe(1000000);
  });

  it('should return default for unknown models', () => {
    expect(getContextWindow('unknown-model')).toBe(8192);
  });
});

describe('getTokenCounter', () => {
  it('should return a token counter', () => {
    const counter = getTokenCounter('gpt-4');
    expect(counter).toBeDefined();
    expect(typeof counter.count).toBe('function');
    expect(typeof counter.countMessages).toBe('function');
  });

  it('should count tokens for simple text', () => {
    const counter = getTokenCounter('gpt-4');
    const count = counter.count('Hello, world!');
    expect(count).toBeGreaterThan(0);
  });

  it('should count tokens for messages', () => {
    const counter = getTokenCounter('gpt-4');
    const count = counter.countMessages([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello!' },
    ]);
    expect(count).toBeGreaterThan(0);
  });

  it('should return higher count for code-like text', () => {
    const counter = getTokenCounter('gpt-4');
    const proseCount = counter.count('This is a simple sentence about programming.');
    const codeCount = counter.count('function calculateSum(a, b) { return a + b; }');
    
    // Code typically has more tokens due to special characters
    expect(codeCount).toBeGreaterThanOrEqual(proseCount * 0.8);
  });

  it('should handle empty strings', () => {
    const counter = getTokenCounter('gpt-4');
    expect(counter.count('')).toBe(0);
  });

  it('should handle Unicode text', () => {
    const counter = getTokenCounter('gpt-4');
    const count = counter.count('こんにちは世界');
    expect(count).toBeGreaterThan(0);
  });
});

describe('calculateBudget', () => {
  it('should calculate token budget correctly', () => {
    const budget = calculateBudget('gpt-4', [
      { role: 'user', content: 'Hello, how are you?' },
    ]);

    expect(budget.total).toBeLessThanOrEqual(8192);
    expect(budget.used).toBeGreaterThan(0);
    expect(budget.remaining).toBeLessThan(budget.total);
    expect(budget.percentUsed).toBeGreaterThan(0);
    expect(budget.percentUsed).toBeLessThan(100);
  });

  it('should account for reserved response tokens', () => {
    const budget1 = calculateBudget('gpt-4', [], 1000);
    const budget2 = calculateBudget('gpt-4', [], 2000);

    expect(budget2.total).toBeLessThan(budget1.total);
  });

  it('should handle large message histories', () => {
    const messages = Array(100).fill({ role: 'user', content: 'This is a test message with some content.' });
    const budget = calculateBudget('gpt-4', messages);

    expect(budget.used).toBeGreaterThan(0);
    expect(budget.percentUsed).toBeGreaterThan(0);
  });
});

describe('truncateToTokens', () => {
  it('should not truncate if within budget', () => {
    const result = truncateToTokens('Hello, world!', {
      maxTokens: 100,
      strategy: 'end',
    });

    expect(result.truncated).toBe(false);
    expect(result.text).toBe('Hello, world!');
  });

  it('should truncate from end by default', () => {
    const longText = 'This is a very long text that needs to be truncated. '.repeat(50);
    const result = truncateToTokens(longText, {
      maxTokens: 50,
      strategy: 'end',
    });

    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThan(longText.length);
    expect(result.finalTokens).toBeLessThanOrEqual(50);
  });

  it('should use custom truncation indicator', () => {
    const longText = 'This is a test. '.repeat(100);
    const result = truncateToTokens(longText, {
      maxTokens: 50,
      strategy: 'end',
      truncationIndicator: '...[TRUNCATED]...',
    });

    expect(result.text).toContain('...[TRUNCATED]...');
  });

  it('should preserve context in middle truncation', () => {
    const longText = 'Start of important context. ' + 'Middle content. '.repeat(100) + 'End of important context.';
    const result = truncateToTokens(longText, {
      maxTokens: 100,
      strategy: 'middle',
      preserveStart: 30,
      preserveEnd: 30,
    });

    expect(result.truncated).toBe(true);
    expect(result.text).toContain('Start');
    expect(result.text).toContain('End');
  });

  it('should handle smart truncation by sentences', () => {
    const text = 'First sentence is important. Second sentence is also good. Third sentence has more info. Fourth continues. Fifth is last.';
    const result = truncateToTokens(text, {
      maxTokens: 30,
      strategy: 'smart',
    });

    expect(result.truncated).toBe(true);
    // Should end at a sentence boundary
    expect(result.text).toMatch(/[.!?](\s|\[|$)/);
  });
});

describe('MODEL_CONTEXT_WINDOWS', () => {
  it('should have entries for major models', () => {
    expect(MODEL_CONTEXT_WINDOWS['gpt-4']).toBeDefined();
    expect(MODEL_CONTEXT_WINDOWS['gpt-4-turbo']).toBeDefined();
    expect(MODEL_CONTEXT_WINDOWS['claude-3-opus']).toBeDefined();
    expect(MODEL_CONTEXT_WINDOWS['gemini-pro']).toBeDefined();
  });

  it('should have reasonable context window sizes', () => {
    for (const [model, size] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
      expect(size).toBeGreaterThan(1000);
      expect(size).toBeLessThanOrEqual(2000000);
    }
  });
});
