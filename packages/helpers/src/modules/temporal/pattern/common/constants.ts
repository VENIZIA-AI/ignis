import type { TConstValue } from '@/common/types';

/**
 * The pattern dialect: `YYYY YY MM M DD D HH H mm m ss s SSS Z ZZ` both ways, plus
 * `MMMM MMM dddd ddd dd A a hh h LL L Q` for writing only, with text in `[brackets]`.
 */
export class PatternTokens {
  static readonly YEAR_4 = 'YYYY';
  static readonly YEAR_2 = 'YY';
  static readonly MONTH_2 = 'MM';
  static readonly MONTH = 'M';
  static readonly DAY_2 = 'DD';
  static readonly DAY = 'D';
  static readonly HOUR_24_2 = 'HH';
  static readonly HOUR_24 = 'H';
  static readonly MINUTE_2 = 'mm';
  static readonly MINUTE = 'm';
  static readonly SECOND_2 = 'ss';
  static readonly SECOND = 's';
  static readonly MILLISECOND = 'SSS';
  static readonly OFFSET_COLON = 'Z';
  static readonly OFFSET = 'ZZ';

  /** Written only: names and the written date come from a locale, the quarter from the month. */
  static readonly MONTH_NAME_LONG = 'MMMM';
  static readonly MONTH_NAME_SHORT = 'MMM';
  static readonly WEEKDAY_LONG = 'dddd';
  static readonly WEEKDAY_SHORT = 'ddd';
  static readonly WEEKDAY_MIN = 'dd';
  static readonly MERIDIEM_UPPER = 'A';
  static readonly MERIDIEM_LOWER = 'a';
  static readonly HOUR_12_2 = 'hh';
  static readonly HOUR_12 = 'h';
  static readonly DATE_LONG = 'LL';
  static readonly DATE_NUMERIC = 'L';
  static readonly QUARTER = 'Q';

  static readonly WRITE_ONLY_SET: ReadonlySet<TWriteOnlyToken> = new Set<TWriteOnlyToken>([
    this.MONTH_NAME_LONG,
    this.MONTH_NAME_SHORT,
    this.WEEKDAY_LONG,
    this.WEEKDAY_SHORT,
    this.WEEKDAY_MIN,
    this.MERIDIEM_UPPER,
    this.MERIDIEM_LOWER,
    this.HOUR_12_2,
    this.HOUR_12,
    this.DATE_LONG,
    this.DATE_NUMERIC,
    this.QUARTER,
  ]);

  static readonly SCHEME_SET = new Set<string>([
    this.YEAR_4,
    this.YEAR_2,
    this.MONTH_2,
    this.MONTH,
    this.DAY_2,
    this.DAY,
    this.HOUR_24_2,
    this.HOUR_24,
    this.MINUTE_2,
    this.MINUTE,
    this.SECOND_2,
    this.SECOND,
    this.MILLISECOND,
    this.OFFSET_COLON,
    this.OFFSET,
    ...this.WRITE_ONLY_SET,
  ]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** Tokens a pattern can write but never read: names and the written date come from a locale, the quarter from the month, and a parse stays numeric and strict. */
export type TWriteOnlyToken =
  | typeof PatternTokens.MONTH_NAME_LONG
  | typeof PatternTokens.MONTH_NAME_SHORT
  | typeof PatternTokens.WEEKDAY_LONG
  | typeof PatternTokens.WEEKDAY_SHORT
  | typeof PatternTokens.WEEKDAY_MIN
  | typeof PatternTokens.MERIDIEM_UPPER
  | typeof PatternTokens.MERIDIEM_LOWER
  | typeof PatternTokens.HOUR_12_2
  | typeof PatternTokens.HOUR_12
  | typeof PatternTokens.DATE_LONG
  | typeof PatternTokens.DATE_NUMERIC
  | typeof PatternTokens.QUARTER;

/** Every token of the pattern dialect, one for every adapter. */
export type TPatternToken = TConstValue<typeof PatternTokens>;
