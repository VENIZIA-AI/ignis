---
title: Snowflake UID Helper
description: New SnowflakeUidHelper generates unique, time-sortable IDs as short Base62 strings for distributed systems.
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2025-12-29

## Snowflake UID Helper

**In one line.** `SnowflakeUidHelper` generates unique, time-sortable IDs as compact Base62 strings, with no external dependencies.

## What changed

- **New helper.** `SnowflakeUidHelper` uses the Snowflake algorithm: 48 bits of timestamp, 10 bits of worker ID (up to 1024 workers) and 12 bits of sequence (4096 IDs per millisecond per worker).
- **Compact output.** IDs are Base62 strings of 10 to 12 characters.
- **Constructor options.** `workerId` and `epoch`; no environment variables.

```typescript
import { SnowflakeUidHelper } from '@venizia/ignis-helpers';

// Defaults: workerId 199, epoch 2025-01-01 00:00:00 UTC
const generator = new SnowflakeUidHelper();

const customGenerator = new SnowflakeUidHelper({
  workerId: 123,
  epoch: BigInt(1735689600000),
});

const id = generator.nextId();               // Base62: "9du1sJXO88"
const snowflake = generator.nextSnowflake(); // BigInt
const parsed = generator.parseId("9du1sJXO88");
// => { raw, timestamp, workerId, sequence }
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `workerId` | `number` | `199` | Worker ID (0-1023) |
| `epoch` | `bigint` | `1735689600000n` | Custom epoch (2025-01-01 UTC) |

Other methods: `encodeBase62(num)`, `decodeBase62(str)`, `extractTimestamp(id)`, `extractWorkerId(id)`, `extractSequence(id)`, `getWorkerId()`.

## Who is affected

- **Everyone.** No action needed. No existing API changed.
