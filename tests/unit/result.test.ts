import { describe, it, expect } from 'vitest';
import {
  ok,
  err,
  errFrom,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  unwrapOrElse,
  map,
  mapErr,
  flatMap,
  combine,
  tryCatch,
  tryCatchAsync,
  match,
  fromPromise,
} from '../../src/result';
import { AgentForgeError, ErrorCode } from '../../src/errors';

describe('result', () => {
  describe('ok', () => {
    it('should create successful result', () => {
      const result = ok(42);

      expect(result.ok).toBe(true);
      expect(result.value).toBe(42);
    });
  });

  describe('err', () => {
    it('should create failed result', () => {
      const error = new AgentForgeError('Test', ErrorCode.UNKNOWN);
      const result = err(error);

      expect(result.ok).toBe(false);
      expect(result.error).toBe(error);
    });
  });

  describe('errFrom', () => {
    it('should wrap any error into AgentForge error', () => {
      const result = errFrom(new Error('Test'));

      expect(result.ok).toBe(false);
      expect(result.error).toBeInstanceOf(AgentForgeError);
    });
  });

  describe('isOk', () => {
    it('should return true for ok results', () => {
      expect(isOk(ok(42))).toBe(true);
    });

    it('should return false for err results', () => {
      expect(isOk(err(new Error() as AgentForgeError))).toBe(false);
    });
  });

  describe('isErr', () => {
    it('should return true for err results', () => {
      expect(isErr(err(new Error() as AgentForgeError))).toBe(true);
    });

    it('should return false for ok results', () => {
      expect(isErr(ok(42))).toBe(false);
    });
  });

  describe('unwrap', () => {
    it('should return value for ok results', () => {
      expect(unwrap(ok(42))).toBe(42);
    });

    it('should throw for err results', () => {
      const error = new AgentForgeError('Test', ErrorCode.UNKNOWN);
      expect(() => unwrap(err(error))).toThrow();
    });
  });

  describe('unwrapOr', () => {
    it('should return value for ok results', () => {
      expect(unwrapOr(ok(42), 0)).toBe(42);
    });

    it('should return default for err results', () => {
      expect(unwrapOr(err(new Error() as AgentForgeError), 0)).toBe(0);
    });
  });

  describe('unwrapOrElse', () => {
    it('should return value for ok results', () => {
      expect(unwrapOrElse(ok(42), () => 0)).toBe(42);
    });

    it('should call function for err results', () => {
      const result = unwrapOrElse(
        err(new AgentForgeError('Test', ErrorCode.UNKNOWN)),
        (e) => e.message.length
      );
      expect(result).toBe(4);
    });
  });

  describe('map', () => {
    it('should transform ok value', () => {
      const result = map(ok(21), (x) => x * 2);

      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(42);
    });

    it('should pass through err', () => {
      const error = new AgentForgeError('Test', ErrorCode.UNKNOWN);
      const result = map(err(error), (x: number) => x * 2);

      expect(isErr(result)).toBe(true);
    });
  });

  describe('mapErr', () => {
    it('should transform error', () => {
      const error = new AgentForgeError('Test', ErrorCode.UNKNOWN);
      const result = mapErr(err(error), (e) => new Error(e.message));

      expect(isErr(result)).toBe(true);
    });

    it('should pass through ok', () => {
      const result = mapErr(ok(42), (e) => new Error());

      expect(isOk(result)).toBe(true);
    });
  });

  describe('flatMap', () => {
    it('should chain successful operations', () => {
      const result = flatMap(ok(21), (x) => ok(x * 2));

      expect(unwrap(result)).toBe(42);
    });

    it('should short-circuit on error', () => {
      const error = new AgentForgeError('Test', ErrorCode.UNKNOWN);
      const result = flatMap(err<AgentForgeError>(error), (x: number) => ok(x * 2));

      expect(isErr(result)).toBe(true);
    });
  });

  describe('combine', () => {
    it('should combine all ok results', () => {
      const results = [ok(1), ok(2), ok(3)];
      const combined = combine(results);

      expect(isOk(combined)).toBe(true);
      expect(unwrap(combined)).toEqual([1, 2, 3]);
    });

    it('should return first error', () => {
      const error = new AgentForgeError('Test', ErrorCode.UNKNOWN);
      const results = [ok(1), err(error), ok(3)];
      const combined = combine(results);

      expect(isErr(combined)).toBe(true);
    });
  });

  describe('tryCatch', () => {
    it('should return ok for successful function', () => {
      const result = tryCatch(() => 42);

      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(42);
    });

    it('should return err for throwing function', () => {
      const result = tryCatch(() => {
        throw new Error('Oops');
      });

      expect(isErr(result)).toBe(true);
    });
  });

  describe('tryCatchAsync', () => {
    it('should return ok for successful async function', async () => {
      const result = await tryCatchAsync(async () => 42);

      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(42);
    });

    it('should return err for rejecting async function', async () => {
      const result = await tryCatchAsync(async () => {
        throw new Error('Oops');
      });

      expect(isErr(result)).toBe(true);
    });
  });

  describe('match', () => {
    it('should call ok handler for ok results', () => {
      const result = match(ok(42), {
        ok: (v) => `Value: ${v}`,
        err: (e) => `Error: ${e.message}`,
      });

      expect(result).toBe('Value: 42');
    });

    it('should call err handler for err results', () => {
      const error = new AgentForgeError('Test', ErrorCode.UNKNOWN);
      const result = match(err(error), {
        ok: (v) => `Value: ${v}`,
        err: (e) => `Error: ${e.message}`,
      });

      expect(result).toBe('Error: Test');
    });
  });

  describe('fromPromise', () => {
    it('should convert resolved promise to ok', async () => {
      const result = await fromPromise(Promise.resolve(42));

      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(42);
    });

    it('should convert rejected promise to err', async () => {
      const result = await fromPromise(Promise.reject(new Error('Oops')));

      expect(isErr(result)).toBe(true);
    });
  });
});
