import { describe, expect, test } from 'bun:test';
import { ParseUtility } from '@/utilities/parse.utility';

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
 * The accepted vocabulary is a contract: `x-request-count` is spelled `'true'`/`'false'` by one package of this house
 * and `'1'`/`'0'` by another, and only this parser makes them compatible.
 */
describe('toBoolean', () => {
  test.each(['true', '1', 'yes', 'on', 'y', 'enabled', 'TRUE', 'Yes', ' on ', true, 1])(
    'reads %p as true',
    (input) => {
      expect(ParseUtility.toBoolean({ input })).toBe(true);
    },
  );

  test.each(['false', '0', 'no', 'off', 'n', 'disabled', 'FALSE', 'No', ' off ', false, 0])(
    'reads %p as false',
    (input) => {
      expect(ParseUtility.toBoolean({ input })).toBe(false);
    },
  );

  test.each(['', '  ', null, undefined])('reads an absent value %p as false', (input) => {
    expect(ParseUtility.toBoolean({ input })).toBe(false);
  });

  test.each([
    ['an unknown word', 'anything'],
    ['a longer number', '00'],
    ['another number', 2],
    ['NaN', Number.NaN],
    ['an object', {}],
    ['a list', ['true']],
    ['a name of Object', 'constructor'],
  ])('refuses %s with a 400', (_, input) => {
    expect(() => ParseUtility.toBoolean({ input })).toThrow(/\[toBoolean\] .* is not a boolean/);
    expect(() => ParseUtility.toBoolean({ input })).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  test('refuses a long run of spaces before a letter in linear time', () => {
    const started = performance.now();

    expect(() => ParseUtility.toBoolean({ input: `${' '.repeat(100_000)}x` })).toThrow();
    expect(performance.now() - started).toBeLessThan(500);
  });

  test('names the setting in the message when given its name', () => {
    expect(() => ParseUtility.toBoolean({ input: 'maybe', name: 'APP_ENV_A' })).toThrow(
      '[toBoolean] APP_ENV_A: "maybe" is not a boolean',
    );
  });

  test('echoes a long rejected value shortened', () => {
    expect(() => ParseUtility.toBoolean({ input: 'x'.repeat(500) })).toThrow(/^.{0,120}$/);
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
    // @ts-expect-error - an element without the key on purpose
    const elements: Array<{ id: number }> = [{ id: 1 }, {}];

    expect(() => ParseUtility.parseArrayToMapWithKey({ items: elements, key: 'id' })).toThrow(
      'Invalid keyMap',
    );
  });
});

describe('getUID', () => {
  test('is ten uppercase base36 characters', () => {
    for (let index = 0; index < 200; index += 1) {
      expect(ParseUtility.getUID()).toMatch(/^[0-9A-Z]{10}$/);
    }
  });

  test('is unique across a batch', () => {
    const ids = new Set(Array.from({ length: 5_000 }, () => ParseUtility.getUID()));
    expect(ids.size).toBe(5_000);
  });

  test('never reads Math.random', () => {
    const realRandom = Math.random;

    Math.random = () => {
      throw new Error('getUID must not use Math.random');
    };

    try {
      expect(ParseUtility.getUID()).toMatch(/^[0-9A-Z]{10}$/);
    } finally {
      Math.random = realRandom;
    }
  });

  test('every base36 character shows up across a batch, so neither half is stuck', () => {
    const seen = new Set<string>();

    for (let index = 0; index < 500; index += 1) {
      for (const character of ParseUtility.getUID()) {
        seen.add(character);
      }
    }

    expect(seen.size).toBe(36);
  });
});

describe('toNumber', () => {
  test('unset and blank answer undefined, so a default applies', () => {
    expect(ParseUtility.toNumber({ input: undefined })).toBeUndefined();
    expect(ParseUtility.toNumber({ input: null })).toBeUndefined();
    expect(ParseUtility.toNumber({ input: '' })).toBeUndefined();
    expect(ParseUtility.toNumber({ input: '   ' })).toBeUndefined();
  });

  test('a decimal number as text answers its value: zero, negative, padded, fraction, exponent', () => {
    expect(ParseUtility.toNumber({ input: '0' })).toBe(0);
    expect(ParseUtility.toNumber({ input: '-5' })).toBe(-5);
    expect(ParseUtility.toNumber({ input: '+7' })).toBe(7);
    expect(ParseUtility.toNumber({ input: ' 12 ' })).toBe(12);
    expect(ParseUtility.toNumber({ input: '1e3' })).toBe(1000);
    expect(ParseUtility.toNumber({ input: '-2.5E-1' })).toBe(-0.25);
    expect(ParseUtility.toNumber({ input: '.5' })).toBe(0.5);
    expect(ParseUtility.toNumber({ input: '5.' })).toBe(5);
    expect(ParseUtility.toNumber({ input: '3000' })).toBe(3000);
  });

  test('a finite number answers itself', () => {
    expect(ParseUtility.toNumber({ input: 42 })).toBe(42);
    expect(ParseUtility.toNumber({ input: 0 })).toBe(0);
  });

  test.each(['abc', '12px', '0x10', '1,000', 'Infinity', '-Infinity', 'NaN', '1e', '--1', '1 2'])(
    '%s throws',
    (input) => {
      expect(() => ParseUtility.toNumber({ input })).toThrow(/\[toNumber\] .* is not a number/);
    },
  );

  test('a non-finite number, a boolean and an object throw', () => {
    expect(() => ParseUtility.toNumber({ input: Number.POSITIVE_INFINITY })).toThrow(
      'is not a number',
    );
    expect(() => ParseUtility.toNumber({ input: Number.NaN })).toThrow('is not a number');
    expect(() => ParseUtility.toNumber({ input: true })).toThrow('is not a number');
    expect(() => ParseUtility.toNumber({ input: {} })).toThrow('is not a number');
  });

  test('a value with a control character is echoed escaped, not raw', () => {
    let message = '';

    expect(() => {
      try {
        ParseUtility.toNumber({ input: 'a\nb' });
      } catch (error) {
        message = String(error);

        throw error;
      }
    }).toThrow(/is not a number/);
    expect(message).not.toContain('\n');
  });

  test('a number that is not finite is named as it reads, not as null', () => {
    expect(() => ParseUtility.toNumber({ input: Number.NaN })).toThrow(
      '[toNumber] NaN is not a number',
    );
    expect(() => ParseUtility.toNumber({ input: Number.POSITIVE_INFINITY })).toThrow(
      '[toNumber] Infinity is not a number',
    );
    expect(() => ParseUtility.toNumber({ input: Number.NEGATIVE_INFINITY })).toThrow(
      '[toNumber] -Infinity is not a number',
    );
  });

  test('a long value is echoed cut at 40 characters with an ellipsis', () => {
    const message = (() => {
      try {
        ParseUtility.toNumber({ input: `${'a'.repeat(100)}` });
      } catch (error) {
        return String(error);
      }

      return '';
    })();

    expect(message).toContain(`"${'a'.repeat(40)}..."`);
    expect(message).not.toContain('a'.repeat(41));
    expect(() => ParseUtility.toNumber({ input: 'a'.repeat(40) })).toThrow(
      `"${'a'.repeat(40)}" is not a number`,
    );
  });

  test('a very long run of digits ending in a letter is rejected in linear time', () => {
    const started = performance.now();

    expect(() => ParseUtility.toNumber({ input: `${'1'.repeat(200_000)}x` })).toThrow(
      'is not a number',
    );
    expect(() =>
      ParseUtility.toNumber({ input: `${'1'.repeat(100_000)}.${'1'.repeat(100_000)}x` }),
    ).toThrow('is not a number');

    expect(performance.now() - started).toBeLessThan(200);
  });

  test('a very long valid number still parses', () => {
    const started = performance.now();

    expect(ParseUtility.toNumber({ input: `1${'0'.repeat(200)}` })).toBe(1e200);
    expect(ParseUtility.toNumber({ input: `0.${'0'.repeat(100_000)}1` })).toBe(0);
    expect(ParseUtility.toNumber({ input: `${'0'.repeat(200_000)}7` })).toBe(7);

    expect(performance.now() - started).toBeLessThan(200);
  });
});
