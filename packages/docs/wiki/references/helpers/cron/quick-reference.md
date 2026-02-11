# Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis-helpers` |
| **Class** | `CronHelper` |
| **Extends** | `BaseHelper` |
| **Runtimes** | Both |

### Common Cron Patterns

| Pattern | Description |
|---------|-------------|
| `'0 */1 * * * *'` | Every minute |
| `'0 */5 * * * *'` | Every 5 minutes |
| `'0 0 * * * *'` | Every hour |
| `'0 0 0 * * *'` | Every day at midnight |
| `'0 0 0 * * 1'` | Every Monday at midnight |

### Key Methods

| Method | Purpose |
|--------|---------|
| `start()` | Start the cron job manually |
| `modifyCronTime({ cronTime })` | Change schedule dynamically |
| `duplicate({ cronTime })` | Create new job with same config |

::: details Import Paths
```typescript
import { CronHelper } from '@venizia/ignis-helpers';
import type { ICronHelperOptions } from '@venizia/ignis-helpers';
```
:::
