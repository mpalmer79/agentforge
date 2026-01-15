import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateId,
  sleep,
  retry,
  deepMerge,
  truncate,
  estimateTokens,
  isPlainObject,
  omit,
  pick,
} from '../../src/utils';

describe('utils', () => {
  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });

    it('should include prefix when provided', () => {
      const id = generateId('test');
      expect(id).toMatch(/^test_/);
    });

    it('should generate IDs without prefix', () => {
      const id = generateId();
      expect(id).not.toContain('_');
    });
  });

  describe('sleep', () => {
    it('should wait for specified duration', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(95);
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe('retry', () => {
    it('should return result on first success', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await retry(fn, { maxRetries: 3 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const result = await retry(fn, { maxRetries: 3, baseDelay: 10 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fails'));

      await expect(retry(fn, { maxRetries: 2, baseDelay: 10 })).rejects.toThrow('always fails');
      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should respect shouldRetry predicate', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('no retry'));

      await expect(
        retry(fn, {
          maxRetries: 3,
          baseDelay: 10,
          shouldRetry: () => false,
        })
      ).rejects.toThrow('no retry');

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('deepMerge', () => {
    it('should merge flat objects', () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should deep merge nested objects', () => {
      const target = { a: { b: 1, c: 2 } };
      const source = { a: { c: 3, d: 4 } };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: { b: 1, c: 3, d: 4 } });
    });

    it('should not mutate original objects', () => {
      const target = { a: 1 };
      const source = { b: 2 };
      deepMerge(target, source);
      expect(target).toEqual({ a: 1 });
      expect(source).toEqual({ b: 2 });
    });

    it('should handle multiple sources', () => {
      const target = { a: 1 };
      const source1 = { b: 2 };
      const source2 = { c: 3 };
      const result = deepMerge(target, source1, source2);
      expect(result).toEqual({ a: 1, b: 2, c: 3 });
    });
  });

  describe('truncate', () => {
    it('should not truncate short strings', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });

    it('should truncate long strings', () => {
      expect(truncate('hello world', 8)).toBe('hello...');
    });

    it('should use custom suffix', () => {
      expect(truncate('hello world', 8, '…')).toBe('hello w…');
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens for text', () => {
      const text = 'This is a test string with some words.';
      const estimate = estimateTokens(text);
      expect(estimate).toBeGreaterThan(0);
      expect(estimate).toBeLessThan(text.length);
    });

    it('should return 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });
  });

  describe('isPlainObject', () => {
    it('should return true for plain objects', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ a: 1 })).toBe(true);
    });

    it('should return false for non-objects', () => {
      expect(isPlainObject(null)).toBe(false);
      expect(isPlainObject(undefined)).toBe(false);
      expect(isPlainObject('string')).toBe(false);
      expect(isPlainObject(123)).toBe(false);
      expect(isPlainObject([])).toBe(false);
    });

    it('should return false for class instances', () => {
      class MyClass {}
      expect(isPlainObject(new MyClass())).toBe(false);
    });
  });

  describe('omit', () => {
    it('should omit specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(omit(obj, ['b'])).toEqual({ a: 1, c: 3 });
    });

    it('should handle multiple keys', () => {
      const obj = { a: 1, b: 2, c: 3, d: 4 };
      expect(omit(obj, ['a', 'c'])).toEqual({ b: 2, d: 4 });
    });
  });

  describe('pick', () => {
    it('should pick specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
    });

    it('should ignore non-existent keys', () => {
      const obj = { a: 1, b: 2 };
      expect(pick(obj, ['a', 'z' as keyof typeof obj])).toEqual({ a: 1 });
    });
  });
});
