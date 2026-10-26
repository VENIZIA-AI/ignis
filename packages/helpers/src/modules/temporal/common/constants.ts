import type { TConstValue } from '@/common/types';

/** Units `add`, `subtract`, `startOf` and `endOf` accept. Weeks are ISO weeks - they start on Monday; a quarter is three calendar months from January, April, July or October. */
export class TemporalUnits {
  static readonly MILLISECOND = 'millisecond';
  static readonly SECOND = 'second';
  static readonly MINUTE = 'minute';
  static readonly HOUR = 'hour';
  static readonly DAY = 'day';
  static readonly WEEK = 'week';
  static readonly MONTH = 'month';
  static readonly QUARTER = 'quarter';
  static readonly YEAR = 'year';

  static readonly SCHEME_SET = new Set([
    this.MILLISECOND,
    this.SECOND,
    this.MINUTE,
    this.HOUR,
    this.DAY,
    this.WEEK,
    this.MONTH,
    this.QUARTER,
    this.YEAR,
  ]);

  static isValid(input: string): input is TTemporalUnit {
    return this.SCHEME_SET.has(input);
  }
}

export type TTemporalUnit = TConstValue<typeof TemporalUnits>;

/** A helper built without a `tz` computes in UTC - never in the host's zone, which differs per machine. */
export const DEFAULT_TEMPORAL_TZ = 'UTC';

/** `format` with no pattern writes ISO 8601 with the zone's offset: `2026-09-19T12:00:00.000+07:00`. */
export const DEFAULT_TEMPORAL_PATTERN = 'YYYY-MM-DDTHH:mm:ss.SSSZ';

/** The locale name tokens and `formatIntl` write in when a helper is built without one. */
export const DEFAULT_TEMPORAL_LOCALE = 'en-US';

/** How `formatDuration` writes: `compact` is `1d1h30m`; the others are the locale's own unit words. */
export class TemporalDurationStyles {
  static readonly COMPACT = 'compact';
  static readonly NARROW = 'narrow';
  static readonly SHORT = 'short';
  static readonly LONG = 'long';

  static readonly SCHEME_SET = new Set([this.COMPACT, this.NARROW, this.SHORT, this.LONG]);

  static isValid(input: string): input is TTemporalDurationStyle {
    return this.SCHEME_SET.has(input);
  }
}

export type TTemporalDurationStyle = TConstValue<typeof TemporalDurationStyles>;

/** Which ends of the range `isBetween` counts: `[` includes an end, `(` leaves it out. */
export class TemporalInclusivities {
  static readonly EXCLUSIVE = '()';
  static readonly INCLUSIVE = '[]';
  static readonly START_ONLY = '[)';
  static readonly END_ONLY = '(]';

  static readonly SCHEME_SET = new Set([
    this.EXCLUSIVE,
    this.INCLUSIVE,
    this.START_ONLY,
    this.END_ONLY,
  ]);

  static isValid(input: string): input is TTemporalInclusivity {
    return this.SCHEME_SET.has(input);
  }
}

export type TTemporalInclusivity = TConstValue<typeof TemporalInclusivities>;

/** How long a month or weekday name is written: NARROW (`M`), SHORT (`Mon`) or LONG (`Monday`). */
export class TemporalNameWidths {
  static readonly NARROW = 'narrow';
  static readonly SHORT = 'short';
  static readonly LONG = 'long';

  static readonly SCHEME_SET = new Set<string>([this.NARROW, this.SHORT, this.LONG]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** Valid name width values. */
export type TTemporalNameWidth = TConstValue<typeof TemporalNameWidths>;

/** A month name has no narrow form here: SHORT or LONG. */
export type TTemporalMonthNameWidth = Exclude<TTemporalNameWidth, typeof TemporalNameWidths.NARROW>;

/** How `writtenDate` writes a date: NUMERIC is `10/14/2026`, LONG is `October 14, 2026`. */
export class TemporalWrittenDateStyles {
  static readonly NUMERIC = 'numeric';
  static readonly LONG = 'long';

  static readonly SCHEME_SET = new Set<string>([this.NUMERIC, this.LONG]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** Valid written date style values. */
export type TTemporalWrittenDateStyle = TConstValue<typeof TemporalWrittenDateStyles>;
