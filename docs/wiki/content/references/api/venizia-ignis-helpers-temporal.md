---
title: "@venizia/ignis-helpers/temporal"
description: "Every export of @venizia/ignis-helpers/temporal, from the built declarations (generated)."
---

# `@venizia/ignis-helpers/temporal`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

35 exports, 35 with TSDoc.

## `AbstractTemporalHelper`

*class*

The machinery every temporal helper shares: the adapter, the zone and locale it holds, reading a
zone's offset, turning wall clocks into instants across daylight-saving gaps and repeats, and the
input checks. A helper extends this and supplies the operations in `ITemporalHelper`.

```ts
export declare abstract class AbstractTemporalHelper extends BaseHelper implements ITemporalHelper {
    /** Validated once per process: `Intl` answers the same for a zone name every time. */
    protected static readonly knownTzs: Set<string>;
    protected readonly adapter: ITemporalAdapter;
    protected readonly tz: string;
    protected readonly locale: string;
    protected readonly names: Record<string, ITemporalLocaleNames>;
    protected readonly fallback?: string;
    /** Which `names` entry each locale a call wrote in resolved to - `names` never changes after construction. */
    private readonly namesByLocale;
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
    });
    /**
     * The zone a `Date`'s local getters use on this runtime - the browser's or the server's. The one
     * place this helper reads the host zone, and only when a wall-clock bridge is not given one.
     */
    static getHostTz(): string;
    /** The instant whose wall clock in `to` reads what `value`'s wall clock reads in `from`. */
    protected moveWallClock(opts: {
        value: TTemporalInput;
        from: string;
        to: string;
    }): Date;
    /** Every list the right length, so a bad table fails when the helper is built, not on a screen. */
    protected static ensureNames(opts: {
        names: Record<string, ITemporalLocaleNames>;
    }): Record<string, ITemporalLocaleNames>;
    /** The wording this helper holds for `locale`, if any. */
    protected namesOf(opts: {
        locale: string;
    }): ITemporalLocaleNames | undefined;
    /**
     * The value as a date for a writer: with a fallback - the call's, else the helper's - a value that
     * is not a date answers `null`; without one it is a 400, null included.
     */
    protected readDate(opts: {
        value: TTemporalInput | null | undefined;
        tz: string;
        fallback?: string;
    }): Date | null;
    /** The runtime's `Temporal` where it has one; `Intl`, which every runtime has, everywhere else. */
    protected static defaultAdapter(): ITemporalAdapter;
    protected static ensureLocale(opts: {
        locale: string;
    }): string;
    /** A parse or input error the caller may treat as "not a date"; anything else is a bug and still throws. */
    protected static isRefusal(error: unknown): boolean;
    protected static ensureTz(opts: {
        tz: string;
        statusCode: number;
    }): string;
    protected static ensureUnit(opts: {
        unit: string;
        amount?: number;
    }): void;
    /** Every result passes here: an overflowing `add` is refused, never an Invalid Date. */
    protected static ensureInstant(opts: {
        epoch: number;
    }): Date;
    protected static ensureYear(opts: {
        parts: ITemporalParts;
    }): void;
    protected resolveTz(opts: {
        tz?: string;
    }): string;
    /** The adapter's one answer, rounded: an offset is whole milliseconds, a library's float may not be. */
    protected offsetAt(opts: {
        epoch: number;
        tz: string;
    }): number;
    protected zonedParts(opts: {
        epoch: number;
        tz: string;
    }): IZonedTemporalParts;
    /**
     * Every instant whose wall clock reads `parts` in the zone, earliest first: one as a rule, two
     * when the clock goes back, none when it jumps forward. `forward` is where a skipped time lands -
     * read with the offset from before the jump, so it moves past the gap.
     */
    protected instantsOf(opts: {
        parts: ITemporalParts;
        tz: string;
    }): {
        instants: Array<number>;
        forward: number;
    };
    /** The instant wall-clock `parts` name: a skipped time moves forward, a repeated one takes the earlier. */
    protected earliestOf(opts: {
        parts: ITemporalParts;
        tz: string;
    }): number;
    /**
     * `[start, end)` of the unit holding `epoch`. A day or longer starts at its first instant. An hour
     * or less repeats when the clock goes back, so it starts at the latest start not after `epoch`,
     * and ends where the wall clock next shows either the following unit or this one's start again.
     */
    protected unitBounds(opts: {
        epoch: number;
        unit: TTemporalUnit;
        tz: string;
    }): {
        start: number;
        end: number;
    };
    getTz(): string;
    getLocale(): string;
    now(): Date;
    /** The instant a value names. An ISO string without an offset is read as wall clock in the zone. */
    toDate(opts: {
        value: TTemporalInput;
        tz?: string;
    }): Date;
    protected static notADate(opts: {
        value: unknown;
    }): import("@venizia/ignis-inversion").ApplicationError;
    /** `toDate`, answering `null` where `toDate` refuses the value: null, undefined, bad text, NaN. */
    tryToDate(opts: {
        value: TTemporalInput | null | undefined;
        tz?: string;
    }): Date | null;
    /** The wall clock the value shows in the zone, with its ISO weekday and UTC offset. */
    parts(opts: {
        value: TTemporalInput;
        tz?: string;
    }): IZonedTemporalParts;
    /**
     * Fractional months from `other` to `value` (dayjs and moment's month difference): anchored on the
     * date with the later day of the month, whole months by `add`, the rest as a share of the month
     * it falls in.
     */
    protected monthGap(opts: {
        value: number;
        other: number;
        tz: string;
    }): number;
    /** `add` by months without the 1-9999 check: an anchor one month past the range is still a number. */
    protected shiftMonthsFrom(opts: {
        parts: IZonedTemporalParts;
        months: number;
        tz: string;
    }): number;
    abstract fromWallClock(opts: {
        value: TTemporalInput;
        sourceTz?: string;
        tz?: string;
    }): Date;
    abstract toWallClock(opts: {
        value: TTemporalInput;
        targetTz?: string;
        tz?: string;
    }): Date;
    abstract clone(opts: {
        locale?: string;
        tz?: string;
    }): ITemporalHelper;
    abstract parse(opts: {
        value: string;
        pattern?: string;
        tz?: string;
    }): Date;
    abstract tryParse(opts: {
        value: string;
        pattern?: string;
        tz?: string;
    }): Date | null;
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
    abstract startOf(opts: {
        value: TTemporalInput;
        unit: TTemporalUnit;
        tz?: string;
    }): Date;
    abstract endOf(opts: {
        value: TTemporalInput;
        unit: TTemporalUnit;
        tz?: string;
    }): Date;
    abstract isWeekday(opts: {
        value: TTemporalInput;
        tz?: string;
    }): boolean;
    abstract nextWeekday(opts: {
        value: TTemporalInput;
        tz?: string;
    }): Date;
    abstract previousWeekday(opts: {
        value: TTemporalInput;
        tz?: string;
    }): Date;
    abstract set(opts: {
        value: TTemporalInput;
        tz?: string;
    } & TTemporalFields): Date;
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
    abstract durationParts(opts: {
        milliseconds: number;
    }): ITemporalDurationParts;
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
```

Source: `packages/helpers/src/modules/temporal/abstract.ts`

## `DayjsTemporalAdapter`

*class*

Time zones through your own `dayjs`, passed in rather than imported: this package never loads
dayjs, and you keep whatever plugins, locale and default zone you configured.

Only `utcOffset()` is read, which stays right whatever the host zone; dayjs's own `format()`
near the host's daylight-saving change does not, and is never used here. dayjs does misread a
local mean time offset under one hour (London before 1848 reads `-01:15`, not `-00:01:15`);
for such dates use `NativeTemporalAdapter` or `LuxonTemporalAdapter`.

```ts
export declare class DayjsTemporalAdapter implements ITemporalAdapter {
    private readonly dayjs;
    constructor(opts: {
        dayjs: IDayjsFactory;
    });
    getOffsetMilliseconds(opts: {
        value: Date;
        tz: string;
    }): number;
}
```

Source: `packages/helpers/src/modules/temporal/adapters/dayjs.ts`

## `DEFAULT_TEMPORAL_LOCALE`

*const*

The locale name tokens and `formatIntl` write in when a helper is built without one.

```ts
export declare const DEFAULT_TEMPORAL_LOCALE = "en-US";
```

Source: `packages/helpers/src/modules/temporal/common/constants.ts`

## `DEFAULT_TEMPORAL_PATTERN`

*const*

`format` with no pattern writes ISO 8601 with the zone's offset: `2026-09-19T12:00:00.000+07:00`.

```ts
export declare const DEFAULT_TEMPORAL_PATTERN = "YYYY-MM-DDTHH:mm:ss.SSSZ";
```

Source: `packages/helpers/src/modules/temporal/common/constants.ts`

## `DEFAULT_TEMPORAL_TZ`

*const*

A helper built without a `tz` computes in UTC - never in the host's zone, which differs per machine.

```ts
export declare const DEFAULT_TEMPORAL_TZ = "UTC";
```

Source: `packages/helpers/src/modules/temporal/common/constants.ts`

## `IDayjsFactory`

*interface*

The part of the `dayjs` factory this adapter drives - with the `utc` and `timezone` plugins extended.

```ts
export interface IDayjsFactory {
    (value?: Date | number): IDayjsInstance;
    tz: (value: string, tz: string) => IDayjsInstance;
}
```

Source: `packages/helpers/src/modules/temporal/common/types.ts`

## `IDayjsInstance`

*interface*

The part of a `Dayjs` object this adapter reads.

```ts
export interface IDayjsInstance {
    utcOffset(): number;
    tz(tz: string): IDayjsInstance;
}
```

Source: `packages/helpers/src/modules/temporal/common/types.ts`

## `ILuxonDateTime`

*interface*

The part of a Luxon `DateTime` this adapter reads.

```ts
export interface ILuxonDateTime {
    readonly isValid: boolean;
    readonly invalidReason: string | null;
    readonly offset: number;
}
```

Source: `packages/helpers/src/modules/temporal/common/types.ts`

## `ILuxonDateTimeFactory`

*interface*

The part of Luxon's `DateTime` class this adapter drives.

```ts
export interface ILuxonDateTimeFactory {
    fromMillis(milliseconds: number, options: {
        zone: string;
    }): ILuxonDateTime;
}
```

Source: `packages/helpers/src/modules/temporal/common/types.ts`

## `IntlTemporalAdapter`

*class*

Time zones through `Intl.DateTimeFormat` alone - no `Temporal`, no polyfill, no date library - so
it runs in every browser and every server runtime. The offset is the zone's wall clock at the
instant, read field by field, minus the instant itself.

```ts
export declare class IntlTemporalAdapter implements ITemporalAdapter {
    private static readonly formatters;
    /** The zone's formatter, and how it spells the common era - so any other era is before year 1, whatever the engine calls it. */
    private static formatterOf;
    getOffsetMilliseconds(opts: {
        value: Date;
        tz: string;
    }): number;
}
```

Source: `packages/helpers/src/modules/temporal/adapters/intl.ts`

## `ITemporalAdapter`

*interface*

The one question a date library answers: which UTC offset a time zone observes at an instant.
Everything else - the wall clock, a time a daylight-saving jump skips or repeats, adding a month,
the start of a week, a pattern - `TemporalHelper` works out once from these answers, so every
adapter shares one behaviour.

```ts
export interface ITemporalAdapter {
    /** Milliseconds east of UTC that `tz` observes at `value`: `25_200_000` for `+07:00`. */
    getOffsetMilliseconds(opts: {
        value: Date;
        tz: string;
    }): number;
}
```

Source: `packages/helpers/src/modules/temporal/common/types.ts`

## `ITemporalDurationParts`

*interface*

A span of time split into whole units, every field non-negative; `isNegative` carries the sign.

```ts
export interface ITemporalDurationParts {
    isNegative: boolean;
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    milliseconds: number;
}
```

Source: `packages/helpers/src/modules/temporal/common/types.ts`

## `ITemporalHelper`

*interface*

What a temporal helper does: dates in one time zone, through an adapter. `TemporalHelper` is the implementation.

```ts
export interface ITemporalHelper {
    /**
     * A date picker hands back a `Date` meaning "this wall clock in the host's zone". This returns the
     * instant that shows the same year, month, day and time in the helper's zone. `sourceTz` defaults
     * to the host's. A skipped wall time resolves forward, a repeated one to the earlier instant.
     */
    fromWallClock(opts: {
        value: TTemporalInput;
        sourceTz?: string;
        tz?: string;
    }): Date;
    /**
     * The reverse of `fromWallClock`, to feed a picker: a `Date` whose wall clock in `targetTz` (default:
     * the host's) reads what the helper's zone reads for `value`.
     */
    toWallClock(opts: {
        value: TTemporalInput;
        targetTz?: string;
        tz?: string;
    }): Date;
    /** A helper like this one, with another locale or zone: same adapter, same `names`. */
    clone(opts: {
        locale?: string;
        tz?: string;
    }): ITemporalHelper;
    getTz(): string;
    getLocale(): string;
    now(): Date;
    /** The instant a value names. An ISO string without an offset is read as wall clock in the zone. */
    toDate(opts: {
        value: TTemporalInput;
        tz?: string;
    }): Date;
    /** `toDate`, answering `null` where `toDate` refuses the value: null, undefined, bad text, NaN. */
    tryToDate(opts: {
        value: TTemporalInput | null | undefined;
        tz?: string;
    }): Date | null;
    /** The wall clock the value shows in the zone, with its ISO weekday and UTC offset. */
    parts(opts: {
        value: TTemporalInput;
        tz?: string;
    }): IZonedTemporalParts;
    /**
     * Reads a string. With a `pattern` (`YYYY YY MM M DD D HH H mm m ss s SSS Z ZZ`, text in
     * `[brackets]`), the value must match it exactly; without one it must be ISO 8601. An offset in
     * the value wins; otherwise the fields are wall clock in the zone.
     */
    parse(opts: {
        value: string;
        pattern?: string;
        tz?: string;
    }): Date;
    /** `parse`, answering `null` where `parse` refuses the value. A pattern that does not compile still throws. */
    tryParse(opts: {
        value: string;
        pattern?: string;
        tz?: string;
    }): Date | null;
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
        value: TTemporalInput | null | undefined;
        options?: Omit<Intl.DateTimeFormatOptions, 'timeZone'>;
        tz?: string;
        locale?: string;
        fallback?: string;
    }): string;
    /**
     * Moves the value by whole units. Hours and smaller are elapsed time; days and larger move the
     * calendar in the zone, so a day across a daylight-saving jump keeps the wall time, and a month
     * past a shorter month clamps to its last day.
     */
    add(opts: {
        value: TTemporalInput;
        amount: number;
        unit: TTemporalUnit;
        tz?: string;
    }): Date;
    subtract(opts: {
        value: TTemporalInput;
        amount: number;
        unit: TTemporalUnit;
        tz?: string;
    }): Date;
    /** The first instant of the unit containing the value, in the zone. Weeks start on Monday. */
    startOf(opts: {
        value: TTemporalInput;
        unit: TTemporalUnit;
        tz?: string;
    }): Date;
    /** The last millisecond of the unit containing the value, in the zone. */
    endOf(opts: {
        value: TTemporalInput;
        unit: TTemporalUnit;
        tz?: string;
    }): Date;
    /** Monday to Friday, read on the wall clock of the zone. */
    isWeekday(opts: {
        value: TTemporalInput;
        tz?: string;
    }): boolean;
    nextWeekday(opts: {
        value: TTemporalInput;
        tz?: string;
    }): Date;
    previousWeekday(opts: {
        value: TTemporalInput;
        tz?: string;
    }): Date;
    /**
     * The value with wall-clock fields replaced in the zone - `{ hour: 9, minute: 0 }` is 09:00 that day.
     * `month` is 1-12. The day is clamped to the month's last day, so setting February on the 31st
     * lands on the 28th or 29th. A wall time a daylight-saving jump skips resolves forward, as `parse` does.
     */
    set(opts: {
        value: TTemporalInput;
        tz?: string;
    } & TTemporalFields): Date;
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
    durationParts(opts: {
        milliseconds: number;
    }): ITemporalDurationParts;
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
```

Source: `packages/helpers/src/modules/temporal/common/types.ts`

## `ITemporalLocaleNames`

*interface*

A locale's own wording, over what `Intl` writes for it: month names (January first), weekday
names in ISO order (Monday first), and the AM and PM markers. Any list left out stays `Intl`'s.

```ts
export interface ITemporalLocaleNames {
    months?: ReadonlyArray<string>;
    monthsShort?: ReadonlyArray<string>;
    weekdays?: ReadonlyArray<string>;
    weekdaysShort?: ReadonlyArray<string>;
    weekdaysMin?: ReadonlyArray<string>;
    meridiem?: readonly [string, string];
}
```

Source: `packages/helpers/src/modules/temporal/common/types.ts`

## `ITemporalNamespace`

*interface*

The part of the `Temporal` namespace this adapter drives - structural, so neither this package
nor its consumers need Temporal's type definitions, and a polyfill's namespace fits as well.

```ts
export interface ITemporalNamespace {
    Instant: {
        fromEpochMilliseconds(epochMilliseconds: number): {
            toZonedDateTimeISO(tz: string): ITemporalZonedDateTime;
        };
    };
}
```

Source: `packages/helpers/src/modules/temporal/common/types.ts`

## `ITemporalParts`

*interface*

Wall-clock fields. `month` is 1-12, `day` 1-31 - never zero-based.

```ts
export interface ITemporalParts {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    millisecond: number;
}
```

Source: `packages/helpers/src/modules/temporal/common/types.ts`

## `ITemporalZonedDateTime`

*interface*

The part of a `Temporal.ZonedDateTime` this adapter reads.

```ts
export interface ITemporalZonedDateTime {
    readonly offsetNanoseconds: number;
}
```

Source: `packages/helpers/src/modules/temporal/common/types.ts`

## `IZonedTemporalParts`

*interface*

The wall clock an instant shows in one time zone. `dayOfWeek` is ISO: 1 Monday - 7 Sunday.

```ts
export interface IZonedTemporalParts extends ITemporalParts {
    dayOfWeek: number;
    /** Minutes east of UTC: `420` for `+07:00`. Historic local mean time carries seconds, as a fraction. */
    offsetMinutes: number;
}
```

Source: `packages/helpers/src/modules/temporal/common/types.ts`

## `LuxonTemporalAdapter`

*class*

Time zones through your own Luxon `DateTime`, passed in rather than imported.

```ts
export declare class LuxonTemporalAdapter implements ITemporalAdapter {
    private readonly dateTime;
    constructor(opts: {
        DateTime: ILuxonDateTimeFactory;
    });
    getOffsetMilliseconds(opts: {
        value: Date;
        tz: string;
    }): number;
}
```

Source: `packages/helpers/src/modules/temporal/adapters/luxon.ts`

## `NativeTemporalAdapter`

*class*

Time zones through the TC39 `Temporal` API: the runtime's global (Bun has it, as do current
browsers), or a polyfill's namespace passed as `temporal`.

```ts
export declare class NativeTemporalAdapter implements ITemporalAdapter {
    private readonly temporal;
    /** A `Temporal` namespace - the runtime's global or a polyfill's - by the one member the adapter drives. */
    static isTemporalNamespace(value: unknown): value is ITemporalNamespace;
    constructor(opts?: {
        temporal?: ITemporalNamespace;
    });
    getOffsetMilliseconds(opts: {
        value: Date;
        tz: string;
    }): number;
}
```

Source: `packages/helpers/src/modules/temporal/adapters/native.ts`

## `TemporalDurationStyles`

*class*

How `formatDuration` writes: `compact` is `1d1h30m`; the others are the locale's own unit words.

```ts
export declare class TemporalDurationStyles {
    static readonly COMPACT = "compact";
    static readonly NARROW = "narrow";
    static readonly SHORT = "short";
    static readonly LONG = "long";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): input is TTemporalDurationStyle;
}
```

Source: `packages/helpers/src/modules/temporal/common/constants.ts`

## `TemporalHelper`

*class*

Dates in one time zone, through whichever library you choose: pass an adapter - the runtime's
`Temporal` (the default where the runtime has it, `Intl` everywhere else), your own dayjs, your own Luxon. The adapter only reports a zone's UTC
offset at an instant; the wall clock, daylight-saving gaps and repeats, and the calendar math all
live here, so every adapter shares one behaviour.

Values go in as a `Date`, epoch milliseconds or an ISO 8601 string, and come out as a `Date`, so
swapping the adapter never touches a call site. The zone is yours to set: without one this helper
computes in UTC, never in the host's zone. Years run from 1 to 9999.

```ts
export declare class TemporalHelper extends AbstractTemporalHelper {
    private static readonly intlFormatters;
    /**
     * A date picker hands back a `Date` meaning "this wall clock in the host's zone". This returns the
     * instant that shows the same year, month, day and time in the helper's zone. `sourceTz` defaults
     * to the host's. A skipped wall time resolves forward, a repeated one to the earlier instant.
     */
    fromWallClock(opts: {
        value: TTemporalInput;
        sourceTz?: string;
        tz?: string;
    }): Date;
    /**
     * The reverse of `fromWallClock`, to feed a picker: a `Date` whose wall clock in `targetTz` (default:
     * the host's) reads what the helper's zone reads for `value`.
     */
    toWallClock(opts: {
        value: TTemporalInput;
        targetTz?: string;
        tz?: string;
    }): Date;
    /** A helper like this one, with another locale or zone: same adapter, `names` and `fallback`. */
    clone(opts: {
        locale?: string;
        tz?: string;
    }): TemporalHelper;
    /**
     * Reads a string. With a `pattern` (`YYYY YY MM M DD D HH H mm m ss s SSS Z ZZ`, text in
     * `[brackets]`), the value must match it exactly; without one it must be ISO 8601. An offset in
     * the value wins; otherwise the fields are wall clock in the zone.
     */
    parse(opts: {
        value: string;
        pattern?: string;
        tz?: string;
    }): Date;
    private readIso;
    /** `parse`, answering `null` where `parse` refuses the value. A pattern that does not compile still throws. */
    tryParse(opts: {
        value: string;
        pattern?: string;
        tz?: string;
    }): Date | null;
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
        value: TTemporalInput | null | undefined;
        options?: Omit<Intl.DateTimeFormatOptions, 'timeZone'>;
        tz?: string;
        locale?: string;
        fallback?: string;
    }): string;
    /**
     * Moves the value by whole units. Hours and smaller are elapsed time; days and larger move the
     * calendar in the zone, so a day across a daylight-saving jump keeps the wall time, and a month
     * past a shorter month clamps to its last day.
     */
    add(opts: {
        value: TTemporalInput;
        amount: number;
        unit: TTemporalUnit;
        tz?: string;
    }): Date;
    subtract(opts: {
        value: TTemporalInput;
        amount: number;
        unit: TTemporalUnit;
        tz?: string;
    }): Date;
    /** The first instant of the unit containing the value, in the zone. Weeks start on Monday. */
    startOf(opts: {
        value: TTemporalInput;
        unit: TTemporalUnit;
        tz?: string;
    }): Date;
    /** The last millisecond of the unit containing the value, in the zone. */
    endOf(opts: {
        value: TTemporalInput;
        unit: TTemporalUnit;
        tz?: string;
    }): Date;
    /** Monday to Friday, read on the wall clock of the zone. */
    isWeekday(opts: {
        value: TTemporalInput;
        tz?: string;
    }): boolean;
    nextWeekday(opts: {
        value: TTemporalInput;
        tz?: string;
    }): Date;
    previousWeekday(opts: {
        value: TTemporalInput;
        tz?: string;
    }): Date;
    private stepToWeekday;
    /**
     * The value with wall-clock fields replaced in the zone - `{ hour: 9, minute: 0 }` is 09:00 that day.
     * `month` is 1-12. The day is clamped to the month's last day, so setting February on the 31st
     * lands on the 28th or 29th. A wall time a daylight-saving jump skips resolves forward, as `parse` does.
     */
    set(opts: {
        value: TTemporalInput;
        tz?: string;
    } & TTemporalFields): Date;
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
    durationParts(opts: {
        milliseconds: number;
    }): ITemporalDurationParts;
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
```

Source: `packages/helpers/src/modules/temporal/helper.ts`

## `TemporalInclusivities`

*class*

Which ends of the range `isBetween` counts: `[` includes an end, `(` leaves it out.

```ts
export declare class TemporalInclusivities {
    static readonly EXCLUSIVE = "()";
    static readonly INCLUSIVE = "[]";
    static readonly START_ONLY = "[)";
    static readonly END_ONLY = "(]";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): input is TTemporalInclusivity;
}
```

Source: `packages/helpers/src/modules/temporal/common/constants.ts`

## `TemporalNameWidths`

*class*

How long a month or weekday name is written: NARROW (`M`), SHORT (`Mon`) or LONG (`Monday`).

```ts
export declare class TemporalNameWidths {
    static readonly NARROW = "narrow";
    static readonly SHORT = "short";
    static readonly LONG = "long";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/helpers/src/modules/temporal/common/constants.ts`

## `TemporalUnits`

*class*

Units `add`, `subtract`, `startOf` and `endOf` accept. Weeks are ISO weeks - they start on Monday; a quarter is three calendar months from January, April, July or October.

```ts
export declare class TemporalUnits {
    static readonly MILLISECOND = "millisecond";
    static readonly SECOND = "second";
    static readonly MINUTE = "minute";
    static readonly HOUR = "hour";
    static readonly DAY = "day";
    static readonly WEEK = "week";
    static readonly MONTH = "month";
    static readonly QUARTER = "quarter";
    static readonly YEAR = "year";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): input is TTemporalUnit;
}
```

Source: `packages/helpers/src/modules/temporal/common/constants.ts`

## `TemporalWrittenDateStyles`

*class*

How `writtenDate` writes a date: NUMERIC is `10/14/2026`, LONG is `October 14, 2026`.

```ts
export declare class TemporalWrittenDateStyles {
    static readonly NUMERIC = "numeric";
    static readonly LONG = "long";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/helpers/src/modules/temporal/common/constants.ts`

## `TRelativeUnit`

*type*

The units `Intl.RelativeTimeFormat` speaks: every temporal unit but the millisecond.

```ts
export type TRelativeUnit = Exclude<TTemporalUnit, typeof TemporalUnits.MILLISECOND>;
```

Source: `packages/helpers/src/modules/temporal/common/types.ts`

## `TTemporalDurationStyle`

*type*

A value of {@link TemporalDurationStyles}.

```ts
export type TTemporalDurationStyle = TConstValue<typeof TemporalDurationStyles>;
```

Source: `packages/helpers/src/modules/temporal/common/constants.ts`

## `TTemporalFields`

*type*

The fields `set` replaces on the wall clock: `month` is 1-12.

```ts
export type TTemporalFields = Partial<ITemporalParts>;
```

Source: `packages/helpers/src/modules/temporal/common/types.ts`

## `TTemporalInclusivity`

*type*

A value of {@link TemporalInclusivities}.

```ts
export type TTemporalInclusivity = TConstValue<typeof TemporalInclusivities>;
```

Source: `packages/helpers/src/modules/temporal/common/constants.ts`

## `TTemporalInput`

*type*

What a date-taking method accepts: a `Date`, epoch milliseconds, or an ISO 8601 string.

```ts
export type TTemporalInput = Date | number | string;
```

Source: `packages/helpers/src/modules/temporal/common/types.ts`

## `TTemporalMonthNameWidth`

*type*

A month name has no narrow form here: SHORT or LONG.

```ts
export type TTemporalMonthNameWidth = Exclude<TTemporalNameWidth, typeof TemporalNameWidths.NARROW>;

/** How long a month or weekday name is written: NARROW (`M`), SHORT (`Mon`) or LONG (`Monday`). */
export declare class TemporalNameWidths {
    static readonly NARROW = "narrow";
    static readonly SHORT = "short";
    static readonly LONG = "long";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/helpers/src/modules/temporal/common/constants.ts`

## `TTemporalNameWidth`

*type*

Valid name width values.

```ts
export type TTemporalNameWidth = TConstValue<typeof TemporalNameWidths>;
```

Source: `packages/helpers/src/modules/temporal/common/constants.ts`

## `TTemporalUnit`

*type*

A value of {@link TemporalUnits}.

```ts
export type TTemporalUnit = TConstValue<typeof TemporalUnits>;
```

Source: `packages/helpers/src/modules/temporal/common/constants.ts`

## `TTemporalWrittenDateStyle`

*type*

Valid written date style values.

```ts
export type TTemporalWrittenDateStyle = TConstValue<typeof TemporalWrittenDateStyles>;
```

Source: `packages/helpers/src/modules/temporal/common/constants.ts`
