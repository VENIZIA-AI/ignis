import { HTTP } from '@/common/constants/http';
import { BaseHelper } from '@/modules/base';
import { getError, isApplicationError } from '@/modules/error';
import { IntlTemporalAdapter } from './adapters/intl';
import { NativeTemporalAdapter } from './adapters/native';
import { TemporalCalendar } from './calendar';
import {
  DEFAULT_TEMPORAL_LOCALE,
  DEFAULT_TEMPORAL_PATTERN,
  DEFAULT_TEMPORAL_TIME_ZONE,
  TemporalInclusivities,
  TemporalUnits,
} from './common/constants';
import type {
  TTemporalDurationStyle,
  TTemporalInclusivity,
  TTemporalUnit,
} from './common/constants';
import type {
  ITemporalAdapter,
  ITemporalDurationParts,
  ITemporalLocaleNames,
  ITemporalParts,
  TRelativeUnit,
  TTemporalFields,
  IZonedTemporalParts,
  TTemporalInput,
} from './common/types';
import { TemporalDuration } from './duration';
import { TemporalLocale } from './locale';
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

const MAX_KNOWN_TIME_ZONES = 256;

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

/** How many entries each `names` list must hold. */
const NAME_LENGTHS: Record<keyof ITemporalLocaleNames, number> = {
  months: 12,
  monthsShort: 12,
  weekdays: 7,
  weekdaysShort: 7,
  weekdaysMin: 7,
  meridiem: 2,
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

const OUT_OF_RANGE = `outside the years ${TemporalCalendar.MIN_YEAR}-${TemporalCalendar.MAX_YEAR}`;

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
export class TemporalHelper extends BaseHelper {
  /** Validated once per process: `Intl` answers the same for a zone name every time. */
  private static readonly knownTimeZones = new Set<string>();

  private static readonly intlFormatters = new Map<string, Intl.DateTimeFormat>();

  private readonly adapter: ITemporalAdapter;
  private readonly timeZone: string;
  private readonly locale: string;
  private readonly names: Record<string, ITemporalLocaleNames>;

  /**
   * `locale` (default `en-US`) spells month and weekday names, AM/PM, relative time and durations,
   * unless a call passes its own. `names` replaces `Intl`'s wording for a locale - month and weekday
   * names, the AM/PM marker - keyed by the locale tag a call writes in.
   */
  constructor(opts?: {
    adapter?: ITemporalAdapter;
    timeZone?: string;
    locale?: string;
    names?: Record<string, ITemporalLocaleNames>;
    scope?: string;
  }) {
    super({ scope: opts?.scope ?? TemporalHelper.name });

    this.timeZone = TemporalHelper.ensureTimeZone({
      timeZone: opts?.timeZone ?? DEFAULT_TEMPORAL_TIME_ZONE,
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
    });
    this.locale = TemporalHelper.ensureLocale({ locale: opts?.locale ?? DEFAULT_TEMPORAL_LOCALE });
    this.adapter = opts?.adapter ?? TemporalHelper.defaultAdapter();
    this.names = TemporalHelper.ensureNames({ names: opts?.names ?? {} });
  }

  /** A helper like this one, with another locale or zone: same adapter, same `names`. */
  clone(opts: { locale?: string; timeZone?: string }): TemporalHelper {
    return new TemporalHelper({
      adapter: this.adapter,
      timeZone: opts.timeZone ?? this.timeZone,
      locale: opts.locale ?? this.locale,
      names: this.names,
      scope: this.scope,
    });
  }

  /** Every list the right length, so a bad table fails when the helper is built, not on a screen. */
  private static ensureNames(opts: {
    names: Record<string, ITemporalLocaleNames>;
  }): Record<string, ITemporalLocaleNames> {
    for (const [locale, names] of Object.entries(opts.names)) {
      TemporalHelper.ensureLocale({ locale });
      for (const [key, length] of Object.entries(NAME_LENGTHS)) {
        const list: unknown = Reflect.get(names, key);
        if (list === undefined) {
          continue;
        }
        if (
          !Array.isArray(list) ||
          list.length !== length ||
          !list.every(entry => typeof entry === 'string')
        ) {
          throw getError({
            statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
            message: `[TemporalHelper] names['${locale}'].${key} must hold ${length} strings`,
          });
        }
      }
    }
    return opts.names;
  }

  /** The wording this helper holds for `locale`, if any. */
  private namesOf(opts: { locale: string }): ITemporalLocaleNames | undefined {
    return Object.hasOwn(this.names, opts.locale) ? this.names[opts.locale] : undefined;
  }

  /** The runtime's `Temporal` where it has one; `Intl`, which every runtime has, everywhere else. */
  private static defaultAdapter(): ITemporalAdapter {
    return NativeTemporalAdapter.isTemporalNamespace(Reflect.get(globalThis, 'Temporal'))
      ? new NativeTemporalAdapter()
      : new IntlTemporalAdapter();
  }

  private static ensureLocale(opts: { locale: string }): string {
    TemporalLocale.of({ locale: opts.locale });
    return opts.locale;
  }

  /** A parse or input error the caller may treat as "not a date"; anything else is a bug and still throws. */
  private static isRefusal(error: unknown): boolean {
    return isApplicationError(error) && error.statusCode === HTTP.ResultCodes.RS_4.BadRequest;
  }

  private static ensureTimeZone(opts: { timeZone: string; statusCode: number }): string {
    const { timeZone, statusCode } = opts;
    if (TemporalHelper.knownTimeZones.has(timeZone)) {
      return timeZone;
    }

    try {
      new Intl.DateTimeFormat('en-US', { timeZone });
    } catch (error) {
      throw getError({
        statusCode,
        message: `[TemporalHelper] unknown time zone '${timeZone}' | ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    if (TemporalHelper.knownTimeZones.size < MAX_KNOWN_TIME_ZONES) {
      TemporalHelper.knownTimeZones.add(timeZone);
    }
    return timeZone;
  }

  private static ensureUnit(opts: { unit: string; amount?: number }): void {
    const { unit, amount } = opts;
    if (!TemporalUnits.isValid(unit)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[TemporalHelper] unknown unit '${unit}' | Supported: ${[...TemporalUnits.SCHEME_SET].join(', ')}`,
      });
    }
    if (amount === undefined) {
      return;
    }
    // Elapsed time takes a fraction (1.5 hours is 90 minutes); a calendar unit has no half.
    const isElapsed = TemporalCalendar.EXACT_UNIT_MILLISECONDS[unit] !== undefined;
    if (isElapsed ? !Number.isFinite(amount) : !Number.isInteger(amount)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: isElapsed
          ? `[TemporalHelper] amount must be a finite number - received ${amount}`
          : `[TemporalHelper] amount must be an integer for '${unit}' - received ${amount}`,
      });
    }
  }

  /** Every result passes here: an overflowing `add` is refused, never an Invalid Date. */
  private static ensureInstant(opts: { epoch: number }): Date {
    const { epoch } = opts;
    if (!(epoch >= MIN_INSTANT && epoch <= MAX_INSTANT)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[TemporalHelper] ${Number.isNaN(epoch) ? 'invalid date' : OUT_OF_RANGE} - received ${epoch}`,
      });
    }
    return new Date(epoch);
  }

  private static ensureYear(opts: { parts: ITemporalParts }): void {
    if (!TemporalCalendar.isSupportedYear({ year: opts.parts.year })) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[TemporalHelper] year ${opts.parts.year} is ${OUT_OF_RANGE}`,
      });
    }
  }

  private resolveTimeZone(opts: { timeZone?: string }): string {
    return opts.timeZone === undefined
      ? this.timeZone
      : TemporalHelper.ensureTimeZone({
          timeZone: opts.timeZone,
          statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        });
  }

  /** The adapter's one answer, rounded: an offset is whole milliseconds, a library's float may not be. */
  private offsetAt(opts: { epoch: number; timeZone: string }): number {
    return Math.round(
      this.adapter.getOffsetMilliseconds({ value: new Date(opts.epoch), timeZone: opts.timeZone }),
    );
  }

  private zonedParts(opts: { epoch: number; timeZone: string }): IZonedTemporalParts {
    const parts = TemporalCalendar.wallClockAt({
      epoch: opts.epoch,
      offsetMilliseconds: this.offsetAt(opts),
    });
    TemporalHelper.ensureYear({ parts });
    return parts;
  }

  /**
   * Every instant whose wall clock reads `parts` in the zone, earliest first: one as a rule, two
   * when the clock goes back, none when it jumps forward. `forward` is where a skipped time lands -
   * read with the offset from before the jump, so it moves past the gap.
   */
  private instantsOf(opts: { parts: ITemporalParts; timeZone: string }): {
    instants: Array<number>;
    forward: number;
  } {
    const { parts, timeZone } = opts;
    const local = TemporalCalendar.epochAtOffset({ parts, offsetMilliseconds: 0 });
    const before = this.offsetAt({ epoch: local - DAY_MILLISECONDS, timeZone });
    const after = this.offsetAt({ epoch: local + DAY_MILLISECONDS, timeZone });

    const offsets = before === after ? [before] : [before, after];
    const instants: Array<number> = [];
    for (const offset of offsets) {
      const candidate = local - offset;
      if (this.offsetAt({ epoch: candidate, timeZone }) === offset) {
        instants.push(candidate);
      }
    }
    instants.sort((left, right) => left - right);

    return { instants, forward: local - before };
  }

  /** The instant wall-clock `parts` name: a skipped time moves forward, a repeated one takes the earlier. */
  private earliestOf(opts: { parts: ITemporalParts; timeZone: string }): number {
    const { instants, forward } = this.instantsOf(opts);
    return instants[0] ?? forward;
  }

  /**
   * `[start, end)` of the unit holding `epoch`. A day or longer starts at its first instant. An hour
   * or less repeats when the clock goes back, so it starts at the latest start not after `epoch`,
   * and ends where the wall clock next shows either the following unit or this one's start again.
   */
  private unitBounds(opts: { epoch: number; unit: TTemporalUnit; timeZone: string }): {
    start: number;
    end: number;
  } {
    const { epoch, unit, timeZone } = opts;
    const startParts = TemporalCalendar.truncate({
      parts: this.zonedParts({ epoch, timeZone }),
      unit,
    });
    const nextParts = TemporalCalendar.shift({ parts: startParts, amount: 1, unit });
    TemporalHelper.ensureYear({ parts: nextParts });

    const starts = this.instantsOf({ parts: startParts, timeZone });
    if (TemporalCalendar.EXACT_UNIT_MILLISECONDS[unit] === undefined) {
      const start = starts.instants[0] ?? starts.forward;
      return { start, end: this.earliestOf({ parts: nextParts, timeZone }) };
    }

    const started = starts.instants.filter(instant => instant <= epoch);
    const start = started.at(-1) ?? starts.instants[0] ?? starts.forward;

    const nexts = this.instantsOf({ parts: nextParts, timeZone });
    const following = nexts.instants.find(instant => instant > start) ?? nexts.forward;
    const repeated = starts.instants.find(instant => instant > start);
    return { start, end: repeated === undefined ? following : Math.min(repeated, following) };
  }

  getTimeZone(): string {
    return this.timeZone;
  }

  getLocale(): string {
    return this.locale;
  }

  now(): Date {
    return new Date();
  }

  /** The instant a value names. An ISO string without an offset is read as wall clock in the zone. */
  toDate(opts: { value: TTemporalInput; timeZone?: string }): Date {
    const { value } = opts;

    if (typeof value === 'string') {
      return this.parse({ value, timeZone: opts.timeZone });
    }
    if (value instanceof Date) {
      return TemporalHelper.ensureInstant({ epoch: value.getTime() });
    }
    if (typeof value === 'number') {
      return TemporalHelper.ensureInstant({ epoch: value });
    }

    // `null` above all: read as a number it would be 1970, a date nobody meant.
    throw TemporalHelper.notADate({ value });
  }

  private static notADate(opts: { value: unknown }) {
    const { value } = opts;
    return getError({
      statusCode: HTTP.ResultCodes.RS_4.BadRequest,
      message: `[TemporalHelper] not a date - received ${value === null ? 'null' : typeof value}`,
    });
  }

  /** `toDate`, answering `null` where `toDate` refuses the value: null, undefined, bad text, NaN. */
  tryToDate(opts: { value: TTemporalInput | null | undefined; timeZone?: string }): Date | null {
    const { value } = opts;
    // Outside the try: a bad zone is the caller's bug, not an unreadable value.
    const timeZone = this.resolveTimeZone({ timeZone: opts.timeZone });
    if (value === null || value === undefined) {
      return null;
    }

    try {
      return this.toDate({ value, timeZone });
    } catch (error) {
      if (TemporalHelper.isRefusal(error)) {
        return null;
      }
      throw error;
    }
  }

  /** The wall clock the value shows in the zone, with its ISO weekday and UTC offset. */
  parts(opts: { value: TTemporalInput; timeZone?: string }): IZonedTemporalParts {
    const timeZone = this.resolveTimeZone({ timeZone: opts.timeZone });
    const date = this.toDate({ value: opts.value, timeZone });
    return this.zonedParts({ epoch: date.getTime(), timeZone });
  }

  /**
   * Reads a string. With a `pattern` (`YYYY YY MM M DD D HH H mm m ss s SSS Z ZZ`, text in
   * `[brackets]`), the value must match it exactly; without one it must be ISO 8601. An offset in
   * the value wins; otherwise the fields are wall clock in the zone.
   */
  parse(opts: { value: string; pattern?: string; timeZone?: string }): Date {
    const { value, pattern } = opts;
    const timeZone = this.resolveTimeZone({ timeZone: opts.timeZone });

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
        ? this.earliestOf({ parts: read.parts, timeZone })
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
  tryParse(opts: { value: string; pattern?: string; timeZone?: string }): Date | null {
    // Outside the try: a bad zone is the caller's bug, as a broken pattern is.
    const timeZone = this.resolveTimeZone({ timeZone: opts.timeZone });
    try {
      return this.parse({ ...opts, timeZone });
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
    timeZone?: string;
  }): boolean {
    const { value, pattern, timeZone } = opts;
    if (typeof value === 'string') {
      return this.tryParse({ value, pattern, timeZone }) !== null;
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
    timeZone?: string;
    locale?: string;
    fallback?: string;
  }): string {
    const { value, fallback } = opts;
    const timeZone = this.resolveTimeZone({ timeZone: opts.timeZone });
    const locale = opts.locale ?? this.locale;

    let date: Date | null;
    if (fallback !== undefined) {
      date = this.tryToDate({ value, timeZone });
    } else if (value === null || value === undefined) {
      throw TemporalHelper.notADate({ value });
    } else {
      date = this.toDate({ value, timeZone });
    }
    if (date === null) {
      return fallback ?? '';
    }

    return TemporalPattern.format({
      pattern: opts.pattern ?? DEFAULT_TEMPORAL_PATTERN,
      parts: this.zonedParts({ epoch: date.getTime(), timeZone }),
      locale,
      names: this.namesOf({ locale }),
    });
  }

  /** Writes the value with `Intl.DateTimeFormat` options, in the zone - for what the pattern tokens cannot say. */
  formatIntl(opts: {
    value: TTemporalInput;
    options?: Omit<Intl.DateTimeFormatOptions, 'timeZone'>;
    timeZone?: string;
    locale?: string;
  }): string {
    const timeZone = this.resolveTimeZone({ timeZone: opts.timeZone });
    const locale =
      opts.locale === undefined
        ? this.locale
        : TemporalHelper.ensureLocale({ locale: opts.locale });
    const date = this.toDate({ value: opts.value, timeZone });

    const key = `${locale}|${timeZone}|${JSON.stringify(opts.options ?? {})}`;
    let formatter = TemporalHelper.intlFormatters.get(key);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(locale, { ...opts.options, timeZone });
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
  add(opts: {
    value: TTemporalInput;
    amount: number;
    unit: TTemporalUnit;
    timeZone?: string;
  }): Date {
    const { amount, unit } = opts;
    TemporalHelper.ensureUnit({ unit, amount });

    const timeZone = this.resolveTimeZone({ timeZone: opts.timeZone });
    const date = this.toDate({ value: opts.value, timeZone });
    if (amount === 0) {
      return date;
    }

    const exact = TemporalCalendar.EXACT_UNIT_MILLISECONDS[unit];
    if (exact !== undefined) {
      return TemporalHelper.ensureInstant({ epoch: date.getTime() + amount * exact });
    }

    const parts = TemporalCalendar.wallClockOf({
      parts: this.zonedParts({ epoch: date.getTime(), timeZone }),
    });
    const shifted = TemporalCalendar.shift({ parts, amount, unit });
    TemporalHelper.ensureYear({ parts: shifted });

    return TemporalHelper.ensureInstant({ epoch: this.earliestOf({ parts: shifted, timeZone }) });
  }

  subtract(opts: {
    value: TTemporalInput;
    amount: number;
    unit: TTemporalUnit;
    timeZone?: string;
  }): Date {
    return this.add({ ...opts, amount: -opts.amount });
  }

  /** The first instant of the unit containing the value, in the zone. Weeks start on Monday. */
  startOf(opts: { value: TTemporalInput; unit: TTemporalUnit; timeZone?: string }): Date {
    const { unit } = opts;
    TemporalHelper.ensureUnit({ unit });

    const timeZone = this.resolveTimeZone({ timeZone: opts.timeZone });
    const date = this.toDate({ value: opts.value, timeZone });
    if (unit === TemporalUnits.MILLISECOND) {
      return date;
    }

    const { start } = this.unitBounds({ epoch: date.getTime(), unit, timeZone });
    return TemporalHelper.ensureInstant({ epoch: start });
  }

  /** The last millisecond of the unit containing the value, in the zone. */
  endOf(opts: { value: TTemporalInput; unit: TTemporalUnit; timeZone?: string }): Date {
    const { unit } = opts;
    TemporalHelper.ensureUnit({ unit });

    const timeZone = this.resolveTimeZone({ timeZone: opts.timeZone });
    const date = this.toDate({ value: opts.value, timeZone });
    if (unit === TemporalUnits.MILLISECOND) {
      return date;
    }

    const { end } = this.unitBounds({ epoch: date.getTime(), unit, timeZone });
    return TemporalHelper.ensureInstant({ epoch: end - 1 });
  }

  /** Monday to Friday, read on the wall clock of the zone. */
  isWeekday(opts: { value: TTemporalInput; timeZone?: string }): boolean {
    return this.parts(opts).dayOfWeek <= 5;
  }

  nextWeekday(opts: { value: TTemporalInput; timeZone?: string }): Date {
    return this.stepToWeekday({ ...opts, step: 1 });
  }

  previousWeekday(opts: { value: TTemporalInput; timeZone?: string }): Date {
    return this.stepToWeekday({ ...opts, step: -1 });
  }

  private stepToWeekday(opts: { value: TTemporalInput; timeZone?: string; step: number }): Date {
    let candidate = this.add({
      value: opts.value,
      amount: opts.step,
      unit: TemporalUnits.DAY,
      timeZone: opts.timeZone,
    });

    while (!this.isWeekday({ value: candidate, timeZone: opts.timeZone })) {
      candidate = this.add({
        value: candidate,
        amount: opts.step,
        unit: TemporalUnits.DAY,
        timeZone: opts.timeZone,
      });
    }
    return candidate;
  }

  /**
   * The value with wall-clock fields replaced in the zone - `{ hour: 9, minute: 0 }` is 09:00 that day.
   * `month` is 1-12. The day is clamped to the month's last day, so setting February on the 31st
   * lands on the 28th or 29th. A wall time a daylight-saving jump skips resolves forward, as `parse` does.
   */
  set(opts: { value: TTemporalInput; timeZone?: string } & TTemporalFields): Date {
    const timeZone = this.resolveTimeZone({ timeZone: opts.timeZone });
    const date = this.toDate({ value: opts.value, timeZone });
    const wall = TemporalCalendar.wallClockOf({
      parts: this.zonedParts({ epoch: date.getTime(), timeZone }),
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

    return TemporalHelper.ensureInstant({ epoch: this.earliestOf({ parts: next, timeZone }) });
  }

  /** `value` is before `other` - at the unit's granularity in the zone when `unit` is given. */
  isBefore(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit?: TTemporalUnit;
    timeZone?: string;
  }): boolean {
    return this.compare(opts) < 0;
  }

  isAfter(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit?: TTemporalUnit;
    timeZone?: string;
  }): boolean {
    return this.compare(opts) > 0;
  }

  /** In the same unit - `unit: 'day'` is the same calendar day in the zone. */
  isSame(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit?: TTemporalUnit;
    timeZone?: string;
  }): boolean {
    return this.compare(opts) === 0;
  }

  isSameOrBefore(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit?: TTemporalUnit;
    timeZone?: string;
  }): boolean {
    return this.compare(opts) <= 0;
  }

  isSameOrAfter(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit?: TTemporalUnit;
    timeZone?: string;
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
    timeZone?: string;
  }): boolean {
    const { value, from, to, unit, inclusivity = TemporalInclusivities.EXCLUSIVE, timeZone } = opts;
    if (!TemporalInclusivities.isValid(inclusivity)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[TemporalHelper] unknown inclusivity '${inclusivity}' | Supported: ${[...TemporalInclusivities.SCHEME_SET].join(', ')}`,
      });
    }

    const isStartIncluded = inclusivity.startsWith('[');
    const isEndIncluded = inclusivity.endsWith(']');
    const fromOrder = this.compare({ value, other: from, unit, timeZone });
    const toOrder = this.compare({ value, other: to, unit, timeZone });

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
    timeZone?: string;
  }): number {
    const { unit } = opts;
    TemporalHelper.ensureUnit({ unit });

    const timeZone = this.resolveTimeZone({ timeZone: opts.timeZone });
    const value = this.toDate({ value: opts.value, timeZone }).getTime();
    const other = this.toDate({ value: opts.other, timeZone }).getTime();

    // `+ 0` turns a truncated `-0` into `0`.
    const exact = TemporalCalendar.EXACT_UNIT_MILLISECONDS[unit];
    if (exact !== undefined) {
      return Math.trunc((value - other) / exact) + 0;
    }

    const months = MONTHS_IN[unit];
    if (months !== undefined) {
      return Math.trunc(this.monthGap({ value, other, timeZone }) / months) + 0;
    }

    const wallClocks =
      TemporalCalendar.epochAtOffset({
        parts: TemporalCalendar.wallClockOf({ parts: this.zonedParts({ epoch: value, timeZone }) }),
        offsetMilliseconds: 0,
      }) -
      TemporalCalendar.epochAtOffset({
        parts: TemporalCalendar.wallClockOf({ parts: this.zonedParts({ epoch: other, timeZone }) }),
        offsetMilliseconds: 0,
      });
    const days = wallClocks / DAY_MILLISECONDS;
    return Math.trunc(unit === TemporalUnits.WEEK ? days / 7 : days) + 0;
  }

  /**
   * Fractional months from `other` to `value` (dayjs and moment's month difference): anchored on the
   * date with the later day of the month, whole months by `add`, the rest as a share of the month
   * it falls in.
   */
  private monthGap(opts: { value: number; other: number; timeZone: string }): number {
    const { value, other, timeZone } = opts;
    const valueParts = this.zonedParts({ epoch: value, timeZone });
    const otherParts = this.zonedParts({ epoch: other, timeZone });
    if (valueParts.day < otherParts.day) {
      return -this.monthGap({ value: other, other: value, timeZone });
    }

    const whole = (otherParts.year - valueParts.year) * 12 + (otherParts.month - valueParts.month);
    const anchor = this.shiftMonthsFrom({ parts: valueParts, months: whole, timeZone });
    const isBelow = other - anchor < 0;
    const nextAnchor = this.shiftMonthsFrom({
      parts: valueParts,
      months: whole + (isBelow ? -1 : 1),
      timeZone,
    });
    const span = isBelow ? anchor - nextAnchor : nextAnchor - anchor;

    return -(whole + (other - anchor) / span) || 0;
  }

  /** `add` by months without the 1-9999 check: an anchor one month past the range is still a number. */
  private shiftMonthsFrom(opts: {
    parts: IZonedTemporalParts;
    months: number;
    timeZone: string;
  }): number {
    const { parts, months, timeZone } = opts;
    const shifted = TemporalCalendar.shift({
      parts: TemporalCalendar.wallClockOf({ parts }),
      amount: months,
      unit: TemporalUnits.MONTH,
    });
    return this.earliestOf({ parts: shifted, timeZone });
  }

  /**
   * `-1`, `0` or `1` as `value` is before, in, or after the unit that holds `other`, in the zone.
   * Without a unit the two instants are compared to the millisecond.
   */
  compare(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit?: TTemporalUnit;
    timeZone?: string;
  }): -1 | 0 | 1 {
    const { unit } = opts;
    const timeZone = this.resolveTimeZone({ timeZone: opts.timeZone });

    const value =
      unit === undefined
        ? this.toDate({ value: opts.value, timeZone })
        : this.startOf({ value: opts.value, unit, timeZone });
    const other =
      unit === undefined
        ? this.toDate({ value: opts.other, timeZone })
        : this.startOf({ value: opts.other, unit, timeZone });

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
    timeZone?: string;
    locale?: string;
  }): string {
    const { unit, numeric = 'always', style = 'long' } = opts;
    const timeZone = this.resolveTimeZone({ timeZone: opts.timeZone });
    const locale =
      opts.locale === undefined
        ? this.locale
        : TemporalHelper.ensureLocale({ locale: opts.locale });
    const value = this.toDate({ value: opts.value, timeZone });
    const base = opts.base === undefined ? this.now() : this.toDate({ value: opts.base, timeZone });

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
        value: this.startOf({ value, unit, timeZone }),
        other: this.startOf({ value: base, unit, timeZone }),
        unit,
        timeZone,
      });
      said = unit;
    } else {
      for (const candidate of RELATIVE_UNITS) {
        const counted = this.diff({ value, other: base, unit: candidate, timeZone });
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
