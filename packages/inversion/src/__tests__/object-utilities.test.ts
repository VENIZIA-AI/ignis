import { isEmpty, ObjectUtility, omit } from '@/common/utilities';
import { describe, expect, test } from 'bun:test';

/**
 * These replaced `lodash/isEmpty` and `lodash/omit` - 24 KB in a browser bundle for two functions.
 * Each case below was an ACTUAL mismatch while writing them, not a hypothetical:
 *
 * - `{}` is empty but `!{}` is `false`, so a plain falsy check flips that branch.
 * - `for...in` walks the prototype chain, so an object with an INHERITED key looked non-empty.
 * - `{ length: 0 }` is NOT empty - it has an own key - so duck-typing on `.length` is wrong.
 */
describe('ObjectUtility.isEmpty', () => {
  test('nothing at all', () => {
    expect(ObjectUtility.isEmpty({ value: null })).toBe(true);
    expect(ObjectUtility.isEmpty({ value: undefined })).toBe(true);
  });

  test('strings, by length', () => {
    expect(ObjectUtility.isEmpty({ value: '' })).toBe(true);
    expect(ObjectUtility.isEmpty({ value: ' ' })).toBe(false);
  });

  test('arrays and typed arrays, by length', () => {
    expect(ObjectUtility.isEmpty({ value: [] })).toBe(true);
    expect(ObjectUtility.isEmpty({ value: [1] })).toBe(false);
    expect(ObjectUtility.isEmpty({ value: new Uint8Array(0) })).toBe(true);
    expect(ObjectUtility.isEmpty({ value: Buffer.from('x') })).toBe(false);
  });

  test('Map and Set, by size', () => {
    expect(ObjectUtility.isEmpty({ value: new Map() })).toBe(true);
    expect(ObjectUtility.isEmpty({ value: new Set([1]) })).toBe(false);
  });

  /** What a plain `!value` gets wrong. */
  test('an empty object is empty, unlike `!value`', () => {
    const configured: object = {};

    expect(ObjectUtility.isEmpty({ value: configured })).toBe(true);
    // The trap, spelled out: a falsy check calls this NON-empty and takes the other branch.
    expect(!configured).toBe(false);
  });

  /** What `for...in` gets wrong. */
  test('an inherited key does not make an object non-empty', () => {
    expect(ObjectUtility.isEmpty({ value: Object.create({ inherited: 1 }) })).toBe(true);
  });

  /** What duck-typing on `.length` gets wrong. */
  test('a plain object carrying `length` is judged by its keys', () => {
    expect(ObjectUtility.isEmpty({ value: { length: 0 } })).toBe(false);
  });

  test('a primitive holds no entries', () => {
    expect(ObjectUtility.isEmpty({ value: 0 })).toBe(true);
    expect(ObjectUtility.isEmpty({ value: true })).toBe(true);
  });

  test('an own key set to undefined still counts', () => {
    expect(ObjectUtility.isEmpty({ value: { a: undefined } })).toBe(false);
  });
});

describe('ObjectUtility.omit', () => {
  test('it keeps what is not named', () => {
    expect(ObjectUtility.omit({ source: { a: 1, b: 2, c: 3 }, keys: ['a', 'c'] })).toEqual({
      b: 2,
    });
  });

  test('a key that is not there is not an error', () => {
    expect(ObjectUtility.omit({ source: { a: 1 }, keys: ['zzz'] })).toEqual({ a: 1 });
  });

  test('it copies rather than mutating', () => {
    const source = { a: 1, b: 2 };
    ObjectUtility.omit({ source: source, keys: ['a'] });
    expect(source).toEqual({ a: 1, b: 2 });
  });
});

describe('the deprecated aliases give what the class gives', () => {
  test('isEmpty', () => {
    const samples: unknown[] = [null, '', ' ', [], [1], new Map(), { a: 1 }, {}, 0];
    for (const value of samples) {
      expect(isEmpty({ value })).toBe(ObjectUtility.isEmpty({ value }));
    }
  });

  test('omit', () => {
    const options = { source: { a: 1, b: 2, c: 3 }, keys: ['a', 'zzz'] };
    expect(omit(options)).toEqual(ObjectUtility.omit(options));
  });
});
