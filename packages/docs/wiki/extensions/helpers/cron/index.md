# Cron

Schedule and manage recurring tasks using cron expressions, with support for dynamic rescheduling and job duplication.

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis-helpers` |
| **Class** | `CronHelper` |
| **Extends** | `BaseHelper` |
| **Peer Dependency** | `cron` (^4.3.3, optional) |
| **Runtimes** | Both |

#### Import Paths

```typescript
import { CronHelper } from '@venizia/ignis-helpers/cron';
import type { ICronHelperOptions } from '@venizia/ignis-helpers/cron';
```

## Creating an Instance

`CronHelper` wraps the `cron` package's `CronJob` class, adding scoped logging via `BaseHelper` and convenience methods for rescheduling and duplication.

```typescript
import { CronHelper } from '@venizia/ignis-helpers/cron';

const job = new CronHelper({
  cronTime: '0 */5 * * * *', // Every 5 minutes
  onTick: async () => {
    console.log('Running scheduled task');
  },
  autoStart: true,
  tz: 'America/New_York',
  errorHandler: (error) => {
    console.error('Cron job failed:', error);
  },
});
```

> [!TIP]
> You can also use the static factory method `CronHelper.newInstance(opts)` which is equivalent to `new CronHelper(opts)`.

#### ICronHelperOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cronTime` | `string` | -- | Cron pattern defining when the job runs (e.g., `'0 */1 * * * *'`). Required, must be non-empty. |
| `onTick` | `() => void \| Promise<void>` | -- | Function executed each time the cron job triggers. Required. |
| `onCompleted` | `CronOnCompleteCommand \| null` | `undefined` | Callback executed when the job is stopped via `stop()`. |
| `autoStart` | `boolean` | `false` | If `true`, the job starts running immediately after construction. |
| `tz` | `string` | `undefined` | IANA timezone for the schedule (e.g., `'Asia/Ho_Chi_Minh'`). Uses server timezone if omitted. |
| `errorHandler` | `(error: unknown) => void \| null` | `undefined` | Handler invoked if `onTick` throws during execution. |

#### Common Cron Patterns

| Pattern | Description |
|---------|-------------|
| `'0 */1 * * * *'` | Every minute |
| `'0 */5 * * * *'` | Every 5 minutes |
| `'0 0 * * * *'` | Every hour |
| `'0 0 0 * * *'` | Every day at midnight |
| `'0 0 9 * * 1-5'` | Weekdays at 9 AM |
| `'0 0 0 * * 1'` | Every Monday at midnight |

## Usage

### Scheduling Jobs

Create a job with `autoStart: true` to begin execution immediately, or leave it as `false` (default) and call `start()` when ready.

```typescript
// Auto-start: begins running on schedule immediately
const autoJob = new CronHelper({
  cronTime: '0 */1 * * * *',
  onTick: () => {
    console.log('Runs every minute');
  },
  autoStart: true,
});
```

### Starting Jobs Manually

When `autoStart` is `false`, the job is created but does not run until `start()` is called. This is useful when you need to set up dependencies before the job begins firing.

```typescript
const job = new CronHelper({
  cronTime: '0 0 * * * *', // Every hour
  onTick: () => {
    console.log('Hourly task executed');
  },
});

// Start later when conditions are met
job.start();
```

If the internal `CronJob` instance does not exist (e.g., `configure()` failed), `start()` logs an error and returns without throwing.

### Modifying the Schedule

Change a job's cron schedule at runtime with `modifyCronTime()`. The job continues running with the new schedule.

```typescript
modifyCronTime(opts: { cronTime: string; shouldFireOnTick?: boolean }): void
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `cronTime` | `string` | -- | The new cron pattern to apply. |
| `shouldFireOnTick` | `boolean` | `false` | If `true`, immediately fires the `onTick` function after changing the schedule. |

```typescript
// Change the job to run every 5 minutes instead
job.modifyCronTime({ cronTime: '0 */5 * * * *' });

// Change schedule and immediately fire onTick
job.modifyCronTime({ cronTime: '0 */10 * * * *', shouldFireOnTick: true });
```

### Duplicating Jobs

Create a new `CronHelper` instance that copies the current job's configuration (`onTick`, `onCompleted`, `autoStart`, `tz`, `errorHandler`) but uses a different `cronTime`.

```typescript
duplicate(opts: { cronTime: string }): CronHelper
```

```typescript
const dailyJob = new CronHelper({
  cronTime: '0 0 0 * * *', // Daily at midnight
  onTick: async () => {
    await generateReport();
  },
  tz: 'America/New_York',
});

// Same logic, different schedule
const hourlyJob = dailyJob.duplicate({ cronTime: '0 0 * * * *' });
hourlyJob.start();
```

> [!NOTE]
> `duplicate()` copies all configuration except `cronTime`. The new instance is independent -- stopping or modifying one does not affect the other.

### Accessing the Underlying CronJob

The `instance` property exposes the underlying `CronJob` from the `cron` package, giving access to the full API (e.g., `stop()`, `running`, `lastDate()`).

```typescript
const job = new CronHelper({
  cronTime: '0 */1 * * * *',
  onTick: () => { /* ... */ },
});

job.start();

// Access the underlying CronJob directly
console.log(job.instance.running);  // true
job.instance.stop();
```

## Troubleshooting

### "[CronHelper][configure] Invalid cronTime to configure application cron!"

**Cause:** The `cronTime` option is empty, undefined, or not provided.

**Fix:** Provide a valid, non-empty cron pattern string:

```typescript
const job = new CronHelper({
  cronTime: '0 */1 * * * *', // Must be a non-empty cron pattern
  onTick: () => { /* ... */ },
});
```

### "Invalid cron instance to start cronjob!"

**Cause:** `start()` was called but the internal `CronJob` instance was not created. This typically means `configure()` threw an error during construction.

**Fix:** Ensure the constructor completed without errors before calling `start()`. Wrap creation in a try/catch to detect configuration failures:

```typescript
try {
  const job = new CronHelper({
    cronTime: '0 */1 * * * *',
    onTick: () => { /* ... */ },
  });
  job.start();
} catch (error) {
  console.error('Failed to create cron job:', error);
}
```

### Job does not fire at expected times

**Cause:** The `tz` option is not set or uses an incorrect timezone identifier, causing the job to fire based on the server's local timezone.

**Fix:** Set `tz` to the correct [IANA timezone identifier](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones):

```typescript
const job = new CronHelper({
  cronTime: '0 0 9 * * *', // 9 AM
  onTick: () => { /* ... */ },
  tz: 'America/New_York', // Explicit timezone
});
```

## See Also

- **Related Concepts:**
  - [Services](/guides/core-concepts/services) -- Scheduling jobs within services
  - [Application](/guides/core-concepts/application/) -- Scheduling on application startup

- **Other Helpers:**
  - [Helpers Index](../index) -- All available helpers
  - [Queue Helper](../queue/) -- Message queue processing

- **External Resources:**
  - [Cron Expression Guide](https://crontab.guru/) -- Interactive cron syntax reference
  - [`cron` npm package](https://github.com/kelektiv/node-cron) -- Underlying cron library
