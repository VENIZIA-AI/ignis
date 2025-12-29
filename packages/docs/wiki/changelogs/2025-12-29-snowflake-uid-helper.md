---
title: Snowflake UID Helper
description: New Snowflake ID generator with Base62 encoding for distributed systems
---

# Changelog - 2025-12-29

## Snowflake UID Helper

New unique ID generator using Twitter's Snowflake algorithm with Base62 encoding, suitable for distributed systems.

## Overview

- **New Helper**: `SnowflakeUidHelper` for generating unique, time-sortable IDs
- **Base62 Encoding**: Compact string output (10-12 characters)
- **Configurable**: Optional `workerId` and `epoch` parameters
- **No Environment Variables**: Clean constructor-based configuration

## New Features

### SnowflakeUidHelper

**File:** `packages/helpers/src/helpers/uid/helper.ts`

**Problem:** Need unique, time-sortable IDs for distributed systems without external dependencies.

**Solution:** Snowflake ID generator with 70-bit structure (48-10-12):
- 48 bits: timestamp (~8,919 years from epoch)
- 10 bits: worker ID (1024 workers max)
- 12 bits: sequence (4096 per ms per worker)

```typescript
import { SnowflakeUidHelper, SnowflakeConfig } from '@venizia/ignis-helpers';

// Use defaults (workerId: 199, epoch: 2025-01-01 00:00:00 UTC)
const generator = new SnowflakeUidHelper();

// Or with custom values
const customGenerator = new SnowflakeUidHelper({
  workerId: 123,
  epoch: BigInt(1735689600000),
});

// Generate IDs
const id = generator.nextId();           // Base62: "9du1sJXO88"
const snowflake = generator.nextSnowflake(); // BigInt: 130546360012247045n

// Parse IDs
const parsed = generator.parseId("9du1sJXO88");
// => { raw, timestamp, workerId, sequence }
```

**Benefits:**
- High throughput: 4,096,000 IDs/second/worker
- Time-sortable: IDs are chronologically ordered
- Compact: 10-12 character Base62 strings
- No collisions: Worker ID + sequence ensures uniqueness
- Long lifespan: Until ~10,944 AD

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `workerId` | `number` | `199` | Worker ID (0-1023) |
| `epoch` | `bigint` | `1735689600000n` | Custom epoch (2025-01-01 UTC) |

### Available Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `nextId()` | `string` | Generate Base62 encoded ID |
| `nextSnowflake()` | `bigint` | Generate raw Snowflake ID |
| `encodeBase62(num)` | `string` | Encode bigint to Base62 |
| `decodeBase62(str)` | `bigint` | Decode Base62 to bigint |
| `parseId(base62Id)` | `ISnowflakeParsedId` | Parse and extract components |
| `extractTimestamp(id)` | `Date` | Extract timestamp from ID |
| `extractWorkerId(id)` | `number` | Extract worker ID from ID |
| `extractSequence(id)` | `number` | Extract sequence from ID |
| `getWorkerId()` | `number` | Get current worker ID |

## Files Changed

### Helpers Package (`packages/helpers`)

| File | Changes |
|------|---------|
| `src/helpers/uid/helper.ts` | New Snowflake ID generator class |
| `src/helpers/uid/index.ts` | Export helper |
| `src/helpers/index.ts` | Added uid export |

### Docs Package (`packages/docs`)

| File | Changes |
|------|---------|
| `wiki/references/helpers/uid.md` | New documentation |
| `wiki/references/helpers/index.md` | Added UID to helper list |

## No Breaking Changes

This is a new feature addition. No existing APIs were modified.
