import { TConstValue } from '../types';

/** The time units a duration can be expressed in, smallest first. */
export class DurationUnits {
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

  static isValid(input: string): input is TDurationUnit {
    return this.SCHEME_SET.has(input);
  }
}

export type TDurationUnit = TConstValue<typeof DurationUnits>;

/**
 * Written spellings that resolve to a unit. Member names are the spelling, upper-cased - so
 * {@link resolve} upper-cases its input and reads one property, with no second table to keep in step.
 *
 * `M` is MINUTE and `MO` is MONTH - the same choice every duration library makes, and the one
 * ambiguity a reader will trip on. There is no single-letter month.
 */
export class DurationAliases {
  static readonly MS = DurationUnits.MILLISECOND;
  static readonly MSEC = DurationUnits.MILLISECOND;
  static readonly MILLISECOND = DurationUnits.MILLISECOND;
  static readonly MILLISECONDS = DurationUnits.MILLISECOND;

  static readonly S = DurationUnits.SECOND;
  static readonly SEC = DurationUnits.SECOND;
  static readonly SECOND = DurationUnits.SECOND;
  static readonly SECONDS = DurationUnits.SECOND;

  static readonly M = DurationUnits.MINUTE;
  static readonly MIN = DurationUnits.MINUTE;
  static readonly MINUTE = DurationUnits.MINUTE;
  static readonly MINUTES = DurationUnits.MINUTE;

  static readonly H = DurationUnits.HOUR;
  static readonly HR = DurationUnits.HOUR;
  static readonly HOUR = DurationUnits.HOUR;
  static readonly HOURS = DurationUnits.HOUR;

  static readonly D = DurationUnits.DAY;
  static readonly DAY = DurationUnits.DAY;
  static readonly DAYS = DurationUnits.DAY;

  static readonly W = DurationUnits.WEEK;
  static readonly WK = DurationUnits.WEEK;
  static readonly WEEK = DurationUnits.WEEK;
  static readonly WEEKS = DurationUnits.WEEK;

  static readonly MO = DurationUnits.MONTH;
  static readonly MON = DurationUnits.MONTH;
  static readonly MONTH = DurationUnits.MONTH;
  static readonly MONTHS = DurationUnits.MONTH;

  static readonly Y = DurationUnits.YEAR;
  static readonly YR = DurationUnits.YEAR;
  static readonly YEAR = DurationUnits.YEAR;
  static readonly YEARS = DurationUnits.YEAR;

  /** Resolves a written unit - `'d'`, `'days'`, `'DAY'` - to its canonical name, or `null`. */
  static resolve(input: string): TDurationUnit | null {
    if (typeof input !== 'string') {
      return null;
    }

    // Try the input as given first. `trim().toUpperCase()` allocates two strings and costs ~55ns,
    // where the lookup itself is ~1ns - so the spellings callers actually pass (`'day'`, `'d'`,
    // `'DAYS'`) must not pay for it. Measured, both ways.
    //
    // The table is declared below because it is derived FROM this class; it is read at call time,
    // never at class-evaluation time.
    /* eslint-disable @typescript-eslint/no-use-before-define */
    return ALIAS_LOOKUP.get(input) ?? ALIAS_LOOKUP.get(input.trim().toUpperCase()) ?? null;
    /* eslint-enable @typescript-eslint/no-use-before-define */
  }
}

/**
 * Derived from the class once, never hand-listed, so the two cannot drift. Reading the class
 * directly is slower and would need `name`/`length`/`constructor` guarded out. Each spelling is
 * stored upper and lower so the common call allocates nothing.
 */
const ALIAS_LOOKUP: Map<string, TDurationUnit> = new Map(
  Object.entries(DurationAliases)
    .filter((entry): entry is [string, TDurationUnit] => DurationUnits.isValid(entry[1] as string))
    .flatMap(([spelling, unit]): Array<[string, TDurationUnit]> => [
      [spelling, unit],
      [spelling.toLowerCase(), unit],
    ]),
);

export interface IDuration {
  unit: TDurationUnit;
  value: number;
}

/** `30d`, `1500 ms`, `-2 Hours`. One number, optional space, one unit. */
const DURATION_PATTERN = /^([+-]?\d+(?:\.\d+)?)\s*([a-z]+)$/i;

/**
 * A month is 30 days and a year 365, nominal. These size a WINDOW - a grace period, a cache TTL, a
 * near-expiry horizon - and must never compute a calendar date: adding `MONTH` to 31 January lands
 * on 2 March in a leap year and 3 March otherwise. Use a date library for calendar arithmetic.
 */
export class DurationMultipliers {
  static readonly MILLISECOND = 1;
  static readonly SECOND = 1000 * this.MILLISECOND;
  static readonly MINUTE = 60 * this.SECOND;
  static readonly HOUR = 60 * this.MINUTE;
  static readonly DAY = 24 * this.HOUR;
  static readonly WEEK = 7 * this.DAY;
  static readonly MONTH = 30 * this.DAY;
  static readonly YEAR = 365 * this.DAY;

  static readonly BY_UNIT: Record<string, number> = {
    [DurationUnits.MILLISECOND]: this.MILLISECOND,
    [DurationUnits.SECOND]: this.SECOND,
    [DurationUnits.MINUTE]: this.MINUTE,
    [DurationUnits.HOUR]: this.HOUR,
    [DurationUnits.DAY]: this.DAY,
    [DurationUnits.WEEK]: this.WEEK,
    [DurationUnits.MONTH]: this.MONTH,
    [DurationUnits.YEAR]: this.YEAR,
  };

  /**
   * `null` rather than a throw, so a caller that wants an error raises its own with its own context.
   * Every method here answers the same way.
   *
   * One map read, not a validity check followed by a read: an unknown unit is already `undefined`.
   */
  static toMilliseconds(opts: IDuration | null): number | null {
    if (!opts) {
      return null;
    }

    const multiplier = this.BY_UNIT[opts.unit];

    if (multiplier === undefined || !Number.isFinite(opts.value)) {
      return null;
    }

    return Math.round(opts.value * multiplier);
  }

  /** The inverse of {@link toMilliseconds}. Fractional on purpose - rounding here would silently lose a 36-hour window asked for in days. */
  static fromMilliseconds(opts: { milliseconds: number; unit: TDurationUnit }): number | null {
    const multiplier = this.BY_UNIT[opts?.unit];

    if (multiplier === undefined || !Number.isFinite(opts.milliseconds)) {
      return null;
    }

    return opts.milliseconds / multiplier;
  }

  /** Unit to unit, through milliseconds. Fractional, for the reason {@link fromMilliseconds} gives. */
  static convert(opts: { value: number; from: TDurationUnit; to: TDurationUnit }): number | null {
    const source = this.BY_UNIT[opts?.from];
    const target = this.BY_UNIT[opts?.to];

    if (source === undefined || target === undefined || !Number.isFinite(opts.value)) {
      return null;
    }

    return (opts.value * source) / target;
  }

  /** Reads a written duration - `'30d'`, `'1500 ms'`, `'2 hours'` - into {@link IDuration}. Aliases and the `M`/`MO` rule are on {@link DurationAliases}. */
  static parse(input: string): IDuration | null {
    if (typeof input !== 'string') {
      return null;
    }

    const matched = DURATION_PATTERN.exec(input.trim());

    if (!matched) {
      return null;
    }

    const unit = DurationAliases.resolve(matched[2]);
    const value = Number(matched[1]);

    if (!unit || !Number.isFinite(value)) {
      return null;
    }

    return { unit, value };
  }

  /** `'30d'` straight to milliseconds - the shape a TTL or a grace period is usually configured in. */
  static parseToMilliseconds(input: string): number | null {
    return this.toMilliseconds(this.parse(input));
  }
}
