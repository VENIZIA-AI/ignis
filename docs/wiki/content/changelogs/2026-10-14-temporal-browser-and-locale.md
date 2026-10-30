---
title: TemporalHelper Runs in Every Browser and Speaks a Locale
description: "IntlTemporalAdapter needs no Temporal, so TemporalHelper works in every browser, with month and weekday names, 12-hour time, relative time, diff, compare, a non-throwing parse and duration formatting."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-10-14

## TemporalHelper runs in every browser and speaks a locale

<Badge type="tip" text="Feature" />

**In one line.** A browser app can drop dayjs: `TemporalHelper` now covers names, relative time and comparisons, without needing `Temporal`.

```typescript
import { TemporalHelper, TemporalUnits } from '@venizia/ignis-helpers/temporal';

const temporal = new TemporalHelper({ timeZone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN' });

temporal.format({ value: order.createdAt, pattern: 'dddd, D MMMM YYYY hh:mm A' }); // 'Thứ Bảy, 19 Tháng 9 2026 12:00 CH'
temporal.relative({ value: order.createdAt }); // '3 giờ trước'
temporal.relative({ value: order.createdAt, unit: TemporalUnits.DAY, numeric: 'auto' }); // 'Hôm qua'
temporal.diff({ value: end, other: start, unit: TemporalUnits.MONTH }); // whole months
temporal.tryParse({ value: input }); // a Date, or null
temporal.formatDuration({ milliseconds: 91_800_000 }); // '1d1h30m'
```

## What changed

- **A browser-safe adapter.** `IntlTemporalAdapter` reads offsets through `Intl.DateTimeFormat` alone. A helper built without an `adapter` uses `Temporal` where the runtime has it and `IntlTemporalAdapter` everywhere else. Before, `new TemporalHelper()` threw in a browser without `Temporal`.
- **Writing in a locale.** The constructor takes `locale` (default `en-US`); every call can pass its own. New format tokens: `MMMM` / `MMM` (month name), `dddd` / `ddd` (weekday name), `hh` / `h` with `A` / `a` (12-hour clock and AM/PM), `L` / `LL` (the date in the locale's numeric order / long form). `formatIntl({ value, options })` takes any `Intl.DateTimeFormat` options in the helper's zone.
- **New methods:** `relative({ value, base, unit, numeric })`, `diff({ value, other, unit })` (whole units, truncated; `diff(add(x, n), x)` is `n`, outside a zone that skipped a whole day), `compare({ value, other, unit })` (`-1`, `0` or `1`), `tryParse(...)` and `isValid({ value })` (`null` / `false` where `parse` would throw a 400), and `durationParts({ milliseconds })` / `formatDuration(...)` (`1d1h30m`, or the locale's unit words).
- **The new name tokens write only.** `parse` stays numeric and strict, and a parse pattern holding one throws a 500.

## Who is affected

- **A browser app on a runtime without `Temporal`.** It now works through `Intl`. Nothing to change.
- **A pattern with `MMM`, `MMMM` or `dddd`.** Formatting used to throw an "unknown token" 500; it now writes the name. As a parse pattern it still throws.
- **Everyone else.** No change.
