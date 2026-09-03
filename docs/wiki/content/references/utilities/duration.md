---
title: Duration Utility
description: A unit vocabulary, written-duration parsing, and conversion between units and milliseconds
difficulty: beginner
lastUpdated: 2026-08-15
---

# Duration Utility

A duration is `{ unit, value }`. This turns that into milliseconds, reads it out of a written string like `30d`, and converts between units.

## In one example

```typescript
import { DurationMultipliers, DurationUnits } from '@venizia/ignis-helpers/common';

const gracePeriod = { unit: DurationUnits.DAY, value: 30 };

DurationMultipliers.toMilliseconds(gracePeriod); // 2_592_000_000
DurationMultipliers.parseToMilliseconds('30d'); // 2_592_000_000
DurationMultipliers.convert({ value: 36, from: 'hour', to: 'day' }); // 1.5
```

Everything here is browser-pure, so it works unchanged in a Worker. Import from `@venizia/ignis-helpers/common`, or from the root barrel if you already depend on it.

## Units

| Constant | Value | Milliseconds |
|---|---|---|
| `DurationUnits.MILLISECOND` | `'millisecond'` | 1 |
| `DurationUnits.SECOND` | `'second'` | 1 000 |
| `DurationUnits.MINUTE` | `'minute'` | 60 000 |
| `DurationUnits.HOUR` | `'hour'` | 3 600 000 |
| `DurationUnits.DAY` | `'day'` | 86 400 000 |
| `DurationUnits.WEEK` | `'week'` | 604 800 000 |
| `DurationUnits.MONTH` | `'month'` | 2 592 000 000 |
| `DurationUnits.YEAR` | `'year'` | 31 536 000 000 |

`TDurationUnit` is the union of those eight values. `IDuration` is `{ unit: TDurationUnit; value: number }`.

## Functions

| Function | Signature | What it does |
|---|---|---|
| `DurationUnits.isValid` | `isValid(input: string): input is TDurationUnit` | `true` when `input` is one of the eight canonical names. |
| `DurationAliases.resolve` | `resolve(input: string): TDurationUnit \| null` | Reads a written unit - `'d'`, `'days'`, `'DAY'` - into its canonical name. |
| `DurationMultipliers.toMilliseconds` | `toMilliseconds(opts: IDuration \| null): number \| null` | Converts a duration to milliseconds, rounded. |
| `DurationMultipliers.fromMilliseconds` | `fromMilliseconds(opts: { milliseconds: number; unit: TDurationUnit }): number \| null` | The inverse. Fractional, not rounded. |
| `DurationMultipliers.convert` | `convert(opts: { value: number; from: TDurationUnit; to: TDurationUnit }): number \| null` | Converts between two units. Fractional. |
| `DurationMultipliers.parse` | `parse(input: string): IDuration \| null` | Reads `'30d'`, `'1500 ms'`, `'2 hours'` into an `IDuration`. |
| `DurationMultipliers.parseToMilliseconds` | `parseToMilliseconds(input: string): number \| null` | `parse` followed by `toMilliseconds`. |

## A month is 30 days and a year is 365

These size a **window** - a grace period, a cache TTL, a near-expiry horizon. They are not calendar arithmetic.

Adding `MONTH` to 31 January lands on 2 March in a leap year and 3 March otherwise. If you need a real calendar date, use [the date utility](./date.md) and let `dayjs` handle months.

## Every function answers `null`, never throws

An unknown unit, a `NaN` value, an unreadable string - all return `null`. A caller that wants an error raises its own, with its own context:

```typescript
const ttlMs = DurationMultipliers.parseToMilliseconds(config.cacheTtl);

if (ttlMs === null) {
  throw getError({ message: `[cache] Unreadable TTL: '${config.cacheTtl}'` });
}
```

Zero is a real duration, not an absent one - `{ unit: 'day', value: 0 }` converts to `0`. A negative value converts too, so a caller deciding what a negative window means keeps that decision.

## Writing a duration

`parse` accepts one number, an optional space, and one unit: `30d`, `1.5h`, `-2 Hours`, `1500 ms`. Anything it cannot read whole is `null` - there is no partial credit, so `'30d extra'` fails rather than silently meaning 30 days.

Accepted spellings are the member names of `DurationAliases`, lower-cased: short (`d`), abbreviated (`wk`), singular (`day`) and plural (`days`).

**`m` is minute and `mo` is month.** That is the choice every duration library makes, and the one ambiguity worth checking before you write a config value. There is no single-letter month.

## Notes

- **The fast path allocates nothing.** `resolve` tries your input as given before normalising it, so a canonical `'day'` costs about 2ns while a messy `'  Days '` pays the ~80ns that trimming and upper-casing costs. Pass canonical spellings in a loop.
- **`toMilliseconds` rounds; `fromMilliseconds` and `convert` do not.** Rounding on the way out would silently lose a 36-hour window asked for in days.
- **The alias table is derived from `DurationAliases`**, not hand-listed beside it, so a new spelling is one member and the two cannot drift.
