# Creating an Instance

`SnowflakeUidHelper` extends `BaseHelper`, providing scoped logging.

```typescript
import { SnowflakeUidHelper } from '@venizia/ignis-helpers';

// Use defaults (workerId: 199, epoch: 2025-01-01 00:00:00 UTC)
const generator = new SnowflakeUidHelper();

// Or with custom values
const customGenerator = new SnowflakeUidHelper({
  workerId: 123,
  epoch: BigInt(1735689600000),
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `workerId` | `number` | `199` | Worker ID (0-1023) |
| `epoch` | `bigint` | `SnowflakeConfig.DEFAULT_EPOCH` | Custom epoch timestamp in milliseconds |

> [!TIP]
> Use unique worker IDs in distributed systems to prevent ID collisions, and keep the epoch consistent across all instances to ensure proper ID ordering.

::: details SnowflakeConfig Constants
```typescript
import { SnowflakeConfig } from '@venizia/ignis-helpers';

SnowflakeConfig.DEFAULT_EPOCH      // BigInt(1735689600000) - 2025-01-01 00:00:00 UTC
SnowflakeConfig.MAX_WORKER_ID      // 1023n
SnowflakeConfig.MAX_SEQUENCE       // 4095n
SnowflakeConfig.TIMESTAMP_SHIFT    // 22n
SnowflakeConfig.WORKER_ID_SHIFT    // 12n

// Bit widths
SnowflakeConfig.TIMESTAMP_BITS     // 48n
SnowflakeConfig.WORKER_ID_BITS     // 10n
SnowflakeConfig.SEQUENCE_BITS      // 12n

// Safety thresholds
SnowflakeConfig.MAX_CLOCK_BACKWARD_MS  // 100n (busy-wait tolerance)
SnowflakeConfig.MAX_TIMESTAMP_MS       // (1n << 48n) - 1n (~8,919 years)
SnowflakeConfig.WARNING_THRESHOLD_MS   // ~8,909 years (warns 10 years before expiry)
```
:::
