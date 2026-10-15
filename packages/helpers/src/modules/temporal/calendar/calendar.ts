import { TemporalUnits } from '../common/constants';
import type { TTemporalUnit } from '../common/constants';
import type { ITemporalParts, IZonedTemporalParts } from '../common/types';

const MILLISECONDS_PER_MINUTE = 60_000;
const MONTHS_PER_YEAR = 12;
const DAYS_PER_WEEK = 7;

/**
 * Calendar arithmetic on wall-clock fields, at a fixed offset or none at all - never a time zone,
 * never the host's. `TemporalHelper` brings the zone.
 */
export class TemporalCalendar {
  /** The years a four-digit `YYYY` spells - the range every method reads and writes. */
  static readonly MIN_YEAR = 1;
  static readonly MAX_YEAR = 9999;

  /** Units that measure elapsed time rather than the calendar - 24 hours is not always a day. */
  static readonly EXACT_UNIT_MILLISECONDS: Partial<Record<TTemporalUnit, number>> = {
    [TemporalUnits.MILLISECOND]: 1,
    [TemporalUnits.SECOND]: 1_000,
    [TemporalUnits.MINUTE]: 60_000,
    [TemporalUnits.HOUR]: 3_600_000,
  };

  /** A UTC scratch date - `Date.UTC` maps years 0-99 onto 1900-1999, `setUTCFullYear` does not. */
  private static scratch(opts: { year: number; month: number; day: number }): Date {
    const date = new Date(0);
    date.setUTCFullYear(opts.year, opts.month - 1, opts.day);
    return date;
  }

  static isSupportedYear(opts: { year: number }): boolean {
    return opts.year >= TemporalCalendar.MIN_YEAR && opts.year <= TemporalCalendar.MAX_YEAR;
  }

  static daysInMonth(opts: { year: number; month: number }): number {
    return TemporalCalendar.scratch({
      year: opts.year,
      month: opts.month + 1,
      day: 0,
    }).getUTCDate();
  }

  /** Whether the fields name a day and a time the calendar has - Feb 30, 24:00 and year 0 do not. */
  static isRealDateTime(opts: { parts: ITemporalParts }): boolean {
    const { year, month, day, hour, minute, second, millisecond } = opts.parts;

    return (
      TemporalCalendar.isSupportedYear({ year }) &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= TemporalCalendar.daysInMonth({ year, month }) &&
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59 &&
      second >= 0 &&
      second <= 59 &&
      millisecond >= 0 &&
      millisecond <= 999
    );
  }

  /** Epoch milliseconds of wall-clock fields read at a fixed offset. */
  static epochAtOffset(opts: { parts: ITemporalParts; offsetMilliseconds: number }): number {
    const { parts, offsetMilliseconds } = opts;
    const date = TemporalCalendar.scratch({
      year: parts.year,
      month: parts.month,
      day: parts.day,
    });
    date.setUTCHours(parts.hour, parts.minute, parts.second, parts.millisecond);
    return date.getTime() - offsetMilliseconds;
  }

  /** The wall clock an instant shows at a fixed offset - pure arithmetic, never the host's zone. */
  static wallClockAt(opts: { epoch: number; offsetMilliseconds: number }): IZonedTemporalParts {
    const { epoch, offsetMilliseconds } = opts;
    const date = new Date(epoch + offsetMilliseconds);

    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
      millisecond: date.getUTCMilliseconds(),
      // `getUTCDay` counts Sunday as 0; ISO counts Monday as 1 and Sunday as 7.
      dayOfWeek: ((date.getUTCDay() + 6) % 7) + 1,
      offsetMinutes: offsetMilliseconds / MILLISECONDS_PER_MINUTE,
    };
  }

  /** The wall-clock fields alone, without the weekday and the offset. */
  static wallClockOf(opts: { parts: ITemporalParts }): ITemporalParts {
    const { year, month, day, hour, minute, second, millisecond } = opts.parts;
    return { year, month, day, hour, minute, second, millisecond };
  }

  /** The wall-clock start of the unit holding `parts`. Weeks start on Monday; quarters in Jan, Apr, Jul, Oct. */
  static truncate(opts: { parts: IZonedTemporalParts; unit: TTemporalUnit }): ITemporalParts {
    const { parts, unit } = opts;
    const wall = TemporalCalendar.wallClockOf({ parts });
    const midnight = { ...wall, hour: 0, minute: 0, second: 0, millisecond: 0 };

    switch (unit) {
      case TemporalUnits.SECOND: {
        return { ...wall, millisecond: 0 };
      }
      case TemporalUnits.MINUTE: {
        return { ...wall, second: 0, millisecond: 0 };
      }
      case TemporalUnits.HOUR: {
        return { ...wall, minute: 0, second: 0, millisecond: 0 };
      }
      case TemporalUnits.DAY: {
        return midnight;
      }
      case TemporalUnits.WEEK: {
        return TemporalCalendar.shift({
          parts: midnight,
          amount: 1 - parts.dayOfWeek,
          unit: TemporalUnits.DAY,
        });
      }
      case TemporalUnits.MONTH: {
        return { ...midnight, day: 1 };
      }
      case TemporalUnits.QUARTER: {
        return { ...midnight, month: Math.floor((wall.month - 1) / 3) * 3 + 1, day: 1 };
      }
      default: {
        return { ...midnight, month: 1, day: 1 };
      }
    }
  }

  /**
   * `parts` moved by whole units on the wall clock - no time zone involved. Hours and smaller move
   * elapsed time; days and weeks move the calendar date, wall time untouched; months, quarters and
   * years move the month, the day clamped to the target month: Jan 31 + 1 month is Feb 28.
   */
  static shift(opts: {
    parts: ITemporalParts;
    amount: number;
    unit: TTemporalUnit;
  }): ITemporalParts {
    const { parts, amount, unit } = opts;

    const exact = TemporalCalendar.EXACT_UNIT_MILLISECONDS[unit];
    if (exact !== undefined) {
      const epoch =
        TemporalCalendar.epochAtOffset({ parts, offsetMilliseconds: 0 }) + amount * exact;
      return TemporalCalendar.wallClockOf({
        parts: TemporalCalendar.wallClockAt({ epoch, offsetMilliseconds: 0 }),
      });
    }

    if (unit === TemporalUnits.DAY || unit === TemporalUnits.WEEK) {
      const days = unit === TemporalUnits.WEEK ? amount * DAYS_PER_WEEK : amount;
      const date = TemporalCalendar.scratch({
        year: parts.year,
        month: parts.month,
        day: parts.day + days,
      });
      return {
        ...parts,
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
      };
    }

    const monthsPerUnit =
      unit === TemporalUnits.QUARTER ? 3 : unit === TemporalUnits.YEAR ? MONTHS_PER_YEAR : 1;
    const total = parts.year * MONTHS_PER_YEAR + (parts.month - 1) + amount * monthsPerUnit;
    const year = Math.floor(total / MONTHS_PER_YEAR);
    const month = total - year * MONTHS_PER_YEAR + 1;

    return {
      ...parts,
      year,
      month,
      day: Math.min(parts.day, TemporalCalendar.daysInMonth({ year, month })),
    };
  }
}
