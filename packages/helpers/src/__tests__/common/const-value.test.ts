/** The const-value aliases are enforced by tsc, not by the runner: this file compiles only while the literal unions stay literal. */

import { describe, expect, test } from 'bun:test';
import type { TConstValue, TNumberConstValue, TStringConstValue } from '@/common/types';

class Periods {
  static readonly HALF_DAY = '12h';
  static readonly DAY = '24h';
  static readonly RETRIES = 3;
  static readonly SCHEME_SET = new Set([this.HALF_DAY, this.DAY]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}

type TPeriod = TStringConstValue<typeof Periods>;
type TPeriodValue = TConstValue<typeof Periods>;

describe('TStringConstValue / TNumberConstValue / TConstValue - literal unions', () => {
  test('a value mapped into a new object literal keeps the literal union', () => {
    const rows: { value: TPeriod }[] = [{ value: Periods.HALF_DAY }, { value: Periods.DAY }];

    const mapped = rows.map(row => ({ value: row.value, label: row.value.toUpperCase() }));
    const typed: { value: TPeriod; label: string }[] = mapped;

    expect(typed.map(row => row.value)).toEqual(['12h', '24h']);
  });

  test('a let initialised from a value keeps the literal union, strings and numbers alike', () => {
    const periods: TPeriodValue[] = [Periods.DAY, Periods.RETRIES];
    const retries: TNumberConstValue<typeof Periods>[] = [Periods.RETRIES];

    let current = periods[0];
    let attempts = retries[0];
    const typedCurrent: '12h' | '24h' | 3 = current;
    const typedAttempts: 3 = attempts;

    current = Periods.HALF_DAY;
    attempts = Periods.RETRIES;
    expect<unknown[]>([typedCurrent, typedAttempts, current, attempts]).toEqual([
      '24h',
      3,
      '12h',
      3,
    ]);
  });

  test('the union is exactly the declared members, usable as record keys', () => {
    const labels: Record<TPeriod, string> = { '12h': 'Half day', '24h': 'Day' };

    // @ts-expect-error - a string outside the declared members is not a TPeriod
    const outside: TPeriod = '48h';

    expect(Object.keys(labels)).toEqual(['12h', '24h']);
    expect<string>(outside).toBe('48h');
  });

  test('generic code converts both ways between the alias and the raw Extract', () => {
    const toAlias = <T extends typeof Periods>(
      value: Extract<T[keyof T], string>,
    ): TStringConstValue<T> => value;
    const toRaw = <T extends typeof Periods>(
      value: TStringConstValue<T>,
    ): Extract<T[keyof T], string> => value;

    expect(toRaw(toAlias(Periods.DAY))).toBe('24h');
  });
});
