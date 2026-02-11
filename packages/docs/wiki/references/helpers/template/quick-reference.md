# Quick Reference

First section after the title. Gives the reader a complete overview at a glance.

## Key Difference from Components

Helper Quick Reference tables are **flexible** — adapt the structure to fit the helper. Components always use the same fixed table.

## Single-Class Helper

For helpers with one main class (UID, Cron, Environment):

```markdown
## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis-helpers` |
| **Class** | `SnowflakeUidHelper` |
| **Extends** | `BaseHelper` |
| **Runtimes** | Both |
```

## Multi-Class Helper

For helpers with multiple classes (Redis, Crypto, Network):

```markdown
## Quick Reference

| Class | Extends | Use Case |
|-------|---------|----------|
| **RedisHelper** | DefaultRedisHelper | Single instance |
| **RedisClusterHelper** | DefaultRedisHelper | Cluster |
```

## Operations Summary

Follow with a **Supported Operations** table when it helps scope:

```markdown
### Supported Operations

| Category | Methods |
|----------|---------|
| **Key-Value** | `set()`, `get()`, `del()` |
| **Pub/Sub** | `subscribe()`, `publish()` |
```

## Import Paths

Always collapsible. Always show both class and type imports:

```markdown
::: details Import Paths
` ``typescript
import { HelperClass } from '@venizia/ignis-helpers';
import type { IHelperOptions } from '@venizia/ignis-helpers';
` ``
:::
```

## Rules

- **Package** is `@venizia/ignis-helpers` for helpers (not `@venizia/ignis`)
- Add an `> [!IMPORTANT]` callout only for critical notes (e.g., "Bun only")
- Optional: Add a specs table for helpers with notable characteristics (throughput, limits, etc.)
