import type { PatternTokens, TPatternToken, TWriteOnlyToken } from './constants';
import type { ITemporalLocaleNames, IZonedTemporalParts } from '../../common/types';
import type { TemporalLocale } from '../../locale';

export type TPatternSegment = { token: TPatternToken } | { literal: string };

export type TNumericToken = Exclude<
  TPatternToken,
  | typeof PatternTokens.OFFSET_COLON
  | typeof PatternTokens.OFFSET
  | typeof PatternTokens.YEAR_2
  | TWriteOnlyToken
>;

/** What a writer reads: the wall clock, and the locale - resolved only when a locale token asks for it. */
export interface ITokenWriterInput {
  parts: IZonedTemporalParts;
  locale: () => TemporalLocale;
  /** The helper's own wording for this locale, over `Intl`'s. */
  names?: ITemporalLocaleNames;
}
