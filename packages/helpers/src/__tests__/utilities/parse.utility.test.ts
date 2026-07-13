import { afterEach, describe, expect, test } from 'bun:test';
import type { AnyType } from '@/common/types';
import {
  float,
  getUID,
  int,
  isFloat,
  isInt,
  keysToCamel,
  parseArrayToMapWithKey,
  toBoolean,
  toCamel,
  toDelimitedArray,
  toTrimmed,
} from '@/utilities/parse.utility';

const realRandom = Math.random;

/** Snake-cased wire payloads are exactly what `keysToCamel` exists to convert, but a snake_case
 * object literal is banned in this codebase - parse the fixture from its JSON wire form instead. */
const wirePayload = (json: string): Record<string, unknown> => {
  return JSON.parse(json);
};

describe('int', () => {
  test('parses plain numeric input', () => {
    expect(int(42)).toBe(42);
    expect(int('42')).toBe(42);
    expect(int('42.9')).toBe(42);
    expect(int(-7)).toBe(-7);
    expect(int('0x10')).toBe(0);
  });

  test('returns 0 for garbage, empty and nullish input', () => {
    expect(int('abc')).toBe(0);
    expect(int('')).toBe(0);
    expect(int(undefined)).toBe(0);
    expect(int(null)).toBe(0);
    expect(int(Number.NaN)).toBe(0);
    expect(int({})).toBe(0);
    expect(int('12px')).toBe(0);
    expect(int(true)).toBe(0);
  });

  test('strips thousand separators - the comma normalization must actually be reachable', () => {
    expect(int('1,234')).toBe(1234);
    expect(int('1,234,567')).toBe(1_234_567);
  });
});

describe('float', () => {
  test('parses and rounds to the requested precision', () => {
    expect(float('3.14159')).toBe(3.14);
    expect(float('3.14159', 4)).toBe(3.1416);
    expect(float(2)).toBe(2);
  });

  test('returns 0 for garbage, empty and nullish input', () => {
    expect(float('abc')).toBe(0);
    expect(float('')).toBe(0);
    expect(float(undefined)).toBe(0);
    expect(float(null)).toBe(0);
    expect(float(0)).toBe(0);
  });

  test('strips thousand separators - the comma normalization must actually be reachable', () => {
    expect(float('1,234.567', 2)).toBe(1234.57);
    expect(float('12,345')).toBe(12345);
  });
});

describe('isInt / isFloat', () => {
  test('isInt accepts integral numbers and integral numeric strings', () => {
    expect(isInt(5)).toBe(true);
    expect(isInt('5')).toBe(true);
    expect(isInt(5.5)).toBe(false);
    expect(isInt('abc')).toBe(false);
  });

  test('isFloat accepts numbers and fractional strings', () => {
    expect(isFloat(5.5)).toBe(true);
    expect(isFloat('5.5')).toBe(true);
    expect(isFloat(5)).toBe(true);
    expect(isFloat('abc')).toBe(false);
  });
});

describe('toCamel', () => {
  test('camelizes snake and kebab segments', () => {
    expect(toCamel('first_name')).toBe('firstName');
    expect(toCamel('first-name')).toBe('firstName');
    expect(toCamel('a_b_c')).toBe('aBC');
  });

  test('leaves an already-camel key untouched', () => {
    expect(toCamel('firstName')).toBe('firstName');
    expect(toCamel('id')).toBe('id');
    expect(toCamel('')).toBe('');
  });

  test('a leading underscore is consumed and the next letter capitalized (pinned behavior)', () => {
    expect(toCamel('_private')).toBe('Private');
    expect(toCamel('__x')).toBe('_X');
  });

  test('a separator followed by a digit is left in place (pinned behavior)', () => {
    expect(toCamel('address_1')).toBe('address_1');
    expect(toCamel('utm_2source')).toBe('utm_2source');
  });
});

describe('keysToCamel', () => {
  test('camelizes flat keys', () => {
    const result = keysToCamel(wirePayload('{"first_name":"a","last_name":"b","id":1}'));

    expect(result).toEqual({ firstName: 'a', lastName: 'b', id: 1 });
  });

  test('recurses into nested objects', () => {
    const result = keysToCamel(wirePayload('{"outer_key":{"inner_key":{"deep_key":1}}}'));

    expect(result).toEqual({ outerKey: { innerKey: { deepKey: 1 } } });
  });

  test('preserves null, undefined and Date values without recursing into them', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    const source: Record<string, unknown> = {};
    source['null_value'] = null;
    source['undefined_value'] = undefined;
    source['created_at'] = date;

    const result = keysToCamel(source);

    expect(result.nullValue).toBeNull();
    expect(result.undefinedValue).toBeUndefined();
    expect(result.createdAt).toBe(date);
  });

  test('camelizes keys of objects nested inside arrays', () => {
    const result = keysToCamel(
      wirePayload(
        '{"user_list":[{"first_name":"a"},{"first_name":"b","nested_one":{"deep_key":2}}],"scalar_list":[1,"two",null]}',
      ),
    );

    expect(result.userList).toEqual([
      { firstName: 'a' },
      { firstName: 'b', nestedOne: { deepKey: 2 } },
    ]);
    expect(result.scalarList).toEqual([1, 'two', null]);
  });

  test('an array value stays an array - never collapsed into an index-keyed object', () => {
    const result = keysToCamel(wirePayload('{"items":[1,2,3]}'));

    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items).toEqual([1, 2, 3]);
  });
});

describe('toBoolean', () => {
  test('treats the falsy wire values as false', () => {
    expect(toBoolean('')).toBe(false);
    expect(toBoolean('false')).toBe(false);
    expect(toBoolean('0')).toBe(false);
    expect(toBoolean(false)).toBe(false);
    expect(toBoolean(0)).toBe(false);
    expect(toBoolean(null)).toBe(false);
    expect(toBoolean(undefined)).toBe(false);
  });

  test('treats everything else as true (pinned - any non-empty string is truthy)', () => {
    expect(toBoolean('true')).toBe(true);
    expect(toBoolean('1')).toBe(true);
    expect(toBoolean(true)).toBe(true);
    expect(toBoolean(1)).toBe(true);
    expect(toBoolean('anything')).toBe(true);
    expect(toBoolean('FALSE')).toBe(true);
  });
});

describe('toDelimitedArray / toTrimmed', () => {
  test('splits, trims and drops empty entries', () => {
    expect(toDelimitedArray('a, b , ,c')).toEqual(['a', 'b', 'c']);
    expect(toDelimitedArray('a|b', '|')).toEqual(['a', 'b']);
    expect(toDelimitedArray('')).toEqual([]);
    expect(toDelimitedArray(null)).toEqual([]);
    expect(toDelimitedArray(undefined)).toEqual([]);
  });

  test('toTrimmed normalizes a possibly-absent value', () => {
    expect(toTrimmed('  x  ')).toBe('x');
    expect(toTrimmed(undefined)).toBe('');
    expect(toTrimmed(null)).toBe('');
    expect(toTrimmed(5)).toBe('5');
  });
});

describe('parseArrayToMapWithKey', () => {
  test('keys by the given field, last element wins', () => {
    const result = parseArrayToMapWithKey(
      [
        { id: 1, name: 'first' },
        { id: 2, name: 'second' },
        { id: 1, name: 'override' },
      ],
      'id',
    );

    expect(result.size).toBe(2);
    expect(result.get(1)).toEqual({ id: 1, name: 'override' });
  });

  test('an empty array yields an empty map', () => {
    expect(parseArrayToMapWithKey([], 'id').size).toBe(0);
  });

  test('throws when an element lacks the key', () => {
    const elements = [{ id: 1 }, {} as AnyType];

    expect(() => parseArrayToMapWithKey(elements, 'id')).toThrow('Invalid keyMap');
  });
});

describe('getUID', () => {
  afterEach(() => {
    Math.random = realRandom;
  });

  test('produces an uppercase alphanumeric, non-empty id', () => {
    for (let index = 0; index < 200; index += 1) {
      const uid = getUID();
      expect(uid).toMatch(/^[0-9A-Z]+$/);
    }
  });

  test('is unique across a batch', () => {
    const ids = new Set(Array.from({ length: 5_000 }, () => getUID()));
    expect(ids.size).toBe(5_000);
  });

  test('degenerate Math.random values yield a degenerate id (pinned - not a collision-safe id source)', () => {
    Math.random = () => 0;
    expect(getUID()).toBe('');

    Math.random = () => 0.5;
    expect(getUID()).toBe('I');
  });
});
