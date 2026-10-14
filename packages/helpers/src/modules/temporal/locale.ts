import { HTTP } from '@/common/constants/http';
import { getError } from '@/modules/error';
import type { ITemporalParts } from './common/types';

/** A service writes a handful of locales; capped so caller-fed locales cannot grow it. */
const MAX_CACHED_LOCALES = 32;

const MONTHS = 12;
const WEEKDAYS = 7;
const NOON = 12;

/** A Monday: ISO weekday `n` is this date plus `n - 1` days. */
const MONDAY = Date.UTC(2024, 0, 1);
const DAY_MILLISECONDS = 86_400_000;

/**
 * Month and weekday names, the AM/PM marker and the written date of one locale, as `Intl` spells
 * them. Every table is read once, on first use, from a fixed UTC date: the names belong to the
 * calendar, not to a time zone, so the wall clock is formatted as if it were UTC.
 */
export class TemporalLocale {
  private static readonly locales = new Map<string, TemporalLocale>();

  private readonly locale: string;
  private readonly tables = new Map<string, Array<string>>();
  private readonly formatters = new Map<string, Intl.DateTimeFormat>();

  private constructor(opts: { locale: string }) {
    this.locale = opts.locale;
  }

  /** The locale's names; a malformed tag is a 400. */
  static of(opts: { locale: string }): TemporalLocale {
    const { locale } = opts;
    const cached = TemporalLocale.locales.get(locale);
    if (cached) {
      return cached;
    }

    try {
      Intl.getCanonicalLocales(locale);
    } catch (error) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[TemporalLocale] invalid locale '${locale}' | ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    // Full: the oldest locale makes room, so the 33rd locale is not rebuilt on every call.
    if (TemporalLocale.locales.size >= MAX_CACHED_LOCALES) {
      const oldest = TemporalLocale.locales.keys().next().value;
      if (oldest !== undefined) {
        TemporalLocale.locales.delete(oldest);
      }
    }
    const created = new TemporalLocale({ locale });
    TemporalLocale.locales.set(locale, created);
    return created;
  }

  private formatterOf(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    const key = JSON.stringify(opts);
    const cached = this.formatters.get(key);
    if (cached) {
      return cached;
    }

    // Gregorian always: the numeric tokens are, and a name from another calendar would sit beside them.
    const formatter = new Intl.DateTimeFormat(this.locale, {
      ...opts,
      calendar: 'gregory',
      timeZone: 'UTC',
    });
    this.formatters.set(key, formatter);
    return formatter;
  }

  private tableOf(opts: {
    key: string;
    size: number;
    read: (index: number) => string;
  }): Array<string> {
    const cached = this.tables.get(opts.key);
    if (cached) {
      return cached;
    }

    const table = Array.from({ length: opts.size }, (_, index) => opts.read(index));
    this.tables.set(opts.key, table);
    return table;
  }

  /** `month` is 1-12. */
  monthName(opts: { month: number; width: 'short' | 'long' }): string {
    const { month, width } = opts;
    const formatter = this.formatterOf({ month: width });
    const table = this.tableOf({
      key: `month-${width}`,
      size: MONTHS,
      read: index => formatter.format(Date.UTC(2024, index, 15)),
    });
    return table[month - 1];
  }

  /** `dayOfWeek` is ISO: 1 Monday - 7 Sunday. */
  weekdayName(opts: { dayOfWeek: number; width: 'short' | 'long' }): string {
    const { dayOfWeek, width } = opts;
    const formatter = this.formatterOf({ weekday: width });
    const table = this.tableOf({
      key: `weekday-${width}`,
      size: WEEKDAYS,
      read: index => formatter.format(MONDAY + index * DAY_MILLISECONDS),
    });
    return table[dayOfWeek - 1];
  }

  /** The AM or PM marker the locale writes for `hour` (0-23), lower-cased by the locale's own rules when asked. */
  dayPeriod(opts: { hour: number; isLowerCase?: boolean }): string {
    const formatter = this.formatterOf({ hour: 'numeric', hourCycle: 'h12' });
    const table = this.tableOf({
      key: 'day-period',
      size: 2,
      read: index =>
        formatter
          .formatToParts(Date.UTC(2024, 0, 1, index === 0 ? 1 : NOON + 1))
          .find(part => part.type === 'dayPeriod')?.value ?? (index === 0 ? 'AM' : 'PM'),
    });
    const marker = table[opts.hour < NOON ? 0 : 1];
    return opts.isLowerCase ? marker.toLocaleLowerCase(this.locale) : marker;
  }

  /** The wall-clock date the way the locale writes it: `numeric` is `10/14/2026`, `long` is `October 14, 2026`. */
  writtenDate(opts: { parts: ITemporalParts; style: 'numeric' | 'long' }): string {
    const { parts, style } = opts;
    const formatter =
      style === 'numeric'
        ? this.formatterOf({ year: 'numeric', month: '2-digit', day: '2-digit' })
        : this.formatterOf({ dateStyle: 'long' });

    const date = new Date(0);
    date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
    return formatter.format(date);
  }
}
