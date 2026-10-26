import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import {
  IntlTemporalAdapter,
  TemporalHelper,
  TemporalInclusivities,
  TemporalUnits,
} from '@/modules/temporal';
import type { TTemporalUnit } from '@/modules/temporal';
import { PACKAGE_ROOT } from '../package-root';
import { spawnSyncBounded } from '@venizia/dev-configs/testing';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(quarterOfYear);

const SAIGON = 'Asia/Ho_Chi_Minh';
const NEW_YORK = 'America/New_York';
const VALUE = '2026-10-15T14:30:00+07:00';

/** The status code a call throws with, or undefined when it does not throw. */
const statusOf = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? Reflect.get(error, 'statusCode') : error;
  }
  return undefined;
};

describe('null is not a date', () => {
  const helper = new TemporalHelper({ tz: SAIGON });

  test('toDate, compare and format refuse null with a 400, never 1970', () => {
    expect(statusOf(() => helper.toDate({ value: JSON.parse('null') }))).toBe(400);
    expect(statusOf(() => helper.compare({ value: JSON.parse('null'), other: 0 }))).toBe(400);
    expect(statusOf(() => helper.format({ value: JSON.parse('null') }))).toBe(400);
  });

  test('isValid, tryToDate and a format fallback answer without throwing', () => {
    expect(helper.isValid({ value: null })).toBe(false);
    expect(helper.isValid({ value: undefined })).toBe(false);
    expect(helper.tryToDate({ value: null })).toBeNull();
    expect(helper.tryToDate({ value: 'not a date' })).toBeNull();
    expect(helper.tryToDate({ value: Number.NaN })).toBeNull();
    expect(helper.tryToDate({ value: VALUE })?.toISOString()).toBe('2026-10-15T07:30:00.000Z');
    expect(helper.format({ value: null, pattern: 'DD/MM', fallback: '--' })).toBe('--');
    expect(helper.format({ value: VALUE, pattern: 'DD/MM', fallback: '--' })).toBe('15/10');
  });

  test('a broken pattern or zone still throws, fallback or not', () => {
    expect(statusOf(() => helper.format({ value: VALUE, pattern: 'yyyy', fallback: '--' }))).toBe(
      500,
    );
    expect(statusOf(() => helper.tryToDate({ value: VALUE, tz: 'Mars/Base' }))).toBe(400);
  });
});

describe('quarter', () => {
  const helper = new TemporalHelper({ tz: SAIGON });

  test('start, end, add, diff and the Q token', () => {
    expect(helper.startOf({ value: VALUE, unit: TemporalUnits.QUARTER }).toISOString()).toBe(
      '2026-09-30T17:00:00.000Z',
    );
    expect(helper.endOf({ value: VALUE, unit: TemporalUnits.QUARTER }).toISOString()).toBe(
      '2026-12-31T16:59:59.999Z',
    );
    expect(
      helper.add({ value: '2026-11-30T10:00:00+07:00', amount: 1, unit: 'quarter' }).toISOString(),
    ).toBe('2027-02-28T03:00:00.000Z');
    expect(
      helper.diff({
        value: '2026-10-14T12:00:00+07:00',
        other: '2026-01-14T11:59:59+07:00',
        unit: 'quarter',
      }),
    ).toBe(3);
    expect(helper.format({ value: VALUE, pattern: '[Q]Q/YYYY' })).toBe('Q4/2026');
    expect(
      helper.isSame({ value: VALUE, other: '2026-12-31T23:00:00+07:00', unit: 'quarter' }),
    ).toBe(true);
  });
});

describe('set', () => {
  const helper = new TemporalHelper({ tz: SAIGON });

  test('replaces wall-clock fields in the zone, the day clamped to the month', () => {
    expect(helper.set({ value: VALUE, hour: 9, minute: 0 }).toISOString()).toBe(
      '2026-10-15T02:00:00.000Z',
    );
    expect(helper.set({ value: '2026-01-31T10:00:00+07:00', month: 2 }).toISOString()).toBe(
      '2026-02-28T03:00:00.000Z',
    );
    expect(helper.set({ value: '2024-01-31T10:00:00+07:00', month: 2 }).toISOString()).toBe(
      '2024-02-29T03:00:00.000Z',
    );
  });

  test('a skipped wall time resolves forward, as parse does', () => {
    const newYork = new TemporalHelper({ tz: NEW_YORK });
    expect(newYork.set({ value: '2026-03-08T12:00:00Z', hour: 2, minute: 30 }).toISOString()).toBe(
      '2026-03-08T07:30:00.000Z',
    );
  });

  test('a field out of its range is a 400', () => {
    expect(statusOf(() => helper.set({ value: VALUE, month: 13 }))).toBe(400);
    expect(statusOf(() => helper.set({ value: VALUE, hour: 1.5 }))).toBe(400);
  });
});

describe('comparisons', () => {
  const helper = new TemporalHelper({ tz: SAIGON });
  const other = '2026-10-15T23:00:00+07:00';

  test('the booleans follow compare', () => {
    expect(helper.isBefore({ value: VALUE, other })).toBe(true);
    expect(helper.isAfter({ value: VALUE, other })).toBe(false);
    expect(helper.isSame({ value: VALUE, other, unit: TemporalUnits.DAY })).toBe(true);
    expect(helper.isSameOrBefore({ value: VALUE, other, unit: TemporalUnits.DAY })).toBe(true);
    expect(helper.isSameOrAfter({ value: VALUE, other })).toBe(false);
  });

  test('isBetween honours each end, and takes the range in either order', () => {
    const from = '2026-10-15T14:30:00+07:00';
    const to = '2026-10-16T00:00:00+07:00';

    expect(helper.isBetween({ value: VALUE, from, to })).toBe(false);
    expect(
      helper.isBetween({ value: VALUE, from, to, inclusivity: TemporalInclusivities.START_ONLY }),
    ).toBe(true);
    expect(helper.isBetween({ value: VALUE, from: to, to: from, inclusivity: '(]' })).toBe(true);
    expect(helper.isBetween({ value: VALUE, from, to, inclusivity: '[]', unit: 'day' })).toBe(true);
    expect(
      statusOf(() => helper.isBetween({ value: VALUE, from, to, inclusivity: JSON.parse('"[["') })),
    ).toBe(400);
  });
});

describe('durations', () => {
  const helper = new TemporalHelper({ locale: 'vi-VN' });

  test('a clock face, the largest token carrying the rest', () => {
    expect(helper.formatDuration({ milliseconds: 3_723_000, pattern: 'HH:mm:ss' })).toBe(
      '01:02:03',
    );
    expect(helper.formatDuration({ milliseconds: 4_500_000, pattern: 'mm:ss' })).toBe('75:00');
    expect(helper.formatDuration({ milliseconds: 93_784_005, pattern: 'D[d] HH:mm:ss.SSS' })).toBe(
      '1d 02:03:04.005',
    );
    expect(helper.formatDuration({ milliseconds: -65_000, pattern: 'm:ss' })).toBe('-1:05');
    expect(statusOf(() => helper.formatDuration({ milliseconds: 1, pattern: 'YYYY' }))).toBe(500);
  });

  test('maxUnits keeps the largest units only', () => {
    expect(helper.formatDuration({ milliseconds: 7_500_000, style: 'long', maxUnits: 1 })).toBe(
      new Intl.NumberFormat('vi-VN', { style: 'unit', unit: 'hour', unitDisplay: 'long' }).format(
        2,
      ),
    );
    expect(helper.formatDuration({ milliseconds: 93_784_000, maxUnits: 2 })).toBe('1d2h');
    expect(statusOf(() => helper.formatDuration({ milliseconds: 1, maxUnits: 0 }))).toBe(400);
  });
});

describe('clone and names', () => {
  const names = {
    'vi-VN': {
      weekdaysShort: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'],
      monthsShort: Array.from({ length: 12 }, (_, index) => `Th${index + 1}`),
      meridiem: ['AM', 'PM'] as const,
    },
  };
  const helper = new TemporalHelper({
    adapter: new IntlTemporalAdapter(),
    tz: SAIGON,
    locale: 'vi-VN',
    names,
  });

  test('names win over Intl for their locale; dd is the narrow weekday', () => {
    expect(helper.format({ value: VALUE, pattern: 'ddd D MMM, hh:mm A a' })).toBe(
      'T5 15 Th10, 02:30 PM pm',
    );
    expect(helper.format({ value: VALUE, pattern: 'dd' })).toBe(
      new Intl.DateTimeFormat('vi-VN', { weekday: 'narrow', timeZone: SAIGON }).format(
        new Date(VALUE),
      ),
    );
  });

  test('clone keeps the names and the adapter, and changes only what it is given', () => {
    const english = helper.clone({ locale: 'en-US' });
    expect(english.getLocale()).toBe('en-US');
    expect(english.getTz()).toBe(SAIGON);
    expect(english.format({ value: VALUE, pattern: 'ddd MMM' })).toBe('Thu Oct');
    expect(english.clone({ locale: 'vi-VN' }).format({ value: VALUE, pattern: 'MMM' })).toBe(
      'Th10',
    );
    expect(helper.clone({ tz: 'UTC' }).format({ value: VALUE, pattern: 'HH:mm' })).toBe('07:30');
  });

  test('a list of the wrong length fails when the helper is built', () => {
    expect(
      statusOf(() => new TemporalHelper({ names: { 'vi-VN': { weekdaysShort: ['T2'] } } })),
    ).toBe(500);
  });
});

describe('diff counts as dayjs does, add takes fractions of elapsed time', () => {
  /** The instants a consumer's golden proof uses: month ends, a leap day, the edges of a day and a year. */
  const INSTANTS = [
    '2026-01-31T12:00:00+07:00',
    '2026-02-28T12:00:00+07:00',
    '2026-03-01T00:00:00+07:00',
    '2026-03-31T12:00:00+07:00',
    '2024-02-29T12:00:00+07:00',
    '2026-02-28T23:59:59.999+07:00',
    '2025-10-15T12:00:00+07:00',
    '2026-10-14T12:00:00+07:00',
    '2026-01-14T11:59:59+07:00',
    '2026-10-13T23:59:59+07:00',
    '2026-10-14T00:00:00+07:00',
    '2026-10-14T00:00:01+07:00',
    '2026-10-21T00:00:00+07:00',
    '2026-10-14T09:30:00+07:00',
    '2000-02-29T00:00:00+07:00',
    '2026-12-31T23:59:59.999+07:00',
  ];
  const UNITS: Array<TTemporalUnit> = [
    'millisecond',
    'second',
    'minute',
    'hour',
    'day',
    'week',
    'month',
    'quarter',
    'year',
  ];

  for (const tz of [SAIGON, NEW_YORK]) {
    test(`every pair and unit matches dayjs in ${tz}, and diff(a, b) is -diff(b, a)`, () => {
      const helper = new TemporalHelper({ tz });
      const mismatches: Array<string> = [];

      for (const unit of UNITS) {
        for (const value of INSTANTS) {
          for (const other of INSTANTS) {
            const counted = helper.diff({ value, other, unit });
            const expected = dayjs(value).tz(tz).diff(dayjs(other).tz(tz), unit);
            if (
              counted !== expected ||
              counted !== -helper.diff({ value: other, other: value, unit }) + 0
            ) {
              mismatches.push(`${value} | ${other} | ${unit} | ${counted} vs ${expected}`);
            }
          }
        }
      }
      expect(mismatches).toEqual([]);
    });
  }

  test('the month-end lines that anchoring at the earlier date gets wrong', () => {
    const helper = new TemporalHelper({ tz: SAIGON });
    expect(
      helper.diff({
        value: '2024-02-29T12:00:00+07:00',
        other: '2026-02-28T23:59:59.999+07:00',
        unit: 'month',
      }),
    ).toBe(-24);
    expect(
      helper.diff({
        value: '2026-03-31T12:00:00+07:00',
        other: '2026-02-28T23:59:59.999+07:00',
        unit: 'month',
      }),
    ).toBe(0);
  });

  test('add takes a fraction of an hour or less, and refuses one of a calendar unit', () => {
    const helper = new TemporalHelper({ tz: SAIGON });
    const start = '2026-08-25T00:00:00Z';

    expect(helper.add({ value: start, amount: 1.5, unit: 'hour' }).toISOString()).toBe(
      '2026-08-25T01:30:00.000Z',
    );
    expect(helper.add({ value: start, amount: 0.25, unit: 'minute' }).toISOString()).toBe(
      '2026-08-25T00:00:15.000Z',
    );
    expect(statusOf(() => helper.add({ value: start, amount: 1.5, unit: 'day' }))).toBe(400);
    expect(
      statusOf(() => helper.add({ value: start, amount: Number.POSITIVE_INFINITY, unit: 'hour' })),
    ).toBe(400);
  });
});

describe('the date-picker bridge', () => {
  const saigon = new TemporalHelper({ tz: SAIGON });

  test('a picked day in another zone keeps its calendar day in the helper zone', () => {
    // A picker in New York hands back Oct 15 00:00 New York time (04:00Z).
    const picked = new Date('2026-10-15T04:00:00Z');
    const stored = saigon.fromWallClock({ value: picked, sourceTz: NEW_YORK });

    expect(stored.toISOString()).toBe('2026-10-14T17:00:00.000Z');
    expect(saigon.format({ value: stored, pattern: 'DD/MM/YYYY HH:mm' })).toBe('15/10/2026 00:00');
    expect(saigon.toWallClock({ value: stored, targetTz: NEW_YORK }).toISOString()).toBe(
      picked.toISOString(),
    );
  });

  test('a wall time the target zone skips resolves forward', () => {
    const newYork = new TemporalHelper({ tz: NEW_YORK });
    // 02:30 on 2026-03-08 never happens in New York.
    const picked = new Date('2026-03-08T02:30:00Z');
    expect(newYork.fromWallClock({ value: picked, sourceTz: 'UTC' }).toISOString()).toBe(
      '2026-03-08T07:30:00.000Z',
    );
  });

  test('a bad zone is a 400', () => {
    expect(statusOf(() => saigon.fromWallClock({ value: 0, sourceTz: 'Mars/Base' }))).toBe(400);
  });

  test.each(['America/New_York', 'Asia/Tokyo'])(
    'the host zone is the default, under %s',
    (hostZone) => {
      const moduleSource = path.resolve(PACKAGE_ROOT, 'src/modules/temporal/index.ts');
      const script = `
      const { TemporalHelper } = await import('${moduleSource}');
      const helper = new TemporalHelper({ tz: 'Asia/Ho_Chi_Minh' });
      const picked = new Date(2026, 9, 15);
      const stored = helper.fromWallClock({ value: picked });
      const back = helper.toWallClock({ value: stored });
      console.log(TemporalHelper.getHostTz());
      console.log(helper.format({ value: stored, pattern: 'DD/MM/YYYY HH:mm' }));
      console.log(back.getTime() === picked.getTime());
    `;
      const run = spawnSyncBounded({
        cmd: [process.execPath, '-e', script],
        cwd: PACKAGE_ROOT,
        env: { ...process.env, TZ: hostZone },
        stderr: 'pipe',
      });

      expect(run.stdout.toString().trim().split('\n')).toEqual([
        hostZone,
        '15/10/2026 00:00',
        'true',
      ]);
    },
  );
});

describe('names do not depend on the host zone', () => {
  test('a host west of UTC writes the same month, weekday and date', () => {
    const moduleSource = path.resolve(PACKAGE_ROOT, 'src/modules/temporal/index.ts');
    const script = `
      const { TemporalHelper } = await import('${moduleSource}');
      const helper = new TemporalHelper({ tz: 'Asia/Ho_Chi_Minh', locale: 'en-US' });
      console.log(helper.format({ value: '2026-01-01T03:00:00+07:00', pattern: 'dddd ddd dd MMMM MMM L LL' }));
    `;
    const run = spawnSyncBounded({
      cmd: [process.execPath, '-e', script],
      cwd: PACKAGE_ROOT,
      env: { ...process.env, TZ: 'America/Los_Angeles' },
      stderr: 'pipe',
    });

    expect(run.stdout.toString().trim()).toBe(
      'Thursday Thu T January Jan 01/01/2026 January 1, 2026',
    );
  });
});

describe('a helper-wide fallback, and names matched by language', () => {
  const names = { 'vi-VN': { weekdaysShort: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] } };
  const helper = new TemporalHelper({
    tz: SAIGON,
    locale: 'vi-VN',
    names,
    fallback: 'Invalid Date',
  });

  test('format and formatIntl write the helper fallback; a call fallback still wins', () => {
    expect(helper.format({ value: null, pattern: 'DD/MM' })).toBe('Invalid Date');
    expect(helper.format({ value: 'not a date', pattern: 'DD/MM' })).toBe('Invalid Date');
    expect(helper.format({ value: null, pattern: 'DD/MM', fallback: '--' })).toBe('--');
    expect(helper.formatIntl({ value: undefined, options: { month: 'long' } })).toBe(
      'Invalid Date',
    );
    expect(helper.format({ value: VALUE, pattern: 'DD/MM' })).toBe('15/10');
  });

  test('clone keeps the fallback; a helper without one still refuses null', () => {
    expect(helper.clone({ locale: 'en-US' }).format({ value: null })).toBe('Invalid Date');
    expect(statusOf(() => new TemporalHelper().format({ value: JSON.parse('null') }))).toBe(400);
  });

  test('a call in another tag of the same language uses the entry', () => {
    expect(helper.format({ value: VALUE, pattern: 'ddd', locale: 'vi' })).toBe('T5');
    expect(helper.format({ value: VALUE, pattern: 'ddd', locale: 'vi-VN' })).toBe('T5');
    expect(helper.format({ value: VALUE, pattern: 'ddd', locale: 'en-US' })).toBe('Thu');
  });
});
