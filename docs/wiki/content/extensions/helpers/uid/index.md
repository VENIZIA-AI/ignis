---
title: UID
description: Snowflake ID generator with Base62 encoding for unique, time-sortable distributed identifiers
difficulty: beginner
---

# UID

`SnowflakeUidHelper` generates 70-bit, time-sortable Snowflake IDs and encodes them as compact Base62 strings, suitable as database primary keys.

## In one example

```typescript
import { SnowflakeUidHelper } from '@venizia/ignis-helpers';

const generator = new SnowflakeUidHelper(); // workerId: 199, epoch: 2025-01-01 UTC
const id = generator.nextId();
// => e.g. "9du1sJXO88"
```

Use one `SnowflakeUidHelper` instance per worker process - `nextId()` returns a URL-safe Base62 string that sorts the same order as the IDs were generated.

## How it works

- **The ID packs three fields into 70 bits.** A 48-bit timestamp (offset from a custom epoch), a 10-bit worker ID (0-1023), and a 12-bit sequence (0-4095) - shifted and OR'd together in `nextSnowflake()`. Sorting the raw bigints, or the Base62 strings, sorts by generation time.
- **The sequence resets every millisecond, per worker.** Within the same millisecond it increments and wraps at 4096; a wrap forces the generator to busy-wait for the next millisecond, capping throughput at 4,096,000 IDs/second/worker.
- **Backward clock drift is handled, up to a point.** A drift up to 100ms (`MAX_CLOCK_BACKWARD_MS`) busy-waits until the clock catches up, logging a warning. A larger drift throws instead of risking a duplicate ID.
- **`encodeBase62` / `decodeBase62` are just a bigint <-> string codec.** They do not know about the Snowflake layout - `parseId()` is `decodeBase62()` followed by the three `extract*` calls, all built on the same instance's `epoch` and bit-shift constants.
- **An expiry warning logs once the epoch nears its 48-bit limit.** ~8,919 years after the configured epoch the timestamp field overflows; a warning starts logging 10 years before that.

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

`nextId()` is the common case - a Base62 string, 10-12 characters. `nextSnowflake()` returns the raw `bigint` when you need arithmetic or bit-level access.

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

Give each process a unique `workerId`; keep `epoch` identical across all of them so ID ordering stays meaningful.

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
