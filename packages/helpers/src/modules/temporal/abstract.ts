import { HTTP } from '@/common/constants/http';
import { BaseHelper } from '@/modules/base';
import { getError, isApplicationError } from '@/modules/error';
import { IntlTemporalAdapter } from './adapters/intl';
import { NativeTemporalAdapter } from './adapters/native';
import { TemporalCalendar } from './calendar';
import {
  DEFAULT_TEMPORAL_LOCALE,
  DEFAULT_TEMPORAL_TZ as DEFAULT_TEMPORAL_TZ,
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
  TTemporalFields,
  IZonedTemporalParts,
  TTemporalInput,
  ITemporalHelper,
} from './common/types';
import { TemporalLocale } from './locale';

const DAY_MILLISECONDS = 86_400_000;

/** 0001-01-01T00:00:00.000Z and 9999-12-31T23:59:59.999Z. */
const MIN_INSTANT = -62_135_596_800_000;
const MAX_INSTANT = 253_402_300_799_999;

const MAX_KNOWN_TIME_ZONES = 256;

/** How many entries each `names` list must hold. */
const NAME_LENGTHS: Record<keyof ITemporalLocaleNames, number> = {
  months: 12,
  monthsShort: 12,
  weekdays: 7,
  weekdaysShort: 7,
  weekdaysMin: 7,
  meridiem: 2,
};

const OUT_OF_RANGE = `outside the years ${TemporalCalendar.MIN_YEAR}-${TemporalCalendar.MAX_YEAR}`; /**
 * The machinery every temporal helper shares: the adapter, the zone and locale it holds, reading a
 * zone's offset, turning wall clocks into instants across daylight-saving gaps and repeats, and the
 * input checks. A helper extends this and supplies the operations in `ITemporalHelper`.
 */
export abstract class AbstractTemporalHelper extends BaseHelper implements ITemporalHelper {
  /** Validated once per process: `Intl` answers the same for a zone name every time. */
  protected static readonly knownTzs = new Set<string>();

  protected readonly adapter: ITemporalAdapter;
  protected readonly tz: string;
  protected readonly locale: string;
  protected readonly names: Record<string, ITemporalLocaleNames>;
  protected readonly fallback?: string;
  /** Which `names` entry each locale a call wrote in resolved to - `names` never changes after construction. */
  private readonly namesByLocale = new Map<string, ITemporalLocaleNames | undefined>();

  /**
   * `locale` (default `en-US`) spells month and weekday names, AM/PM, relative time and durations,
   * unless a call passes its own. `names` replaces `Intl`'s wording for a locale - month and weekday
   * names, the AM/PM marker - keyed by a locale tag; a call in another tag of the same language (`vi`
   * for a `vi-VN` entry) uses it too. `fallback` is what `format` and `formatIntl` write for a value
   * that is not a date when a call gives none; without it, such a value is a 400.
   */
  constructor(opts?: {
    adapter?: ITemporalAdapter;
    tz?: string;
    locale?: string;
    names?: Record<string, ITemporalLocaleNames>;
    fallback?: string;
    scope?: string;
  }) {
    super({ scope: opts?.scope ?? new.target.name });

    this.tz = AbstractTemporalHelper.ensureTz({
      tz: opts?.tz ?? DEFAULT_TEMPORAL_TZ,
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
    });
    this.locale = AbstractTemporalHelper.ensureLocale({
      locale: opts?.locale ?? DEFAULT_TEMPORAL_LOCALE,
    });
    this.adapter = opts?.adapter ?? AbstractTemporalHelper.defaultAdapter();
    this.names = AbstractTemporalHelper.ensureNames({ names: opts?.names ?? {} });
    this.fallback = opts?.fallback;
  }

  /**
   * The zone a `Date`'s local getters use on this runtime - the browser's or the server's. The one
   * place this helper reads the host zone, and only when a wall-clock bridge is not given one.
   */
  static getHostTz(): string {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  /** The instant whose wall clock in `to` reads what `value`'s wall clock reads in `from`. */
  protected moveWallClock(opts: { value: TTemporalInput; from: string; to: string }): Date {
    const from = this.resolveTz({ tz: opts.from });
    const to = this.resolveTz({ tz: opts.to });
    const date = this.toDate({ value: opts.value, tz: from });

    const wall = TemporalCalendar.wallClockOf({
      parts: this.zonedParts({ epoch: date.getTime(), tz: from }),
    });
    return AbstractTemporalHelper.ensureInstant({
      epoch: this.earliestOf({ parts: wall, tz: to }),
    });
  }

  /** Every list the right length, so a bad table fails when the helper is built, not on a screen. */
  protected static ensureNames(opts: {
    names: Record<string, ITemporalLocaleNames>;
  }): Record<string, ITemporalLocaleNames> {
    for (const [locale, names] of Object.entries(opts.names)) {
      AbstractTemporalHelper.ensureLocale({ locale });
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
  protected namesOf(opts: { locale: string }): ITemporalLocaleNames | undefined {
    const { locale } = opts;
    if (Object.hasOwn(this.names, locale)) {
      return this.names[locale];
    }

    if (this.namesByLocale.has(locale)) {
      return this.namesByLocale.get(locale);
    }
    // A malformed tag is the caller's 400, before it reaches `Intl.Locale`.
    AbstractTemporalHelper.ensureLocale({ locale });

    // No entry for the exact tag: one for the same language serves - `vi` reads a `vi-VN` entry.
    const language = new Intl.Locale(locale).language;
    const match = Object.keys(this.names).find(key => new Intl.Locale(key).language === language);
    const names = match === undefined ? undefined : this.names[match];
    this.namesByLocale.set(locale, names);
    return names;
  }

  /**
   * The value as a date for a writer: with a fallback - the call's, else the helper's - a value that
   * is not a date answers `null`; without one it is a 400, null included.
   */
  protected readDate(opts: {
    value: TTemporalInput | null | undefined;
    tz: string;
    fallback?: string;
  }): Date | null {
    const { value, tz } = opts;
    if ((opts.fallback ?? this.fallback) !== undefined) {
      return this.tryToDate({ value, tz });
    }
    if (value === null || value === undefined) {
      throw AbstractTemporalHelper.notADate({ value });
    }
    return this.toDate({ value, tz });
  }

  /** The runtime's `Temporal` where it has one; `Intl`, which every runtime has, everywhere else. */
  protected static defaultAdapter(): ITemporalAdapter {
    return NativeTemporalAdapter.isTemporalNamespace(Reflect.get(globalThis, 'Temporal'))
      ? new NativeTemporalAdapter()
      : new IntlTemporalAdapter();
  }

  protected static ensureLocale(opts: { locale: string }): string {
    TemporalLocale.of({ locale: opts.locale });
    return opts.locale;
  }

  /** A parse or input error the caller may treat as "not a date"; anything else is a bug and still throws. */
  protected static isRefusal(error: unknown): boolean {
    return isApplicationError(error) && error.statusCode === HTTP.ResultCodes.RS_4.BadRequest;
  }

  protected static ensureTz(opts: { tz: string; statusCode: number }): string {
    const { tz, statusCode } = opts;
    if (AbstractTemporalHelper.knownTzs.has(tz)) {
      return tz;
    }

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
    } catch (error) {
      throw getError({
        statusCode,
        message: `[TemporalHelper] unknown time zone '${tz}' | ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    if (AbstractTemporalHelper.knownTzs.size < MAX_KNOWN_TIME_ZONES) {
      AbstractTemporalHelper.knownTzs.add(tz);
    }
    return tz;
  }

  protected static ensureUnit(opts: { unit: string; amount?: number }): void {
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
  protected static ensureInstant(opts: { epoch: number }): Date {
    const { epoch } = opts;
    if (!(epoch >= MIN_INSTANT && epoch <= MAX_INSTANT)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[TemporalHelper] ${Number.isNaN(epoch) ? 'invalid date' : OUT_OF_RANGE} - received ${epoch}`,
      });
    }
    return new Date(epoch);
  }

  protected static ensureYear(opts: { parts: ITemporalParts }): void {
    if (!TemporalCalendar.isSupportedYear({ year: opts.parts.year })) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[TemporalHelper] year ${opts.parts.year} is ${OUT_OF_RANGE}`,
      });
    }
  }

  protected resolveTz(opts: { tz?: string }): string {
    return opts.tz === undefined
      ? this.tz
      : AbstractTemporalHelper.ensureTz({
          tz: opts.tz,
          statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        });
  }

  /** The adapter's one answer, rounded: an offset is whole milliseconds, a library's float may not be. */
  protected offsetAt(opts: { epoch: number; tz: string }): number {
    return Math.round(
      this.adapter.getOffsetMilliseconds({ value: new Date(opts.epoch), tz: opts.tz }),
    );
  }

  protected zonedParts(opts: { epoch: number; tz: string }): IZonedTemporalParts {
    const parts = TemporalCalendar.wallClockAt({
      epoch: opts.epoch,
      offsetMilliseconds: this.offsetAt(opts),
    });
    AbstractTemporalHelper.ensureYear({ parts });
    return parts;
  }

  /**
   * Every instant whose wall clock reads `parts` in the zone, earliest first: one as a rule, two
   * when the clock goes back, none when it jumps forward. `forward` is where a skipped time lands -
   * read with the offset from before the jump, so it moves past the gap.
   */
  protected instantsOf(opts: { parts: ITemporalParts; tz: string }): {
    instants: Array<number>;
    forward: number;
  } {
    const { parts, tz } = opts;
    const local = TemporalCalendar.epochAtOffset({ parts, offsetMilliseconds: 0 });
    const before = this.offsetAt({ epoch: local - DAY_MILLISECONDS, tz });
    const after = this.offsetAt({ epoch: local + DAY_MILLISECONDS, tz });

    const offsets = before === after ? [before] : [before, after];
    const instants: Array<number> = [];
    for (const offset of offsets) {
      const candidate = local - offset;
      if (this.offsetAt({ epoch: candidate, tz }) === offset) {
        instants.push(candidate);
      }
    }
    instants.sort((left, right) => left - right);

    return { instants, forward: local - before };
  }

  /** The instant wall-clock `parts` name: a skipped time moves forward, a repeated one takes the earlier. */
  protected earliestOf(opts: { parts: ITemporalParts; tz: string }): number {
    const { instants, forward } = this.instantsOf(opts);
    return instants[0] ?? forward;
  }

  /**
   * `[start, end)` of the unit holding `epoch`. A day or longer starts at its first instant. An hour
   * or less repeats when the clock goes back, so it starts at the latest start not after `epoch`,
   * and ends where the wall clock next shows either the following unit or this one's start again.
   */
  protected unitBounds(opts: { epoch: number; unit: TTemporalUnit; tz: string }): {
    start: number;
    end: number;
  } {
    const { epoch, unit, tz } = opts;
    const startParts = TemporalCalendar.truncate({
      parts: this.zonedParts({ epoch, tz }),
      unit,
    });
    const nextParts = TemporalCalendar.shift({ parts: startParts, amount: 1, unit });
    AbstractTemporalHelper.ensureYear({ parts: nextParts });

    const starts = this.instantsOf({ parts: startParts, tz });
    if (TemporalCalendar.EXACT_UNIT_MILLISECONDS[unit] === undefined) {
      const start = starts.instants[0] ?? starts.forward;
      return { start, end: this.earliestOf({ parts: nextParts, tz }) };
    }

    const started = starts.instants.filter(instant => instant <= epoch);
    const start = started.at(-1) ?? starts.instants[0] ?? starts.forward;

    const nexts = this.instantsOf({ parts: nextParts, tz });
    const following = nexts.instants.find(instant => instant > start) ?? nexts.forward;
    const repeated = starts.instants.find(instant => instant > start);
    return { start, end: repeated === undefined ? following : Math.min(repeated, following) };
  }

  getTz(): string {
    return this.tz;
  }

  getLocale(): string {
    return this.locale;
  }

  now(): Date {
    return new Date();
  }

  /** The instant a value names. An ISO string without an offset is read as wall clock in the zone. */
  toDate(opts: { value: TTemporalInput; tz?: string }): Date {
    const { value } = opts;

    if (typeof value === 'string') {
      return this.parse({ value, tz: opts.tz });
    }
    if (value instanceof Date) {
      return AbstractTemporalHelper.ensureInstant({ epoch: value.getTime() });
    }
    if (typeof value === 'number') {
      return AbstractTemporalHelper.ensureInstant({ epoch: value });
    }

    // `null` above all: read as a number it would be 1970, a date nobody meant.
    throw AbstractTemporalHelper.notADate({ value });
  }

  protected static notADate(opts: { value: unknown }) {
    const { value } = opts;
    return getError({
      statusCode: HTTP.ResultCodes.RS_4.BadRequest,
      message: `[TemporalHelper] not a date - received ${value === null ? 'null' : typeof value}`,
    });
  }

  /** `toDate`, answering `null` where `toDate` refuses the value: null, undefined, bad text, NaN. */
  tryToDate(opts: { value: TTemporalInput | null | undefined; tz?: string }): Date | null {
    const { value } = opts;
    // Outside the try: a bad zone is the caller's bug, not an unreadable value.
    const tz = this.resolveTz({ tz: opts.tz });
    if (value === null || value === undefined) {
      return null;
    }

    try {
      return this.toDate({ value, tz });
    } catch (error) {
      if (AbstractTemporalHelper.isRefusal(error)) {
        return null;
      }
      throw error;
    }
  }

  /** The wall clock the value shows in the zone, with its ISO weekday and UTC offset. */
  parts(opts: { value: TTemporalInput; tz?: string }): IZonedTemporalParts {
    const tz = this.resolveTz({ tz: opts.tz });
    const date = this.toDate({ value: opts.value, tz });
    return this.zonedParts({ epoch: date.getTime(), tz });
  }

  /**
   * Fractional months from `other` to `value` (dayjs and moment's month difference): anchored on the
   * date with the later day of the month, whole months by `add`, the rest as a share of the month
   * it falls in.
   */
  protected monthGap(opts: { value: number; other: number; tz: string }): number {
    const { value, other, tz } = opts;
    const valueParts = this.zonedParts({ epoch: value, tz });
    const otherParts = this.zonedParts({ epoch: other, tz });
    if (valueParts.day < otherParts.day) {
      return -this.monthGap({ value: other, other: value, tz });
    }

    const whole = (otherParts.year - valueParts.year) * 12 + (otherParts.month - valueParts.month);
    const anchor = this.shiftMonthsFrom({ parts: valueParts, months: whole, tz });
    const isBelow = other - anchor < 0;
    const nextAnchor = this.shiftMonthsFrom({
      parts: valueParts,
      months: whole + (isBelow ? -1 : 1),
      tz,
    });
    const span = isBelow ? anchor - nextAnchor : nextAnchor - anchor;

    return -(whole + (other - anchor) / span) || 0;
  }

  /** `add` by months without the 1-9999 check: an anchor one month past the range is still a number. */
  protected shiftMonthsFrom(opts: {
    parts: IZonedTemporalParts;
    months: number;
    tz: string;
  }): number {
    const { parts, months, tz } = opts;
    const shifted = TemporalCalendar.shift({
      parts: TemporalCalendar.wallClockOf({ parts }),
      amount: months,
      unit: TemporalUnits.MONTH,
    });
    return this.earliestOf({ parts: shifted, tz });
  }

  abstract fromWallClock(opts: { value: TTemporalInput; sourceTz?: string; tz?: string }): Date;

  abstract toWallClock(opts: { value: TTemporalInput; targetTz?: string; tz?: string }): Date;

  abstract clone(opts: { locale?: string; tz?: string }): ITemporalHelper;

  abstract parse(opts: { value: string; pattern?: string; tz?: string }): Date;

  abstract tryParse(opts: { value: string; pattern?: string; tz?: string }): Date | null;

  abstract isValid(opts: {
    value: TTemporalInput | null | undefined;
    pattern?: string;
    tz?: string;
  }): boolean;

  abstract format(opts: {
    value: TTemporalInput | null | undefined;
    pattern?: string;
    tz?: string;
    locale?: string;
    fallback?: string;
  }): string;

  abstract formatIntl(opts: {
    value: TTemporalInput;
    options?: Omit<Intl.DateTimeFormatOptions, 'timeZone'>;
    tz?: string;
    locale?: string;
  }): string;

  abstract add(opts: {
    value: TTemporalInput;
    amount: number;
    unit: TTemporalUnit;
    tz?: string;
  }): Date;

  abstract subtract(opts: {
    value: TTemporalInput;
    amount: number;
    unit: TTemporalUnit;
    tz?: string;
  }): Date;

  abstract startOf(opts: { value: TTemporalInput; unit: TTemporalUnit; tz?: string }): Date;

  abstract endOf(opts: { value: TTemporalInput; unit: TTemporalUnit; tz?: string }): Date;

  abstract isWeekday(opts: { value: TTemporalInput; tz?: string }): boolean;

  abstract nextWeekday(opts: { value: TTemporalInput; tz?: string }): Date;

  abstract previousWeekday(opts: { value: TTemporalInput; tz?: string }): Date;

  abstract set(opts: { value: TTemporalInput; tz?: string } & TTemporalFields): Date;

  abstract isBefore(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit?: TTemporalUnit;
    tz?: string;
  }): boolean;

  abstract isAfter(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit?: TTemporalUnit;
    tz?: string;
  }): boolean;

  abstract isSame(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit?: TTemporalUnit;
    tz?: string;
  }): boolean;

  abstract isSameOrBefore(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit?: TTemporalUnit;
    tz?: string;
  }): boolean;

  abstract isSameOrAfter(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit?: TTemporalUnit;
    tz?: string;
  }): boolean;

  abstract isBetween(opts: {
    value: TTemporalInput;
    from: TTemporalInput;
    to: TTemporalInput;
    unit?: TTemporalUnit;
    inclusivity?: TTemporalInclusivity;
    tz?: string;
  }): boolean;

  abstract diff(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit: TTemporalUnit;
    tz?: string;
  }): number;

  abstract compare(opts: {
    value: TTemporalInput;
    other: TTemporalInput;
    unit?: TTemporalUnit;
    tz?: string;
  }): -1 | 0 | 1;

  abstract relative(opts: {
    value: TTemporalInput;
    base?: TTemporalInput;
    unit?: TTemporalUnit;
    numeric?: Intl.RelativeTimeFormatNumeric;
    style?: Intl.RelativeTimeFormatStyle;
    tz?: string;
    locale?: string;
  }): string;

  abstract durationParts(opts: { milliseconds: number }): ITemporalDurationParts;

  abstract formatDuration(opts: {
    milliseconds: number;
    style?: TTemporalDurationStyle;
    /** A clock face instead of words: `HH:mm:ss`, `mm:ss`, `D[d] HH:mm`. The largest token carries the rest. */
    pattern?: string;
    /** Only the largest units that are not zero: `1` writes `2 giờ` for 2 hours 5 minutes. */
    maxUnits?: number;
    locale?: string;
  }): string;
}
