import { HTTP } from '@/common/constants/http';
import { getError } from '@/modules/error';
import { TemporalDurationStyles } from '../common/constants';
import type { TTemporalDurationStyle } from '../common/constants';
import type { ITemporalDurationParts } from '../common/types';

const SECOND_MILLISECONDS = 1000;
const MINUTE_MILLISECONDS = 60 * SECOND_MILLISECONDS;
const HOUR_MILLISECONDS = 60 * MINUTE_MILLISECONDS;
const DAY_MILLISECONDS = 24 * HOUR_MILLISECONDS;

/** Clock-face tokens, largest first: how many milliseconds each counts, and how wide it pads. */
const FACE_TOKENS = new Map<string, { milliseconds: number; width: number }>([
  ['DD', { milliseconds: DAY_MILLISECONDS, width: 2 }],
  ['D', { milliseconds: DAY_MILLISECONDS, width: 1 }],
  ['HH', { milliseconds: HOUR_MILLISECONDS, width: 2 }],
  ['H', { milliseconds: HOUR_MILLISECONDS, width: 1 }],
  ['mm', { milliseconds: MINUTE_MILLISECONDS, width: 2 }],
  ['m', { milliseconds: MINUTE_MILLISECONDS, width: 1 }],
  ['ss', { milliseconds: SECOND_MILLISECONDS, width: 2 }],
  ['s', { milliseconds: SECOND_MILLISECONDS, width: 1 }],
  ['SSS', { milliseconds: 1, width: 3 }],
]);

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
    pattern?: string;
    maxUnits?: number;
    locale: string;
  }): string {
    const { style = TemporalDurationStyles.COMPACT, pattern, maxUnits, locale } = opts;
    if (pattern !== undefined) {
      return TemporalDuration.formatFace({ milliseconds: opts.milliseconds, pattern });
    }

    if (maxUnits !== undefined && !(Number.isInteger(maxUnits) && maxUnits > 0)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[TemporalDuration] maxUnits must be a positive integer - received ${maxUnits}`,
      });
    }

    if (!TemporalDurationStyles.isValid(style)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[TemporalDuration] unknown style '${style}' | Supported: ${[...TemporalDurationStyles.SCHEME_SET].join(', ')}`,
      });
    }

    const parts = TemporalDuration.parts({ milliseconds: opts.milliseconds });
    const present = FIELDS.filter(({ field }) => parts[field] > 0).slice(0, maxUnits);
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

  /**
   * A clock face: `HH:mm:ss` writes 3,723,000 ms as `01:02:03`. The largest token present carries
   * everything above it, so `mm:ss` writes 75 minutes as `75:00`. Text goes in `[brackets]`.
   */
  private static formatFace(opts: { milliseconds: number; pattern: string }): string {
    const { pattern } = opts;
    const parts = TemporalDuration.parts({ milliseconds: opts.milliseconds });
    let remaining =
      ((parts.days * 24 + parts.hours) * 60 + parts.minutes) * MINUTE_MILLISECONDS +
      parts.seconds * SECOND_MILLISECONDS +
      parts.milliseconds;

    let text = parts.isNegative ? '-' : '';
    let position = 0;
    while (position < pattern.length) {
      const character = pattern[position];
      if (character === '[') {
        const close = pattern.indexOf(']', position + 1);
        if (close < 0) {
          throw getError({
            statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
            message: `[TemporalDuration] unclosed [ in pattern '${pattern}'`,
          });
        }
        text += pattern.slice(position + 1, close);
        position = close + 1;
        continue;
      }

      let runEnd = position + 1;
      while (pattern[runEnd] === character) {
        runEnd += 1;
      }

      const run = pattern.slice(position, runEnd);
      const token = FACE_TOKENS.get(run);
      if (token === undefined) {
        if (/[A-Za-z]/.test(character)) {
          throw getError({
            statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
            message: `[TemporalDuration] unknown token '${run}' in pattern '${pattern}' | Supported: ${[...FACE_TOKENS.keys()].join(' ')}; wrap text in [brackets]`,
          });
        }
        text += run;
        position = runEnd;
        continue;
      }

      const amount = Math.floor(remaining / token.milliseconds);
      remaining -= amount * token.milliseconds;
      text += String(amount).padStart(token.width, '0');
      position = runEnd;
    }
    return text;
  }
}
