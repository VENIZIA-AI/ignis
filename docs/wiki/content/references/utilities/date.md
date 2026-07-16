---
title: Date Utility
description: Pre-configured dayjs re-export plus sleep, weekday, timezone, and high-resolution timing helpers
difficulty: beginner
lastUpdated: 2026-07-16
---

# Date Utility

A pre-configured `dayjs` re-export, plus small standalone helpers for sleeping, weekday math, timezone conversion, and high-resolution timing.

## In one example

```typescript
import { dayjs, sleep, getDateTz } from '@venizia/ignis-helpers';

const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

await sleep(2000); // pause for 2 seconds

const tokyoTime = getDateTz({ date: '2023-10-27T10:00:00Z', timezone: 'Asia/Tokyo' });
```

## Functions

| Function | Signature | What it does |
|----------|-----------|---------------|
| `dayjs` | re-exported `dayjs` object | The `dayjs` factory, pre-loaded with plugins - use it exactly like raw `dayjs`. |
| `sleep` | `sleep(ms: number): Promise<void>` | Resolves after `ms` milliseconds (`setTimeout` wrapped in a Promise). |
| `isWeekday` | `isWeekday(date: string \| dayjs.Dayjs): boolean` | `true` when `date` falls Monday through Friday (ISO weekday 1-5). |
| `getPreviousWeekday` | `getPreviousWeekday(opts?: { date?: string \| dayjs.Dayjs }): dayjs.Dayjs` | Walks backward a day at a time from `date` (default: today) until it lands on a weekday. |
| `getNextWeekday` | `getNextWeekday(opts?: { date?: string \| dayjs.Dayjs }): dayjs.Dayjs` | Walks forward a day at a time from `date` (default: today) until it lands on a weekday. |
| `getDateTz` | `getDateTz(opts: { date: string; timezone: string; useClientTz?: boolean; timeOffset?: number }): dayjs.Dayjs` | Parses `date` and converts it to `timezone`, optionally shifting by `timeOffset` hours. |
| `hrTime` | `hrTime(): number` | High-resolution seconds from `process.hrtime()`, rounded to 9 decimal places - for benchmarking. |

## Notes

- **Plugins loaded once at module import:** `CustomParseFormat`, `UTC`, `Timezone`, `Weekday`, `IsoWeek`.
- **Default timezone is `Asia/Ho_Chi_Minh`**, set via `dayjs.tz.setDefault()` at module load. Override with the `APP_ENV_APPLICATION_TIMEZONE` environment variable - it is read once, so changing it at runtime needs a restart.
- **`getPreviousWeekday` / `getNextWeekday` are day-by-day loops**, not calendar lookups. They call `isWeekday()` after each step, so the worst case (stepping over a weekend) is only 2-3 iterations.
- **`getDateTz`'s `useClientTz`** defaults to `false` and controls whether `dayjs().tz()` keeps the original wall-clock time or converts it - see the [Day.js Timezone plugin docs](https://day.js.org/docs/en/timezone/timezone) for the exact semantics.

## See also

- [Utilities Overview](/references/utilities/) - all utility functions
- [Day.js documentation](https://day.js.org/docs/en/installation/installation) - underlying date library

**Files:**

- [`packages/helpers/src/utilities/date.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/date.utility.ts)
