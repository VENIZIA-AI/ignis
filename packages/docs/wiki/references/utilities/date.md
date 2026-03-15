# Date Utility

The Date utility provides a set of functions for date and time manipulation, built on top of the powerful `dayjs` library. It also configures `dayjs` with useful plugins and a default timezone.

## `dayjs`

The `dayjs` object is re-exported, so you can use it directly for any date and time operations. It is pre-configured with the following plugins: `CustomParseFormat`, `UTC`, `Timezone`, `Weekday`, and `IsoWeek`.

The default timezone is set to `Asia/Ho_Chi_Minh` and can be overridden via the `APP_ENV_APPLICATION_TIMEZONE` environment variable.

```typescript
import { dayjs } from '@venizia/ignis-helpers';

// Get the current date and time
const now = dayjs();

// Format a date
const formatted = now.format('YYYY-MM-DD HH:mm:ss');
```

## `sleep`

The `sleep` function pauses execution for a specified number of milliseconds.

```typescript
import { sleep } from '@venizia/ignis-helpers';

async function myAsyncFunction() {
  console.log('Start');
  await sleep(2000); // Wait for 2 seconds
  console.log('End');
}
```

## Weekday Functions

-   **`isWeekday(date)`**: Checks if a given date is a weekday (Monday to Friday). Accepts a `string` or `dayjs.Dayjs` instance.
-   **`getPreviousWeekday(opts?)`**: Returns the previous weekday from a given date. If no date is provided, defaults to today.
-   **`getNextWeekday(opts?)`**: Returns the next weekday from a given date. If no date is provided, defaults to today.

```typescript
import { isWeekday, getPreviousWeekday, getNextWeekday } from '@venizia/ignis-helpers';

const isTodayWeekday = isWeekday('2026-03-15');

const lastBusinessDay = getPreviousWeekday();
const nextBusinessDay = getNextWeekday({ date: '2026-03-13' });
```

## `getDateTz`

The `getDateTz` function allows you to get a `dayjs` object in a specific timezone, with an optional hour offset.

### `getDateTz(opts)`

-   `opts` (object):
    -   `date` (string): The date string to parse.
    -   `timezone` (string): The IANA timezone name.
    -   `useClientTz` (boolean, optional): Whether to keep the client's timezone. Defaults to `false`.
    -   `timeOffset` (number, optional): Number of hours to add to the result. Defaults to `0`.

```typescript
import { getDateTz } from '@venizia/ignis-helpers';

const tokyoTime = getDateTz({
  date: '2023-10-27T10:00:00Z',
  timezone: 'Asia/Tokyo',
});

// With hour offset
const offsetTime = getDateTz({
  date: '2023-10-27T10:00:00Z',
  timezone: 'Asia/Tokyo',
  timeOffset: 2, // Add 2 hours
});
```

## `hrTime`

The `hrTime` function returns a high-resolution time measurement in seconds using `process.hrtime()`, useful for performance benchmarking. The result is rounded to 9 decimal places.

```typescript
import { hrTime } from '@venizia/ignis-helpers';

const start = hrTime();
// ... some long-running operation
const end = hrTime();

console.log(`Operation took ${end - start} seconds.`);
```
