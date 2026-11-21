import type { TConstValue } from '@/common/types';
import { ConstClass } from '@/common/const-class';

/** Units `add`, `subtract`, `startOf` and `endOf` accept. Weeks are ISO weeks - they start on Monday; a quarter is three calendar months from January, April, July or October. */
export class TemporalUnits extends ConstClass {
  static readonly MILLISECOND = 'millisecond';
  static readonly SECOND = 'second';
  static readonly MINUTE = 'minute';
  static readonly HOUR = 'hour';
  static readonly DAY = 'day';
  static readonly WEEK = 'week';
  static readonly MONTH = 'month';
  static readonly QUARTER = 'quarter';
  static readonly YEAR = 'year';
}

/** A value of {@link TemporalUnits}. */
export type TTemporalUnit = TConstValue<typeof TemporalUnits>;

/** A helper built without a `tz` computes in UTC - never in the host's zone, which differs per machine. */
export const DEFAULT_TEMPORAL_TZ = 'UTC';

/** `format` with no pattern writes ISO 8601 with the zone's offset: `2026-09-19T12:00:00.000+07:00`. */
export const DEFAULT_TEMPORAL_PATTERN = 'YYYY-MM-DDTHH:mm:ss.SSSZ';

/** The locale name tokens and `formatIntl` write in when a helper is built without one. */
export const DEFAULT_TEMPORAL_LOCALE = 'en-US';

/** How `formatDuration` writes: `compact` is `1d1h30m`; the others are the locale's own unit words. */
export class TemporalDurationStyles extends ConstClass {
  static readonly COMPACT = 'compact';
  static readonly NARROW = 'narrow';
  static readonly SHORT = 'short';
  static readonly LONG = 'long';
}

/** A value of {@link TemporalDurationStyles}. */
export type TTemporalDurationStyle = TConstValue<typeof TemporalDurationStyles>;

/** Which ends of the range `isBetween` counts: `[` includes an end, `(` leaves it out. */
export class TemporalInclusivities extends ConstClass {
  static readonly EXCLUSIVE = '()';
  static readonly INCLUSIVE = '[]';
  static readonly START_ONLY = '[)';
  static readonly END_ONLY = '(]';
}

/** A value of {@link TemporalInclusivities}. */
export type TTemporalInclusivity = TConstValue<typeof TemporalInclusivities>;

/** How long a month or weekday name is written: NARROW (`M`), SHORT (`Mon`) or LONG (`Monday`). */
export class TemporalNameWidths extends ConstClass {
  static readonly NARROW = 'narrow';
  static readonly SHORT = 'short';
  static readonly LONG = 'long';
}

/** Valid name width values. */
export type TTemporalNameWidth = TConstValue<typeof TemporalNameWidths>;

/** A month name has no narrow form here: SHORT or LONG. */
export type TTemporalMonthNameWidth = Exclude<TTemporalNameWidth, typeof TemporalNameWidths.NARROW>;

/** How `writtenDate` writes a date: NUMERIC is `10/14/2026`, LONG is `October 14, 2026`. */
export class TemporalWrittenDateStyles extends ConstClass {
  static readonly NUMERIC = 'numeric';
  static readonly LONG = 'long';
}

/** Valid written date style values. */
export type TTemporalWrittenDateStyle = TConstValue<typeof TemporalWrittenDateStyles>;
