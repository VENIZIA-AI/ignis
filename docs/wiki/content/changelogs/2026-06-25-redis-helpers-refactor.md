---
title: Redis Helpers Refactor - Abstract Base, Interfaces, Sentinel & Factory
description: Redis helpers are reorganized by topology with renamed classes, an IRedisHelper interface, a Sentinel helper and a createRedisHelper factory.
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-06-25

## Redis Helpers Refactor

<Badge type="warning" text="Breaking Change" /> <Badge type="tip" text="New Feature" />

**In one line.** You can now connect through Redis Sentinel and pick a topology from one factory call. Existing Single and Cluster connection behavior is unchanged, but classes are renamed, so imports need updating.

## What changed

- **Renamed classes and types.** `DefaultRedisHelper` is now `AbstractRedisHelper`, `RedisHelper` is `RedisSingleHelper`, and `IRedisHelperOptions` is `IRedisSingleHelperOptions`. No aliases.
- **New `RedisSentinelHelper`.** Connects through a Sentinel quorum for automatic failover.
- **New `createRedisHelper({ mode })` factory.** Picks `RedisModes.SINGLE`, `CLUSTER` or `SENTINEL` from config.
- **New `IRedisHelper` interface.** Type consumers against it instead of a concrete class.
- **Expanded data API.** New key operations (`exists`, `expire`, `ttl`, `incr`, `decr`, ...), set operations (`sAdd`, `sMembers`, ...), list operations (`lPush`, `rPush`, `lRange`, ...), and hash operations `hGet`, `hDel`, `hExists`, `hKeys`, `hVals`, `hIncrBy`, `hLen`.
- **`set()` takes `expiresIn`.** An optional TTL in milliseconds (Redis `PX`).

```typescript
const redis = createRedisHelper({
  mode: RedisModes.SENTINEL,
  name: 'cache',
  masterName: 'mymaster',
  sentinels: [{ host: '10.0.0.1', port: 26379 }],
});
```

## Who is affected

- **Code importing `RedisHelper`, `DefaultRedisHelper` or `IRedisHelperOptions`.** Update to the new names.
- **Code calling `mset`, `mget`, `hset` or `hgetall`.** Switch to camelCase.
- **Code reading `.message` off the `error` in an `onError` callback.** Add a type guard.
- **`RedisClusterHelper` users.** No action needed.
- **Socket.IO, WebSocket and BullMQ queue helper users.** No action needed.

## Breaking changes

> [!WARNING]
> Public class and type names changed, with no aliases. See the [migration guide](/guides/migrations/redis-helpers-migration).

| Before | After |
|--------|-------|
| `DefaultRedisHelper` | `AbstractRedisHelper` |
| `RedisHelper` | `RedisSingleHelper` |
| `IRedisHelperOptions` | `IRedisSingleHelperOptions` |
| `mset` | `mSet` |
| `mget` | `mGet` |
| `hset` | `hSet` |
| `hgetall` | `hGetAll` |

The `error` argument of `onError` is now `unknown` instead of `any`:

```typescript
// Before
onError: ({ name, helper, error }) => {
  console.error(error.message);
}

// After
onError: ({ name, helper, error }) => {
  if (error instanceof Error) {
    console.error(error.message);
  }
}
```

Type fields against the interface:

```typescript
// Before
constructor(private redisConnection: DefaultRedisHelper) {}

// After
import type { IRedisHelper } from '@venizia/ignis-helpers';
constructor(private redisConnection: IRedisHelper) {}
```

## Details

- `RedisSentinelHelper` takes `masterName` (the Sentinel group name, separate from the helper's `name`), `sentinels` (port defaults to 26379), `role`, `password`, `sentinelPassword`, `autoConnect` and `redisOptions` for any other ioredis option. First-class fields win over `redisOptions`.
- Array-input methods (`exists`, `hDel`, `sAdd`, `sRem`, `lPush`, `rPush`) return `0` on an empty array without calling ioredis.
- `expireAt` takes epoch seconds. `set`'s `expiresIn` takes milliseconds.

## See also

- [Migrating to the new Redis Helper API](/guides/migrations/redis-helpers-migration)
- [Redis - Full Reference](/extensions/helpers/redis/reference)
