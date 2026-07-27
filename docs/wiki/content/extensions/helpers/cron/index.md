---
title: Cron
description: Schedule recurring tasks with cron expressions, plus runtime rescheduling and job duplication
difficulty: beginner
---

# Cron

`CronHelper` wraps the `cron` package's `CronJob`. It adds scoped logging, and convenience methods for rescheduling and duplicating jobs.

## In one example

```typescript
import { CronHelper } from '@venizia/ignis-helpers/cron';

const job = new CronHelper({
  cronTime: '0 */5 * * * *', // Every 5 minutes
  onTick: async () => {
    console.log('Running scheduled task');
  },
  autoStart: true,
  tz: 'Asia/Ho_Chi_Minh',
});
```

`autoStart: true` starts the job immediately. Leave it `false` (the default) and call `job.start()` when you are ready.

## How it works

- **The constructor builds the job right away.** `buildInstance()` runs inside the constructor and creates a `CronJob` via `CronJob.from(...)`. An empty `cronTime`, or a malformed cron expression, throws immediately - `getError` never lets you hold a half-built job.
- **`start()` checks for a built job first.** If a prior `configure()` call failed, `buildInstance()` never produced a `CronJob`. `start()` then logs a warning and returns - it does not throw.
- **`stop()` is `async` on purpose.** The underlying `CronJob.stop()` resolves only once an in-flight tick finishes. Awaiting it stops a replacement job from starting while the old handler still runs.
- **`modifyCronTime()` reschedules in place.** It builds a new `CronTime`, calls `instance.setTime(...)`, and updates the stored `cronTime`. The same `CronJob` keeps running - it just fires on the new schedule.
- **`duplicate()` clones configuration, not state.** The new instance shares `onTick`, `onCompleted`, `autoStart`, `tz`, and `errorHandler`, with a different `cronTime`. Stopping or modifying one instance never touches the other.
- **`instance` is the raw `CronJob`.** Reach it for anything the wrapper skips - `isActive`, `lastDate()`, `fireOnTick()`. It comes from the [`cron`](https://github.com/kelektiv/node-cron) package, an optional peer dependency (`^4.3.3`).

**`ICronHelperOptions`**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cronTime` | `string` | -- (required) | Cron pattern defining when the job runs, e.g. `'0 */1 * * * *'` |
| `onTick` | `() => void \| Promise<void>` | -- (required) | Runs on every trigger |
| `onCompleted` | `CronOnCompleteCommand \| null` | `undefined` | Runs when the job is stopped via `stop()` |
| `autoStart` | `boolean` | `false` | Starts the job immediately after construction |
| `tz` | `string` | `undefined` | IANA timezone, e.g. `'Asia/Ho_Chi_Minh'`. Uses server timezone if omitted |
| `errorHandler` | `(error: unknown) => void \| null` | `undefined` | Runs if `onTick` throws |

## Common tasks

### Start a job manually

Leave `autoStart` unset (`false`) and call `start()` once dependencies are ready.

```typescript
const job = new CronHelper({
  cronTime: '0 0 * * * *', // Every hour
  onTick: () => runHourlyTask(),
});

job.start();
```

### Reschedule at runtime

`modifyCronTime()` swaps the cron pattern without recreating the job. Set `shouldFireOnTick: true` to fire once immediately after the change. That fire is fire-and-forget - errors are logged, not thrown.

```typescript
job.modifyCronTime({ cronTime: '0 */10 * * * *', shouldFireOnTick: true });
```

### Duplicate a job onto a new schedule

Reuse the same `onTick` logic on a second cron pattern.

```typescript
const dailyJob = new CronHelper({
  cronTime: '0 0 0 * * *', // Daily at midnight
  onTick: async () => generateReport(),
  tz: 'Asia/Ho_Chi_Minh',
});

const hourlyJob = dailyJob.duplicate({ cronTime: '0 0 * * * *' });
hourlyJob.start();
```

### Handle tick errors without crashing the process

Pass `errorHandler` so a throwing `onTick` does not take down the job silently.

```typescript
const job = new CronHelper({
  cronTime: '0 */1 * * * *',
  onTick: async () => riskyTask(),
  errorHandler: error => logger.for('cron').error('Tick failed: %s', error),
});
```

### Reach the underlying `CronJob`

```typescript
console.log(job.instance.isActive); // true
job.instance.stop();
```

## See also

- [Services](/guides/core-concepts/services) - scheduling jobs inside services
- [Application](/guides/core-concepts/application/) - scheduling on application startup
- [Helpers Overview](/extensions/helpers/) - all available helpers
- [Queue Helper](/extensions/helpers/queue/) - message queue processing
- [Cron Expression Guide](https://crontab.guru/) - interactive cron syntax reference

**Files:**

- [`packages/helpers/src/modules/cron/cron.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/cron/cron.helper.ts) - `CronHelper` class
- [`packages/helpers/src/modules/cron/index.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/cron/index.ts) - module barrel
