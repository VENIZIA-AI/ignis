# Creating an Instance

`CronHelper` extends `BaseHelper`, providing scoped logging.

```typescript
import { CronHelper } from '@venizia/ignis-helpers';

const myJob = new CronHelper({
  cronTime: '0 */1 * * * *', // Every minute
  onTick: () => {
    console.log('This message will be logged every minute.');
  },
  autoStart: true,
  tz: 'America/New_York',
});
```

### `ICronHelperOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cronTime` | `string` | -- | Cron pattern defining when the job should run (e.g., `'0 */1 * * * *'`) |
| `onTick` | `() => void \| Promise<void>` | -- | Function executed when the cron job triggers |
| `onCompleted` | `CronOnCompleteCommand \| null` | `undefined` | Function executed when the job stops |
| `autoStart` | `boolean` | `false` | If `true`, the job starts automatically |
| `tz` | `string` | `undefined` | Timezone for the schedule (e.g., `'America/New_York'`) |
| `errorHandler` | `(error: unknown) => void \| null` | `undefined` | Handler for errors during `onTick` execution |

> [!TIP]
> You can also use the static factory method `CronHelper.newInstance(opts)` which is equivalent to `new CronHelper(opts)`.
