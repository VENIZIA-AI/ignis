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
    expect(isEmpty({ value: null })).toBe(true);
    expect(isEmpty({ value: undefined })).toBe(true);
  });

  test('strings, by length', () => {
    expect(isEmpty({ value: '' })).toBe(true);
    expect(isEmpty({ value: ' ' })).toBe(false);
  });

  test('arrays and typed arrays, by length', () => {
    expect(isEmpty({ value: [] })).toBe(true);
    expect(isEmpty({ value: [1] })).toBe(false);
    expect(isEmpty({ value: new Uint8Array(0) })).toBe(true);
    expect(isEmpty({ value: Buffer.from('x') })).toBe(false);
  });

  test('Map and Set, by size', () => {
    expect(isEmpty({ value: new Map() })).toBe(true);
    expect(isEmpty({ value: new Set([1]) })).toBe(false);
  });

  /** What a plain `!value` gets wrong. */
  test('an empty object is empty, unlike `!value`', () => {
    const configured: object = {};

    expect(isEmpty({ value: configured })).toBe(true);
    // The trap, spelled out: a falsy check calls this NON-empty and takes the other branch.
    expect(!configured).toBe(false);
  });

  /** What `for...in` gets wrong. */
  test('an inherited key does not make an object non-empty', () => {
    expect(isEmpty({ value: Object.create({ inherited: 1 }) })).toBe(true);
  });

  /** What duck-typing on `.length` gets wrong. */
  test('a plain object carrying `length` is judged by its keys', () => {
    expect(isEmpty({ value: { length: 0 } })).toBe(false);
  });

  test('a primitive holds no entries', () => {
    expect(isEmpty({ value: 0 })).toBe(true);
    expect(isEmpty({ value: true })).toBe(true);
  });

  test('an own key set to undefined still counts', () => {
    expect(isEmpty({ value: { a: undefined } })).toBe(false);
  });
});

describe('omit', () => {
  test('it keeps what is not named', () => {
    expect(omit({ source: { a: 1, b: 2, c: 3 }, keys: ['a', 'c'] })).toEqual({ b: 2 });
  });

  test('a key that is not there is not an error', () => {
    expect(omit({ source: { a: 1 }, keys: ['zzz'] })).toEqual({ a: 1 });
  });

  test('it copies rather than mutating', () => {
    const source = { a: 1, b: 2 };
    omit({ source: source, keys: ['a'] });
    expect(source).toEqual({ a: 1, b: 2 });
  });
});
