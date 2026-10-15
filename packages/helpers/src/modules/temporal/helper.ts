import { HTTP } from '@/common/constants/http';
import { getError } from '@/modules/error';
import { AbstractTemporalHelper } from './abstract';
import { TemporalCalendar } from './calendar';
import { DEFAULT_TEMPORAL_PATTERN, TemporalInclusivities, TemporalUnits } from './common/constants';
import type {
  TTemporalDurationStyle,
  TTemporalInclusivity,
  TTemporalUnit,
} from './common/constants';
import type {
  ITemporalDurationParts,
  ITemporalParts,
  TRelativeUnit,
  TTemporalFields,
  TTemporalInput,
} from './common/types';
import { TemporalDuration } from './duration';
import { TemporalPattern } from './pattern';

/** `2026-09-19`, `2026-09-19T12:00`, `2026-09-19 12:00:00.021+07:00`, `...Z` - an offset only after a time. */
const ISO_8601 =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}(?::?\d{2}(?::?\d{2})?)?)?)?$/i;

/** The offset of an ISO 8601 value: `+07`, `+07:00`, `+0700`, `+07:06:40`. */
const ISO_OFFSET = /^([+-])(\d{2})(?::?(\d{2})(?::?(\d{2}))?)?$/;

const DAY_MILLISECONDS = 86_400_000;

/** 0001-01-01T00:00:00.000Z and 9999-12-31T23:59:59.999Z. */
const MIN_INSTANT = -62_135_596_800_000;
const MAX_INSTANT = 253_402_300_799_999;

/** Months in each calendar unit `diff` counts by months. */
const MONTHS_IN: Partial<Record<TTemporalUnit, number>> = {
  [TemporalUnits.MONTH]: 1,
  [TemporalUnits.QUARTER]: 3,
  [TemporalUnits.YEAR]: 12,
};

/** What each wall-clock field `set` takes. The day is clamped to the month separately. */
const FIELD_RANGES: Record<keyof ITemporalParts, [number, number]> = {
  year: [TemporalCalendar.MIN_YEAR, TemporalCalendar.MAX_YEAR],
  month: [1, 12],
  day: [1, 31],
  hour: [0, 23],
  minute: [0, 59],
  second: [0, 59],
  millisecond: [0, 999],
};

/** `formatIntl` builds one formatter per locale, options and zone; capped so caller-fed options cannot grow it. */
const MAX_INTL_FORMATTERS = 128;

/** `relative` without a unit says it in the largest whole one, down to seconds. */
const RELATIVE_UNITS: Array<TRelativeUnit> = [
  TemporalUnits.YEAR,
  TemporalUnits.MONTH,
  TemporalUnits.WEEK,
  TemporalUnits.DAY,
  TemporalUnits.HOUR,
  TemporalUnits.MINUTE,
  TemporalUnits.SECOND,
];

/**
 * Dates in one time zone, through whichever library you choose: pass an adapter - the runtime's
 * `Temporal` (the default where the runtime has it, `Intl` everywhere else), your own dayjs, your own Luxon. The adapter only reports a zone's UTC
 * offset at an instant; the wall clock, daylight-saving gaps and repeats, and the calendar math all
 * live here, so every adapter shares one behaviour.
 *
 * Values go in as a `Date`, epoch milliseconds or an ISO 8601 string, and come out as a `Date`, so
 * swapping the adapter never touches a call site. The zone is yours to set: without one this helper
 * computes in UTC, never in the host's zone. Years run from 1 to 9999.
 */
export class TemporalHelper extends AbstractTemporalHelper {
  private static readonly intlFormatters = new Map<string, Intl.DateTimeFormat>();

  /**
   * A date picker hands back a `Date` meaning "this wall clock in the host's zone". This returns the
   * instant that shows the same year, month, day and time in the helper's zone. `sourceTz` defaults
   * to the host's. A skipped wall time resolves forward, a repeated one to the earlier instant.
   */
  fromWallClock(opts: { value: TTemporalInput; sourceTz?: string; tz?: string }): Date {
    return this.moveWallClock({
      value: opts.value,
      from: opts.sourceTz ?? TemporalHelper.getHostTz(),
      to: this.resolveTz({ tz: opts.tz }),
    });
  }

  /**
   * The reverse of `fromWallClock`, to feed a picker: a `Date` whose wall clock in `targetTz` (default:
   * the host's) reads what the helper's zone reads for `value`.
   */
  toWallClock(opts: { value: TTemporalInput; targetTz?: string; tz?: string }): Date {
    return this.moveWallClock({
      value: opts.value,
      from: this.resolveTz({ tz: opts.tz }),
      to: opts.targetTz ?? TemporalHelper.getHostTz(),
    });
  }

  /** A helper like this one, with another locale or zone: same adapter, same `names`. */
  clone(opts: { locale?: string; tz?: string }): TemporalHelper {
    return new TemporalHelper({
      adapter: this.adapter,
      tz: opts.tz ?? this.tz,
      locale: opts.locale ?? this.locale,
      names: this.names,
      scope: this.scope,
    });
  }

  /**
   * Reads a string. With a `pattern` (`YYYY YY MM M DD D HH H mm m ss s SSS Z ZZ`, text in
   * `[brackets]`), the value must match it exactly; without one it must be ISO 8601. An offset in
   * the value wins; otherwise the fields are wall clock in the zone.
   */
  parse(opts: { value: string; pattern?: string; tz?: string }): Date {
    const { value, pattern } = opts;
    const tz = this.resolveTz({ tz: opts.tz });

    const read = pattern ? TemporalPattern.parse({ pattern, value }) : this.readIso({ value });
    if (!read) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: pattern
          ? `[TemporalHelper] '${value}' does not match pattern '${pattern}'`
          : `[TemporalHelper] '${value}' is not ISO 8601 | Pass a pattern for any other shape`,
      });
    }

    if (!TemporalCalendar.isRealDateTime({ parts: read.parts })) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[TemporalHelper] '${value}' is not a real date and time`,
      });
    }

    const epoch =
      read.offsetMilliseconds === undefined
        ? this.earliestOf({ parts: read.parts, tz })
        : TemporalCalendar.epochAtOffset({
            parts: read.parts,
            offsetMilliseconds: read.offsetMilliseconds,
          });
    return TemporalHelper.ensureInstant({ epoch });
  }

  private readIso(opts: {
    value: string;
  }): { parts: ITemporalParts; offsetMilliseconds?: number } | undefined {
    const match = ISO_8601.exec(opts.value);
    if (!match) {
      return undefined;
    }

    const [, year, month, day, hour, minute, second, fraction, offset] = match;
    const parts: ITemporalParts = {
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: Number(hour ?? 0),
      minute: Number(minute ?? 0),
      second: Number(second ?? 0),
      millisecond: Number((fraction ?? '0').padEnd(3, '0').slice(0, 3)),
    };

    if (!offset) {
      return { parts };
    }
    if (offset.toUpperCase() === 'Z') {
      return { parts, offsetMilliseconds: 0 };
    }

    const [, sign, offsetHours, offsetMinutes, offsetSeconds] = ISO_OFFSET.exec(offset) ?? [];
    const hours = Number(offsetHours);
    const minutes = Number(offsetMinutes ?? 0);
    const seconds = Number(offsetSeconds ?? 0);
    if (!(hours <= 23 && minutes <= 59 && seconds <= 59)) {
      return undefined;
    }

    const milliseconds = ((hours * 60 + minutes) * 60 + seconds) * 1000;
    return { parts, offsetMilliseconds: sign === '-' ? -milliseconds : milliseconds };
  }

  /** `parse`, answering `null` where `parse` refuses the value. A pattern that does not compile still throws. */
  tryParse(opts: { value: string; pattern?: string; tz?: string }): Date | null {
    // Outside the try: a bad zone is the caller's bug, as a broken pattern is.
    const tz = this.resolveTz({ tz: opts.tz });
    try {
      return this.parse({ ...opts, tz });
    } catch (error) {
      if (TemporalHelper.isRefusal(error)) {
        return null;
      }
      throw error;
    }
  }

  /** Whether the value names an instant in years 1-9999 - a string read as `parse` reads it. */
  isValid(opts: {
    value: TTemporalInput | null | undefined;
    pattern?: string;
    tz?: string;
  }): boolean {
    const { value, pattern, tz } = opts;
    if (typeof value === 'string') {
      return this.tryParse({ value, pattern, tz }) !== null;
    }
    if (!(value instanceof Date) && typeof value !== 'number') {
      return false;
    }

    const epoch = value instanceof Date ? value.getTime() : value;
    return epoch >= MIN_INSTANT && epoch <= MAX_INSTANT;
  }

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
  }): string {
    const { value, fallback } = opts;
    const tz = this.resolveTz({ tz: opts.tz });
    const locale = opts.locale ?? this.locale;

    let date: Date | null;
    if (fallback !== undefined) {
      date = this.tryToDate({ value, tz });
    } else if (value === null || value === undefined) {
      throw TemporalHelper.notADate({ value });
    } else {
      date = this.toDate({ value, tz });
    }
    if (date === null) {
      return fallback ?? '';
    }

    return TemporalPattern.format({
      pattern: opts.pattern ?? DEFAULT_TEMPORAL_PATTERN,
      parts: this.zonedParts({ epoch: date.getTime(), tz }),
      locale,
      names: this.namesOf({ locale }),
    });
  }

  /** Writes the value with `Intl.DateTimeFormat` options, in the zone - for what the pattern tokens cannot say. */
  formatIntl(opts: {
    value: TTemporalInput;
    options?: Omit<Intl.DateTimeFormatOptions, 'timeZone'>;
    tz?: string;
    locale?: string;
  }): string {
    const tz = this.resolveTz({ tz: opts.tz });
    const locale =
      opts.locale === undefined
        ? this.locale
        : TemporalHelper.ensureLocale({ locale: opts.locale });
    const date = this.toDate({ value: opts.value, tz });

    const key = `${locale}|${tz}|${JSON.stringify(opts.options ?? {})}`;
    let formatter = TemporalHelper.intlFormatters.get(key);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(locale, { ...opts.options, timeZone: tz });
      if (TemporalHelper.intlFormatters.size < MAX_INTL_FORMATTERS) {
        TemporalHelper.intlFormatters.set(key, formatter);
      }
    }
    return formatter.format(date);
  }

  /**
   * Moves the value by whole units. Hours and smaller are elapsed time; days and larger move the
   * calendar in the zone, so a day across a daylight-saving jump keeps the wall time, and a month
   * past a shorter month clamps to its last day.
   */
  add(opts: { value: TTemporalInput; amount: number; unit: TTemporalUnit; tz?: string }): Date {
    const { amount, unit } = opts;
    TemporalHelper.ensureUnit({ unit, amount });

    const tz = this.resolveTz({ tz: opts.tz });
    const date = this.toDate({ value: opts.value, tz });
    if (amount === 0) {
      return date;
    }

    const exact = TemporalCalendar.EXACT_UNIT_MILLISECONDS[unit];
    if (exact !== undefined) {
      return TemporalHelper.ensureInstant({ epoch: date.getTime() + amount * exact });
    }

    const parts = TemporalCalendar.wallClockOf({
      parts: this.zonedParts({ epoch: date.getTime(), tz }),
    });
    const shifted = TemporalCalendar.shift({ parts, amount, unit });
    TemporalHelper.ensureYear({ parts: shifted });

    return TemporalHelper.ensureInstant({ epoch: this.earliestOf({ parts: shifted, tz }) });
  }

  subtract(opts: {
    value: TTemporalInput;
    amount: number;
    unit: TTemporalUnit;
    tz?: string;
  }): Date {
    return this.add({ ...opts, amount: -opts.amount });
  }

  /** The first instant of the unit containing the value, in the zone. Weeks start on Monday. */
  startOf(opts: { value: TTemporalInput; unit: TTemporalUnit; tz?: string }): Date {
    const { unit } = opts;
    TemporalHelper.ensureUnit({ unit });

    const tz = this.resolveTz({ tz: opts.tz });
    const date = this.toDate({ value: opts.value, tz });
    if (unit === TemporalUnits.MILLISECOND) {
      return date;
    }

    const { start } = this.unitBounds({ epoch: date.getTime(), unit, tz });
    return TemporalHelper.ensureInstant({ epoch: start });
  }

  /** The last millisecond of the unit containing the value, in the zone. */
  endOf(opts: { value: TTemporalInput; unit: TTemporalUnit; tz?: string }): Date {
    const { unit } = opts;
    TemporalHelper.ensureUnit({ unit });

    const tz = this.resolveTz({ tz: opts.tz });
    const date = this.toDate({ value: opts.value, tz });
    if (unit === TemporalUnits.MILLISECOND) {
      return date;
    }

    const { end } = this.unitBounds({ epoch: date.getTime(), unit, tz });
    return TemporalHelper.ensureInstant({ epoch: end - 1 });
  }

  /** Monday to Friday, read on the wall clock of the zone. */
  isWeekday(opts: { value: TTemporalInput; tz?: string }): boolean {
    return this.parts(opts).dayOfWeek <= 5;
  }

  nextWeekday(opts: { value: TTemporalInput; tz?: string }): Date {
    return this.stepToWeekday({ ...opts, step: 1 });
  }

  previousWeekday(opts: { value: TTemporalInput; tz?: string }): Date {
    return this.stepToWeekday({ ...opts, step: -1 });
  }

  private stepToWeekday(opts: { value: TTemporalInput; tz?: string; step: number }): Date {
    let candidate = this.add({
      value: opts.value,
      amount: opts.step,
      unit: TemporalUnits.DAY,
      tz: opts.tz,
    });

    while (!this.isWeekday({ value: candidate, tz: opts.tz })) {
      candidate = this.add({
        value: candidate,
        amount: opts.step,
        unit: TemporalUnits.DAY,
        tz: opts.tz,
      });
    }
    return candidate;
  }

  /**
   * The value with wall-clock fields replaced in the zone - `{ hour: 9, minute: 0 }` is 09:00 that day.
   * `month` is 1-12. The day is clamped to the month's last day, so setting February on the 31st
   * lands on the 28th or 29th. A wall time a daylight-saving jump skips resolves forward, as `parse` does.
   */
  set(opts: { value: TTemporalInput; tz?: string } & TTemporalFields): Date {
    const tz = this.resolveTz({ tz: opts.tz });
    const date = this.toDate({ value: opts.value, tz });
    const wall = TemporalCalendar.wallClockOf({
      parts: this.zonedParts({ epoch: date.getTime(), tz }),
    });

    const next: ITemporalParts = { ...wall };
    for (const [field, [min, max]] of Object.entries(FIELD_RANGES)) {
      const given: unknown = Reflect.get(opts, field);
      if (given === undefined) {
        continue;
      }
      if (typeof given !== 'number' || !Number.isInteger(given) || given < min || given > max) {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_4.BadRequest,
          message: `[TemporalHelper] ${field} must be an integer from ${min} to ${max} - received ${String(given)}`,
        });
      }
      Reflect.set(next, field, given);
    }
    next.day = Math.min(
      next.day,
      TemporalCalendar.daysInMonth({ year: next.year, month: next.month }),
    );

    return TemporalHelper.ensureInstant({ epoch: this.earliestOf({ parts: next, tz }) });
  }

  /** `value` is before `other` - at the unit's granularity in the zone when `unit` is given. */
  isBefore(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit?: TTemporalUnit;
    tz?: string;
  }): boolean {
    return this.compare(opts) < 0;
  }

  isAfter(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit?: TTemporalUnit;
    tz?: string;
  }): boolean {
    return this.compare(opts) > 0;
  }

  /** In the same unit - `unit: 'day'` is the same calendar day in the zone. */
  isSame(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit?: TTemporalUnit;
    tz?: string;
  }): boolean {
    return this.compare(opts) === 0;
  }

  isSameOrBefore(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit?: TTemporalUnit;
    tz?: string;
  }): boolean {
    return this.compare(opts) <= 0;
  }

  isSameOrAfter(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit?: TTemporalUnit;
    tz?: string;
  }): boolean {
    return this.compare(opts) >= 0;
  }

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
  }): boolean {
    const { value, from, to, unit, inclusivity = TemporalInclusivities.EXCLUSIVE, tz } = opts;
    if (!TemporalInclusivities.isValid(inclusivity)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[TemporalHelper] unknown inclusivity '${inclusivity}' | Supported: ${[...TemporalInclusivities.SCHEME_SET].join(', ')}`,
      });
    }

    const isStartIncluded = inclusivity.startsWith('[');
    const isEndIncluded = inclusivity.endsWith(']');
    const fromOrder = this.compare({ value, other: from, unit, tz });
    const toOrder = this.compare({ value, other: to, unit, tz });

    const isAfterStart = isStartIncluded ? fromOrder >= 0 : fromOrder > 0;
    const isBeforeEnd = isEndIncluded ? toOrder <= 0 : toOrder < 0;
    // The range given backwards: `to` is the earlier end.
    const isAfterEnd = isEndIncluded ? toOrder >= 0 : toOrder > 0;
    const isBeforeStart = isStartIncluded ? fromOrder <= 0 : fromOrder < 0;
    return (isAfterStart && isBeforeEnd) || (isAfterEnd && isBeforeStart);
  }

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
  }): number {
    const { unit } = opts;
    TemporalHelper.ensureUnit({ unit });

    const tz = this.resolveTz({ tz: opts.tz });
    const value = this.toDate({ value: opts.value, tz }).getTime();
    const other = this.toDate({ value: opts.other, tz }).getTime();

    // `+ 0` turns a truncated `-0` into `0`.
    const exact = TemporalCalendar.EXACT_UNIT_MILLISECONDS[unit];
    if (exact !== undefined) {
      return Math.trunc((value - other) / exact) + 0;
    }

    const months = MONTHS_IN[unit];
    if (months !== undefined) {
      return Math.trunc(this.monthGap({ value, other, tz }) / months) + 0;
    }

    const wallClocks =
      TemporalCalendar.epochAtOffset({
        parts: TemporalCalendar.wallClockOf({ parts: this.zonedParts({ epoch: value, tz }) }),
        offsetMilliseconds: 0,
      }) -
      TemporalCalendar.epochAtOffset({
        parts: TemporalCalendar.wallClockOf({ parts: this.zonedParts({ epoch: other, tz }) }),
        offsetMilliseconds: 0,
      });
    const days = wallClocks / DAY_MILLISECONDS;
    return Math.trunc(unit === TemporalUnits.WEEK ? days / 7 : days) + 0;
  }

  /**
   * `-1`, `0` or `1` as `value` is before, in, or after the unit that holds `other`, in the zone.
   * Without a unit the two instants are compared to the millisecond.
   */
  compare(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit?: TTemporalUnit;
    tz?: string;
  }): -1 | 0 | 1 {
    const { unit } = opts;
    const tz = this.resolveTz({ tz: opts.tz });

    const value =
      unit === undefined
        ? this.toDate({ value: opts.value, tz })
        : this.startOf({ value: opts.value, unit, tz });
    const other =
      unit === undefined
        ? this.toDate({ value: opts.other, tz })
        : this.startOf({ value: opts.other, unit, tz });

    const delta = value.getTime() - other.getTime();
    return delta < 0 ? -1 : delta > 0 ? 1 : 0;
  }

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
  }): string {
    const { unit, numeric = 'always', style = 'long' } = opts;
    const tz = this.resolveTz({ tz: opts.tz });
    const locale =
      opts.locale === undefined
        ? this.locale
        : TemporalHelper.ensureLocale({ locale: opts.locale });
    const value = this.toDate({ value: opts.value, tz });
    const base = opts.base === undefined ? this.now() : this.toDate({ value: opts.base, tz });

    let amount = 0;
    let said: TRelativeUnit = TemporalUnits.SECOND;
    if (unit !== undefined) {
      TemporalHelper.ensureUnit({ unit });
      if (unit === TemporalUnits.MILLISECOND) {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_4.BadRequest,
          message: '[TemporalHelper] relative time has no millisecond unit | Use second or larger',
        });
      }
      amount = this.diff({
        value: this.startOf({ value, unit, tz }),
        other: this.startOf({ value: base, unit, tz }),
        unit,
        tz,
      });
      said = unit;
    } else {
      for (const candidate of RELATIVE_UNITS) {
        const counted = this.diff({ value, other: base, unit: candidate, tz });
        if (counted !== 0 || candidate === TemporalUnits.SECOND) {
          amount = counted;
          said = candidate;
          break;
        }
      }
    }

    return new Intl.RelativeTimeFormat(locale, { numeric, style }).format(amount, said);
  }

  /** A span of milliseconds as days, hours, minutes, seconds and milliseconds. A day is 24 hours. */
  durationParts(opts: { milliseconds: number }): ITemporalDurationParts {
    return TemporalDuration.parts(opts);
  }

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
  }): string {
    const locale =
      opts.locale === undefined
        ? this.locale
        : TemporalHelper.ensureLocale({ locale: opts.locale });
    return TemporalDuration.format({
      milliseconds: opts.milliseconds,
      style: opts.style,
      pattern: opts.pattern,
      maxUnits: opts.maxUnits,
      locale,
    });
  }
}
