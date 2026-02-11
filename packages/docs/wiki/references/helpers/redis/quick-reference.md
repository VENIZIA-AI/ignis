# Quick Reference

| Helper Class | Extends | Use Case |
|--------------|---------|----------|
| **`DefaultRedisHelper`** | `BaseHelper` | Base class with unified API for all Redis operations |
| **`RedisHelper`** | `DefaultRedisHelper` | Single Redis instance |
| **`RedisClusterHelper`** | `DefaultRedisHelper` | Redis cluster |

### Supported Operations

| Category | Methods |
|----------|---------|
| **Key-Value** | `set()`, `get()`, `getString()`, `getObject()`, `del()` |
| **Multi-Key** | `mset()` / `mSet()`, `mget()` / `mGet()`, `getStrings()`, `getObjects()` |
| **Hashes** | `hset()` / `hSet()`, `hgetall()` / `hGetAll()` |
| **JSON** (RedisJSON) | `jSet()`, `jGet()`, `jDelete()`, `jNumberIncreaseBy()`, `jStringAppend()`, `jPush()`, `jPop()` |
| **Pub/Sub** | `subscribe()`, `publish()`, `unsubscribe()` |
| **Connection** | `connect()`, `disconnect()`, `ping()`, `getClient()` |
| **Raw** | `execute()`, `keys()` |

::: details Import Paths
```typescript
// From the helpers package
import {
  DefaultRedisHelper,
  RedisHelper,
  RedisClusterHelper,
} from '@venizia/ignis-helpers';

// Or from the core package (re-exports everything)
import {
  DefaultRedisHelper,
  RedisHelper,
  RedisClusterHelper,
} from '@venizia/ignis';

// Types
import type {
  IRedisHelperOptions,
  IRedisClusterHelperOptions,
  IRedisHelperCallbacks,
  IRedisHelperProps,
  IRedisClusterHelperProps,
} from '@venizia/ignis-helpers';
```
:::
