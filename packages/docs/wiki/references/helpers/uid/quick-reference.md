# Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis-helpers` |
| **Class** | `SnowflakeUidHelper` |
| **Extends** | `BaseHelper` |
| **Runtimes** | Both |

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

::: details Import Paths
```typescript
// Via helpers package
import { SnowflakeUidHelper, SnowflakeConfig } from '@venizia/ignis-helpers';

// Types
import type { IIdGeneratorOptions, ISnowflakeParsedId } from '@venizia/ignis-helpers';
```
:::
