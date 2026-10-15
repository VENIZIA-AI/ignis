---
title: Temporal
description: Parse, format and move dates in a time zone you name, through the date library you choose
difficulty: beginner
---

# Temporal

`TemporalHelper` does date work in a time zone you name. It reads a `Date`, epoch milliseconds or an ISO string, and always hands back a `Date`.

```typescript
import { TemporalHelper } from '@venizia/ignis-helpers/temporal';

const temporal = new TemporalHelper({ tz: 'Asia/Ho_Chi_Minh' });

// VNPay sends a wall-clock time with no offset
const paidAt = temporal.parse({ value: '20260919120000', pattern: 'YYYYMMDDHHmmss' });
paidAt.toISOString(); // '2026-09-19T05:00:00.000Z'
```

Noon in Ho Chi Minh City is 05:00 UTC. The zone belongs to the helper, never to the server, so every machine answers the same instant.

A helper built without `tz` computes in UTC. It never reads an environment variable.

## Pick an adapter

An **adapter** answers one question: which UTC offset a zone observes at an instant. The helper does everything else. You pass the date library in - `@venizia/ignis-helpers` imports none.

| Adapter | Build it with | Needs | Reach for it when |
|---|---|---|---|
| `NativeTemporalAdapter` (the default when the runtime has `Temporal`) | `new NativeTemporalAdapter()` | The runtime's `Temporal` API - Bun has it, not every browser does | You run on Bun |
| `IntlTemporalAdapter` (the default otherwise) | `new IntlTemporalAdapter()` | Nothing: `Intl.DateTimeFormat` ships in every browser and runtime | You run in a browser, or want one behaviour everywhere |
| `NativeTemporalAdapter` | `new NativeTemporalAdapter({ temporal })` | A Temporal polyfill's namespace | Your runtime has no `Temporal` and you want the standard API |
| `DayjsTemporalAdapter` | `new DayjsTemporalAdapter({ dayjs })` | Your `dayjs`, with the `utc` and `timezone` plugins extended | Your app already ships dayjs |
| `LuxonTemporalAdapter` | `new LuxonTemporalAdapter({ DateTime })` | Your Luxon `DateTime` class | Your app already ships Luxon |

Node 24 has no global `Temporal` (only behind the experimental `--harmony-temporal` flag). There, `new TemporalHelper()` without an adapter throws `[NativeTemporalAdapter] Temporal is not available on this runtime`. Pass another adapter:

```typescript
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { DayjsTemporalAdapter, TemporalHelper } from '@venizia/ignis-helpers/temporal';

dayjs.extend(utc);
dayjs.extend(timezone);

const temporal = new TemporalHelper({
  adapter: new DayjsTemporalAdapter({ dayjs }),
  tz: 'Asia/Ho_Chi_Minh',
});
```

```typescript
import { DateTime } from 'luxon';
import { LuxonTemporalAdapter, TemporalHelper } from '@venizia/ignis-helpers/temporal';

const temporal = new TemporalHelper({
  adapter: new LuxonTemporalAdapter({ DateTime }),
  tz: 'Asia/Ho_Chi_Minh',
});
```

The wall clock, daylight-saving gaps and repeats, and the calendar arithmetic all live in the helper. Swapping the adapter changes no call site, and the adapters agree wherever their libraries report the same offset.

> [!WARNING]
> dayjs misreads a local mean time offset under one hour: `Europe/London` before 1848 comes back as `-01:15` instead of `-00:01:15`, and 20 zones are off by up to 14.5 hours before 1914. For such dates, use `NativeTemporalAdapter` or `LuxonTemporalAdapter`. The host's zone does not matter to the adapter: it reads only dayjs's offset, which stays right on any host. Formatting with dayjs itself, outside the helper, does move with the host zone near the host's own daylight-saving change.

## Common tasks

The examples share this setup:

```typescript
import { TemporalHelper, TemporalUnits } from '@venizia/ignis-helpers/temporal';

const temporal = new TemporalHelper({ tz: 'Asia/Ho_Chi_Minh' });
const paidAt = temporal.parse({ value: '20260919120000', pattern: 'YYYYMMDDHHmmss' });
```

### Parse a timestamp from another system

Give the pattern the other system writes. The value must match it exactly, and its fields are read as wall clock in the zone:

```typescript
temporal.parse({ value: '19/09/2026 12:00', pattern: 'DD/MM/YYYY HH:mm' });
// 2026-09-19T05:00:00.000Z
```

Without a pattern, the value must be ISO 8601. An offset inside the value wins over the zone:

```typescript
temporal.parse({ value: '2026-09-19T12:00:00+07:00' }); // 2026-09-19T05:00:00.000Z
temporal.parse({ value: '2026-09-19T12:00:00' }); // 2026-09-19T05:00:00.000Z - wall clock in the zone
temporal.parse({ value: '2026-09-19' }); // 2026-09-18T17:00:00.000Z - midnight in the zone
```

A value that does not match throws a 400. So does a date the calendar does not have: `2026-02-30` is refused, never rolled over into March.

### Format a date for a person or another system

```typescript
temporal.format({ value: paidAt }); // '2026-09-19T12:00:00.000+07:00'
temporal.format({ value: paidAt, pattern: 'DD/MM/YYYY HH:mm' }); // '19/09/2026 12:00'
temporal.format({ value: paidAt, pattern: '[on] D/M/YYYY [at] H:mm' }); // 'on 19/9/2026 at 12:00'
```

Without a pattern you get ISO 8601 with the zone's offset. Wrap literal text in `[brackets]`.

Patterns use the dayjs spelling - see [Pattern tokens](#pattern-tokens). Any other letter throws when the pattern is read, so a date-fns pattern like `yyyy-MM-dd` fails loudly instead of printing garbage.

### Write month names, weekdays and 12-hour time

```typescript
const vietnamese = new TemporalHelper({ tz: 'Asia/Ho_Chi_Minh', locale: 'vi-VN' });

vietnamese.format({ value: paidAt, pattern: 'dddd, D MMMM YYYY hh:mm A' }); // 'Thứ Bảy, 19 Tháng 9 2026 12:00 CH'
temporal.format({ value: paidAt, pattern: 'ddd, MMM D, h:mm a', locale: 'en-US' }); // 'Sat, Sep 19, 12:00 pm'
temporal.format({ value: paidAt, pattern: 'LL', locale: 'en-US' }); // 'September 19, 2026'
```

The names are what `Intl` spells for the locale, so a browser can differ slightly from Bun. These tokens write only: `parse` stays numeric. For anything a token cannot say, pass `Intl.DateTimeFormat` options to `formatIntl`:

```typescript
temporal.formatIntl({ value: paidAt, options: { weekday: 'long', hour: 'numeric' }, locale: 'en-US' }); // 'Saturday 12 PM'
```

### Say how long ago

```typescript
temporal.relative({ value: paidAt, base: '2026-09-19T08:00:00Z' }); // '3 hours ago'
temporal.relative({ value: paidAt, unit: TemporalUnits.DAY, numeric: 'auto' }); // 'yesterday', 'today', 'tomorrow'
```

Without a `unit`, `relative` says the largest whole unit that has passed. With one, it counts that unit's boundaries in the zone: 23:00 yesterday, seen at 01:00, is `yesterday`. `base` defaults to now.

### Compare and measure

```typescript
temporal.compare({ value: a, other: b, unit: TemporalUnits.DAY }); // -1, 0 or 1 - is a before, on, or after b's day?
temporal.isSame({ value: a, other: b, unit: TemporalUnits.DAY }); // true on the same day in the zone
temporal.isBetween({ value: a, from, to, inclusivity: '[]' }); // both ends count
temporal.diff({ value: b, other: a, unit: TemporalUnits.MONTH }); // whole months from a to b
temporal.tryParse({ value: input }); // a Date, or null where parse would throw
temporal.tryToDate({ value: row.paidAt }); // a Date, or null for null, undefined or bad input
temporal.format({ value: row.paidAt, pattern: 'DD/MM/YYYY', fallback: '--' }); // '--' when there is no date
// Or once for every call: new TemporalHelper({ tz, fallback: '--' })
temporal.formatDuration({ milliseconds: 5_400_000 }); // '1h30m'
```

`diff` counts as dayjs does, truncated toward zero, and `diff(a, b)` is always `-diff(b, a)`:

- Hours and smaller count elapsed time.
- Days and weeks count the wall clocks in the zone, so the 23-hour day of a spring-forward jump is one day.
- Months, quarters and years anchor on the date with the later day of the month. From Feb 28 23:59 to Mar 31 12:00 is 0 months: Mar 31 less a month is Feb 28 12:00, before the start.

`null` is never a date: `toDate`, `compare` and `format` throw a 400 for it, `isValid` answers `false`.

### Set fields, and clone a helper for another locale

```typescript
temporal.set({ value: order.createdAt, hour: 9, minute: 0 }); // 09:00 that day, in the zone
temporal.set({ value: '2026-01-31T10:00:00+07:00', month: 2 }); // Feb 28 - the day clamps to the month

const english = temporal.clone({ locale: 'en-US' }); // same zone, adapter and names
```

### Write a clock face, or the largest unit only

```typescript
temporal.formatDuration({ milliseconds: 3_723_000, pattern: 'HH:mm:ss' }); // '01:02:03'
temporal.formatDuration({ milliseconds: 4_500_000, pattern: 'mm:ss' }); // '75:00' - the largest token carries the rest
temporal.formatDuration({ milliseconds: 7_500_000, style: 'long', maxUnits: 1 }); // '2 hours'
```

Face tokens are `DD D HH H mm m ss s SSS`, text in `[brackets]`.

### Bridge a date picker

A browser date picker hands back a `Date` meaning "this day and time in the browser's zone". Read in the helper's zone, a user outside it sees the day shift. Move the wall clock across instead:

```typescript
<DayPicker
  selected={temporal.toWallClock({ value: order.deliveryDate })} // what the picker shows
  onSelect={day => setDeliveryDate(temporal.fromWallClock({ value: day }))} // what you store
/>
```

`fromWallClock` keeps the year, month, day and time the picker shows and returns that instant in the helper's zone; `toWallClock` is the reverse. Both default to the host's zone (`TemporalHelper.getHostTz()`), the one place the helper reads it; pass `sourceTz` / `targetTz` to name another.

### Use your own month and weekday names

```typescript
const temporal = new TemporalHelper({
  tz: 'Asia/Ho_Chi_Minh',
  locale: 'vi-VN',
  names: {
    'vi-VN': {
      weekdaysShort: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'], // Monday first
      monthsShort: ['Th1', 'Th2', 'Th3', 'Th4', 'Th5', 'Th6', 'Th7', 'Th8', 'Th9', 'Th10', 'Th11', 'Th12'],
      meridiem: ['AM', 'PM'],
    },
  },
});

temporal.format({ value: paidAt, pattern: 'ddd D MMM, hh:mm A' }); // 'T7 19 Th9, 12:00 PM'
```

`names` replaces `Intl`'s wording for the locale it is keyed by: `months`, `monthsShort` (January first), `weekdays`, `weekdaysShort`, `weekdaysMin` (Monday first) and `meridiem`. A list of the wrong length fails when the helper is built.

### Move a date by days, months or hours

```typescript
const dueAt = temporal.add({ value: paidAt, amount: 1, unit: TemporalUnits.MONTH });
// 2026-10-19 12:00 in the zone

const remindAt = temporal.subtract({ value: dueAt, amount: 3, unit: TemporalUnits.DAY });
// 2026-10-16 12:00 in the zone
```

The unit decides what "one" means:

- **`millisecond` to `hour`** measure elapsed time. 24 hours across a daylight-saving jump is not one day.
- **`day` and `week`** move the calendar in the zone and keep the wall time.
- **`month` and `year`** clamp to the end of a shorter month: January 31 plus one month is February 28.

`amount` must be a whole number.

### Get the range of a day, week or month

```typescript
const from = temporal.startOf({ value: paidAt, unit: TemporalUnits.MONTH });
// 2026-08-31T17:00:00.000Z - September 1, 00:00 in the zone

const to = temporal.endOf({ value: paidAt, unit: TemporalUnits.MONTH });
// 2026-09-30T16:59:59.999Z - September 30, 23:59:59.999 in the zone
```

Both follow the zone's calendar, so "this month" is the month in Ho Chi Minh City, not in UTC. Weeks are ISO weeks and start on Monday.

### Skip weekends

```typescript
temporal.isWeekday({ value: paidAt }); // false - 2026-09-19 is a Saturday
temporal.nextWeekday({ value: paidAt }); // Monday 2026-09-21, same wall time
temporal.previousWeekday({ value: paidAt }); // Friday 2026-09-18, same wall time
```

The weekday is read on the zone's wall clock. Friday 20:00 UTC is already Saturday in Ho Chi Minh City.

### Use another zone for one call

Every method takes an optional `tz` that overrides the helper's zone for that call only:

```typescript
temporal.format({ value: paidAt, tz: 'UTC' }); // '2026-09-19T05:00:00.000+00:00'
```

An unknown zone throws: a 500 when the helper is built, a 400 when it arrives on a call.

### Write your own adapter

Implement `ITemporalAdapter`. It has one method, `getOffsetMilliseconds`: the UTC offset a zone observes at an instant. The helper builds the wall clock and resolves skipped and repeated times from that one answer, so an adapter cannot get daylight saving wrong on its own. Read the offset from the instant, never from the server's zone.

This adapter drives date-fns through `tzOffset` from `@date-fns/tz`, which reads a zone's offset through `Intl`:

```typescript
import { tzOffset } from '@date-fns/tz';
import type { ITemporalAdapter } from '@venizia/ignis-helpers/temporal';

export class DateFnsTemporalAdapter implements ITemporalAdapter {
  getOffsetMilliseconds(opts: { value: Date; tz: string }): number {
    return tzOffset(opts.timeZone, opts.value) * 60_000; // tzOffset answers in minutes
  }
}
```

Pass it like any built-in adapter: `new TemporalHelper({ adapter: new DateFnsTemporalAdapter(), tz: 'Asia/Ho_Chi_Minh' })`.

### Replace the `dayjs` IGNIS used to export

`@venizia/ignis-helpers` no longer exports `dayjs`. It no longer sets dayjs's default zone when it loads, either. If you imported `dayjs` from IGNIS, pick one of two ways forward.

**Keep dayjs.** Install it with `bun add dayjs`, then configure it once in a module of your own:

```typescript
// src/utilities/dayjs.ts
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import isoWeek from 'dayjs/plugin/isoWeek';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import weekday from 'dayjs/plugin/weekday';

dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(weekday);
dayjs.extend(isoWeek);
dayjs.tz.setDefault('Asia/Ho_Chi_Minh');

export { dayjs };
```

Those five plugins and that zone are what IGNIS configured. Then point every import at your module: `import { dayjs } from '@/utilities/dayjs'`.

> [!WARNING]
> Keep `customParseFormat`. Without it, `dayjs(value, format)` ignores the format and never says so: `dayjs('09/10/2026', 'DD/MM/YYYY')` reads as 10 September instead of 9 October.

**Or move to `TemporalHelper`.** `DayjsTemporalAdapter` runs it on the same dayjs. The removed functions map like this:

| Removed | Use instead |
|---|---|
| `isWeekday(date)` | `temporal.isWeekday({ value })` |
| `getNextWeekday({ date })` | `temporal.nextWeekday({ value })` |
| `getPreviousWeekday({ date })` | `temporal.previousWeekday({ value })` |
| `getDateTz({ date, timezone })` | `temporal.format({ value, tz })` for text, with `dddd` for the weekday name; `temporal.parts({ value, tz })` for fields |
| `getDateTz({ ..., timeOffset })` | `temporal.add({ value, amount: timeOffset, unit: TemporalUnits.HOUR })` |
| `sleep()`, `hrTime()` | Unchanged - both still ship from `@venizia/ignis-helpers` |

The new weekday methods read the day in the helper's zone. The removed ones read it in the server's own zone.

## Reference

### Import

```typescript
import { TemporalHelper, TemporalUnits } from '@venizia/ignis-helpers/temporal';
```

The same names ship from `@venizia/ignis-helpers` and from the browser-safe `@venizia/ignis-helpers/core`.

### Constructor

`new TemporalHelper(opts?)`

| Option | Type | Default | Meaning |
|---|---|---|---|
| `adapter` | `ITemporalAdapter` | `NativeTemporalAdapter` when the runtime has `Temporal`, `IntlTemporalAdapter` otherwise | Converts time zones |
| `tz` | `string` | `'UTC'` | The IANA zone every call uses unless it passes its own. Checked when the helper is built |
| `locale` | `string` | `'en-US'` | Spells name tokens, relative time and durations, unless a call passes its own. A malformed tag is a 400 |
| `names` | `Record<string, ITemporalLocaleNames>` | none | Your own month and weekday names and AM/PM marker, per locale, over `Intl`'s. A call in another tag of the same language (`vi` for a `vi-VN` entry) uses the entry |
| `fallback` | `string` | none | What `format` and `formatIntl` write for a value that is not a date - null included - when a call passes none. Without it, such a value is a 400 |
| `scope` | `string` | `'TemporalHelper'` | Logger scope, from `BaseHelper` |

### Methods

Every method takes one options object. `value` is a `TTemporalInput`: a `Date`, epoch milliseconds, or an ISO 8601 string. `pattern` and `tz` are optional everywhere. Dates run from year 1 to year 9999.

| Method | Returns | What it does |
|---|---|---|
| `getTz()` | `string` | The helper's zone |
| `getLocale()` | `string` | The helper's locale |
| `now()` | `Date` | The current instant |
| `toDate({ value, tz })` | `Date` | The instant `value` names. An ISO string without an offset is wall clock in the zone. `null` is a 400 |
| `tryToDate({ value, tz })` | `Date \| null` | `toDate`, answering `null` for null, undefined, bad text or `NaN` |
| `parts({ value, tz })` | `IZonedTemporalParts` | The wall clock in the zone, with the ISO weekday and the offset |
| `parse({ value, pattern, tz })` | `Date` | Reads a string: an exact match with `pattern`, ISO 8601 without. An offset in the value wins over the zone |
| `tryParse({ value, pattern, tz })` | `Date \| null` | `parse`, answering `null` where `parse` throws a 400. A broken pattern still throws |
| `isValid({ value, pattern, tz })` | `boolean` | Whether the value names an instant in years 1-9999; a string is read as `parse` reads it. `null` and `undefined` are `false` |
| `format({ value, pattern, tz, locale, fallback })` | `string` | Writes the value in the zone. `pattern` defaults to `YYYY-MM-DDTHH:mm:ss.SSSZ`. With `fallback`, a value that is not a date writes the fallback |
| `formatIntl({ value, options, tz, locale, fallback })` | `string` | Writes the value with `Intl.DateTimeFormat` options, in the zone |
| `add({ value, amount, unit, tz })` | `Date` | Moves the value - see [Units](#units). An hour or smaller takes a fraction (`1.5` hours is 90 minutes); a calendar unit takes whole numbers only |
| `set({ value, year, month, day, hour, minute, second, millisecond, tz })` | `Date` | Replaces wall-clock fields in the zone; `month` is 1-12; the day clamps to the month |
| `subtract({ value, amount, unit, tz })` | `Date` | `add` with the sign flipped |
| `startOf({ value, unit, tz })` | `Date` | The first instant of the unit containing the value |
| `endOf({ value, unit, tz })` | `Date` | The last millisecond of that unit |
| `isWeekday({ value, tz })` | `boolean` | Monday to Friday, on the zone's wall clock |
| `nextWeekday({ value, tz })` | `Date` | The next Monday-to-Friday day, same wall time |
| `previousWeekday({ value, tz })` | `Date` | The previous Monday-to-Friday day, same wall time |
| `diff({ value, other, unit, tz })` | `number` | Whole units from `other` to `value`, truncated toward zero, counted as dayjs counts - see [Compare and measure](#compare-and-measure) |
| `compare({ value, other, unit, tz })` | `-1 \| 0 \| 1` | Before, in or after the unit holding `other`. Without `unit`, to the millisecond |
| `isBefore`, `isAfter`, `isSame`, `isSameOrBefore`, `isSameOrAfter` `({ value, other, unit, tz })` | `boolean` | `compare` as a yes or no |
| `isBetween({ value, from, to, unit, inclusivity, tz })` | `boolean` | Between the two ends, in either order. `inclusivity` is `()` (default), `[]`, `[)` or `(]` - `TemporalInclusivities` |
| `relative({ value, base, unit, numeric, style, tz, locale })` | `string` | `value` relative to `base` (default now), through `Intl.RelativeTimeFormat`. `unit` has no millisecond |
| `durationParts({ milliseconds })` | `ITemporalDurationParts` | Days, hours, minutes, seconds and milliseconds; a day is 24 hours |
| `formatDuration({ milliseconds, style, pattern, maxUnits, locale })` | `string` | `compact` (default) writes `1d1h30m`; `narrow`, `short` and `long` use the locale's unit words. `maxUnits` keeps the largest units; `pattern` writes a clock face instead |
| `clone({ locale, tz })` | `TemporalHelper` | A helper like this one with another locale or zone: same adapter and names |
| `fromWallClock({ value, sourceTz, tz })` | `Date` | The instant with the same wall clock in the helper's zone as `value` shows in `sourceTz` (default: the host's) |
| `toWallClock({ value, targetTz, tz })` | `Date` | The reverse: a `Date` whose wall clock in `targetTz` (default: the host's) reads what the helper's zone reads |
| `TemporalHelper.getHostTz()` | `string` | The zone a `Date`'s local getters use on this runtime |

### Units

`TemporalUnits` is a const class, and `TTemporalUnit` is the type of its values.

| Unit | `add` and `subtract` | `startOf` |
|---|---|---|
| `MILLISECOND`, `SECOND`, `MINUTE`, `HOUR` | Elapsed time | Drops every smaller field |
| `DAY` | One calendar day in the zone, same wall time | 00:00 in the zone |
| `WEEK` | Seven calendar days | Monday, 00:00 |
| `MONTH` | One calendar month, the day clamped to the month's end | The 1st, 00:00 |
| `QUARTER` | Three calendar months, clamped the same way | January, April, July or October 1, 00:00 |
| `YEAR` | Twelve calendar months, clamped the same way | January 1, 00:00 |

### Pattern tokens

Examples format `2026-09-19T05:04:03.021Z` in `Asia/Ho_Chi_Minh`.

| Token | Meaning | Example |
|---|---|---|
| `YYYY` | Year, four digits | `2026` |
| `YY` | Year, two digits. Parsing reads `00`-`68` as 2000-2068 and `69`-`99` as 1969-1999 | `26` |
| `MM` / `M` | Month, padded / unpadded | `09` / `9` |
| `DD` / `D` | Day of the month, padded / unpadded | `19` / `19` |
| `HH` / `H` | Hour 0-23, padded / unpadded | `12` / `12` |
| `mm` / `m` | Minute, padded / unpadded | `04` / `4` |
| `ss` / `s` | Second, padded / unpadded | `03` / `3` |
| `SSS` | Millisecond, three digits | `021` |
| `Z` | Offset with a colon, and seconds when it has them. Parsing also takes `Z` | `+07:00` |
| `ZZ` | Offset without a colon, and seconds when it has them. Parsing also takes `Z` | `+0700` |
| `MMMM` / `MMM` | Month name, long / short, on the Gregorian calendar whatever the locale's own. Writing only | `September` / `Sep` |
| `dddd` / `ddd` | Weekday name, long / short. Writing only | `Saturday` / `Sat` |
| `hh` / `h` | Hour 1-12, padded / unpadded. Writing only | `12` / `12` |
| `A` / `a` | AM/PM marker, as written / lower case. Writing only | `PM` / `pm` |
| `L` / `LL` | The date in the locale's numeric order / its long form. Writing only | `09/19/2026` / `September 19, 2026` |
| `dd` | Weekday name, narrowest. Writing only | `S` (vi-VN: `T7`) |
| `Q` | Quarter, 1-4. Writing only | `3` |
| `[text]` | Literal text | `[at]` writes `at` |
| `T` | A literal `T` - the one letter allowed without brackets | `T` |

- A run of one letter is one token. `DDDD` or `ZZZ` throws a 500 that names it, rather than being read as smaller tokens.
- Name examples are `en-US`. The writing-only tokens take the call's `locale`, or the helper's. A parse pattern holding one throws a 500.
- Any other letter throws the same way. Spaces and punctuation are literals.
- An offset with seconds is historic local mean time: `Asia/Ho_Chi_Minh` in 1900 writes `+07:06:30`. Parsing refuses an offset hour above 23, or a minute or second above 59.
- Parsing fills a field the pattern leaves out with its start: year 1970, month 1, day 1, 00:00:00.000.

### Daylight saving

| Case | Resolves to | Example in `America/New_York` |
|---|---|---|
| A wall time a jump skips | Forward, past the gap | `2026-03-08 02:30` is `07:30Z` (03:30 EDT) |
| A wall time that happens twice | The earlier instant | `2026-11-01 01:30` is `05:30Z` (01:30 EDT) |
| `startOf` / `endOf` an hour or less, inside a repeated hour | Each pass is its own unit | From `06:30Z` (the second 01:30), the hour runs `06:00Z` to `06:59:59.999Z` |
| `add` a day or longer, landing on a repeated time | The earlier instant | `add` of 0 returns the value unchanged |

### Errors

| Situation | Status | Message begins with |
|---|---|---|
| Unknown `tz` in the constructor | 500 | `[TemporalHelper] unknown time zone` |
| Unknown `tz` on a call | 400 | `[TemporalHelper] unknown time zone` |
| Value does not match `pattern` | 400 | `[TemporalHelper] '<value>' does not match pattern` |
| No `pattern`, and the value is not ISO 8601 | 400 | `[TemporalHelper] '<value>' is not ISO 8601` |
| A date or time the calendar does not have | 400 | `[TemporalHelper] '<value>' is not a real date and time` |
| An invalid `Date`, or `NaN` | 400 | `[TemporalHelper] invalid date` |
| A value outside years 1-9999, or an `add` that leaves them | 400 | `[TemporalHelper]` ... `outside the years 1-9999` |
| An adapter called directly with a zone it cannot read | 400 | `[NativeTemporalAdapter] no offset for` (and the same for the other two) |
| An unknown unit, or a fractional `amount` | 400 | `[TemporalHelper] unknown unit` / `[TemporalHelper] amount must be an integer` |
| An unknown token, or an unclosed `[`, in a pattern; a writing-only token in a parse pattern | 500 | `[TemporalPattern]` |
| A malformed `locale` | 400 | `[TemporalLocale] invalid locale` |
| A fractional `milliseconds`, or an unknown duration `style` | 400 | `[TemporalDuration]` |
| `new NativeTemporalAdapter()` finds no `Temporal` | 500 | `[NativeTemporalAdapter] Temporal is not available on this runtime` |
| dayjs without the `timezone` plugin | 500 | ``[DayjsTemporalAdapter] dayjs has no `tz` `` |

### Types

```typescript
interface ITemporalAdapter {
  /** Milliseconds east of UTC that tz observes at value: 25_200_000 for +07:00. */
  getOffsetMilliseconds(opts: { value: Date; tz: string }): number;
}
```

| Type | Shape |
|---|---|
| `TTemporalInput` | `Date \| number \| string` |
| `ITemporalParts` | `year`, `month` (1-12), `day` (1-31), `hour`, `minute`, `second`, `millisecond` |
| `IZonedTemporalParts` | `ITemporalParts` plus `dayOfWeek` (ISO: 1 is Monday, 7 is Sunday) and `offsetMinutes` (east of UTC: `420` for `+07:00`; a fraction when the offset has seconds) |
| `ITemporalDurationParts` | `isNegative`, and non-negative `days`, `hours`, `minutes`, `seconds`, `milliseconds` |

- `DEFAULT_TEMPORAL_TZ` is `'UTC'`. `DEFAULT_TEMPORAL_PATTERN` is `'YYYY-MM-DDTHH:mm:ss.SSSZ'`. `DEFAULT_TEMPORAL_LOCALE` is `'en-US'`.
- `TemporalDurationStyles` holds `COMPACT`, `NARROW`, `SHORT` and `LONG`.
- The adapters type their library argument structurally (`ITemporalNamespace`, `IDayjsFactory`, `ILuxonDateTimeFactory`), so no date library's types ship with this package.

## See also

- [UID](/extensions/helpers/uid/) - `UuidHelper.inspect()` reads the creation time out of a v7 id
- [Duration](/references/utilities/duration) - fixed units for sizing a window, not calendar dates
- [Helpers Overview](/extensions/helpers/) - all available helpers
- [Temporal proposal](https://tc39.es/proposal-temporal/docs/) - the API the default adapter drives

**Files:**

- [`packages/helpers/src/modules/temporal/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/temporal/helper.ts) - `TemporalHelper`
- [`packages/helpers/src/modules/temporal/pattern/pattern.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/temporal/pattern/pattern.ts) - the pattern dialect
- [`packages/helpers/src/modules/temporal/calendar/calendar.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/temporal/calendar/calendar.ts) - day and month arithmetic
- [`packages/helpers/src/modules/temporal/adapters/intl.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/temporal/adapters/intl.ts) - `IntlTemporalAdapter`
- [`packages/helpers/src/modules/temporal/locale/locale.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/temporal/locale/locale.ts) - month and weekday names per locale
- [`packages/helpers/src/modules/temporal/duration/duration.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/temporal/duration/duration.ts) - `durationParts` and `formatDuration`
- [`packages/helpers/src/modules/temporal/adapters/native.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/temporal/adapters/native.ts) - `NativeTemporalAdapter`
- [`packages/helpers/src/modules/temporal/adapters/dayjs.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/temporal/adapters/dayjs.ts) - `DayjsTemporalAdapter`
- [`packages/helpers/src/modules/temporal/adapters/luxon.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/temporal/adapters/luxon.ts) - `LuxonTemporalAdapter`
- [`packages/helpers/src/modules/temporal/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/temporal/common/types.ts) - `ITemporalAdapter` and the parts types
- [`packages/helpers/src/modules/temporal/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/temporal/common/constants.ts) - `TemporalUnits` and the defaults
- [`packages/helpers/src/temporal.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/temporal.ts) - the `./temporal` subpath entry
