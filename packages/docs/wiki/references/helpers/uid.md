# UID Helper

Snowflake ID generator with Base62 encoding for generating unique, time-sortable IDs suitable for distributed systems.

## Quick Reference

| Class | Purpose | Key Features |
|-------|---------|--------------|
| **SnowflakeConfig** | Configuration constants | Bit structure, limits, defaults |
| **SnowflakeUidHelper** | ID generation | Snowflake IDs, Base62 encoding/decoding |

### Snowflake ID Structure (70 bits)

| Component | Bits | Range | Purpose |
|-----------|------|-------|---------|
| Timestamp | 48 | ~8,919 years | Time since epoch |
| Worker ID | 10 | 0-1023 | Unique worker identifier |
| Sequence | 12 | 0-4095 | IDs per millisecond |

### Key Specifications

| Spec | Value |
|------|-------|
| Base62 Output | 10-12 characters |
| Throughput | 4,096,000 IDs/second/worker |
| Max Workers | 1024 |
| Lifespan | Until ~10,944 AD |
| Default Epoch | 2025-01-01 00:00:00 UTC |

## Basic Usage

### Creating an Instance

```typescript
import { SnowflakeUidHelper, SnowflakeConfig } from '@venizia/ignis-helpers';

// Use defaults (workerId: 199, epoch: 2025-01-01 00:00:00 UTC)
const generator = new SnowflakeUidHelper();

// Or with custom values
const customGenerator = new SnowflakeUidHelper({
  workerId: 123,
  epoch: BigInt(1735689600000),
});
```

### Generating IDs

```typescript
// Generate Base62 encoded ID (recommended for most use cases)
const id = generator.nextId();
// => e.g., "9du1sJXO88"

// Generate raw Snowflake ID as bigint
const snowflakeId = generator.nextSnowflake();
// => e.g., 130546360012247045n
```

## Base62 Encoding/Decoding

### Encode a BigInt to Base62

```typescript
const encoded = generator.encodeBase62(130546360012247045n);
// => "9du1sJXO88"
```

### Decode Base62 to BigInt

```typescript
const decoded = generator.decodeBase62("9du1sJXO88");
// => 130546360012247045n
```

## Parsing and Extracting Components

### Parse a Base62 ID

```typescript
const parsed = generator.parseId("9du1sJXO88");
// => {
//   raw: 130546360012247045n,
//   timestamp: Date,
//   workerId: 199,
//   sequence: 0
// }
```

### Extract Individual Components

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
```

## Configuration

### SnowflakeConfig Constants

```typescript
import { SnowflakeConfig } from '@venizia/ignis-helpers';

SnowflakeConfig.DEFAULT_EPOCH      // BigInt(1735689600000) - 2025-01-01 00:00:00 UTC
SnowflakeConfig.MAX_WORKER_ID      // 1023n
SnowflakeConfig.MAX_SEQUENCE       // 4095n
SnowflakeConfig.TIMESTAMP_SHIFT    // 22n
SnowflakeConfig.WORKER_ID_SHIFT    // 12n
```

### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `workerId` | `number` | `199` | Worker ID (0-1023) |
| `epoch` | `bigint` | `SnowflakeConfig.DEFAULT_EPOCH` | Custom epoch timestamp in milliseconds |

## Error Handling

The helper throws errors in these cases:

- **Invalid Worker ID**: Worker ID outside 0-1023 range
- **Invalid Epoch**: Epoch is zero, negative, or in the future
- **Clock Backward**: System clock moved backward by more than 100ms
- **Invalid Base62**: Decoding a string with invalid characters

```typescript
try {
  const generator = new SnowflakeUidHelper({ workerId: 2000 }); // Invalid
} catch (error) {
  // Worker ID must be between 0 and 1023
}
```

## Best Practices

1. **Use unique worker IDs** in distributed systems to prevent ID collisions
2. **Keep epoch consistent** across all instances to ensure proper ID ordering
3. **Use `nextId()`** for most cases (returns compact Base62 string)
4. **Use `nextSnowflake()`** when you need the raw bigint for arithmetic operations
