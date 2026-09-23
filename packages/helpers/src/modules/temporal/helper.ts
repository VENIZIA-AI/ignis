import { HTTP } from '@/common/constants/http';
import { BaseHelper } from '@/modules/base';
import { getError } from '@/modules/error';
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
  DEFAULT_TEMPORAL_PATTERN,
  DEFAULT_TEMPORAL_TIME_ZONE,
  TemporalUnits,
} from './common/constants';
import type { TTemporalUnit } from './common/constants';
import type {
  ITemporalAdapter,
  ITemporalParts,
  IZonedTemporalParts,
  TTemporalInput,
} from './common/types';
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

const OUT_OF_RANGE = `outside the years ${MIN_TEMPORAL_YEAR}-${MAX_TEMPORAL_YEAR}`;

/**
 * Dates in one time zone, through whichever library you choose: pass an adapter - the runtime's
 * `Temporal` (the default), your own dayjs, your own Luxon. The adapter only reports a zone's UTC
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

  private readonly adapter: ITemporalAdapter;
  private readonly timeZone: string;

  constructor(opts?: { adapter?: ITemporalAdapter; timeZone?: string; scope?: string }) {
    super({ scope: opts?.scope ?? TemporalHelper.name });

    this.timeZone = TemporalHelper.ensureTimeZone({
      timeZone: opts?.timeZone ?? DEFAULT_TEMPORAL_TIME_ZONE,
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
    });
    this.adapter = opts?.adapter ?? new NativeTemporalAdapter();
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

  /** Writes the value in the zone. Without a `pattern`: ISO 8601 with the zone's offset. */
  format(opts: { value: TTemporalInput; pattern?: string; timeZone?: string }): string {
    return TemporalPattern.format({
      pattern: opts.pattern ?? DEFAULT_TEMPORAL_PATTERN,
      parts: this.parts({ value: opts.value, timeZone: opts.timeZone }),
    });
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
}
