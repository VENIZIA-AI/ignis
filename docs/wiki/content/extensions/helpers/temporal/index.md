---
title: Temporal
description: Parse, format and move dates in a time zone you name, through the date library you choose
difficulty: beginner
---

# Temporal

`TemporalHelper` does date work in a time zone you name. It reads a `Date`, epoch milliseconds or an ISO string, and always hands back a `Date`.

```typescript
import { TemporalHelper } from '@venizia/ignis-helpers/temporal';

const temporal = new TemporalHelper({ timeZone: 'Asia/Ho_Chi_Minh' });

// VNPay sends a wall-clock time with no offset
const paidAt = temporal.parse({ value: '20260919120000', pattern: 'YYYYMMDDHHmmss' });
paidAt.toISOString(); // '2026-09-19T05:00:00.000Z'
```

Noon in Ho Chi Minh City is 05:00 UTC. The zone belongs to the helper, never to the server, so every machine answers the same instant.

A helper built without `timeZone` computes in UTC. It never reads an environment variable.

## Pick an adapter

An **adapter** answers one question: which UTC offset a zone observes at an instant. The helper does everything else. You pass the date library in - `@venizia/ignis-helpers` imports none.

| Adapter | Build it with | Needs | Reach for it when |
|---|---|---|---|
| `NativeTemporalAdapter` (the default) | `new NativeTemporalAdapter()` | The runtime's `Temporal` API - Bun and current browsers have it | You run on Bun |
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
  timeZone: 'Asia/Ho_Chi_Minh',
});
```

```typescript
import { DateTime } from 'luxon';
import { LuxonTemporalAdapter, TemporalHelper } from '@venizia/ignis-helpers/temporal';

const temporal = new TemporalHelper({
  adapter: new LuxonTemporalAdapter({ DateTime }),
  timeZone: 'Asia/Ho_Chi_Minh',
});
```

The wall clock, daylight-saving gaps and repeats, and the calendar arithmetic all live in the helper. Swapping the adapter changes no call site, and the adapters agree wherever their libraries report the same offset.

> [!WARNING]
> dayjs misreads a local mean time offset under one hour: `Europe/London` before 1848 comes back as `-01:15` instead of `-00:01:15`, and 20 zones are off by up to 14.5 hours before 1914. For such dates, use `NativeTemporalAdapter` or `LuxonTemporalAdapter`. The host's zone does not matter to the adapter: it reads only dayjs's offset, which stays right on any host. Formatting with dayjs itself, outside the helper, does move with the host zone near the host's own daylight-saving change.

## Common tasks

The examples share this setup:

```typescript
import { TemporalHelper, TemporalUnits } from '@venizia/ignis-helpers/temporal';

const temporal = new TemporalHelper({ timeZone: 'Asia/Ho_Chi_Minh' });
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

Patterns use the dayjs spelling, digits only - see [Pattern tokens](#pattern-tokens). Any other letter throws when the pattern is read, so a date-fns pattern like `yyyy-MM-dd` fails loudly instead of printing garbage.

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

Every method takes an optional `timeZone` that overrides the helper's zone for that call only:

```typescript
temporal.format({ value: paidAt, timeZone: 'UTC' }); // '2026-09-19T05:00:00.000+00:00'
```

An unknown zone throws: a 500 when the helper is built, a 400 when it arrives on a call.

### Write your own adapter

Implement `ITemporalAdapter`. It has one method, `getOffsetMilliseconds`: the UTC offset a zone observes at an instant. The helper builds the wall clock and resolves skipped and repeated times from that one answer, so an adapter cannot get daylight saving wrong on its own. Read the offset from the instant, never from the server's zone.

This adapter drives date-fns through `tzOffset` from `@date-fns/tz`, which reads a zone's offset through `Intl`:

```typescript
import { tzOffset } from '@date-fns/tz';
import type { ITemporalAdapter } from '@venizia/ignis-helpers/temporal';

export class DateFnsTemporalAdapter implements ITemporalAdapter {
  getOffsetMilliseconds(opts: { value: Date; timeZone: string }): number {
    return tzOffset(opts.timeZone, opts.value) * 60_000; // tzOffset answers in minutes
  }
}
```

Pass it like any built-in adapter: `new TemporalHelper({ adapter: new DateFnsTemporalAdapter(), timeZone: 'Asia/Ho_Chi_Minh' })`.

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
| `getDateTz({ date, timezone })` | `temporal.format({ value, timeZone })` for numeric text, `temporal.parts({ value, timeZone })` for fields. There is no day-name token: `format` with `dddd` throws, so read the weekday as `parts(...).dayOfWeek` (ISO: 1 is Monday, 7 is Sunday) |
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
| `adapter` | `ITemporalAdapter` | `new NativeTemporalAdapter()` | Converts time zones. The default throws when the runtime has no `Temporal` |
| `timeZone` | `string` | `'UTC'` | The IANA zone every call uses unless it passes its own. Checked when the helper is built |
| `scope` | `string` | `'TemporalHelper'` | Logger scope, from `BaseHelper` |

### Methods

Every method takes one options object. `value` is a `TTemporalInput`: a `Date`, epoch milliseconds, or an ISO 8601 string. `pattern` and `timeZone` are optional everywhere. Dates run from year 1 to year 9999.

| Method | Returns | What it does |
|---|---|---|
| `getTimeZone()` | `string` | The helper's zone |
| `now()` | `Date` | The current instant |
| `toDate({ value, timeZone })` | `Date` | The instant `value` names. An ISO string without an offset is wall clock in the zone |
| `parts({ value, timeZone })` | `IZonedTemporalParts` | The wall clock in the zone, with the ISO weekday and the offset |
| `parse({ value, pattern, timeZone })` | `Date` | Reads a string: an exact match with `pattern`, ISO 8601 without. An offset in the value wins over the zone |
| `format({ value, pattern, timeZone })` | `string` | Writes the value in the zone. `pattern` defaults to `YYYY-MM-DDTHH:mm:ss.SSSZ` |
| `add({ value, amount, unit, timeZone })` | `Date` | Moves the value by whole units - see [Units](#units) |
| `subtract({ value, amount, unit, timeZone })` | `Date` | `add` with the sign flipped |
| `startOf({ value, unit, timeZone })` | `Date` | The first instant of the unit containing the value |
| `endOf({ value, unit, timeZone })` | `Date` | The last millisecond of that unit |
| `isWeekday({ value, timeZone })` | `boolean` | Monday to Friday, on the zone's wall clock |
| `nextWeekday({ value, timeZone })` | `Date` | The next Monday-to-Friday day, same wall time |
| `previousWeekday({ value, timeZone })` | `Date` | The previous Monday-to-Friday day, same wall time |

### Units

`TemporalUnits` is a const class, and `TTemporalUnit` is the type of its values.

| Unit | `add` and `subtract` | `startOf` |
|---|---|---|
| `MILLISECOND`, `SECOND`, `MINUTE`, `HOUR` | Elapsed time | Drops every smaller field |
| `DAY` | One calendar day in the zone, same wall time | 00:00 in the zone |
| `WEEK` | Seven calendar days | Monday, 00:00 |
| `MONTH` | One calendar month, the day clamped to the month's end | The 1st, 00:00 |
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
| `[text]` | Literal text | `[at]` writes `at` |
| `T` | A literal `T` - the one letter allowed without brackets | `T` |

- A run of one letter is one token. `MMM`, `DDDD` or `ZZZ` throws a 500 that names it, rather than being read as smaller tokens - month and weekday names are not supported.
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
| Unknown `timeZone` in the constructor | 500 | `[TemporalHelper] unknown time zone` |
| Unknown `timeZone` on a call | 400 | `[TemporalHelper] unknown time zone` |
| Value does not match `pattern` | 400 | `[TemporalHelper] '<value>' does not match pattern` |
| No `pattern`, and the value is not ISO 8601 | 400 | `[TemporalHelper] '<value>' is not ISO 8601` |
| A date or time the calendar does not have | 400 | `[TemporalHelper] '<value>' is not a real date and time` |
| An invalid `Date`, or `NaN` | 400 | `[TemporalHelper] invalid date` |
| A value outside years 1-9999, or an `add` that leaves them | 400 | `[TemporalHelper]` ... `outside the years 1-9999` |
| An adapter called directly with a zone it cannot read | 400 | `[NativeTemporalAdapter] no offset for` (and the same for the other two) |
| An unknown unit, or a fractional `amount` | 400 | `[TemporalHelper] unknown unit` / `[TemporalHelper] amount must be an integer` |
| An unknown token, or an unclosed `[`, in a pattern | 500 | `[TemporalPattern]` |
| The default adapter finds no `Temporal` | 500 | `[NativeTemporalAdapter] Temporal is not available on this runtime` |
| dayjs without the `timezone` plugin | 500 | ``[DayjsTemporalAdapter] dayjs has no `tz` `` |

### Types

```typescript
interface ITemporalAdapter {
  /** Milliseconds east of UTC that timeZone observes at value: 25_200_000 for +07:00. */
  getOffsetMilliseconds(opts: { value: Date; timeZone: string }): number;
}
```

| Type | Shape |
|---|---|
| `TTemporalInput` | `Date \| number \| string` |
| `ITemporalParts` | `year`, `month` (1-12), `day` (1-31), `hour`, `minute`, `second`, `millisecond` |
| `IZonedTemporalParts` | `ITemporalParts` plus `dayOfWeek` (ISO: 1 is Monday, 7 is Sunday) and `offsetMinutes` (east of UTC: `420` for `+07:00`; a fraction when the offset has seconds) |

- `DEFAULT_TEMPORAL_TIME_ZONE` is `'UTC'`. `DEFAULT_TEMPORAL_PATTERN` is `'YYYY-MM-DDTHH:mm:ss.SSSZ'`.
- The adapters type their library argument structurally (`ITemporalNamespace`, `IDayjsFactory`, `ILuxonDateTimeFactory`), so no date library's types ship with this package.

## See also

- [UID](/extensions/helpers/uid/) - `UuidHelper.inspect()` reads the creation time out of a v7 id
- [Duration](/references/utilities/duration) - fixed units for sizing a window, not calendar dates
- [Helpers Overview](/extensions/helpers/) - all available helpers
- [Temporal proposal](https://tc39.es/proposal-temporal/docs/) - the API the default adapter drives

**Files:**

- [`packages/helpers/src/modules/temporal/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/temporal/helper.ts) - `TemporalHelper`
- [`packages/helpers/src/modules/temporal/pattern.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/temporal/pattern.ts) - the pattern dialect
- [`packages/helpers/src/modules/temporal/calendar.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/temporal/calendar.ts) - day and month arithmetic
- [`packages/helpers/src/modules/temporal/adapters/native.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/temporal/adapters/native.ts) - `NativeTemporalAdapter`
- [`packages/helpers/src/modules/temporal/adapters/dayjs.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/temporal/adapters/dayjs.ts) - `DayjsTemporalAdapter`
- [`packages/helpers/src/modules/temporal/adapters/luxon.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/temporal/adapters/luxon.ts) - `LuxonTemporalAdapter`
- [`packages/helpers/src/modules/temporal/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/temporal/common/types.ts) - `ITemporalAdapter` and the parts types
- [`packages/helpers/src/modules/temporal/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/temporal/common/constants.ts) - `TemporalUnits` and the defaults
- [`packages/helpers/src/temporal.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/temporal.ts) - the `./temporal` subpath entry
