import { HTTP } from '@/common/constants/http';
import { BaseHelper } from '@/modules/base';
import { getError, isApplicationError } from '@/modules/error';
import { isTemporalNamespace } from './adapters/guards';
import { IntlTemporalAdapter } from './adapters/intl';
import { NativeTemporalAdapter } from './adapters/native';
import {
  epochAtOffset,
  EXACT_UNIT_MILLISECONDS,
  isRealDateTime,
  isSupportedYear,
  MAX_TEMPORAL_YEAR,
  MIN_TEMPORAL_YEAR,
  shiftWallClock,
  truncateTo,
  wallClockAt,
  wallClockOf,
} from './calendar';
import {
  DEFAULT_TEMPORAL_LOCALE,
  DEFAULT_TEMPORAL_PATTERN,
  DEFAULT_TEMPORAL_TIME_ZONE,
  TemporalUnits,
} from './common/constants';
import type { TTemporalDurationStyle, TTemporalUnit } from './common/constants';
import type {
  ITemporalAdapter,
  ITemporalDurationParts,
  ITemporalParts,
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

/** `formatIntl` builds one formatter per locale, options and zone; capped so caller-fed options cannot grow it. */
const MAX_INTL_FORMATTERS = 128;

/** The units `Intl.RelativeTimeFormat` speaks: every temporal unit but the millisecond. */
type TRelativeUnit = Exclude<TTemporalUnit, typeof TemporalUnits.MILLISECOND>;

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

const OUT_OF_RANGE = `outside the years ${MIN_TEMPORAL_YEAR}-${MAX_TEMPORAL_YEAR}`;

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

  /**
   * `locale` (default `en-US`) spells month and weekday names, AM/PM, relative time and durations,
   * unless a call passes its own.
   */
  constructor(opts?: {
    adapter?: ITemporalAdapter;
    timeZone?: string;
    locale?: string;
    scope?: string;
  }) {
    super({ scope: opts?.scope ?? TemporalHelper.name });

    this.timeZone = TemporalHelper.ensureTimeZone({
      timeZone: opts?.timeZone ?? DEFAULT_TEMPORAL_TIME_ZONE,
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
    });
    this.locale = TemporalHelper.ensureLocale({ locale: opts?.locale ?? DEFAULT_TEMPORAL_LOCALE });
    this.adapter = opts?.adapter ?? TemporalHelper.defaultAdapter();
  }

  /** The runtime's `Temporal` where it has one; `Intl`, which every runtime has, everywhere else. */
  private static defaultAdapter(): ITemporalAdapter {
    return isTemporalNamespace(Reflect.get(globalThis, 'Temporal'))
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
    if (amount !== undefined && !Number.isInteger(amount)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[TemporalHelper] amount must be an integer - received ${amount}`,
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
    if (!isSupportedYear(opts.parts.year)) {
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
    const parts = wallClockAt({ epoch: opts.epoch, offsetMilliseconds: this.offsetAt(opts) });
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
    const local = epochAtOffset({ parts, offsetMilliseconds: 0 });
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
    const startParts = truncateTo({ parts: this.zonedParts({ epoch, timeZone }), unit });
    const nextParts = shiftWallClock({ parts: startParts, amount: 1, unit });
    TemporalHelper.ensureYear({ parts: nextParts });

    const starts = this.instantsOf({ parts: startParts, timeZone });
    if (EXACT_UNIT_MILLISECONDS[unit] === undefined) {
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

    return TemporalHelper.ensureInstant({
      epoch: value instanceof Date ? value.getTime() : value,
    });
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

    if (!isRealDateTime({ parts: read.parts })) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[TemporalHelper] '${value}' is not a real date and time`,
      });
    }

    const epoch =
      read.offsetMilliseconds === undefined
        ? this.earliestOf({ parts: read.parts, timeZone })
        : epochAtOffset({ parts: read.parts, offsetMilliseconds: read.offsetMilliseconds });
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
  isValid(opts: { value: TTemporalInput; pattern?: string; timeZone?: string }): boolean {
    const { value, pattern, timeZone } = opts;
    if (typeof value === 'string') {
      return this.tryParse({ value, pattern, timeZone }) !== null;
    }

    const epoch = value instanceof Date ? value.getTime() : value;
    return epoch >= MIN_INSTANT && epoch <= MAX_INSTANT;
  }

  /**
   * Writes the value in the zone. Without a `pattern`: ISO 8601 with the zone's offset. The locale
   * tokens `MMMM MMM dddd ddd A a hh h LL L` are spelled in `locale`.
   */
  format(opts: {
    value: TTemporalInput;
    pattern?: string;
    timeZone?: string;
    locale?: string;
  }): string {
    return TemporalPattern.format({
      pattern: opts.pattern ?? DEFAULT_TEMPORAL_PATTERN,
      parts: this.parts({ value: opts.value, timeZone: opts.timeZone }),
      locale: opts.locale ?? this.locale,
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

    const exact = EXACT_UNIT_MILLISECONDS[unit];
    if (exact !== undefined) {
      return TemporalHelper.ensureInstant({ epoch: date.getTime() + amount * exact });
    }

    const parts = wallClockOf({ parts: this.zonedParts({ epoch: date.getTime(), timeZone }) });
    const shifted = shiftWallClock({ parts, amount, unit });
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
   * How many whole units `value` is past `other` - negative when it is before - truncated toward
   * zero. Hours and smaller count elapsed time. Days and larger count the calendar in the zone, as
   * `add` moves it: the answer is the largest `n` that `add` can move `other` by without passing
   * `value`, so `diff(add(x, n), x)` is `n` wherever the zone skips no whole day.
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

    const exact = EXACT_UNIT_MILLISECONDS[unit];
    if (exact !== undefined) {
      // `+ 0` turns a truncated `-0` into `0`.
      return Math.trunc((value - other) / exact) + 0;
    }
    if (value === other) {
      return 0;
    }

    const later = this.zonedParts({ epoch: value, timeZone });
    const earlier = this.zonedParts({ epoch: other, timeZone });

    // A first guess from the wall clocks, settled by `add` itself: back while it passes `value`, then
    // on while the next step does not - a zone that repeats or skips a whole day can put it either side.
    let guess: number;
    if (unit === TemporalUnits.MONTH || unit === TemporalUnits.YEAR) {
      const months = (later.year - earlier.year) * 12 + (later.month - earlier.month);
      guess = unit === TemporalUnits.YEAR ? Math.trunc(months / 12) : months;
    } else {
      const days = Math.round(
        (epochAtOffset({ parts: wallClockOf({ parts: later }), offsetMilliseconds: 0 }) -
          epochAtOffset({ parts: wallClockOf({ parts: earlier }), offsetMilliseconds: 0 })) /
          DAY_MILLISECONDS,
      );
      guess = unit === TemporalUnits.WEEK ? Math.trunc(days / 7) : Math.trunc(days);
    }

    const direction = Math.sign(value - other);
    const start = wallClockOf({ parts: earlier });
    const passes = (amount: number): boolean => {
      // A move past years 1-9999 passes every value inside them, and `add` would refuse it.
      if (!isSupportedYear(shiftWallClock({ parts: start, amount, unit }).year)) {
        return true;
      }
      const moved = this.add({ value: other, amount, unit, timeZone }).getTime();
      return direction > 0 ? moved > value : moved < value;
    };
    while (guess !== 0 && passes(guess)) {
      guess -= direction;
    }
    while (!passes(guess + direction)) {
      guess += direction;
    }
    return guess + 0;
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
    locale?: string;
  }): string {
    const locale =
      opts.locale === undefined
        ? this.locale
        : TemporalHelper.ensureLocale({ locale: opts.locale });
    return TemporalDuration.format({ milliseconds: opts.milliseconds, style: opts.style, locale });
  }
}
