import { describe, expect, test } from 'bun:test';
import {
  IntlTemporalAdapter,
  NativeTemporalAdapter,
  TemporalHelper,
  TemporalUnits,
} from '@/modules/temporal';
import type { TTemporalUnit } from '@/modules/temporal';

const SAIGON = 'Asia/Ho_Chi_Minh';
const NEW_YORK = 'America/New_York';
const LOCALES = ['vi-VN', 'en-US'];
const ZONES = [SAIGON, 'UTC'];

/** 20:30 UTC on Wednesday 14 October is already 03:30 on Thursday the 15th in Saigon. */
const EVENING_UTC = '2026-10-14T20:30:00Z';

/** The status code a call throws with, or undefined when it does not throw. */
const statusOf = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? Reflect.get(error, 'statusCode') : error;
  }
  return undefined;
};

/** What `Intl` itself writes for the instant in the zone - the spelling the tokens promise. */
const intl = (opts: {
  locale: string;
  timeZone: string;
  options: Intl.DateTimeFormatOptions;
  value?: string;
}): string =>
  new Intl.DateTimeFormat(opts.locale, { ...opts.options, timeZone: opts.timeZone }).format(
    new Date(opts.value ?? EVENING_UTC),
  );

describe('the default adapter', () => {
  test('is Intl when the runtime has no Temporal, and answers the same offsets', () => {
    const temporal: unknown = Reflect.get(globalThis, 'Temporal');
    Reflect.deleteProperty(globalThis, 'Temporal');

    try {
      const helper = new TemporalHelper({ timeZone: NEW_YORK });
      // Across the November fall-back: -04:00 before, -05:00 after.
      expect(helper.format({ value: '2026-11-01T05:30:00Z' })).toBe(
        '2026-11-01T01:30:00.000-04:00',
      );
      expect(helper.format({ value: '2026-11-01T06:30:00Z' })).toBe(
        '2026-11-01T01:30:00.000-05:00',
      );
    } finally {
      Reflect.set(globalThis, 'Temporal', temporal);
    }
  });

  test('IntlTemporalAdapter refuses an unknown zone with a 400', () => {
    const adapter = new IntlTemporalAdapter();
    expect(
      statusOf(() => adapter.getOffsetMilliseconds({ value: new Date(0), timeZone: 'Mars/Base' })),
    ).toBe(400);
  });

  test('IntlTemporalAdapter matches Temporal across zones, eras and daylight saving', () => {
    const intlAdapter = new IntlTemporalAdapter();
    const nativeAdapter = new NativeTemporalAdapter();
    const zones = [SAIGON, NEW_YORK, 'Europe/London', 'Australia/Lord_Howe', 'Asia/Kathmandu'];
    // Year 1, the 1880s of local mean time, both 2026 transitions in New York, and year 9999.
    const instants = [
      -62_135_596_800_000, -2_717_640_000_000, 1_772_953_200_000, 1_793_512_800_000,
      253_402_300_799_999,
    ];

    for (const timeZone of zones) {
      for (const epoch of instants) {
        for (const delta of [-1, 0, 1, 1500, -3_600_000]) {
          const value = new Date(epoch + delta);
          expect(intlAdapter.getOffsetMilliseconds({ value, timeZone })).toBe(
            nativeAdapter.getOffsetMilliseconds({ value, timeZone }),
          );
        }
      }
    }
  });
});

for (const locale of LOCALES) {
  for (const timeZone of ZONES) {
    describe(`${locale} in ${timeZone}`, () => {
      const helper = new TemporalHelper({ timeZone, locale });

      test('name tokens spell what Intl spells, on the wall clock of the zone', () => {
        const names = helper.format({
          value: EVENING_UTC,
          pattern: 'dddd|ddd|MMMM|MMM|L|LL',
        });

        expect(names.split('|')).toEqual([
          intl({ locale, timeZone, options: { weekday: 'long' } }),
          intl({ locale, timeZone, options: { weekday: 'short' } }),
          intl({ locale, timeZone, options: { month: 'long' } }),
          intl({ locale, timeZone, options: { month: 'short' } }),
          intl({
            locale,
            timeZone,
            options: { year: 'numeric', month: '2-digit', day: '2-digit' },
          }),
          intl({ locale, timeZone, options: { dateStyle: 'long' } }),
        ]);
      });

      test('the 12-hour clock and its marker', () => {
        const isSaigon = timeZone === SAIGON;
        const marker = new Intl.DateTimeFormat(locale, {
          timeZone,
          hour: 'numeric',
          hourCycle: 'h12',
        })
          .formatToParts(new Date(EVENING_UTC))
          .find(part => part.type === 'dayPeriod')?.value;

        expect(helper.format({ value: EVENING_UTC, pattern: 'hh:mm h A a' })).toBe(
          `${isSaigon ? '03:30 3' : '08:30 8'} ${marker} ${marker?.toLowerCase()}`,
        );
        expect(
          helper.format({ value: '2026-10-14T00:00:00Z', pattern: 'h', timeZone: 'UTC' }),
        ).toBe('12');
      });

      test('formatIntl passes Intl options through, in the zone', () => {
        const options: Intl.DateTimeFormatOptions = { weekday: 'long', hour: 'numeric' };
        expect(helper.formatIntl({ value: EVENING_UTC, options })).toBe(
          intl({ locale, timeZone, options }),
        );
      });

      test('relative time by a calendar unit counts its boundaries in the zone', () => {
        // 23:30 on the 14th against 00:30 on the 15th, read in Saigon: a day boundary between them.
        const value = '2026-10-14T16:30:00Z';
        const base = '2026-10-14T17:30:00Z';
        const words = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

        expect(helper.relative({ value, base, unit: TemporalUnits.DAY, numeric: 'auto' })).toBe(
          words.format(timeZone === SAIGON ? -1 : 0, 'day'),
        );
      });

      test('relative time without a unit says the largest whole one', () => {
        const words = new Intl.RelativeTimeFormat(locale);
        const base = '2026-10-14T12:00:00Z';

        expect(helper.relative({ value: '2026-10-14T09:00:00Z', base })).toBe(
          words.format(-3, 'hour'),
        );
        expect(helper.relative({ value: '2026-10-16T13:00:00Z', base })).toBe(
          words.format(2, 'day'),
        );
        expect(helper.relative({ value: base, base })).toBe(words.format(0, 'second'));
      });

      test('compare at a unit reads the unit in the zone', () => {
        const value = '2026-10-14T16:59:00Z';
        const other = '2026-10-14T17:01:00Z';

        expect(helper.compare({ value, other, unit: TemporalUnits.DAY })).toBe(
          timeZone === SAIGON ? -1 : 0,
        );
        expect(helper.compare({ value, other })).toBe(-1);
        expect(helper.compare({ value: other, other: value })).toBe(1);
      });
    });
  }
}

describe('diff', () => {
  const newYork = new TemporalHelper({ timeZone: NEW_YORK });
  const saigon = new TemporalHelper({ timeZone: SAIGON });

  test('is the inverse of add, across daylight saving and month ends', () => {
    const units: Array<TTemporalUnit> = [
      TemporalUnits.HOUR,
      TemporalUnits.DAY,
      TemporalUnits.WEEK,
      TemporalUnits.MONTH,
      TemporalUnits.YEAR,
    ];
    const starts = [
      '2026-01-31T15:00:00Z',
      '2026-03-07T07:30:00Z',
      '2026-10-31T05:30:00Z',
      '2024-02-29T12:00:00Z',
    ];

    for (const helper of [newYork, saigon]) {
      for (const value of starts) {
        for (const unit of units) {
          for (const amount of [-25, -13, -1, 0, 1, 2, 13, 25]) {
            const moved = helper.add({ value, amount, unit });
            expect(helper.diff({ value: moved, other: value, unit })).toBe(amount);
          }
        }
      }
    }
  });

  test('truncates toward zero', () => {
    const other = '2026-10-14T00:00:00Z';

    expect(newYork.diff({ value: '2026-10-14T01:59:59Z', other, unit: TemporalUnits.HOUR })).toBe(
      1,
    );
    expect(newYork.diff({ value: '2026-10-13T22:00:01Z', other, unit: TemporalUnits.HOUR })).toBe(
      -1,
    );
    expect(
      saigon.diff({ value: '2026-02-27T23:59:59Z', other: '2026-01-31T00:00:00Z', unit: 'month' }),
    ).toBe(0);
    expect(
      saigon.diff({ value: '2026-02-28T17:00:00Z', other: '2026-01-31T17:00:00Z', unit: 'month' }),
    ).toBe(1);
  });

  test('a calendar day across the spring-forward gap is one day, 23 hours long', () => {
    const value = '2026-03-09T04:00:00Z';
    const other = '2026-03-08T05:00:00Z';

    expect(newYork.diff({ value, other, unit: TemporalUnits.DAY })).toBe(1);
    expect(newYork.diff({ value, other, unit: TemporalUnits.HOUR })).toBe(23);
  });
});

describe('reading without throwing', () => {
  const helper = new TemporalHelper({ timeZone: SAIGON });

  test('tryParse answers null where parse refuses the value', () => {
    expect(helper.tryParse({ value: '2026-13-01' })).toBeNull();
    expect(helper.tryParse({ value: '14/10', pattern: 'DD/MM/YYYY' })).toBeNull();
    expect(helper.tryParse({ value: '2026-10-14' })?.toISOString()).toBe(
      '2026-10-13T17:00:00.000Z',
    );
  });

  test('a pattern that is a bug still throws', () => {
    expect(statusOf(() => helper.tryParse({ value: '2026', pattern: 'yyyy' }))).toBe(500);
    expect(statusOf(() => helper.tryParse({ value: 'Oct', pattern: 'MMM' }))).toBe(500);
  });

  test('isValid covers strings, epochs and dates in years 1-9999', () => {
    expect(helper.isValid({ value: '2026-10-14T05:30:00Z' })).toBe(true);
    expect(helper.isValid({ value: 'not a date' })).toBe(false);
    expect(helper.isValid({ value: new Date(Number.NaN) })).toBe(false);
    expect(helper.isValid({ value: 253_402_300_800_000 })).toBe(false);
    expect(helper.isValid({ value: 0 })).toBe(true);
  });
});

describe('durations', () => {
  const english = new TemporalHelper({ locale: 'en-US' });
  const vietnamese = new TemporalHelper({ locale: 'vi-VN' });
  const ninetyMinutesAndADay = 91_800_000;

  test('durationParts splits into whole units, with the sign apart', () => {
    expect(english.durationParts({ milliseconds: -(ninetyMinutesAndADay + 1500) })).toEqual({
      isNegative: true,
      days: 1,
      hours: 1,
      minutes: 30,
      seconds: 1,
      milliseconds: 500,
    });
  });

  test('compact writes 1d1h30m, leaving zero units out', () => {
    expect(english.formatDuration({ milliseconds: ninetyMinutesAndADay })).toBe('1d1h30m');
    expect(english.formatDuration({ milliseconds: -5_400_000 })).toBe('-1h30m');
    expect(english.formatDuration({ milliseconds: 999 })).toBe('0s');
  });

  test('the other styles use the locale unit words', () => {
    expect(english.formatDuration({ milliseconds: ninetyMinutesAndADay, style: 'long' })).toBe(
      new Intl.ListFormat('en-US', { type: 'unit', style: 'long' }).format([
        '1 day',
        '1 hour',
        '30 minutes',
      ]),
    );
    expect(vietnamese.formatDuration({ milliseconds: 3_600_000, style: 'long' })).toBe(
      new Intl.NumberFormat('vi-VN', { style: 'unit', unit: 'hour', unitDisplay: 'long' }).format(
        1,
      ),
    );
  });

  test('a fractional or unsafe span, or an unknown style, is a 400', () => {
    expect(statusOf(() => english.formatDuration({ milliseconds: 1.5 }))).toBe(400);
    expect(statusOf(() => english.durationParts({ milliseconds: Number.MAX_VALUE }))).toBe(400);
    expect(
      statusOf(() => english.formatDuration({ milliseconds: 1, style: JSON.parse('"bogus"') })),
    ).toBe(400);
  });
});

describe('locales', () => {
  test('a malformed locale is refused', () => {
    expect(statusOf(() => new TemporalHelper({ locale: 'not a locale!' }))).toBe(400);
    expect(
      statusOf(() => new TemporalHelper().format({ value: 0, pattern: 'MMM', locale: '!' })),
    ).toBe(400);
  });

  test('relative time has no millisecond unit', () => {
    expect(
      statusOf(() =>
        new TemporalHelper().relative({ value: 0, base: 1, unit: TemporalUnits.MILLISECOND }),
      ),
    ).toBe(400);
  });
});

describe('review cases', () => {
  /** The largest n that add can move `other` by without passing `value` - diff's definition, by brute force. */
  const bruteForce = (opts: {
    helper: TemporalHelper;
    value: string;
    other: string;
    unit: TTemporalUnit;
  }): number => {
    const { helper, value, other, unit } = opts;
    const target = new Date(value).getTime();
    const direction = Math.sign(target - new Date(other).getTime());
    const passes = (amount: number): boolean => {
      const moved = helper.add({ value: other, amount, unit }).getTime();
      return direction > 0 ? moved > target : moved < target;
    };

    let amount = 0;
    while (!passes(amount + direction)) {
      amount += direction;
    }
    return amount;
  };

  test('diff near the end of the year range does not throw', () => {
    const helper = new TemporalHelper({ timeZone: 'UTC' });

    expect(
      helper.diff({ value: '9999-12-31T23:59:59Z', other: '2026-10-14T09:00:00Z', unit: 'day' }),
    ).toBe(
      Math.floor((Date.UTC(9999, 11, 31, 23, 59, 59) - Date.UTC(2026, 9, 14, 9)) / 86_400_000),
    );
    expect(
      helper.diff({ value: '0001-01-01T10:00:00Z', other: '0001-01-02T23:00:00Z', unit: 'day' }),
    ).toBe(-1);
  });

  test('diff steps forward where a zone repeats or skips a whole day', () => {
    const cases: Array<{ timeZone: string; value: string; other: string; unit: TTemporalUnit }> = [
      // Sitka repeated 18 October 1867 when Alaska moved from Russian to American time.
      {
        timeZone: 'America/Sitka',
        value: '1867-10-19T01:31:13Z',
        other: '1867-10-17T19:01:13Z',
        unit: 'day',
      },
      // Apia skipped 30 December 2011.
      {
        timeZone: 'Pacific/Apia',
        value: '2011-12-30T19:00:00Z',
        other: '2011-12-31T20:00:00Z',
        unit: 'day',
      },
    ];

    for (const { timeZone, value, other, unit } of cases) {
      const helper = new TemporalHelper({ timeZone });
      expect(helper.diff({ value, other, unit })).toBe(bruteForce({ helper, value, other, unit }));
    }
  });

  test('diff never answers negative zero', () => {
    const helper = new TemporalHelper();
    expect(Object.is(helper.diff({ value: 0, other: 500, unit: 'second' }), 0)).toBe(true);
    expect(Object.is(helper.diff({ value: 0, other: 3_600_000, unit: 'day' }), 0)).toBe(true);
  });

  test('tryParse still throws for a bad zone', () => {
    expect(
      statusOf(() => new TemporalHelper().tryParse({ value: '2026-01-01', timeZone: 'Mars/Base' })),
    ).toBe(400);
  });

  test('names stay Gregorian whatever the locale calendar', () => {
    const helper = new TemporalHelper({ timeZone: 'UTC' });
    const value = '2026-10-14T10:00:00Z';

    for (const locale of ['fa-IR', 'th-TH', 'en-US-u-ca-islamic']) {
      expect(helper.format({ value, pattern: 'MMMM', locale })).toBe(
        new Intl.DateTimeFormat(locale, {
          month: 'long',
          calendar: 'gregory',
          timeZone: 'UTC',
        }).format(new Date(value)),
      );
    }
    expect(helper.format({ value, pattern: 'L', locale: 'th-TH' })).toContain('2026');
  });

  test('under a second is 0s whatever the sign', () => {
    expect(new TemporalHelper().formatDuration({ milliseconds: -500 })).toBe('0s');
  });
});
