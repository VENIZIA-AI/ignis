# Usage

## Scheduling Jobs

Create a cron job and start it immediately with `autoStart`, or start it later with `start()`.

```typescript
import { CronHelper } from '@venizia/ignis-helpers';

// Auto-start: runs immediately on schedule
const autoJob = new CronHelper({
  cronTime: '0 */1 * * * *',
  onTick: () => {
    console.log('This message will be logged every minute.');
  },
  autoStart: true,
  tz: 'America/New_York',
});
```

## Starting Jobs Manually

If `autoStart` is `false` (the default), call `start()` when ready.

```typescript
const myJob = new CronHelper({
  cronTime: '0 0 * * * *', // Every hour
  onTick: () => {
    console.log('Hourly task executed.');
  },
});

// Start later when conditions are met
myJob.start();
```

## Modifying the Schedule

Dynamically change a running job's schedule with `modifyCronTime()`.

- `cronTime` (string): The new cron pattern.
- `shouldFireOnTick` (boolean, optional): If `true`, the `onTick` function executes immediately after the time is changed.

```typescript
// Change the job to run every 5 minutes
myJob.modifyCronTime({ cronTime: '0 */5 * * * *' });
```

## Duplicating Jobs

Create a new `CronHelper` instance that copies the current job's configuration but uses a different `cronTime`.

```typescript
const anotherJob = myJob.duplicate({ cronTime: '0 0 * * *' }); // Runs once at midnight
anotherJob.start();
```

> [!NOTE]
> `duplicate()` copies `onTick`, `onCompleted`, `autoStart`, `tz`, and `errorHandler` from the source job. Only `cronTime` is replaced.
