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
  /** Milliseconds east of UTC that `timeZone` observes at `value`: `25_200_000` for `+07:00`. */
  getOffsetMilliseconds(opts: { value: Date; timeZone: string }): number;
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
      toZonedDateTimeISO(timeZone: string): ITemporalZonedDateTime;
    };
  };
}

/** The part of a `Dayjs` object this adapter reads. */
export interface IDayjsInstance {
  utcOffset(): number;
  tz(timeZone: string): IDayjsInstance;
}

/** The part of the `dayjs` factory this adapter drives - with the `utc` and `timezone` plugins extended. */
export interface IDayjsFactory {
  (value?: Date | number): IDayjsInstance;
  tz: (value: string, timeZone: string) => IDayjsInstance;
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
