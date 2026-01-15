/**
 * Result type for operations that can fail
 *
 * Provides a type-safe way to handle success and failure cases
 * without throwing exceptions.
 */

import { AgentForgeError, wrapError } from './errors';

// ============================================
// Result Type
// ============================================

/**
 * Represents a successful result
 */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
  readonly error?: never;
}

/**
 * Represents a failed result
 */
export interface Err<E = AgentForgeError> {
  readonly ok: false;
  readonly value?: never;
  readonly error: E;
}

/**
 * A Result is either Ok or Err
 */
export type Result<T, E = AgentForgeError> = Ok<T> | Err<E>;

// ============================================
// Result Creators
// ============================================

/**
 * Create a successful result
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Create a failed result
 */
export function err<E = AgentForgeError>(error: E): Err<E> {
  return { ok: false, error };
}

/**
 * Create a failed result from any error
 */
export function errFrom(error: unknown): Err<AgentForgeError> {
  return err(wrapError(error));
}

// ============================================
// Result Operations
// ============================================

/**
 * Check if a result is successful
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok === true;
}

/**
 * Check if a result is an error
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.ok === false;
}

/**
 * Unwrap a result, throwing if it's an error
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.value;
  }
  throw result.error;
}

/**
 * Unwrap a result or return a default value
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (isOk(result)) {
    return result.value;
  }
  return defaultValue;
}

/**
 * Unwrap a result or call a function to get a default
 */
export function unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T {
  if (isOk(result)) {
    return result.value;
  }
  return fn(result.error);
}

/**
 * Map the success value of a result
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (isOk(result)) {
    return ok(fn(result.value));
  }
  return result;
}

/**
 * Map the error of a result
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (isErr(result)) {
    return err(fn(result.error));
  }
  return result;
}

/**
 * Flat map the success value of a result
 */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (isOk(result)) {
    return fn(result.value);
  }
  return result;
}

/**
 * Combine multiple results into one
 */
export function combine<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];

  for (const result of results) {
    if (isErr(result)) {
      return result;
    }
    values.push(result.value);
  }

  return ok(values);
}

/**
 * Try to execute a function and return a Result
 */
export function tryCatch<T>(fn: () => T): Result<T, AgentForgeError> {
  try {
    return ok(fn());
  } catch (error) {
    return errFrom(error);
  }
}

/**
 * Try to execute an async function and return a Result
 */
export async function tryCatchAsync<T>(fn: () => Promise<T>): Promise<Result<T, AgentForgeError>> {
  try {
    const value = await fn();
    return ok(value);
  } catch (error) {
    return errFrom(error);
  }
}

/**
 * Match on a result to handle both cases
 */
export function match<T, E, R>(
  result: Result<T, E>,
  handlers: {
    ok: (value: T) => R;
    err: (error: E) => R;
  }
): R {
  if (isOk(result)) {
    return handlers.ok(result.value);
  }
  return handlers.err(result.error);
}

// ============================================
// Async Result Utilities
// ============================================

/**
 * Resolve a promise to a Result
 */
export async function fromPromise<T>(promise: Promise<T>): Promise<Result<T, AgentForgeError>> {
  return tryCatchAsync(() => promise);
}

/**
 * Convert a Result to a Promise
 */
export function toPromise<T, E extends Error>(result: Result<T, E>): Promise<T> {
  if (isOk(result)) {
    return Promise.resolve(result.value);
  }
  return Promise.reject(result.error);
}

/**
 * Run multiple async operations and collect results
 */
export async function collectAsync<T>(
  operations: (() => Promise<T>)[]
): Promise<Result<T[], AgentForgeError>> {
  const results: T[] = [];

  for (const operation of operations) {
    const result = await tryCatchAsync(operation);
    if (isErr(result)) {
      return result;
    }
    results.push(result.value);
  }

  return ok(results);
}

/**
 * Run multiple async operations in parallel and collect results
 */
export async function collectAsyncParallel<T>(
  operations: (() => Promise<T>)[]
): Promise<Result<T[], AgentForgeError>> {
  const results = await Promise.all(operations.map((op) => tryCatchAsync(op)));

  return combine(results);
}
