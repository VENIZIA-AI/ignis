# Date Utility

The Date utility provides a set of functions for date and time manipulation, built on top of the powerful `dayjs` library. It also configures `dayjs` with useful plugins and a default timezone.

## `dayjs`

The `dayjs` object is re-exported, so you can use it directly for any date and time operations. It is pre-configured with the following plugins: `CustomParseFormat`, `UTC`, `Timezone`, `Weekday`, and `IsoWeek`.

```typescript
import { dayjs } from '@vez/ignis';

// Get the current date and time
const now = dayjs();

// Format a date
const formatted = now.format('YYYY-MM-DD HH:mm:ss');
```

## `sleep`

The `sleep` function pauses execution for a specified number of milliseconds.

```typescript
import { sleep } from '@vez/ignis';

async function myAsyncFunction() {
  console.log('Start');
  await sleep(2000); // Wait for 2 seconds
  console.log('End');
}
```

## Weekday Functions

-   **`isWeekday(date)`**: Checks if a given date is a weekday (Monday to Friday).
-   **`getPreviousWeekday(opts)`**: Returns the previous weekday from a given date.
-   **`getNextWeekday(opts)`**: Returns the next weekday from a given date.

```typescript
import { isWeekday, getPreviousWeekday } from '@vez/ignis';

const isTodayWeekday = isWeekday(new Date());

const lastBusinessDay = getPreviousWeekday();
```

## `getDateTz`

The `getDateTz` function allows you to get a `dayjs` object in a specific timezone, with an optional offset.

```typescript
import { getDateTz } from '@vez/ignis';

const tokyoTime = getDateTz({
  date: '2023-10-27T10:00:00Z',
  timezone: 'Asia/Tokyo',
});
```

## `hrTime`

The `hrTime` function returns a high-resolution time measurement in seconds, useful for performance benchmarking.

```typescript
import { hrTime } from '@vez/ignis';

const start = hrTime();
// ... some long-running operation
const end = hrTime();

console.log(`Operation took ${end - start} seconds.`);
```
