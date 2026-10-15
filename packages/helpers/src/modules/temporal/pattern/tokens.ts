import type { ITemporalParts } from '../common/types';
import type {
  ITokenWriterInput,
  TNumericToken,
  TPatternToken,
  TWriteOnlyToken,
} from './common/types';

/** The pattern dialect's tokens: what each one writes, and how a parse reads digits and offsets. */
export class TemporalTokens {
  static readonly SUPPORTED =
    'YYYY YY MM M DD D HH H mm m ss s SSS Z ZZ, and for writing only MMMM MMM dddd ddd dd A a hh h LL L Q';

  static readonly WRITE_ONLY_TOKENS: ReadonlySet<TPatternToken> = new Set<TWriteOnlyToken>([
    'MMMM',
    'MMM',
    'dddd',
    'ddd',
    'dd',
    'A',
    'a',
    'hh',
    'h',
    'LL',
    'L',
    'Q',
  ]);

  static isWriteOnlyToken(token: TPatternToken): token is TWriteOnlyToken {
    return TemporalTokens.WRITE_ONLY_TOKENS.has(token);
  }

  static readonly MAX_COMPILED_PATTERNS = 64;

  /** Two-digit years pivot as dayjs and moment do: 00-68 is 2000-2068, 69-99 is 1969-1999. */
  static readonly TWO_DIGIT_YEAR_PIVOT = 68;

  /** `[min digits, max digits, field]` for every numeric token a parse reads directly. */
  static readonly NUMERIC_TOKENS: Record<TNumericToken, [number, number, keyof ITemporalParts]> = {
    YYYY: [4, 4, 'year'],
    MM: [2, 2, 'month'],
    M: [1, 2, 'month'],
    DD: [2, 2, 'day'],
    D: [1, 2, 'day'],
    HH: [2, 2, 'hour'],
    H: [1, 2, 'hour'],
    mm: [2, 2, 'minute'],
    m: [1, 2, 'minute'],
    ss: [2, 2, 'second'],
    s: [1, 2, 'second'],
    SSS: [3, 3, 'millisecond'],
  };

  static pad(opts: { value: number; width: number }): string {
    return String(opts.value).padStart(opts.width, '0');
  }

  /** `+07:00`, or `+07:06:40` for an offset with seconds - historic local mean time has them. */
  static formatOffset(opts: { offsetMinutes: number; separator: string }): string {
    const { offsetMinutes, separator } = opts;
    const sign = offsetMinutes < 0 ? '-' : '+';
    const totalSeconds = Math.round(Math.abs(offsetMinutes) * 60);
    const seconds = totalSeconds % 60;

    const text =
      sign +
      TemporalTokens.pad({ value: Math.floor(totalSeconds / 3600), width: 2 }) +
      separator +
      TemporalTokens.pad({ value: Math.floor((totalSeconds % 3600) / 60), width: 2 });
    return seconds === 0
      ? text
      : text + separator + TemporalTokens.pad({ value: seconds, width: 2 });
  }

  /** The hour on a 12-hour clock: 12, 1, ... 11. */
  private static twelveHour(opts: { hour: number }): number {
    return opts.hour % 12 || 12;
  }

  /** One writer per token - a lookup rather than a branch per token on every format. */
  static readonly WRITERS = new Map<TPatternToken, (input: ITokenWriterInput) => string>([
    ['YYYY', ({ parts }) => TemporalTokens.pad({ value: parts.year, width: 4 })],
    ['YY', ({ parts }) => TemporalTokens.pad({ value: parts.year % 100, width: 2 })],
    [
      'MMMM',
      ({ parts, locale, names }) =>
        names?.months?.[parts.month - 1] ??
        locale().monthName({ month: parts.month, width: 'long' }),
    ],
    [
      'MMM',
      ({ parts, locale, names }) =>
        names?.monthsShort?.[parts.month - 1] ??
        locale().monthName({ month: parts.month, width: 'short' }),
    ],
    ['MM', ({ parts }) => TemporalTokens.pad({ value: parts.month, width: 2 })],
    ['M', ({ parts }) => String(parts.month)],
    ['DD', ({ parts }) => TemporalTokens.pad({ value: parts.day, width: 2 })],
    ['D', ({ parts }) => String(parts.day)],
    [
      'dddd',
      ({ parts, locale, names }) =>
        names?.weekdays?.[parts.dayOfWeek - 1] ??
        locale().weekdayName({ dayOfWeek: parts.dayOfWeek, width: 'long' }),
    ],
    [
      'ddd',
      ({ parts, locale, names }) =>
        names?.weekdaysShort?.[parts.dayOfWeek - 1] ??
        locale().weekdayName({ dayOfWeek: parts.dayOfWeek, width: 'short' }),
    ],
    [
      'dd',
      ({ parts, locale, names }) =>
        names?.weekdaysMin?.[parts.dayOfWeek - 1] ??
        locale().weekdayName({ dayOfWeek: parts.dayOfWeek, width: 'narrow' }),
    ],
    ['HH', ({ parts }) => TemporalTokens.pad({ value: parts.hour, width: 2 })],
    ['H', ({ parts }) => String(parts.hour)],
    [
      'hh',
      ({ parts }) =>
        TemporalTokens.pad({ value: TemporalTokens.twelveHour({ hour: parts.hour }), width: 2 }),
    ],
    ['h', ({ parts }) => String(TemporalTokens.twelveHour({ hour: parts.hour }))],
    [
      'A',
      ({ parts, locale, names }) =>
        locale().dayPeriod({ hour: parts.hour, meridiem: names?.meridiem }),
    ],
    [
      'a',
      ({ parts, locale, names }) =>
        locale().dayPeriod({ hour: parts.hour, meridiem: names?.meridiem, isLowerCase: true }),
    ],
    ['mm', ({ parts }) => TemporalTokens.pad({ value: parts.minute, width: 2 })],
    ['m', ({ parts }) => String(parts.minute)],
    ['ss', ({ parts }) => TemporalTokens.pad({ value: parts.second, width: 2 })],
    ['s', ({ parts }) => String(parts.second)],
    ['SSS', ({ parts }) => TemporalTokens.pad({ value: parts.millisecond, width: 3 })],
    [
      'Z',
      ({ parts }) =>
        TemporalTokens.formatOffset({ offsetMinutes: parts.offsetMinutes, separator: ':' }),
    ],
    [
      'ZZ',
      ({ parts }) =>
        TemporalTokens.formatOffset({ offsetMinutes: parts.offsetMinutes, separator: '' }),
    ],
    ['LL', ({ parts, locale }) => locale().writtenDate({ parts, style: 'long' })],
    ['L', ({ parts, locale }) => locale().writtenDate({ parts, style: 'numeric' })],
    ['Q', ({ parts }) => String(Math.floor((parts.month - 1) / 3) + 1)],
  ]);

  static isLetter(opts: { code: number }): boolean {
    const { code } = opts;
    return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
  }

  static isDigit(opts: { code: number }): boolean {
    return opts.code >= 48 && opts.code <= 57;
  }

  /** Reads `min`..`max` digits at `position`, greedily; undefined when fewer than `min` are there. */
  static readDigits(opts: {
    value: string;
    position: number;
    min: number;
    max: number;
  }): { number: number; next: number } | undefined {
    const { value, position, min, max } = opts;
    let next = position;
    let number = 0;
    while (
      next < value.length &&
      next - position < max &&
      TemporalTokens.isDigit({ code: value.charCodeAt(next) })
    ) {
      number = number * 10 + (value.charCodeAt(next) - 48);
      next += 1;
    }
    return next - position < min ? undefined : { number, next };
  }

  /** Reads two digits after an optional separator; undefined when either is missing. */
  private static readOffsetField(opts: {
    value: string;
    position: number;
    separator: boolean;
  }): { number: number; next: number } | undefined {
    const { value, position, separator } = opts;
    if (separator && value[position] !== ':') {
      return undefined;
    }
    return TemporalTokens.readDigits({
      value,
      position: separator ? position + 1 : position,
      min: 2,
      max: 2,
    });
  }

  /**
   * `Z`, `+07:00` (`Z` token) or `+0700` (`ZZ` token), seconds optional, as milliseconds east
   * of UTC. Hours past 23 and minutes or seconds past 59 are refused rather than rolled over.
   */
  static readOffset(opts: {
    value: string;
    position: number;
    separator: boolean;
  }): { milliseconds: number; next: number } | undefined {
    const { value, position, separator } = opts;
    const sign = value[position];
    if (sign === 'Z') {
      return { milliseconds: 0, next: position + 1 };
    }
    if (sign !== '+' && sign !== '-') {
      return undefined;
    }

    const hours = TemporalTokens.readDigits({ value, position: position + 1, min: 2, max: 2 });
    if (!hours) {
      return undefined;
    }
    const minutes = TemporalTokens.readOffsetField({ value, position: hours.next, separator });
    if (!minutes) {
      return undefined;
    }
    const seconds = TemporalTokens.readOffsetField({ value, position: minutes.next, separator });

    if (hours.number > 23 || minutes.number > 59 || (seconds && seconds.number > 59)) {
      return undefined;
    }

    const total = ((hours.number * 60 + minutes.number) * 60 + (seconds?.number ?? 0)) * 1000;
    return { milliseconds: sign === '-' ? -total : total, next: (seconds ?? minutes).next };
  }

  static readonly TOKEN_NAMES: ReadonlySet<string> = new Set(TemporalTokens.WRITERS.keys());

  static isToken(run: string): run is TPatternToken {
    return TemporalTokens.TOKEN_NAMES.has(run);
  }
}
