import type { ITemporalLocaleNames, IZonedTemporalParts } from '../../common/types';
import type { TemporalLocale } from '../../locale';

/**
 * Tokens a pattern can write but never read: names and the written date come from a locale, the
 * quarter from the month, and a parse stays numeric and strict.
 */
export type TWriteOnlyToken =
  'MMMM' | 'MMM' | 'dddd' | 'ddd' | 'dd' | 'A' | 'a' | 'hh' | 'h' | 'LL' | 'L' | 'Q';

/**
 * The pattern dialect, one for every adapter: `YYYY YY MM M DD D HH H mm m ss s SSS Z ZZ` both ways,
 * plus `MMMM MMM dddd ddd dd A a hh h LL L Q` for writing only, with text in `[brackets]`.
 */
export type TPatternToken =
  | TWriteOnlyToken
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

export type TNumericToken = Exclude<TPatternToken, 'Z' | 'ZZ' | 'YY' | TWriteOnlyToken>;

/** What a writer reads: the wall clock, and the locale - resolved only when a locale token asks for it. */
export interface ITokenWriterInput {
  parts: IZonedTemporalParts;
  locale: () => TemporalLocale;
  /** The helper's own wording for this locale, over `Intl`'s. */
  names?: ITemporalLocaleNames;
}
