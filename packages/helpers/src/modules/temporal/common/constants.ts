import type { TConstValue } from '@/common/types';

/** Units `add`, `subtract`, `startOf` and `endOf` accept. Weeks are ISO weeks - they start on Monday. */
export class TemporalUnits {
  static readonly MILLISECOND = 'millisecond';
  static readonly SECOND = 'second';
  static readonly MINUTE = 'minute';
  static readonly HOUR = 'hour';
  static readonly DAY = 'day';
  static readonly WEEK = 'week';
  static readonly MONTH = 'month';
  static readonly YEAR = 'year';

  static readonly SCHEME_SET = new Set([
    this.MILLISECOND,
    this.SECOND,
    this.MINUTE,
    this.HOUR,
    this.DAY,
    this.WEEK,
    this.MONTH,
    this.YEAR,
  ]);

  static isValid(input: string): input is TTemporalUnit {
    return this.SCHEME_SET.has(input);
  }
}

export type TTemporalUnit = TConstValue<typeof TemporalUnits>;

/** A helper built without a `timeZone` computes in UTC - never in the host's zone, which differs per machine. */
export const DEFAULT_TEMPORAL_TIME_ZONE = 'UTC';

/** `format` with no pattern writes ISO 8601 with the zone's offset: `2026-09-19T12:00:00.000+07:00`. */
export const DEFAULT_TEMPORAL_PATTERN = 'YYYY-MM-DDTHH:mm:ss.SSSZ';
