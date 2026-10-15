import { HTTP } from '@/common/constants/http';
import { getError } from '@/modules/error';
import type { ITemporalLocaleNames, ITemporalParts, IZonedTemporalParts } from '../common/types';
import { TemporalLocale } from '../locale';
import { TemporalTokens } from './tokens';
import type { TPatternSegment } from './common/types';

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
      if (!TemporalTokens.isLetter({ code: pattern.charCodeAt(position) }) || character === 'T') {
        literal += character;
        position += 1;
        continue;
      }

      let runEnd = position + 1;
      while (pattern[runEnd] === character) {
        runEnd += 1;
      }

      const run = pattern.slice(position, runEnd);
      if (!TemporalTokens.isToken(run)) {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          message: `[TemporalPattern] unknown token '${run}' in pattern '${pattern}' | Supported: ${TemporalTokens.SUPPORTED}; wrap text in [brackets]`,
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

    if (TemporalPattern.compiled.size < TemporalTokens.MAX_COMPILED_PATTERNS) {
      TemporalPattern.compiled.set(pattern, segments);
    }
    return segments;
  }

  /** Writes the wall clock; `locale` spells the name tokens, and is only resolved when one is used. */
  static format(opts: {
    pattern: string;
    parts: IZonedTemporalParts;
    locale: string;
    names?: ITemporalLocaleNames;
  }): string {
    const segments = TemporalPattern.compile({ pattern: opts.pattern });
    let resolved: TemporalLocale | undefined;
    const input = {
      parts: opts.parts,
      names: opts.names,
      locale: () => (resolved ??= TemporalLocale.of({ locale: opts.locale })),
    };

    let text = '';
    for (const segment of segments) {
      text +=
        'literal' in segment
          ? segment.literal
          : (TemporalTokens.WRITERS.get(segment.token)?.(input) ?? '');
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
      // A pattern is code, not input: a write-only token here is a bug, as an unknown token is.
      if (TemporalTokens.isWriteOnlyToken(token)) {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          message: `[TemporalPattern] '${token}' in pattern '${opts.pattern}' is for writing only | A parse reads the numeric tokens`,
        });
      }

      if (token === 'Z' || token === 'ZZ') {
        const offset = TemporalTokens.readOffset({ value, position, separator: token === 'Z' });
        if (!offset) {
          return undefined;
        }
        offsetMilliseconds = offset.milliseconds;
        position = offset.next;
        continue;
      }

      if (token === 'YY') {
        const read = TemporalTokens.readDigits({ value, position, min: 2, max: 2 });
        if (!read) {
          return undefined;
        }
        parts.year =
          read.number + (read.number > TemporalTokens.TWO_DIGIT_YEAR_PIVOT ? 1900 : 2000);
        position = read.next;
        continue;
      }

      const [min, max, field] = TemporalTokens.NUMERIC_TOKENS[token];
      const read = TemporalTokens.readDigits({ value, position, min, max });
      if (!read) {
        return undefined;
      }
      parts[field] = read.number;
      position = read.next;
    }

    return position === value.length ? { parts, offsetMilliseconds } : undefined;
  }
}
