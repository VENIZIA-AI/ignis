import { describe, expect, test } from 'bun:test';
import { DurationAliases, DurationMultipliers, DurationUnits } from '@/common/constants/duration';

describe('DurationUnits - the unit vocabulary', () => {
  test('every declared unit is in SCHEME_SET, so isValid cannot drift from the constants', () => {
    const declared = Object.values(DurationUnits).filter(value => typeof value === 'string');

    expect(declared.length).toBe(8);
    for (const unit of declared) {
      expect(DurationUnits.SCHEME_SET.has(unit as string)).toBe(true);
      expect(DurationUnits.isValid(unit as string)).toBe(true);
    }
  });

  test('a unit outside the vocabulary is refused', () => {
    expect(DurationUnits.isValid('fortnight')).toBe(false);
    expect(DurationUnits.isValid('')).toBe(false);
    expect(DurationUnits.isValid('MINUTE')).toBe(false);
  });
});

describe('DurationMultipliers - converting a window to milliseconds', () => {
  test('each multiplier is its predecessor scaled, so no arm can drift alone', () => {
    expect(DurationMultipliers.SECOND).toBe(1000);
    expect(DurationMultipliers.MINUTE).toBe(60 * DurationMultipliers.SECOND);
    expect(DurationMultipliers.HOUR).toBe(60 * DurationMultipliers.MINUTE);
    expect(DurationMultipliers.DAY).toBe(24 * DurationMultipliers.HOUR);
    expect(DurationMultipliers.WEEK).toBe(7 * DurationMultipliers.DAY);
  });

  test('a month is 30 days and a year 365 - nominal, and pinned so a "fix" is a deliberate change', () => {
    expect(DurationMultipliers.MONTH).toBe(30 * DurationMultipliers.DAY);
    expect(DurationMultipliers.YEAR).toBe(365 * DurationMultipliers.DAY);
  });

  test('BY_UNIT covers every unit in the vocabulary', () => {
    for (const unit of DurationUnits.SCHEME_SET) {
      expect(typeof DurationMultipliers.BY_UNIT[unit]).toBe('number');
    }
  });

  test('converts the values BANA already depends on', () => {
    expect(DurationMultipliers.toMilliseconds({ unit: 'day', value: 3 })).toBe(259_200_000);
    expect(DurationMultipliers.toMilliseconds({ unit: 'month', value: 1 })).toBe(2_592_000_000);
    expect(DurationMultipliers.toMilliseconds({ unit: 'hour', value: 36 })).toBe(129_600_000);
  });

  test('zero is a real duration, not an absent one', () => {
    expect(DurationMultipliers.toMilliseconds({ unit: 'day', value: 0 })).toBe(0);
  });

  test('a fractional value rounds rather than emitting a fractional millisecond', () => {
    expect(DurationMultipliers.toMilliseconds({ unit: 'second', value: 1.5 })).toBe(1500);
    expect(DurationMultipliers.toMilliseconds({ unit: 'millisecond', value: 1.4 })).toBe(1);
  });

  test('returns null - never a throw and never NaN - for input it cannot convert', () => {
    expect(DurationMultipliers.toMilliseconds(null)).toBeNull();
    expect(DurationMultipliers.toMilliseconds({ unit: 'fortnight', value: 1 } as never)).toBeNull();
    expect(DurationMultipliers.toMilliseconds({ unit: 'day', value: Number.NaN })).toBeNull();
    expect(
      DurationMultipliers.toMilliseconds({ unit: 'day', value: Number.POSITIVE_INFINITY }),
    ).toBeNull();
  });

  test('a negative window converts rather than being silently dropped - the caller decides', () => {
    expect(DurationMultipliers.toMilliseconds({ unit: 'day', value: -1 })).toBe(-86_400_000);
  });
});

describe('DurationAliases.resolve - written units', () => {
  test('accepts short, long and plural spellings, and ignores case and surrounding space', () => {
    for (const written of ['d', 'day', 'days', 'DAY', '  Days  ']) {
      expect(DurationAliases.resolve(written)).toBe(DurationUnits.DAY);
    }
  });

  test('`m` is minute and `mo` is month - the one ambiguity worth pinning', () => {
    expect(DurationAliases.resolve('m')).toBe(DurationUnits.MINUTE);
    expect(DurationAliases.resolve('mo')).toBe(DurationUnits.MONTH);
    expect(DurationAliases.resolve('min')).toBe(DurationUnits.MINUTE);
    expect(DurationAliases.resolve('month')).toBe(DurationUnits.MONTH);
  });

  test('every canonical unit name parses back to itself, so no alias table entry can go missing', () => {
    for (const unit of DurationUnits.SCHEME_SET) {
      expect(DurationAliases.resolve(unit)).toBe(unit);
    }
  });

  test('an unknown spelling is null, never a guess', () => {
    expect(DurationAliases.resolve('fortnight')).toBeNull();
    expect(DurationAliases.resolve('')).toBeNull();
    expect(DurationAliases.resolve(null as never)).toBeNull();
  });
});

describe('DurationMultipliers.fromMilliseconds and convert - the inverse and the cross', () => {
  test('fromMilliseconds inverts toMilliseconds', () => {
    expect(DurationMultipliers.fromMilliseconds({ milliseconds: 259_200_000, unit: 'day' })).toBe(
      3,
    );
    expect(DurationMultipliers.fromMilliseconds({ milliseconds: 1500, unit: 'second' })).toBe(1.5);
  });

  test('it stays fractional - rounding would lose a 36-hour window asked for in days', () => {
    expect(DurationMultipliers.fromMilliseconds({ milliseconds: 129_600_000, unit: 'day' })).toBe(
      1.5,
    );
  });

  test('convert crosses units without going through the caller', () => {
    expect(DurationMultipliers.convert({ value: 36, from: 'hour', to: 'day' })).toBe(1.5);
    expect(DurationMultipliers.convert({ value: 2, from: 'week', to: 'day' })).toBe(14);
    expect(DurationMultipliers.convert({ value: 1, from: 'day', to: 'day' })).toBe(1);
  });

  test('both answer null for input they cannot convert', () => {
    expect(
      DurationMultipliers.fromMilliseconds({ milliseconds: 1, unit: 'fortnight' as never }),
    ).toBeNull();
    expect(DurationMultipliers.convert({ value: 1, from: 'day', to: 'eon' as never })).toBeNull();
    expect(DurationMultipliers.convert({ value: Number.NaN, from: 'day', to: 'hour' })).toBeNull();
  });
});

describe('DurationMultipliers.parse - written durations', () => {
  test('reads the shapes a config value actually arrives in', () => {
    expect(DurationMultipliers.parse('30d')).toEqual({ unit: 'day', value: 30 });
    expect(DurationMultipliers.parse('1500 ms')).toEqual({ unit: 'millisecond', value: 1500 });
    expect(DurationMultipliers.parse('2 Hours')).toEqual({ unit: 'hour', value: 2 });
    expect(DurationMultipliers.parse('  7w  ')).toEqual({ unit: 'week', value: 7 });
  });

  test('carries sign and fraction through', () => {
    expect(DurationMultipliers.parse('-1d')).toEqual({ unit: 'day', value: -1 });
    expect(DurationMultipliers.parse('1.5h')).toEqual({ unit: 'hour', value: 1.5 });
  });

  test('refuses anything it cannot read whole - no partial credit', () => {
    for (const input of ['30', 'd', '30 dd', '30d extra', '', 'thirty days', '1e3d']) {
      expect(DurationMultipliers.parse(input)).toBeNull();
    }
  });

  test('parseToMilliseconds is the whole trip, and inherits the same null', () => {
    expect(DurationMultipliers.parseToMilliseconds('30d')).toBe(2_592_000_000);
    expect(DurationMultipliers.parseToMilliseconds('1.5h')).toBe(5_400_000);
    expect(DurationMultipliers.parseToMilliseconds('nonsense')).toBeNull();
  });
});
