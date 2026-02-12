# UID

Snowflake ID generator with Base62 encoding for unique, time-sortable distributed identifiers.

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis-helpers` |
| **Class** | `SnowflakeUidHelper` |
| **Extends** | `BaseHelper` |
| **Runtimes** | Both |

#### Import Paths

```typescript
import { SnowflakeUidHelper, SnowflakeConfig } from '@venizia/ignis-helpers';

// Types
import type { IIdGeneratorOptions, ISnowflakeParsedId } from '@venizia/ignis-helpers';
```

#### Snowflake ID Structure (70 bits)

| Component | Bits | Range | Purpose |
|-----------|------|-------|---------|
| Timestamp | 48 | ~8,919 years | Time since epoch |
| Worker ID | 10 | 0--1023 | Unique worker identifier |
| Sequence | 12 | 0--4095 | IDs per millisecond |

#### Key Specifications

| Spec | Value |
|------|-------|
| Base62 Output | 10--12 characters |
| Throughput | 4,096,000 IDs/second/worker |
| Max Workers | 1024 |
| Lifespan | Until ~10,944 AD |
| Default Epoch | 2025-01-01 00:00:00 UTC |

## Creating an Instance

`SnowflakeUidHelper` extends `BaseHelper`, providing scoped logging via `LoggerFactory`.

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

#### `IIdGeneratorOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `workerId` | `number` | `199` | Worker ID (0--1023). Must be unique per instance in distributed deployments |
| `epoch` | `bigint` | `BigInt(1735689600000)` | Custom epoch timestamp in milliseconds since Unix epoch. Must be positive and in the past |

> [!TIP]
> Use unique worker IDs in distributed systems to prevent ID collisions, and keep the epoch consistent across all instances to ensure proper ID ordering.

#### `SnowflakeConfig` Constants

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

## Usage

### Generating IDs

Generate unique Snowflake IDs as either compact Base62 strings or raw bigints.

```typescript
// Generate Base62 encoded ID (recommended for most use cases)
const id = generator.nextId();
// => e.g., "9du1sJXO88"

// Generate raw Snowflake ID as bigint
const snowflakeId = generator.nextSnowflake();
// => e.g., 130546360012247045n
```

> [!TIP]
> Use `nextId()` for most cases -- it returns a compact Base62 string (10--12 chars) that works well as database primary keys and URL-safe identifiers. Use `nextSnowflake()` only when you need the raw bigint for arithmetic or bit-level operations.

#### Clock Drift Handling

When `nextSnowflake()` detects the system clock has moved backward:
- Drifts up to 100ms are handled automatically by busy-waiting until the clock catches up.
- Drifts exceeding 100ms throw an error to protect ID uniqueness.
- A warning is logged whenever any backward clock movement is detected.

#### Sequence Exhaustion

If more than 4096 IDs are requested in a single millisecond from the same worker, the generator busy-waits until the next millisecond before continuing. This is transparent to the caller.

### Base62 Encoding and Decoding

Encode any bigint to a compact, URL-safe Base62 string using the alphabet `0-9A-Za-z`, or decode back to the original bigint.

```typescript
// Encode
const encoded = generator.encodeBase62(130546360012247045n);
// => "9du1sJXO88"

// Decode
const decoded = generator.decodeBase62('9du1sJXO88');
// => 130546360012247045n
```

> [!WARNING]
> `decodeBase62()` throws if the input contains characters outside the Base62 alphabet (`0-9`, `A-Z`, `a-z`). Watch for URL-encoded strings or accidental whitespace.

### Parsing IDs

Extract the embedded timestamp, worker ID, and sequence from a generated ID.

#### Parse a Base62 ID

```typescript
const parsed = generator.parseId('9du1sJXO88');
// => {
//   raw: 130546360012247045n,
//   timestamp: Date,
//   workerId: 199,
//   sequence: 0
// }
```

#### `ISnowflakeParsedId`

```typescript
interface ISnowflakeParsedId {
  raw: bigint;
  timestamp: Date;
  workerId: number;
  sequence: number;
}
```

#### Extract Individual Components

```typescript
const snowflakeId = generator.nextSnowflake();

// Extract timestamp
const timestamp = generator.extractTimestamp(snowflakeId);
// => Date object

// Extract worker ID
const workerId = generator.extractWorkerId(snowflakeId);
// => 199

// Extract sequence
const sequence = generator.extractSequence(snowflakeId);
// => 0-4095

// Get current instance's worker ID
const currentWorkerId = generator.getWorkerId();
// => 199
```

## API Summary

| Method | Signature | Description |
|--------|-----------|-------------|
| `nextId` | `nextId(): string` | Generate a Base62-encoded Snowflake ID (10--12 chars) |
| `nextSnowflake` | `nextSnowflake(): bigint` | Generate a raw 70-bit Snowflake ID |
| `encodeBase62` | `encodeBase62(num: bigint): string` | Encode a bigint to Base62 string |
| `decodeBase62` | `decodeBase62(str: string): bigint` | Decode a Base62 string to bigint |
| `parseId` | `parseId(base62Id: string): ISnowflakeParsedId` | Parse a Base62 ID into its components |
| `extractTimestamp` | `extractTimestamp(id: bigint): Date` | Extract the timestamp from a raw Snowflake ID |
| `extractWorkerId` | `extractWorkerId(id: bigint): number` | Extract the worker ID from a raw Snowflake ID |
| `extractSequence` | `extractSequence(id: bigint): number` | Extract the sequence number from a raw Snowflake ID |
| `getWorkerId` | `getWorkerId(): number` | Get the current instance's worker ID |

## Troubleshooting

### "Worker ID must be between 0 and 1023"

**Cause:** The `workerId` option passed to the constructor is negative or exceeds 1023 (10-bit maximum).

**Fix:** Ensure the worker ID is within the valid range (0--1023):

```typescript
// Wrong
new SnowflakeUidHelper({ workerId: 2000 });

// Correct
new SnowflakeUidHelper({ workerId: 1 });
```

### "Epoch must be a positive number"

**Cause:** The `epoch` option is zero or negative.

**Fix:** Provide a valid epoch as a positive bigint representing milliseconds since Unix epoch:

```typescript
// Wrong
new SnowflakeUidHelper({ epoch: BigInt(0) });

// Correct
new SnowflakeUidHelper({ epoch: BigInt(1735689600000) });
```

### "Epoch cannot be in the future"

**Cause:** The `epoch` option is set to a timestamp later than the current time. A future epoch would produce negative timestamp offsets in generated IDs.

**Fix:** Use a past date as the epoch. The default (`2025-01-01 00:00:00 UTC`) is recommended unless you have a specific reason to change it.

### "Clock moved backward by Xms. Refusing to generate ID."

**Cause:** The system clock moved backward by more than 100ms, typically caused by NTP time synchronization. Small drifts (up to 100ms) are handled by busy-waiting, but larger jumps are rejected to protect ID uniqueness.

**Fix:** Ensure your system clock is stable. If running in containers, verify the host clock is not being adjusted aggressively. There is no code-level workaround -- the error protects against duplicate IDs.

### "Invalid Base62 character: X"

**Cause:** `decodeBase62()` encountered a character outside the Base62 alphabet (`0-9`, `A-Z`, `a-z`).

**Fix:** Ensure the input string only contains valid Base62 characters:

```typescript
// Wrong
generator.decodeBase62('9du1sJ+O88');   // '+' is not Base62
generator.decodeBase62(' 9du1sJXO88');  // leading space

// Correct
generator.decodeBase62('9du1sJXO88');
```

## See Also

- **Related Concepts:**
  - [Models](/guides/core-concepts/persistent/models) - Using UIDs as primary keys
  - [Services](/guides/core-concepts/services) - Generating unique IDs in services

- **Other Helpers:**
  - [Helpers Index](../index) - All available helpers
  - [Crypto Helper](../crypto/) - For cryptographic random values

- **External Resources:**
  - [Snowflake ID](https://en.wikipedia.org/wiki/Snowflake_ID) - Snowflake algorithm explained
  - [Base62 Encoding](https://en.wikipedia.org/wiki/Base62) - Base62 encoding overview

- **Best Practices:**
  - [Data Modeling](/best-practices/data-modeling) - ID generation strategies
