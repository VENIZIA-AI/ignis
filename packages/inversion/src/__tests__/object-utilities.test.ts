import { isEmpty, omit } from '@/common/utilities';
import { describe, expect, test } from 'bun:test';

/**
 * These replaced `lodash/isEmpty` and `lodash/omit` - 24 KB in a browser bundle for two functions.
 * Each case below was an ACTUAL mismatch while writing them, not a hypothetical:
 *
 * - `{}` is empty but `!{}` is `false`, so a plain falsy check flips that branch.
 * - `for...in` walks the prototype chain, so an object with an INHERITED key looked non-empty.
 * - `{ length: 0 }` is NOT empty - it has an own key - so duck-typing on `.length` is wrong.
 */
describe('isEmpty', () => {
  test('nothing at all', () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
  });

  test('strings, by length', () => {
    expect(isEmpty('')).toBe(true);
    expect(isEmpty(' ')).toBe(false);
  });

  test('arrays and typed arrays, by length', () => {
    expect(isEmpty([])).toBe(true);
    expect(isEmpty([1])).toBe(false);
    expect(isEmpty(new Uint8Array(0))).toBe(true);
    expect(isEmpty(Buffer.from('x'))).toBe(false);
  });

  test('Map and Set, by size', () => {
    expect(isEmpty(new Map())).toBe(true);
    expect(isEmpty(new Set([1]))).toBe(false);
  });

  /** What a plain `!value` gets wrong. */
  test('an empty object is empty, unlike `!value`', () => {
    const configured: object = {};

    expect(isEmpty(configured)).toBe(true);
    // The trap, spelled out: a falsy check calls this NON-empty and takes the other branch.
    expect(!configured).toBe(false);
  });

  /** What `for...in` gets wrong. */
  test('an inherited key does not make an object non-empty', () => {
    expect(isEmpty(Object.create({ inherited: 1 }))).toBe(true);
  });

  /** What duck-typing on `.length` gets wrong. */
  test('a plain object carrying `length` is judged by its keys', () => {
    expect(isEmpty({ length: 0 })).toBe(false);
  });

  test('a primitive holds no entries', () => {
    expect(isEmpty(0)).toBe(true);
    expect(isEmpty(true)).toBe(true);
  });

  test('an own key set to undefined still counts', () => {
    expect(isEmpty({ a: undefined })).toBe(false);
  });
});

describe('omit', () => {
  test('it keeps what is not named', () => {
    expect(omit({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ b: 2 });
  });

  test('a key that is not there is not an error', () => {
    expect(omit({ a: 1 }, ['zzz'])).toEqual({ a: 1 });
  });

  test('it copies rather than mutating', () => {
    const source = { a: 1, b: 2 };
    omit(source, ['a']);
    expect(source).toEqual({ a: 1, b: 2 });
  });
});
