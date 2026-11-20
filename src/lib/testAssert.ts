import { expect } from "vitest";

// Strict assertions with node:assert/strict semantics, for tests that run under the DOM-only tsconfig.
interface StrictAssert {
  ok(value: unknown, message?: string): asserts value;
  equal<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
  deepEqual(actual: unknown, expected: unknown, message?: string): void;
  throws(fn: () => unknown, matcher?: RegExp): void;
  rejects(promise: Promise<unknown> | (() => Promise<unknown>), matcher?: RegExp): Promise<void>;
}

export const assert: StrictAssert = {
  ok(value, message) {
    expect(value, message).toBeTruthy();
  },
  equal(actual, expected, message) {
    expect(actual, message).toBe(expected);
  },
  deepEqual(actual, expected, message) {
    expect(actual, message).toStrictEqual(expected);
  },
  throws(fn, matcher) {
    if (matcher) expect(fn).toThrow(matcher);
    else expect(fn).toThrow();
  },
  async rejects(promise, matcher) {
    const pending = typeof promise === "function" ? promise() : promise;
    if (matcher) await expect(pending).rejects.toThrow(matcher);
    else await expect(pending).rejects.toThrow();
  },
};
