# Cron Helper

Schedule and manage recurring tasks (cron jobs) using cron patterns.

## Quick Reference

| Option | Type | Description |
|--------|------|-------------|
| `cronTime` | `string` | Cron pattern (e.g., `'0 */1 * * * *'` = every minute) |
| `onTick` | `Function` | Callback executed on schedule |
| `autoStart` | `boolean` | Start automatically (default: `false`) |
| `tz` | `string` | Timezone (e.g., `'America/New_York'`) |
| `errorHandler` | `Function` | Handle errors in `onTick` |

### Common Cron Patterns

| Pattern | Description |
|---------|-------------|
| `'0 */1 * * * *'` | Every minute |
| `'0 */5 * * * *'` | Every 5 minutes |
| `'0 0 * * * *'` | Every hour |
| `'0 0 0 * * *'` | Every day at midnight |
| `'0 0 0 * * 1'` | Every Monday at midnight |

### Key Methods

| Method | Purpose |
|--------|---------|
| `start()` | Start the cron job manually |
| `modifyCronTime({ cronTime })` | Change schedule dynamically |
| `duplicate({ cronTime })` | Create new job with same config |

## Creating a Cron Job

To create a cron job, you instantiate the `CronHelper` with your desired options.

### `ICronHelperOptions`

-   `cronTime` (string): The cron pattern that defines when the job should run (e.g., `'0 */1 * * * *'` for every minute).
-   `onTick` (() => void | Promise&lt;void&gt;): The function to be executed when the cron job triggers.
-   `onCompleted` (CronOnCompleteCommand | null, optional): A function to be executed when the job stops.
-   `autoStart` (boolean, optional): If `true`, the job will start automatically. Defaults to `false`.
-   `tz` (string, optional): The timezone to use for the schedule.
-   `errorHandler` ((error: unknown) => void | null, optional): A function to handle errors that occur during the `onTick` execution.

### Example

Here's how to create a simple cron job that logs a message every minute:

```typescript
import { CronHelper } from '@venizia/ignis';

const myJob = new CronHelper({
  cronTime: '0 */1 * * * *', // Every minute
  onTick: () => {
    console.log('This message will be logged every minute.');
  },
  autoStart: true,
  tz: 'America/New_York',
});
```

## Managing Cron Jobs

The `CronHelper` instance provides several methods for managing the cron job:

### `start()`

Manually starts the cron job if `autoStart` was set to `false`.

```typescript
myJob.start();
```

### `modifyCronTime(opts)`

Dynamically changes the schedule of an existing cron job.

-   `cronTime` (string): The new cron pattern.
-   `shouldFireOnTick` (boolean, optional): If `true`, the `onTick` function will be executed immediately after the time is changed.

```typescript
// Change the job to run every 5 minutes
myJob.modifyCronTime({ cronTime: '0 */5 * * * *' });
```

### `duplicate(opts)`

Creates a new `CronHelper` instance with the same configuration but a new `cronTime`.

```typescript
const anotherJob = myJob.duplicate({ cronTime: '0 0 * * *' }); // Runs once at midnight
anotherJob.start();
```
