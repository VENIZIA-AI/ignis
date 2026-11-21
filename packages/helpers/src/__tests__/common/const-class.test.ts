import { describe, expect, test } from 'bun:test';
import { ConstClass } from '@/common/const-class';
import type { TConstValue } from '@/common/types';

class Colors extends ConstClass {
  static readonly RED = 'red';
  static readonly BLUE = 'blue';
}

class Shades extends Colors {
  static readonly GREEN = 'green';
}

class Cached extends ConstClass {
  static readonly CACHE = 'cache';
}

class Empty extends ConstClass {}

class Mixed extends ConstClass {
  static readonly NAME = 'name';
  static readonly LIMIT = 3;
}

describe('ConstClass', () => {
  test('values lists the string members in declaration order', () => {
    expect([...Colors.values()]).toEqual(['red', 'blue']);
  });

  test('values skips non-string members and the inherited statics', () => {
    expect([...Mixed.values()]).toEqual(['name']);
  });

  test('a subclass lists the values it inherits, base first, and validates them', () => {
    expect([...Shades.values()]).toEqual(['red', 'blue', 'green']);
    expect(Shades.isValid('red')).toBe(true);
    expect(Colors.isValid('green')).toBe(false);
  });

  test('a value named CACHE does not clash with the internal cache', () => {
    expect([...Cached.values()]).toEqual(['cache']);
    expect(Cached.isValid('cache')).toBe(true);
  });

  test('values is cached per class', () => {
    expect(Colors.values()).toBe(Colors.values());
    expect(Colors.values()).not.toBe(Mixed.values());
  });

  test('values throws when the class holds no string', () => {
    expect(() => Empty.values()).toThrow('Empty has no values');
  });

  test('isValid accepts a member value and rejects everything else', () => {
    expect(Colors.isValid('red')).toBe(true);
    expect(Colors.isValid('green')).toBe(false);
    expect(Colors.isValid(undefined)).toBe(false);
    expect(Colors.isValid(3)).toBe(false);
    expect(Colors.isValid('values')).toBe(false);
  });

  test('isValid narrows to the literal union, and TConstValue leaves the inherited statics out', () => {
    const input: unknown = 'blue';

    if (Colors.isValid(input)) {
      const color: TConstValue<typeof Colors> = input;
      const literal: 'red' | 'blue' = color;

      expect(literal).toBe('blue');
    }

    const first: 'red' | 'blue' = Colors.values()[0];

    expect(first).toBe('red');
  });
});
