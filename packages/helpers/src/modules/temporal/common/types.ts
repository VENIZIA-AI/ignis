import type {
  TemporalUnits,
  TTemporalDurationStyle,
  TTemporalInclusivity,
  TTemporalUnit,
} from './constants';
/** What a date-taking method accepts: a `Date`, epoch milliseconds, or an ISO 8601 string. */
export type TTemporalInput = Date | number | string;

/** Wall-clock fields. `month` is 1-12, `day` 1-31 - never zero-based. */
export interface ITemporalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

/** The wall clock an instant shows in one time zone. `dayOfWeek` is ISO: 1 Monday - 7 Sunday. */
export interface IZonedTemporalParts extends ITemporalParts {
  dayOfWeek: number;
  /** Minutes east of UTC: `420` for `+07:00`. Historic local mean time carries seconds, as a fraction. */
  offsetMinutes: number;
}

/**
 * The one question a date library answers: which UTC offset a time zone observes at an instant.
 * Everything else - the wall clock, a time a daylight-saving jump skips or repeats, adding a month,
 * the start of a week, a pattern - `TemporalHelper` works out once from these answers, so every
 * adapter shares one behaviour.
 */
export interface ITemporalAdapter {
  /** Milliseconds east of UTC that `tz` observes at `value`: `25_200_000` for `+07:00`. */
  getOffsetMilliseconds(opts: { value: Date; tz: string }): number;
}

// ----- The slices of each library an adapter drives: structural, so no library type ships with this package.

/** The part of a `Temporal.ZonedDateTime` this adapter reads. */
export interface ITemporalZonedDateTime {
  readonly offsetNanoseconds: number;
}

/**
 * The part of the `Temporal` namespace this adapter drives - structural, so neither this package
 * nor its consumers need Temporal's type definitions, and a polyfill's namespace fits as well.
 */
export interface ITemporalNamespace {
  Instant: {
    fromEpochMilliseconds(epochMilliseconds: number): {
      toZonedDateTimeISO(tz: string): ITemporalZonedDateTime;
    };
  };
}

/** The part of a `Dayjs` object this adapter reads. */
export interface IDayjsInstance {
  utcOffset(): number;
  tz(tz: string): IDayjsInstance;
}

/** The part of the `dayjs` factory this adapter drives - with the `utc` and `timezone` plugins extended. */
export interface IDayjsFactory {
  (value?: Date | number): IDayjsInstance;
  tz: (value: string, tz: string) => IDayjsInstance;
}

/** The part of a Luxon `DateTime` this adapter reads. */
export interface ILuxonDateTime {
  readonly isValid: boolean;
  readonly invalidReason: string | null;
  readonly offset: number;
}

/** The part of Luxon's `DateTime` class this adapter drives. */
export interface ILuxonDateTimeFactory {
  fromMillis(milliseconds: number, options: { zone: string }): ILuxonDateTime;
}

/** A span of time split into whole units, every field non-negative; `isNegative` carries the sign. */
export interface ITemporalDurationParts {
  isNegative: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}

/**
 * A locale's own wording, over what `Intl` writes for it: month names (January first), weekday
 * names in ISO order (Monday first), and the AM and PM markers. Any list left out stays `Intl`'s.
 */
export interface ITemporalLocaleNames {
  months?: ReadonlyArray<string>;
  monthsShort?: ReadonlyArray<string>;
  weekdays?: ReadonlyArray<string>;
  weekdaysShort?: ReadonlyArray<string>;
  weekdaysMin?: ReadonlyArray<string>;
  meridiem?: readonly [string, string];
}

/** The fields `set` replaces on the wall clock: `month` is 1-12. */
export type TTemporalFields = Partial<ITemporalParts>;

/** The units `Intl.RelativeTimeFormat` speaks: every temporal unit but the millisecond. */
export type TRelativeUnit = Exclude<TTemporalUnit, typeof TemporalUnits.MILLISECOND>;

/** What a temporal helper does: dates in one time zone, through an adapter. `TemporalHelper` is the implementation. */
export interface ITemporalHelper {
  /**
   * A date picker hands back a `Date` meaning "this wall clock in the host's zone". This returns the
   * instant that shows the same year, month, day and time in the helper's zone. `sourceTz` defaults
   * to the host's. A skipped wall time resolves forward, a repeated one to the earlier instant.
   */
  fromWallClock(opts: { value: TTemporalInput; sourceTz?: string; tz?: string }): Date;

  /**
   * The reverse of `fromWallClock`, to feed a picker: a `Date` whose wall clock in `targetTz` (default:
   * the host's) reads what the helper's zone reads for `value`.
   */
  toWallClock(opts: { value: TTemporalInput; targetTz?: string; tz?: string }): Date;

  /** A helper like this one, with another locale or zone: same adapter, same `names`. */
  clone(opts: { locale?: string; tz?: string }): ITemporalHelper;

  getTz(): string;

  getLocale(): string;

  now(): Date;

  /** The instant a value names. An ISO string without an offset is read as wall clock in the zone. */
  toDate(opts: { value: TTemporalInput; tz?: string }): Date;

  /** `toDate`, answering `null` where `toDate` refuses the value: null, undefined, bad text, NaN. */
  tryToDate(opts: { value: TTemporalInput | null | undefined; tz?: string }): Date | null;

  /** The wall clock the value shows in the zone, with its ISO weekday and UTC offset. */
  parts(opts: { value: TTemporalInput; tz?: string }): IZonedTemporalParts;

  /**
   * Reads a string. With a `pattern` (`YYYY YY MM M DD D HH H mm m ss s SSS Z ZZ`, text in
   * `[brackets]`), the value must match it exactly; without one it must be ISO 8601. An offset in
   * the value wins; otherwise the fields are wall clock in the zone.
   */
  parse(opts: { value: string; pattern?: string; tz?: string }): Date;

  /** `parse`, answering `null` where `parse` refuses the value. A pattern that does not compile still throws. */
  tryParse(opts: { value: string; pattern?: string; tz?: string }): Date | null;

  /** Whether the value names an instant in years 1-9999 - a string read as `parse` reads it. */
  isValid(opts: {
    value: TTemporalInput | null | undefined;
    pattern?: string;
    tz?: string;
  }): boolean;

  /**
   * Writes the value in the zone. Without a `pattern`: ISO 8601 with the zone's offset. The tokens
   * `MMMM MMM dddd ddd dd A a hh h LL L` are spelled in `locale`. With a `fallback`, a value that is
   * not a date - null included - writes the fallback; without one, it is a 400.
   */
  format(opts: {
    value: TTemporalInput | null | undefined;
    pattern?: string;
    tz?: string;
    locale?: string;
    fallback?: string;
  }): string;

  /** Writes the value with `Intl.DateTimeFormat` options, in the zone - for what the pattern tokens cannot say. */
  formatIntl(opts: {
    value: TTemporalInput;
    options?: Omit<Intl.DateTimeFormatOptions, 'timeZone'>;
    tz?: string;
    locale?: string;
  }): string;

  /**
   * Moves the value by whole units. Hours and smaller are elapsed time; days and larger move the
   * calendar in the zone, so a day across a daylight-saving jump keeps the wall time, and a month
   * past a shorter month clamps to its last day.
   */
  add(opts: { value: TTemporalInput; amount: number; unit: TTemporalUnit; tz?: string }): Date;

  subtract(opts: { value: TTemporalInput; amount: number; unit: TTemporalUnit; tz?: string }): Date;

  /** The first instant of the unit containing the value, in the zone. Weeks start on Monday. */
  startOf(opts: { value: TTemporalInput; unit: TTemporalUnit; tz?: string }): Date;

  /** The last millisecond of the unit containing the value, in the zone. */
  endOf(opts: { value: TTemporalInput; unit: TTemporalUnit; tz?: string }): Date;

  /** Monday to Friday, read on the wall clock of the zone. */
  isWeekday(opts: { value: TTemporalInput; tz?: string }): boolean;

  nextWeekday(opts: { value: TTemporalInput; tz?: string }): Date;

  previousWeekday(opts: { value: TTemporalInput; tz?: string }): Date;

  /**
   * The value with wall-clock fields replaced in the zone - `{ hour: 9, minute: 0 }` is 09:00 that day.
   * `month` is 1-12. The day is clamped to the month's last day, so setting February on the 31st
   * lands on the 28th or 29th. A wall time a daylight-saving jump skips resolves forward, as `parse` does.
   */
  set(opts: { value: TTemporalInput; tz?: string } & TTemporalFields): Date;

  /** `value` is before `other` - at the unit's granularity in the zone when `unit` is given. */
  isBefore(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit?: TTemporalUnit;
    tz?: string;
  }): boolean;

  isAfter(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit?: TTemporalUnit;
    tz?: string;
  }): boolean;

  /** In the same unit - `unit: 'day'` is the same calendar day in the zone. */
  isSame(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit?: TTemporalUnit;
    tz?: string;
  }): boolean;

  isSameOrBefore(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit?: TTemporalUnit;
    tz?: string;
  }): boolean;

  isSameOrAfter(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit?: TTemporalUnit;
    tz?: string;
  }): boolean;

  /**
   * Whether `value` lies between `from` and `to`, in either order. `inclusivity` says which ends count:
   * `()` (the default) neither, `[]` both, `[)` the start, `(]` the end.
   */
  isBetween(opts: {
    value: TTemporalInput;
    from: TTemporalInput;
    to: TTemporalInput;
    unit?: TTemporalUnit;
    inclusivity?: TTemporalInclusivity;
    tz?: string;
  }): boolean;

  /**
   * How many whole units `value` is past `other` - negative when it is before - truncated toward
   * zero, counted as dayjs counts. Hours and smaller are elapsed time. Days and weeks are calendar
   * days in the zone: the wall clocks' difference, so a 23-hour daylight-saving day is one day.
   * Months, quarters and years are anchored on the date with the later day of the month, then
   * truncated, so `diff(a, b)` is always `-diff(b, a)`.
   */
  diff(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit: TTemporalUnit;
    tz?: string;
  }): number;

  /**
   * `-1`, `0` or `1` as `value` is before, in, or after the unit that holds `other`, in the zone.
   * Without a unit the two instants are compared to the millisecond.
   */
  compare(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit?: TTemporalUnit;
    tz?: string;
  }): -1 | 0 | 1;

  /**
   * `value` relative to `base` (default: now) in words, through `Intl.RelativeTimeFormat`:
   * `3 hours ago`, `in 2 days`. With a `unit`, it counts the unit's boundaries in the zone, so
   * 23:00 yesterday seen at 01:00 is `yesterday` under `numeric: 'auto'`. Without one it says the
   * largest whole unit that has elapsed, from years down to seconds.
   */
  relative(opts: {
    value: TTemporalInput;
    base?: TTemporalInput;
    unit?: TTemporalUnit;
    numeric?: Intl.RelativeTimeFormatNumeric;
    style?: Intl.RelativeTimeFormatStyle;
    tz?: string;
    locale?: string;
  }): string;

  /** A span of milliseconds as days, hours, minutes, seconds and milliseconds. A day is 24 hours. */
  durationParts(opts: { milliseconds: number }): ITemporalDurationParts;

  /**
   * A span of milliseconds written out: `compact` (the default) is `1d1h30m`; `narrow`, `short` and
   * `long` use the locale's unit words. Zero units are left out and milliseconds dropped.
   */
  formatDuration(opts: {
    milliseconds: number;
    style?: TTemporalDurationStyle;
    /** A clock face instead of words: `HH:mm:ss`, `mm:ss`, `D[d] HH:mm`. The largest token carries the rest. */
    pattern?: string;
    /** Only the largest units that are not zero: `1` writes `2 giờ` for 2 hours 5 minutes. */
    maxUnits?: number;
    locale?: string;
  }): string;
}
