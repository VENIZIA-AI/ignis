import { afterEach, describe, expect, test } from 'bun:test';
import type { AnyType } from '@/common/types';
import { ParseUtility } from '@/utilities/parse.utility';

const realRandom = Math.random;

/** Snake-cased wire payloads are exactly what `keysToCamel` converts, but a snake_case object literal is banned in this codebase - parse the fixture from its JSON wire form instead. */
const wirePayload = (json: string): Record<string, unknown> => {
  return JSON.parse(json);
};

describe('int', () => {
  test('parses plain numeric input', () => {
    expect(ParseUtility.toInt({ input: 42 })).toBe(42);
    expect(ParseUtility.toInt({ input: '42' })).toBe(42);
    expect(ParseUtility.toInt({ input: '42.9' })).toBe(42);
    expect(ParseUtility.toInt({ input: -7 })).toBe(-7);
    expect(ParseUtility.toInt({ input: '0x10' })).toBe(0);
  });

  test('returns 0 for garbage, empty and nullish input', () => {
    expect(ParseUtility.toInt({ input: 'abc' })).toBe(0);
    expect(ParseUtility.toInt({ input: '' })).toBe(0);
    expect(ParseUtility.toInt({ input: undefined })).toBe(0);
    expect(ParseUtility.toInt({ input: null })).toBe(0);
    expect(ParseUtility.toInt({ input: Number.NaN })).toBe(0);
    expect(ParseUtility.toInt({ input: {} })).toBe(0);
    expect(ParseUtility.toInt({ input: '12px' })).toBe(0);
    expect(ParseUtility.toInt({ input: true })).toBe(0);
  });

  test('strips thousand separators - the comma normalization must actually be reachable', () => {
    expect(ParseUtility.toInt({ input: '1,234' })).toBe(1234);
    expect(ParseUtility.toInt({ input: '1,234,567' })).toBe(1_234_567);
  });
});

describe('float', () => {
  test('parses and rounds to the requested precision', () => {
    expect(ParseUtility.toFloat({ input: '3.14159' })).toBe(3.14);
    expect(ParseUtility.toFloat({ input: '3.14159', digit: 4 })).toBe(3.1416);
    expect(ParseUtility.toFloat({ input: 2 })).toBe(2);
  });

  test('returns 0 for garbage, empty and nullish input', () => {
    expect(ParseUtility.toFloat({ input: 'abc' })).toBe(0);
    expect(ParseUtility.toFloat({ input: '' })).toBe(0);
    expect(ParseUtility.toFloat({ input: undefined })).toBe(0);
    expect(ParseUtility.toFloat({ input: null })).toBe(0);
    expect(ParseUtility.toFloat({ input: 0 })).toBe(0);
  });

  test('strips thousand separators - the comma normalization must actually be reachable', () => {
    expect(ParseUtility.toFloat({ input: '1,234.567', digit: 2 })).toBe(1234.57);
    expect(ParseUtility.toFloat({ input: '12,345' })).toBe(12345);
  });
});

describe('isInt / isFloat', () => {
  test('isInt accepts integral numbers and integral numeric strings', () => {
    expect(ParseUtility.isInt({ input: 5 })).toBe(true);
    expect(ParseUtility.isInt({ input: '5' })).toBe(true);
    expect(ParseUtility.isInt({ input: 5.5 })).toBe(false);
    expect(ParseUtility.isInt({ input: 'abc' })).toBe(false);
  });

  test('isFloat accepts numbers and fractional strings', () => {
    expect(ParseUtility.isFloat({ input: 5.5 })).toBe(true);
    expect(ParseUtility.isFloat({ input: '5.5' })).toBe(true);
    expect(ParseUtility.isFloat({ input: 5 })).toBe(true);
    expect(ParseUtility.isFloat({ input: 'abc' })).toBe(false);
  });
});

describe('toCamel', () => {
  test('camelizes snake and kebab segments', () => {
    expect(ParseUtility.toCamel({ input: 'first_name' })).toBe('firstName');
    expect(ParseUtility.toCamel({ input: 'first-name' })).toBe('firstName');
    expect(ParseUtility.toCamel({ input: 'a_b_c' })).toBe('aBC');
  });

  test('leaves an already-camel key untouched', () => {
    expect(ParseUtility.toCamel({ input: 'firstName' })).toBe('firstName');
    expect(ParseUtility.toCamel({ input: 'id' })).toBe('id');
    expect(ParseUtility.toCamel({ input: '' })).toBe('');
  });

  test('a leading underscore is consumed and the next letter capitalized (pinned behavior)', () => {
    expect(ParseUtility.toCamel({ input: '_private' })).toBe('Private');
    expect(ParseUtility.toCamel({ input: '__x' })).toBe('_X');
  });

  test('a separator followed by a digit is left in place (pinned behavior)', () => {
    expect(ParseUtility.toCamel({ input: 'address_1' })).toBe('address_1');
    expect(ParseUtility.toCamel({ input: 'utm_2source' })).toBe('utm_2source');
  });
});

describe('keysToCamel', () => {
  test('camelizes flat keys', () => {
    const result = ParseUtility.keysToCamel({
      source: wirePayload('{"first_name":"a","last_name":"b","id":1}'),
    });

    expect(result).toEqual({ firstName: 'a', lastName: 'b', id: 1 });
  });

  test('recurses into nested objects', () => {
    const result = ParseUtility.keysToCamel({
      source: wirePayload('{"outer_key":{"inner_key":{"deep_key":1}}}'),
    });

    expect(result).toEqual({ outerKey: { innerKey: { deepKey: 1 } } });
  });

  test('preserves null, undefined and Date values without recursing into them', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    const source: Record<string, unknown> = {};
    source['null_value'] = null;
    source['undefined_value'] = undefined;
    source['created_at'] = date;

    const result = ParseUtility.keysToCamel({ source });

    expect(result.nullValue).toBeNull();
    expect(result.undefinedValue).toBeUndefined();
    expect(result.createdAt).toBe(date);
  });

  test('camelizes keys of objects nested inside arrays', () => {
    const result = ParseUtility.keysToCamel({
      source: wirePayload(
        '{"user_list":[{"first_name":"a"},{"first_name":"b","nested_one":{"deep_key":2}}],"scalar_list":[1,"two",null]}',
      ),
    });

    expect(result.userList).toEqual([
      { firstName: 'a' },
      { firstName: 'b', nestedOne: { deepKey: 2 } },
    ]);
    expect(result.scalarList).toEqual([1, 'two', null]);
  });

  test('an array value stays an array - never collapsed into an index-keyed object', () => {
    const result = ParseUtility.keysToCamel({ source: wirePayload('{"items":[1,2,3]}') });

    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items).toEqual([1, 2, 3]);
  });
});

/**
 * The accepted vocabulary is a CONTRACT, not an implementation detail.
 *
 * `x-request-count` decides whether an IGNIS list answers rows or a `{ count, data }` envelope, and
 * two packages in this house spell it differently: IGNIS sends `'true'`/`'false'`, a browser-side
 * consumer sends `'1'`/`'0'`. Only this parser makes them compatible.
 *
 * Tightening it to `=== 'false'` would make every `'0'` read as TRUE, so a list that asked for rows
 * would receive the envelope and render it as ONE row - no error, no failed request, just a page
 * showing one record where there were fifty.
 */
describe('toBoolean', () => {
  test('treats the falsy wire values as false', () => {
    expect(ParseUtility.toBoolean({ input: '' })).toBe(false);
    expect(ParseUtility.toBoolean({ input: 'false' })).toBe(false);
    expect(ParseUtility.toBoolean({ input: '0' })).toBe(false);
    expect(ParseUtility.toBoolean({ input: false })).toBe(false);
    expect(ParseUtility.toBoolean({ input: 0 })).toBe(false);
    expect(ParseUtility.toBoolean({ input: null })).toBe(false);
    expect(ParseUtility.toBoolean({ input: undefined })).toBe(false);
  });

  test('treats everything else as true (pinned - any non-empty string is truthy)', () => {
    expect(ParseUtility.toBoolean({ input: 'true' })).toBe(true);
    expect(ParseUtility.toBoolean({ input: '1' })).toBe(true);
    expect(ParseUtility.toBoolean({ input: true })).toBe(true);
    expect(ParseUtility.toBoolean({ input: 1 })).toBe(true);
    expect(ParseUtility.toBoolean({ input: 'anything' })).toBe(true);
    expect(ParseUtility.toBoolean({ input: 'FALSE' })).toBe(true);
  });
});

describe('toDelimitedArray / toTrimmed', () => {
  test('splits, trims and drops empty entries', () => {
    expect(ParseUtility.toDelimitedArray({ input: 'a, b , ,c' })).toEqual(['a', 'b', 'c']);
    expect(ParseUtility.toDelimitedArray({ input: 'a|b', separator: '|' })).toEqual(['a', 'b']);
    expect(ParseUtility.toDelimitedArray({ input: '' })).toEqual([]);
    expect(ParseUtility.toDelimitedArray({ input: null })).toEqual([]);
    expect(ParseUtility.toDelimitedArray({ input: undefined })).toEqual([]);
  });

  test('toTrimmed normalizes a possibly-absent value', () => {
    expect(ParseUtility.toTrimmed({ input: '  x  ' })).toBe('x');
    expect(ParseUtility.toTrimmed({ input: undefined })).toBe('');
    expect(ParseUtility.toTrimmed({ input: null })).toBe('');
    expect(ParseUtility.toTrimmed({ input: 5 })).toBe('5');
  });
});

describe('parseArrayToMapWithKey', () => {
  test('keys by the given field, last element wins', () => {
    const result = ParseUtility.parseArrayToMapWithKey({
      items: [
        { id: 1, name: 'first' },
        { id: 2, name: 'second' },
        { id: 1, name: 'override' },
      ],
      key: 'id',
    });

    expect(result.size).toBe(2);
    expect(result.get(1)).toEqual({ id: 1, name: 'override' });
  });

  test('an empty array yields an empty map', () => {
    expect(ParseUtility.parseArrayToMapWithKey({ items: [], key: 'id' }).size).toBe(0);
  });

  test('throws when an element lacks the key', () => {
    const elements = [{ id: 1 }, {} as AnyType];

    expect(() => ParseUtility.parseArrayToMapWithKey({ items: elements, key: 'id' })).toThrow(
      'Invalid keyMap',
    );
  });
});

describe('getUID', () => {
  afterEach(() => {
    Math.random = realRandom;
  });

  test('produces an uppercase alphanumeric, non-empty id', () => {
    for (let index = 0; index < 200; index += 1) {
      const uid = ParseUtility.getUID();
      expect(uid).toMatch(/^[0-9A-Z]+$/);
    }
  });

  test('is unique across a batch', () => {
    const ids = new Set(Array.from({ length: 5_000 }, () => ParseUtility.getUID()));
    expect(ids.size).toBe(5_000);
  });

  test('degenerate Math.random values yield a degenerate id (pinned - not a collision-safe id source)', () => {
    Math.random = () => 0;
    expect(ParseUtility.getUID()).toBe('');

    Math.random = () => 0.5;
    expect(ParseUtility.getUID()).toBe('I');
  });
});
