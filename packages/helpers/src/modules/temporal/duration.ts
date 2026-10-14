import { HTTP } from '@/common/constants/http';
import { getError } from '@/modules/error';
import { TemporalDurationStyles } from './common/constants';
import type { TTemporalDurationStyle } from './common/constants';
import type { ITemporalDurationParts } from './common/types';

const SECOND_MILLISECONDS = 1000;
const MINUTE_MILLISECONDS = 60 * SECOND_MILLISECONDS;
const HOUR_MILLISECONDS = 60 * MINUTE_MILLISECONDS;
const DAY_MILLISECONDS = 24 * HOUR_MILLISECONDS;

/** Largest first: the order a written duration reads in. */
const FIELDS = [
  { field: 'days', unit: 'day', letter: 'd' },
  { field: 'hours', unit: 'hour', letter: 'h' },
  { field: 'minutes', unit: 'minute', letter: 'm' },
  { field: 'seconds', unit: 'second', letter: 's' },
] as const;

/** A span of milliseconds, split into days to milliseconds and written out. A day is always 24 hours here. */
export class TemporalDuration {
  static parts(opts: { milliseconds: number }): ITemporalDurationParts {
    const { milliseconds } = opts;
    if (!Number.isSafeInteger(milliseconds)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[TemporalDuration] milliseconds must be a safe integer - received ${milliseconds}`,
      });
    }

    const total = Math.abs(milliseconds);
    return {
      isNegative: milliseconds < 0,
      days: Math.floor(total / DAY_MILLISECONDS),
      hours: Math.floor((total % DAY_MILLISECONDS) / HOUR_MILLISECONDS),
      minutes: Math.floor((total % HOUR_MILLISECONDS) / MINUTE_MILLISECONDS),
      seconds: Math.floor((total % MINUTE_MILLISECONDS) / SECOND_MILLISECONDS),
      milliseconds: total % SECOND_MILLISECONDS,
    };
  }

  /**
   * Days, hours, minutes and seconds, zero units left out and milliseconds dropped: `compact` is
   * `1d1h30m`, the other styles use the locale's unit words (`1 ngày 1 giờ 30 phút`). Under a
   * second writes `0s` or `0 seconds`.
   */
  static format(opts: {
    milliseconds: number;
    style?: TTemporalDurationStyle;
    locale: string;
  }): string {
    const { style = TemporalDurationStyles.COMPACT, locale } = opts;
    if (!TemporalDurationStyles.isValid(style)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[TemporalDuration] unknown style '${style}' | Supported: ${[...TemporalDurationStyles.SCHEME_SET].join(', ')}`,
      });
    }

    const parts = TemporalDuration.parts({ milliseconds: opts.milliseconds });
    const present = FIELDS.filter(({ field }) => parts[field] > 0);
    const written = present.length > 0 ? present : [FIELDS[FIELDS.length - 1]];
    // Under a second writes `0s` whatever the sign: there is no negative zero to show.
    const sign = parts.isNegative && present.length > 0 ? '-' : '';

    if (style === TemporalDurationStyles.COMPACT) {
      return sign + written.map(({ field, letter }) => `${parts[field]}${letter}`).join('');
    }

    const words = written.map(({ field, unit }) =>
      new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: style }).format(
        parts[field],
      ),
    );
    return sign + new Intl.ListFormat(locale, { type: 'unit', style }).format(words);
  }
}
