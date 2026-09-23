import { TemporalUnits } from './common/constants';
import type { TTemporalUnit } from './common/constants';
import type { ITemporalParts, IZonedTemporalParts } from './common/types';

/** The years a four-digit `YYYY` spells - the range every method reads and writes. */
export const MIN_TEMPORAL_YEAR = 1;
export const MAX_TEMPORAL_YEAR = 9999;

const MILLISECONDS_PER_MINUTE = 60_000;

/** A UTC scratch date for calendar math - `Date.UTC` maps years 0-99 onto 1900-1999, `setUTCFullYear` does not. */
const calendarDate = (opts: { year: number; month: number; day: number }): Date => {
  const date = new Date(0);
  date.setUTCFullYear(opts.year, opts.month - 1, opts.day);
  return date;
};

export const isSupportedYear = (year: number): boolean =>
  year >= MIN_TEMPORAL_YEAR && year <= MAX_TEMPORAL_YEAR;

export const daysInMonth = (opts: { year: number; month: number }): number =>
  calendarDate({ year: opts.year, month: opts.month + 1, day: 0 }).getUTCDate();

/** `parts` moved by whole days on the calendar, wall time untouched. */
export const shiftDays = (opts: { parts: ITemporalParts; days: number }): ITemporalParts => {
  const { parts, days } = opts;
  const date = calendarDate({ year: parts.year, month: parts.month, day: parts.day + days });

  return {
    ...parts,
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
};

/** `parts` moved by whole months, the day clamped to the target month: Jan 31 + 1 month is Feb 28. */
export const shiftMonths = (opts: { parts: ITemporalParts; months: number }): ITemporalParts => {
  const { parts, months } = opts;
  const total = parts.year * 12 + (parts.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12 + 1;

  return { ...parts, year, month, day: Math.min(parts.day, daysInMonth({ year, month })) };
};

/** Whether the fields name a day and a time the calendar has - Feb 30, 24:00 and year 0 do not. */
export const isRealDateTime = (opts: { parts: ITemporalParts }): boolean => {
  const { year, month, day, hour, minute, second, millisecond } = opts.parts;

  return (
    isSupportedYear(year) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth({ year, month }) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59 &&
    millisecond >= 0 &&
    millisecond <= 999
  );
};

/** Epoch milliseconds of wall-clock fields read at a fixed offset. */
export const epochAtOffset = (opts: {
  parts: ITemporalParts;
  offsetMilliseconds: number;
}): number => {
  const { parts, offsetMilliseconds } = opts;
  const date = calendarDate({ year: parts.year, month: parts.month, day: parts.day });
  date.setUTCHours(parts.hour, parts.minute, parts.second, parts.millisecond);
  return date.getTime() - offsetMilliseconds;
};

/** The wall clock an instant shows at a fixed offset - pure arithmetic, never the host's zone. */
export const wallClockAt = (opts: {
  epoch: number;
  offsetMilliseconds: number;
}): IZonedTemporalParts => {
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
};

/** Units that measure elapsed time rather than the calendar - 24 hours is not always a day. */
export const EXACT_UNIT_MILLISECONDS: Partial<Record<TTemporalUnit, number>> = {
  [TemporalUnits.MILLISECOND]: 1,
  [TemporalUnits.SECOND]: 1_000,
  [TemporalUnits.MINUTE]: 60_000,
  [TemporalUnits.HOUR]: 3_600_000,
};

/** The wall-clock fields alone, without the weekday and the offset. */
export const wallClockOf = (opts: { parts: ITemporalParts }): ITemporalParts => {
  const { year, month, day, hour, minute, second, millisecond } = opts.parts;
  return { year, month, day, hour, minute, second, millisecond };
};

/** The wall-clock start of the unit holding `parts`. Weeks start on Monday. */
export const truncateTo = (opts: {
  parts: IZonedTemporalParts;
  unit: TTemporalUnit;
}): ITemporalParts => {
  const { parts, unit } = opts;
  const wall = wallClockOf({ parts });

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
      return { ...wall, hour: 0, minute: 0, second: 0, millisecond: 0 };
    }
    case TemporalUnits.WEEK: {
      const midnight = { ...wall, hour: 0, minute: 0, second: 0, millisecond: 0 };
      return shiftDays({ parts: midnight, days: 1 - parts.dayOfWeek });
    }
    case TemporalUnits.MONTH: {
      return { ...wall, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 };
    }
    default: {
      return { ...wall, month: 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 };
    }
  }
};

/** `parts` moved by whole units on the wall clock - no time zone involved. */
export const shiftWallClock = (opts: {
  parts: ITemporalParts;
  amount: number;
  unit: TTemporalUnit;
}): ITemporalParts => {
  const { parts, amount, unit } = opts;
  const exact = EXACT_UNIT_MILLISECONDS[unit];
  if (exact !== undefined) {
    const epoch = epochAtOffset({ parts, offsetMilliseconds: 0 }) + amount * exact;
    return wallClockOf({ parts: wallClockAt({ epoch, offsetMilliseconds: 0 }) });
  }

  switch (unit) {
    case TemporalUnits.DAY: {
      return shiftDays({ parts, days: amount });
    }
    case TemporalUnits.WEEK: {
      return shiftDays({ parts, days: amount * 7 });
    }
    case TemporalUnits.MONTH: {
      return shiftMonths({ parts, months: amount });
    }
    default: {
      return shiftMonths({ parts, months: amount * 12 });
    }
  }
};
