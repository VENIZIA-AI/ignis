---
title: TemporalHelper Covers What a dayjs Wrapper Did
description: "null is no longer 1970, a quarter unit, set, the boolean comparisons and isBetween, clock-face durations, clone, your own names per locale, and diff counted as dayjs counts."
---

# Changelog - 2026-10-15

## TemporalHelper covers what a dayjs wrapper did

<Badge type="tip" text="Feature" /> <Badge type="danger" text="Bug Fix" /> <Badge type="warning" text="Behavior Change" />

**In one line.** An app can call `TemporalHelper` directly instead of keeping its own date wrapper.

```typescript
temporal.format({ value: row.paidAt, pattern: 'DD/MM/YYYY', fallback: '--' }); // '--' when paidAt is null
temporal.startOf({ value, unit: TemporalUnits.QUARTER });
temporal.set({ value, hour: 9, minute: 0 });
temporal.isBetween({ value, from, to, inclusivity: '[]' });
temporal.formatDuration({ milliseconds, pattern: 'mm:ss' });
const english = temporal.clone({ locale: 'en-US' });
```

## What changed

| Area | Now |
|---|---|
| `null` | **Bug fix.** `toDate`, `compare` and `format` threw nothing and answered 1970 for `null`, and `isValid(null)` was `true`. Now `null` is a 400, and `isValid` is `false` |
| Reading without throwing | `tryToDate({ value })` answers `null`; `format({ ..., fallback })` writes the fallback for a value that is not a date |
| Quarter | `TemporalUnits.QUARTER` for `add`, `startOf`, `endOf`, `diff`, `compare` and `relative`; the `Q` token writes 1-4 |
| `set` | Replaces wall-clock fields in the zone; the day clamps to the month |
| Comparisons | `isBefore`, `isAfter`, `isSame`, `isSameOrBefore`, `isSameOrAfter`, and `isBetween` with `()`, `[]`, `[)` or `(]` |
| Durations | `formatDuration` takes a clock-face `pattern` (`HH:mm:ss`, `mm:ss`) and `maxUnits` |
| Locales | `clone({ locale, timeZone })`; the constructor's `names` replaces `Intl`'s month and weekday names and AM/PM marker per locale; the `dd` token writes the narrowest weekday |
| `add` | An hour or smaller takes a fraction: 1.5 hours is 90 minutes. A calendar unit still takes whole numbers only |
| `diff` | **Behavior change.** Counted as dayjs counts: days by the wall clocks, months anchored on the later day of the month. `diff(a, b)` is always `-diff(b, a)` |

## Who is affected

- **Code that passed `null` and got 1970.** It now gets a 400. Use `tryToDate`, `isValid` or `format({ fallback })` where a date may be missing.
- **A `diff` in months or years that ends on a month end.** A few month-end cases change by one. Example: from 2026-02-28 back to 2024-02-29 was -23 months and is now -24, as dayjs answers. It matched 2,160 of 2,160 dayjs answers on a set of month-end and day-edge instants.
- **Everyone else.** No change.

**Files:** [`packages/helpers/src/modules/temporal/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/temporal/helper.ts), [`packages/helpers/src/modules/temporal/calendar/calendar.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/temporal/calendar/calendar.ts), [`packages/helpers/src/modules/temporal/pattern/tokens.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/temporal/pattern/tokens.ts), [`packages/helpers/src/modules/temporal/duration/duration.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/temporal/duration/duration.ts)
