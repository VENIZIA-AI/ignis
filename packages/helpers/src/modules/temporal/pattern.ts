import { HTTP } from '@/common/constants/http';
import { getError } from '@/modules/error';
import type { ITemporalParts, IZonedTemporalParts } from './common/types';
import {
  isLetter,
  isToken,
  MAX_COMPILED_PATTERNS,
  NUMERIC_TOKENS,
  readDigits,
  readOffset,
  SUPPORTED,
  TWO_DIGIT_YEAR_PIVOT,
  WRITERS,
} from './tokens';
import type { TPatternSegment } from './tokens';

/** The pattern dialect: compiled once per pattern, then formatted and parsed from the cache. */
export class TemporalPattern {
  /** A service formats the same few patterns millions of times; capped so caller-fed patterns cannot grow it. */
  private static readonly compiled = new Map<string, Array<TPatternSegment>>();

  /**
   * Splits a pattern into tokens and literals. A run of one letter is one token, and an unknown run
   * is refused: `yyyy` is not `YYYY`, and `MMM` is never read as `MM` then `M`.
   */
  private static compile(opts: { pattern: string }): Array<TPatternSegment> {
    const { pattern } = opts;
    const cached = TemporalPattern.compiled.get(pattern);
    if (cached) {
      return cached;
    }

    const segments: Array<TPatternSegment> = [];
    let literal = '';
    let position = 0;

    while (position < pattern.length) {
      const character = pattern[position];

      if (character === '[') {
        const close = pattern.indexOf(']', position + 1);
        if (close < 0) {
          throw getError({
            statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
            message: `[TemporalPattern] unclosed [ in pattern '${pattern}'`,
          });
        }
        literal += pattern.slice(position + 1, close);
        position = close + 1;
        continue;
      }

      // `T` is the ISO date-time separator, and the one letter a pattern may carry bare.
      if (!isLetter(pattern.charCodeAt(position)) || character === 'T') {
        literal += character;
        position += 1;
        continue;
      }

      let runEnd = position + 1;
      while (pattern[runEnd] === character) {
        runEnd += 1;
      }

      const run = pattern.slice(position, runEnd);
      if (!isToken(run)) {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          message: `[TemporalPattern] unknown token '${run}' in pattern '${pattern}' | Supported: ${SUPPORTED}; wrap text in [brackets]`,
        });
      }

      if (literal) {
        segments.push({ literal });
        literal = '';
      }
      segments.push({ token: run });
      position = runEnd;
    }

    if (literal) {
      segments.push({ literal });
    }

    if (TemporalPattern.compiled.size < MAX_COMPILED_PATTERNS) {
      TemporalPattern.compiled.set(pattern, segments);
    }
    return segments;
  }

  static format(opts: { pattern: string; parts: IZonedTemporalParts }): string {
    const segments = TemporalPattern.compile({ pattern: opts.pattern });
    let text = '';
    for (const segment of segments) {
      text +=
        'literal' in segment ? segment.literal : (WRITERS.get(segment.token)?.(opts.parts) ?? '');
    }
    return text;
  }

  /** The fields a value spells under a pattern, or undefined when it does not match. Unset fields default to the start: month 1, day 1, 00:00. */
  static parse(opts: {
    pattern: string;
    value: string;
  }): { parts: ITemporalParts; offsetMilliseconds?: number } | undefined {
    const { value } = opts;
    const segments = TemporalPattern.compile({ pattern: opts.pattern });
    const parts: ITemporalParts = {
      year: 1970,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    };
    let offsetMilliseconds: number | undefined;
    let position = 0;

    for (const segment of segments) {
      if ('literal' in segment) {
        if (!value.startsWith(segment.literal, position)) {
          return undefined;
        }
        position += segment.literal.length;
        continue;
      }

      const { token } = segment;
      if (token === 'Z' || token === 'ZZ') {
        const offset = readOffset({ value, position, separator: token === 'Z' });
        if (!offset) {
          return undefined;
        }
        offsetMilliseconds = offset.milliseconds;
        position = offset.next;
        continue;
      }

      if (token === 'YY') {
        const read = readDigits({ value, position, min: 2, max: 2 });
        if (!read) {
          return undefined;
        }
        parts.year = read.number + (read.number > TWO_DIGIT_YEAR_PIVOT ? 1900 : 2000);
        position = read.next;
        continue;
      }

      const [min, max, field] = NUMERIC_TOKENS[token];
      const read = readDigits({ value, position, min, max });
      if (!read) {
        return undefined;
      }
      parts[field] = read.number;
      position = read.next;
    }

    return position === value.length ? { parts, offsetMilliseconds } : undefined;
  }
}
