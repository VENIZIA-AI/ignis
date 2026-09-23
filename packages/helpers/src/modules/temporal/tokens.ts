import type { ITemporalParts, IZonedTemporalParts } from './common/types';

/**
 * The pattern dialect, one for every adapter: `YYYY YY MM M DD D HH H mm m ss s SSS Z ZZ`, with
 * text in `[brackets]`. Numeric only - month and weekday names are a locale's business, not a parser's.
 */
export type TPatternToken =
  | 'YYYY'
  | 'YY'
  | 'MM'
  | 'M'
  | 'DD'
  | 'D'
  | 'HH'
  | 'H'
  | 'mm'
  | 'm'
  | 'ss'
  | 's'
  | 'SSS'
  | 'Z'
  | 'ZZ';

export type TPatternSegment = { token: TPatternToken } | { literal: string };

export type TNumericToken = Exclude<TPatternToken, 'Z' | 'ZZ' | 'YY'>;

export const SUPPORTED = 'YYYY YY MM M DD D HH H mm m ss s SSS Z ZZ';

export const MAX_COMPILED_PATTERNS = 64;

/** Two-digit years pivot as dayjs and moment do: 00-68 is 2000-2068, 69-99 is 1969-1999. */
export const TWO_DIGIT_YEAR_PIVOT = 68;

/** `[min digits, max digits, field]` for every numeric token a parse reads directly. */
export const NUMERIC_TOKENS: Record<TNumericToken, [number, number, keyof ITemporalParts]> = {
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

export const pad = (opts: { value: number; width: number }): string =>
  String(opts.value).padStart(opts.width, '0');

/** `+07:00`, or `+07:06:40` for an offset with seconds - historic local mean time has them. */
export const formatOffset = (opts: { offsetMinutes: number; separator: string }): string => {
  const { offsetMinutes, separator } = opts;
  const sign = offsetMinutes < 0 ? '-' : '+';
  const totalSeconds = Math.round(Math.abs(offsetMinutes) * 60);
  const seconds = totalSeconds % 60;

  const text =
    sign +
    pad({ value: Math.floor(totalSeconds / 3600), width: 2 }) +
    separator +
    pad({ value: Math.floor((totalSeconds % 3600) / 60), width: 2 });
  return seconds === 0 ? text : text + separator + pad({ value: seconds, width: 2 });
};

/** One writer per token - a lookup rather than a branch per token on every format. */
export const WRITERS = new Map<TPatternToken, (parts: IZonedTemporalParts) => string>([
  ['YYYY', parts => pad({ value: parts.year, width: 4 })],
  ['YY', parts => pad({ value: parts.year % 100, width: 2 })],
  ['MM', parts => pad({ value: parts.month, width: 2 })],
  ['M', parts => String(parts.month)],
  ['DD', parts => pad({ value: parts.day, width: 2 })],
  ['D', parts => String(parts.day)],
  ['HH', parts => pad({ value: parts.hour, width: 2 })],
  ['H', parts => String(parts.hour)],
  ['mm', parts => pad({ value: parts.minute, width: 2 })],
  ['m', parts => String(parts.minute)],
  ['ss', parts => pad({ value: parts.second, width: 2 })],
  ['s', parts => String(parts.second)],
  ['SSS', parts => pad({ value: parts.millisecond, width: 3 })],
  ['Z', parts => formatOffset({ offsetMinutes: parts.offsetMinutes, separator: ':' })],
  ['ZZ', parts => formatOffset({ offsetMinutes: parts.offsetMinutes, separator: '' })],
]);

export const isLetter = (code: number): boolean =>
  (code >= 65 && code <= 90) || (code >= 97 && code <= 122);

export const isDigit = (code: number): boolean => code >= 48 && code <= 57;

/** Reads `min`..`max` digits at `position`, greedily; undefined when fewer than `min` are there. */
export const readDigits = (opts: {
  value: string;
  position: number;
  min: number;
  max: number;
}): { number: number; next: number } | undefined => {
  const { value, position, min, max } = opts;
  let next = position;
  let number = 0;
  while (next < value.length && next - position < max && isDigit(value.charCodeAt(next))) {
    number = number * 10 + (value.charCodeAt(next) - 48);
    next += 1;
  }
  return next - position < min ? undefined : { number, next };
};

/** Reads two digits after an optional separator; undefined when either is missing. */
export const readOffsetField = (opts: {
  value: string;
  position: number;
  separator: boolean;
}): { number: number; next: number } | undefined => {
  const { value, position, separator } = opts;
  if (separator && value[position] !== ':') {
    return undefined;
  }
  return readDigits({ value, position: separator ? position + 1 : position, min: 2, max: 2 });
};

/**
 * `Z`, `+07:00` (`Z` token) or `+0700` (`ZZ` token), seconds optional, as milliseconds east
 * of UTC. Hours past 23 and minutes or seconds past 59 are refused rather than rolled over.
 */
export const readOffset = (opts: {
  value: string;
  position: number;
  separator: boolean;
}): { milliseconds: number; next: number } | undefined => {
  const { value, position, separator } = opts;
  const sign = value[position];
  if (sign === 'Z') {
    return { milliseconds: 0, next: position + 1 };
  }
  if (sign !== '+' && sign !== '-') {
    return undefined;
  }

  const hours = readDigits({ value, position: position + 1, min: 2, max: 2 });
  if (!hours) {
    return undefined;
  }
  const minutes = readOffsetField({ value, position: hours.next, separator });
  if (!minutes) {
    return undefined;
  }
  const seconds = readOffsetField({ value, position: minutes.next, separator });

  if (hours.number > 23 || minutes.number > 59 || (seconds && seconds.number > 59)) {
    return undefined;
  }

  const total = ((hours.number * 60 + minutes.number) * 60 + (seconds?.number ?? 0)) * 1000;
  return { milliseconds: sign === '-' ? -total : total, next: (seconds ?? minutes).next };
};

export const TOKEN_NAMES: ReadonlySet<string> = new Set(WRITERS.keys());

export const isToken = (run: string): run is TPatternToken => TOKEN_NAMES.has(run);
