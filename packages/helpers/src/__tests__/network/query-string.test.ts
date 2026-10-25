import { toQueryString } from '@/modules/network/utilities/query-string';
import { describe, expect, test } from 'bun:test';

/**
 * This replaced `node:querystring`'s `stringify` - the one import that kept the whole network layer
 * out of a browser bundle. It was diffed against the original across 22 shapes before the swap; the
 * four below are where `URLSearchParams`, the obvious alternative, disagrees.
 */
describe('toQueryString matches what a server expects', () => {
  test('an array repeats the key rather than joining it', () => {
    expect(toQueryString({ params: { a: [1, 2] } })).toBe('a=1&a=2');
  });

  /** The same coercion that sends a header reading "undefined". */
  test('undefined and null are empty values, not their names', () => {
    expect(toQueryString({ params: { a: undefined, b: 1 } })).toBe('a=&b=1');
    expect(toQueryString({ params: { a: null, b: 1 } })).toBe('a=&b=1');
  });

  test('a space is percent-encoded, not a plus', () => {
    expect(toQueryString({ params: { 'a b': 'c d' } })).toBe('a%20b=c%20d');
  });

  /** `querystring` drops a non-primitive rather than stringifying it. */
  test('a nested value collapses to empty', () => {
    expect(toQueryString({ params: { a: [1, [2, 3]] } })).toBe('a=1&a=');
    expect(toQueryString({ params: { a: { nested: 1 } } })).toBe('a=');
  });

  test('the ordinary cases', () => {
    expect(toQueryString({ params: { a: 1, b: 'x' } })).toBe('a=1&b=x');
    expect(toQueryString({ params: {} })).toBe('');
    expect(toQueryString({ params: { a: 'é' } })).toBe('a=%C3%A9');
    expect(toQueryString({ params: { a: true, b: false } })).toBe('a=true&b=false');
  });
});

describe('toQueryString options - the defaults are unchanged', () => {
  const params = { a: undefined, b: null, c: [1, 2], d: { x: 1 }, e: 'a b' };

  test('no options is node:querystring', () => {
    expect(toQueryString({ params })).toBe('a=&b=&c=1&c=2&d=&e=a%20b');
    expect(toQueryString({ params, nullish: 'empty', nested: 'drop' })).toBe(
      toQueryString({ params }),
    );
  });

  test("nullish 'skip' leaves a null or undefined pair out, in an array too", () => {
    expect(toQueryString({ params: { a: undefined, b: null, c: 1 }, nullish: 'skip' })).toBe('c=1');
    expect(toQueryString({ params: { c: [1, null, 2] }, nullish: 'skip' })).toBe('c=1&c=2');
    expect(toQueryString({ params: { a: '', b: 0, c: false }, nullish: 'skip' })).toBe(
      'a=&b=0&c=false',
    );
  });

  test("nested 'json' sends an object as ONE JSON parameter", () => {
    const filter = { where: { id: { inq: [1, 2] } }, limit: 5 };

    expect(toQueryString({ params: { filter }, nested: 'json' })).toBe(
      `filter=${encodeURIComponent(JSON.stringify(filter))}`,
    );
  });

  test("nested 'json' sends a top-level array as ONE JSON parameter, not a repeated key", () => {
    expect(toQueryString({ params: { ids: [1, 2] }, nested: 'json' })).toBe('ids=%5B1%2C2%5D');
    expect(toQueryString({ params: { ids: [1, [2, 3]] }, nested: 'json' })).toBe(
      `ids=${encodeURIComponent('[1,[2,3]]')}`,
    );
    expect(toQueryString({ params: { ids: [] }, nested: 'json' })).toBe('ids=%5B%5D');
  });

  test("nested 'json' leaves primitives alone", () => {
    expect(toQueryString({ params: { a: 1, b: 'x y', c: true }, nested: 'json' })).toBe(
      'a=1&b=x%20y&c=true',
    );
  });

  test('the ARDOR combination: skip nullish, JSON for the rest', () => {
    expect(
      toQueryString({
        params: { page: 2, q: undefined, filter: { limit: 1 }, ids: [3] },
        nullish: 'skip',
        nested: 'json',
      }),
    ).toBe(`page=2&filter=${encodeURIComponent('{"limit":1}')}&ids=%5B3%5D`);
  });

  test("a null under nested 'json' with nullish 'empty' stays an empty value, not 'null'", () => {
    expect(toQueryString({ params: { a: null }, nested: 'json' })).toBe('a=');
  });
});
