import { describe, expect, setSystemTime, test } from 'bun:test';
import path from 'node:path';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import { DateTime } from 'luxon';
import {
  DayjsTemporalAdapter,
  LuxonTemporalAdapter,
  NativeTemporalAdapter,
  TemporalHelper,
  TemporalUnits,
} from '@/modules/temporal';
import type { ITemporalAdapter, TTemporalUnit } from '@/modules/temporal';
import { PACKAGE_ROOT } from '../package-root';

dayjs.extend(utc);
dayjs.extend(timezone);

const SAIGON = 'Asia/Ho_Chi_Minh';
const NEW_YORK = 'America/New_York';
const LORD_HOWE = 'Australia/Lord_Howe';

const adapters: Array<{ name: string; build: () => ITemporalAdapter }> = [
  { name: 'native Temporal', build: () => new NativeTemporalAdapter() },
  { name: 'dayjs', build: () => new DayjsTemporalAdapter({ dayjs }) },
  { name: 'luxon', build: () => new LuxonTemporalAdapter({ DateTime }) },
];

const iso = (value: Date): string => value.toISOString();

/** The status code a call throws with, or undefined when it does not throw. */
const statusOf = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? Reflect.get(error, 'statusCode') : error;
  }
  return undefined;
};

for (const { name, build } of adapters) {
  describe(`TemporalHelper over ${name}`, () => {
    const saigon = new TemporalHelper({ adapter: build(), timeZone: SAIGON });
    const newYork = new TemporalHelper({ adapter: build(), timeZone: NEW_YORK });
    const lordHowe = new TemporalHelper({ adapter: build(), timeZone: LORD_HOWE });

    describe('time zones', () => {
      test('reads the wall clock an instant shows in the zone', () => {
        const parts = saigon.parts({ value: '2026-09-19T00:00:00Z' });

        expect(parts).toEqual({
          year: 2026,
          month: 9,
          day: 19,
          hour: 7,
          minute: 0,
          second: 0,
          millisecond: 0,
          dayOfWeek: 6,
          offsetMinutes: 420,
        });
      });

      test('a per-call timeZone overrides the helper default', () => {
        expect(saigon.parts({ value: '2026-09-19T00:00:00Z', timeZone: 'UTC' }).hour).toBe(0);
      });

      test('a wall time a daylight-saving jump skips resolves forward past the gap', () => {
        // 2026-03-08 02:30 never happens in New York: clocks go 01:59 EST -> 03:00 EDT.
        expect(iso(newYork.parse({ value: '2026-03-08 02:30', pattern: 'YYYY-MM-DD HH:mm' }))).toBe(
          '2026-03-08T07:30:00.000Z',
        );
      });

      test('a wall time that happens twice resolves to the earlier one', () => {
        // 2026-11-01 01:30 happens in EDT (-04:00) and again in EST (-05:00).
        expect(iso(newYork.parse({ value: '2026-11-01 01:30', pattern: 'YYYY-MM-DD HH:mm' }))).toBe(
          '2026-11-01T05:30:00.000Z',
        );
      });

      test('an unknown time zone is refused when the helper is built', () => {
        expect(() => new TemporalHelper({ adapter: build(), timeZone: 'Mars/Olympus' })).toThrow(
          /time zone/i,
        );
      });
    });

    describe('parse and format', () => {
      test('parses a compact pattern as wall clock in the zone - the VNPay timestamp', () => {
        const paid = saigon.parse({ value: '20260919120000', pattern: 'YYYYMMDDHHmmss' });
        expect(iso(paid)).toBe('2026-09-19T05:00:00.000Z');
      });

      test('an offset in the value wins over the zone', () => {
        const value = saigon.parse({
          value: '2026-09-19 12:00 +0000',
          pattern: 'YYYY-MM-DD HH:mm ZZ',
        });
        expect(iso(value)).toBe('2026-09-19T12:00:00.000Z');
      });

      test('with no pattern, ISO 8601 - an offset is exact, none is wall clock in the zone', () => {
        expect(iso(saigon.parse({ value: '2026-09-19T12:00:00+07:00' }))).toBe(
          '2026-09-19T05:00:00.000Z',
        );
        expect(iso(saigon.parse({ value: '2026-09-19T12:00:00' }))).toBe(
          '2026-09-19T05:00:00.000Z',
        );
        expect(iso(saigon.parse({ value: '2026-09-19' }))).toBe('2026-09-18T17:00:00.000Z');
      });

      test('formats ISO 8601 with the zone offset by default', () => {
        expect(saigon.format({ value: '2026-09-19T05:00:00Z' })).toBe(
          '2026-09-19T12:00:00.000+07:00',
        );
      });

      test('formats a pattern, with literals in brackets', () => {
        const text = saigon.format({
          value: '2026-09-19T05:04:03.021Z',
          pattern: '[on] D/M/YYYY [at] H:mm:ss.SSS ZZ',
        });
        expect(text).toBe('on 19/9/2026 at 12:04:03.021 +0700');
      });

      test('YY writes the last two digits of the year', () => {
        expect(saigon.format({ value: '2026-09-19T05:00:00Z', pattern: 'DD/MM/YY' })).toBe(
          '19/09/26',
        );
        expect(saigon.format({ value: '2005-01-02T05:00:00Z', pattern: 'YY' })).toBe('05');
      });

      // The pivot dayjs and moment use: 00-68 is 2000-2068, 69-99 is 1969-1999.
      test.each([
        ['260919', '2026-09-19'],
        ['680101', '2068-01-01'],
        ['690101', '1969-01-01'],
        ['991231', '1999-12-31'],
      ])('YY reads %s as %s', (value, expected) => {
        const parsed = saigon.parse({ value, pattern: 'YYMMDD' });
        expect(saigon.format({ value: parsed, pattern: 'YYYY-MM-DD' })).toBe(expected);
      });

      test('a value that does not match its pattern is refused', () => {
        expect(() => saigon.parse({ value: '2026-09-19', pattern: 'YYYYMMDD' })).toThrow(
          /does not match/,
        );
      });

      test('a date the calendar does not have is refused, not rolled over', () => {
        expect(() => saigon.parse({ value: '2026-02-30', pattern: 'YYYY-MM-DD' })).toThrow(
          /not a real/,
        );
      });

      test('a token this dialect does not have is refused at the pattern, not guessed', () => {
        expect(() => saigon.format({ value: new Date(), pattern: 'yyyy-MM-dd' })).toThrow(/token/);
      });
    });

    describe('calendar arithmetic', () => {
      test('adding a month clamps to the last day instead of spilling over', () => {
        const value = saigon.parse({ value: '2026-01-31 10:00', pattern: 'YYYY-MM-DD HH:mm' });
        const next = saigon.add({ value, amount: 1, unit: TemporalUnits.MONTH });
        expect(saigon.format({ value: next, pattern: 'YYYY-MM-DD HH:mm' })).toBe(
          '2026-02-28 10:00',
        );
      });

      test('a day across a daylight-saving jump keeps the wall time; 24 hours does not', () => {
        const before = newYork.parse({ value: '2026-03-07 12:00', pattern: 'YYYY-MM-DD HH:mm' });

        const plusDay = newYork.add({ value: before, amount: 1, unit: TemporalUnits.DAY });
        const plusHours = newYork.add({ value: before, amount: 24, unit: TemporalUnits.HOUR });

        expect(newYork.format({ value: plusDay, pattern: 'HH:mm' })).toBe('12:00');
        expect(newYork.format({ value: plusHours, pattern: 'HH:mm' })).toBe('13:00');
      });

      test('subtract is add with the sign flipped', () => {
        const value = new Date('2026-09-19T05:00:00Z');
        expect(saigon.subtract({ value, amount: 2, unit: TemporalUnits.YEAR })).toEqual(
          saigon.add({ value, amount: -2, unit: TemporalUnits.YEAR }),
        );
      });

      test('a leap day plus a year lands on the 28th', () => {
        const value = saigon.parse({ value: '2028-02-29', pattern: 'YYYY-MM-DD' });
        const next = saigon.add({ value, amount: 1, unit: TemporalUnits.YEAR });
        expect(saigon.format({ value: next, pattern: 'YYYY-MM-DD' })).toBe('2029-02-28');
      });

      test('a fractional amount is refused', () => {
        expect(() =>
          saigon.add({ value: new Date(), amount: 1.5, unit: TemporalUnits.DAY }),
        ).toThrow(/integer/);
      });
    });

    describe('startOf and endOf', () => {
      const value = '2026-09-19T05:04:03.021Z'; // Saturday 12:04 in Saigon

      test.each<[TTemporalUnit, string]>([
        [TemporalUnits.SECOND, '2026-09-19 12:04:03.000'],
        [TemporalUnits.MINUTE, '2026-09-19 12:04:00.000'],
        [TemporalUnits.HOUR, '2026-09-19 12:00:00.000'],
        [TemporalUnits.DAY, '2026-09-19 00:00:00.000'],
        [TemporalUnits.WEEK, '2026-09-14 00:00:00.000'],
        [TemporalUnits.MONTH, '2026-09-01 00:00:00.000'],
        [TemporalUnits.YEAR, '2026-01-01 00:00:00.000'],
      ])('startOf %s in the zone', (unit, expected) => {
        const start = saigon.startOf({ value, unit });
        expect(saigon.format({ value: start, pattern: 'YYYY-MM-DD HH:mm:ss.SSS' })).toBe(expected);
      });

      test('endOf is one millisecond before the next start', () => {
        const end = saigon.endOf({ value, unit: TemporalUnits.MONTH });
        expect(saigon.format({ value: end, pattern: 'YYYY-MM-DD HH:mm:ss.SSS' })).toBe(
          '2026-09-30 23:59:59.999',
        );
      });
    });

    describe('weekdays', () => {
      test('reads the weekday in the zone, not in UTC', () => {
        // Friday 20:00 UTC is already Saturday 03:00 in Saigon.
        expect(saigon.isWeekday({ value: '2026-09-18T20:00:00Z' })).toBe(false);
        expect(saigon.isWeekday({ value: '2026-09-18T20:00:00Z', timeZone: 'UTC' })).toBe(true);
      });

      test('next and previous weekday skip the weekend', () => {
        const saturday = '2026-09-19T05:00:00Z';
        expect(
          saigon.format({ value: saigon.nextWeekday({ value: saturday }), pattern: 'YYYY-MM-DD' }),
        ).toBe('2026-09-21');
        expect(
          saigon.format({
            value: saigon.previousWeekday({ value: saturday }),
            pattern: 'YYYY-MM-DD',
          }),
        ).toBe('2026-09-18');
      });
    });

    describe('a time the clock repeats', () => {
      // 2026-11-01 01:00-01:59 happens in EDT (05:xx Z) and again in EST (06:xx Z).
      const secondPass = '2026-11-01T06:30:15.500Z';
      const firstPass = '2026-11-01T05:30:15.500Z';

      test.each<[TTemporalUnit, string, string]>([
        [TemporalUnits.MINUTE, '2026-11-01T06:30:00.000Z', '2026-11-01T06:30:59.999Z'],
        [TemporalUnits.HOUR, '2026-11-01T06:00:00.000Z', '2026-11-01T06:59:59.999Z'],
        [TemporalUnits.DAY, '2026-11-01T04:00:00.000Z', '2026-11-02T04:59:59.999Z'],
      ])('the second pass keeps its own %s', (unit, start, end) => {
        const value = secondPass;
        expect(iso(newYork.startOf({ value, unit }))).toBe(start);
        expect(iso(newYork.endOf({ value, unit }))).toBe(end);
      });

      test('the first pass ends its hour when the clock goes back', () => {
        expect(iso(newYork.startOf({ value: firstPass, unit: TemporalUnits.HOUR }))).toBe(
          '2026-11-01T05:00:00.000Z',
        );
        expect(iso(newYork.endOf({ value: firstPass, unit: TemporalUnits.HOUR }))).toBe(
          '2026-11-01T05:59:59.999Z',
        );
      });

      test('adding nothing leaves the instant where it was', () => {
        expect(iso(newYork.add({ value: secondPass, amount: 0, unit: TemporalUnits.DAY }))).toBe(
          secondPass,
        );
      });

      // Lord Howe moves by 30 minutes: 02:00 +11:00 goes back to 01:30 +10:30, so its 01:00 hour
      // runs 90 minutes, and a 02:00 that is skipped in October starts the hour at 02:30.
      test('an hour stretched by a 30-minute repeat holds its whole length', () => {
        const value = '2026-04-04T15:15:00.000Z'; // the second 01:45
        expect(iso(lordHowe.startOf({ value, unit: TemporalUnits.HOUR }))).toBe(
          '2026-04-04T14:00:00.000Z',
        );
        expect(iso(lordHowe.endOf({ value, unit: TemporalUnits.HOUR }))).toBe(
          '2026-04-04T15:29:59.999Z',
        );
      });

      test('an hour shortened by a 30-minute jump starts where the clock lands', () => {
        const value = '2026-10-03T15:45:00.000Z'; // 02:45 +11:00
        expect(iso(lordHowe.startOf({ value, unit: TemporalUnits.HOUR }))).toBe(
          '2026-10-03T15:30:00.000Z',
        );
        expect(iso(lordHowe.endOf({ value, unit: TemporalUnits.HOUR }))).toBe(
          '2026-10-03T15:59:59.999Z',
        );
      });

      test('the earlier pass is chosen whatever today is', () => {
        // Libraries guess an offset from today first: in winter a naive guess lands on EST.
        setSystemTime(new Date('2027-01-15T12:00:00Z'));
        try {
          expect(
            iso(newYork.parse({ value: '2026-11-01 01:30', pattern: 'YYYY-MM-DD HH:mm' })),
          ).toBe('2026-11-01T05:30:00.000Z');
          expect(
            iso(lordHowe.parse({ value: '2026-04-05 01:45', pattern: 'YYYY-MM-DD HH:mm' })),
          ).toBe('2026-04-04T14:45:00.000Z');
        } finally {
          setSystemTime();
        }
      });
    });

    describe('limits', () => {
      const universal = new TemporalHelper({ adapter: build() });

      test('a year below 100 is that year, not 19xx', () => {
        const value = universal.parse({ value: '0050-06-15' });
        expect(universal.format({ value })).toBe('0050-06-15T00:00:00.000+00:00');
        expect(iso(universal.add({ value, amount: 1, unit: TemporalUnits.MONTH }))).toBe(
          '0050-07-15T00:00:00.000Z',
        );
      });

      test.each<[string, { amount: number; unit: TTemporalUnit }]>([
        ['elapsed time', { amount: 1e20, unit: TemporalUnits.MILLISECOND }],
        ['years', { amount: 300_000, unit: TemporalUnits.YEAR }],
        ['days', { amount: 5_000_000, unit: TemporalUnits.DAY }],
      ])('adding past year 9999 in %s is a 400, never an Invalid Date', (_label, move) => {
        const run = () =>
          universal.add({ value: '2026-01-01T00:00:00Z', amount: move.amount, unit: move.unit });
        expect(statusOf(run)).toBe(400);
      });

      test('an offset with seconds - historic local mean time - reads back what it wrote', () => {
        const value = new Date('1900-01-01T00:00:00Z');
        expect(saigon.parse({ value: saigon.format({ value }) })).toEqual(value);
      });

      test('an unknown zone on an elapsed-time add is refused like any other', () => {
        const run = () =>
          universal.add({
            value: 0,
            amount: 1,
            unit: TemporalUnits.HOUR,
            timeZone: 'Mars/Olympus',
          });
        expect(statusOf(run)).toBe(400);
      });

      test('the adapter itself refuses an unknown zone with a 400', () => {
        const run = () =>
          build().getOffsetMilliseconds({ value: new Date(0), timeZone: 'Mars/Olympus' });
        expect(statusOf(run)).toBe(400);
      });
    });
  });
}

describe('adapters refuse a library they cannot drive', () => {
  // Node 24 without --harmony-temporal: no global, and nothing passed in.
  test('native Temporal missing names the way out', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Temporal');
    Reflect.deleteProperty(globalThis, 'Temporal');
    try {
      expect(() => new NativeTemporalAdapter()).toThrow(/Temporal is not available/);
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, 'Temporal', descriptor);
      }
    }
  });

  // A JavaScript caller, or one whose dayjs types carry the plugin but whose runtime never extended it.
  test('dayjs without the timezone plugin names the plugin', () => {
    const bare = { dayjs: () => undefined };
    expect(() => Reflect.construct(DayjsTemporalAdapter, [bare])).toThrow(/timezone/);
  });
});

describe('TemporalHelper input', () => {
  const helper = new TemporalHelper({ adapter: new NativeTemporalAdapter(), timeZone: SAIGON });

  test('takes a Date, epoch milliseconds or an ISO string as the same instant', () => {
    const instant = new Date('2026-09-19T05:00:00Z');
    expect(helper.toDate({ value: instant })).toEqual(instant);
    expect(helper.toDate({ value: instant.getTime() })).toEqual(instant);
    expect(helper.toDate({ value: '2026-09-19T05:00:00Z' })).toEqual(instant);
  });

  test('an invalid Date is refused, not formatted as NaN', () => {
    expect(() => helper.format({ value: new Date('nope') })).toThrow(/invalid/i);
  });

  test('a helper built without a zone computes in UTC', () => {
    const plain = new TemporalHelper({ adapter: new NativeTemporalAdapter() });
    expect(plain.format({ value: '2026-09-19T05:00:00Z' })).toBe('2026-09-19T05:00:00.000+00:00');
  });
});

describe('TemporalPattern tokens', () => {
  const helper = new TemporalHelper({ adapter: new NativeTemporalAdapter(), timeZone: SAIGON });

  // Month and day names are dayjs and moment tokens; read greedily they came out as digits.
  test.each(['DD MMM YYYY', 'MMMM', 'DDDD', 'HHH', 'ZZZ', 'Do', 'SS', 'YYYYY'])(
    "'%s' is refused, not split into smaller tokens",
    pattern => {
      expect(() => helper.format({ value: 0, pattern })).toThrow(/unknown token/);
    },
  );
});

describe('TemporalHelper offsets', () => {
  const helper = new TemporalHelper({ adapter: new NativeTemporalAdapter(), timeZone: SAIGON });

  test('an offset with seconds is written and read in full', () => {
    expect(helper.format({ value: '1900-01-01T00:00:00Z', timeZone: SAIGON })).toBe(
      '1900-01-01T07:06:30.000+07:06:30',
    );
    expect(iso(helper.parse({ value: '2026-01-01T00:00:00+07:06:40' }))).toBe(
      '2025-12-31T16:53:20.000Z',
    );
    expect(
      iso(helper.parse({ value: '2026-01-01 00:00 +070640', pattern: 'YYYY-MM-DD HH:mm ZZ' })),
    ).toBe('2025-12-31T16:53:20.000Z');
  });

  test.each([
    ['2026-01-01T00:00:00+05:75', undefined],
    ['2026-01-01T00:00:00+24:00', undefined],
    ['2026-01-01 00:00 +0575', 'YYYY-MM-DD HH:mm ZZ'],
    ['2026-01-01 00:00 +07:00:60', 'YYYY-MM-DD HH:mm Z'],
  ])("'%s' is refused, not rolled over", (value, pattern) => {
    expect(statusOf(() => helper.parse({ value, pattern }))).toBe(400);
  });

  // ISO 8601 allows an hour-only offset; Temporal.Instant.from accepts it too.
  test.each([
    ['2026-09-19T12:00+07', '2026-09-19T05:00:00.000Z'],
    ['2026-09-19T12:00:00-05', '2026-09-19T17:00:00.000Z'],
  ])("'%s' reads an hour-only offset", (value, expected) => {
    expect(iso(helper.parse({ value }))).toBe(expected);
  });

  test('an offset with no time is refused, so a date is never read as a date plus an hour', () => {
    expect(statusOf(() => helper.parse({ value: '2026-09-19-05' }))).toBe(400);
    expect(statusOf(() => helper.parse({ value: '2026-09-19Z' }))).toBe(400);
  });

  test('year 0 and year 10000 are refused', () => {
    expect(statusOf(() => helper.parse({ value: '0000-06-15' }))).toBe(400);
    expect(statusOf(() => helper.toDate({ value: Date.UTC(10_000, 0, 1) }))).toBe(400);
  });
});

describe('TemporalHelper and the host zone', () => {
  // 2026-03-07T19:30Z is 02:30 in Saigon - inside New York's own spring-forward gap, where dayjs's
  // own format() reads the wall clock back in host time and lands an hour late.
  test.each(['NativeTemporalAdapter', 'LuxonTemporalAdapter', 'DayjsTemporalAdapter'])(
    '%s answers the same under a host zone with daylight saving',
    adapterName => {
      const moduleSource = path.resolve(PACKAGE_ROOT, 'src/modules/temporal/index.ts');
      const script = `
        const { DateTime } = await import('luxon');
        const dayjs = (await import('dayjs')).default;
        dayjs.extend((await import('dayjs/plugin/utc.js')).default);
        dayjs.extend((await import('dayjs/plugin/timezone.js')).default);
        const temporal = await import('${moduleSource}');
        const adapters = {
          NativeTemporalAdapter: () => new temporal.NativeTemporalAdapter(),
          LuxonTemporalAdapter: () => new temporal.LuxonTemporalAdapter({ DateTime }),
          DayjsTemporalAdapter: () => new temporal.DayjsTemporalAdapter({ dayjs }),
        };
        const helper = new temporal.TemporalHelper({
          adapter: adapters['${adapterName}'](),
          timeZone: 'Asia/Ho_Chi_Minh',
        });
        const value = '2026-03-07T19:30:00Z';
        console.log(helper.format({ value }));
        console.log(dayjs(value).tz('Asia/Ho_Chi_Minh').format());
      `;
      const run = Bun.spawnSync({
        cmd: [process.execPath, '-e', script],
        cwd: PACKAGE_ROOT,
        env: { ...process.env, TZ: 'America/New_York' },
        stderr: 'pipe',
      });
      const [helperLine, rawDayjsLine] = run.stdout.toString().trim().split('\n');

      expect(helperLine).toBe('2026-03-08T02:30:00.000+07:00');
      // The control: the host zone really is in play, since dayjs's own format() is thrown off.
      expect(rawDayjsLine).toBe('2026-03-08T03:30:00+07:00');
    },
  );
});
