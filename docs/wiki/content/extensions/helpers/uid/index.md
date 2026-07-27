---
title: UID
description: Snowflake ID generator with Base62 encoding for unique, time-sortable distributed identifiers
difficulty: beginner
---

# UID

`SnowflakeUidHelper` generates 70-bit, time-sortable Snowflake IDs. It encodes them as compact Base62 strings, suitable as database primary keys.

## In one example

```typescript
import { SnowflakeUidHelper } from '@venizia/ignis-helpers';

const generator = new SnowflakeUidHelper(); // workerId: 199, epoch: 2025-01-01 UTC
const id = generator.nextId();
// => e.g. "9du1sJXO88"
```

Use one `SnowflakeUidHelper` instance per worker process. `nextId()` returns a URL-safe Base62 string, and it sorts in the same order the IDs were generated.

## How it works

- **The ID packs three fields into 70 bits.** `nextSnowflake()` shifts and OR's together a timestamp, a worker ID, and a sequence - see the bit layout below.
- **Sorting the ID sorts by generation time.** This holds for the raw `bigint`, and for the Base62 string.
- **The sequence resets every millisecond, per worker.** It increments within the millisecond and wraps at 4096.
- **A wrap forces a busy-wait for the next millisecond.** That caps throughput at 4,096,000 IDs per second per worker.
- **A small backward clock drift busy-waits.** Up to 100ms (`MAX_CLOCK_BACKWARD_MS`), the generator waits for the clock to catch up, and logs a warning.
- **A larger drift throws instead.** IGNIS refuses to risk generating a duplicate ID.
- **`encodeBase62` / `decodeBase62` are a bigint <-> string codec.** They don't know about the Snowflake layout.
- **`parseId()` layers on top of the codec.** It calls `decodeBase62()`, then the three `extract*` calls, using the same instance's `epoch` and bit-shift constants.
- **An expiry warning logs once the epoch nears its 48-bit limit.** The timestamp field overflows about 8,919 years after the configured epoch. A warning starts logging 10 years before that.

**Snowflake layout (70 bits)**

| Component | Bits | Range | Purpose |
|-----------|------|-------|---------|
| Timestamp | 48 | ~8,919 years | Milliseconds since `epoch` |
| Worker ID | 10 | 0-1023 | Set per instance, must be unique across a deployment |
| Sequence | 12 | 0-4095 | IDs generated within the same millisecond |

**`IIdGeneratorOptions`**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `workerId` | `number` | `199` | Integer, `0`-`1023` |
| `epoch` | `bigint` | `BigInt(1735689600000)` (2025-01-01 00:00:00 UTC) | Positive, must be in the past |

## Common tasks

### Generate an ID

`nextId()` is the common case - a Base62 string, 10-12 characters. `nextSnowflake()` returns the raw `bigint`, for arithmetic or bit-level access.

```typescript
const id = generator.nextId();               // "9du1sJXO88"
const raw = generator.nextSnowflake();        // 130546360012247045n
```

### Parse an ID back into its components

```typescript
const parsed = generator.parseId('9du1sJXO88');
// => { raw: 130546360012247045n, timestamp: Date, workerId: 199, sequence: 0 }
```

### Extract a single component from a raw ID

```typescript
const timestamp = generator.extractTimestamp(raw);
const workerId = generator.extractWorkerId(raw);
const sequence = generator.extractSequence(raw);
```

### Run one generator per worker in a distributed deployment

Give each process a unique `workerId`. Keep `epoch` identical across every process, so ID ordering stays meaningful.

```typescript
const generator = new SnowflakeUidHelper({ workerId: Number(process.env.WORKER_ID) });
```

### Decode Base62 defensively

`decodeBase62()` throws on any character outside `0-9A-Za-z` - including a leading space or a URL-decoded `+`.

```typescript
try {
  const raw = generator.decodeBase62(userSuppliedId);
} catch (error) {
  // not a valid Base62 ID
}
```

## See also

- [Models](/guides/core-concepts/persistent/models) - using UIDs as primary keys
- [Services](/guides/core-concepts/services) - generating unique IDs in services
- [Helpers Overview](/extensions/helpers/) - all available helpers
- [Crypto Helper](/extensions/helpers/crypto/) - cryptographic random values
- [Snowflake ID](https://en.wikipedia.org/wiki/Snowflake_ID) - the algorithm this helper implements

**Files:**

- [`packages/helpers/src/modules/uid/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/uid/helper.ts) - `SnowflakeUidHelper`, `SnowflakeConfig`
- [`packages/helpers/src/modules/uid/index.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/uid/index.ts) - module barrel
