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
