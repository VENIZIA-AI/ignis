---
title: Redis Helpers Refactor - Abstract Base, Interfaces, Sentinel & Factory
description: Redis module restructured into folder-per-topology with segregated interfaces, AbstractRedisHelper base, RedisSentinelHelper, and a three-mode createRedisHelper factory.
---

# Changelog - 2026-06-25

## Redis Helpers Refactor - Abstract Base, Interfaces, Sentinel & Factory

<Badge type="warning" text="Breaking Change" /> <Badge type="tip" text="New Feature" />

**In one line.** Redis helpers are reorganized by topology (single, cluster, sentinel) with renamed classes, a segregated `IRedisHelper` interface, and a new factory. Existing Single and Cluster connection behavior is unchanged, but every consumer needs an import update.

## The problem it solves

Before this release, `RedisHelper` covered only a single Redis node. An application that needed Sentinel failover had nothing to reach for, and every consumer typed against a concrete class instead of a capability contract.

Pick a topology from one factory call instead of importing a specific class:

```typescript
const redis = createRedisHelper({
  mode: RedisModes.SENTINEL,
  name: 'cache',
  masterName: 'mymaster',
  sentinels: [{ host: '10.0.0.1', port: 26379 }],
});
```

## What changed

- **Renamed classes and types** - `DefaultRedisHelper` -> `AbstractRedisHelper`, `RedisHelper` -> `RedisSingleHelper`, `IRedisHelperOptions` -> `IRedisSingleHelperOptions`. No aliases are provided.
- **New `RedisSentinelHelper`** - connects through a Redis Sentinel quorum for automatic failover.
- **New `createRedisHelper({ mode })` factory** - picks the right helper (`RedisModes.SINGLE | CLUSTER | SENTINEL`) from config instead of importing all three classes.
- **New `IRedisHelper` interface** - a segregated capability contract composed of nine sub-interfaces (connection, key-value, hash, pub/sub, JSON, raw command, key, set, list). Type consumers against this instead of a concrete class.
- **Expanded data API** - new key operations (`exists`, `expire`, `ttl`, `incr`/`decr`, ...), set operations (`sAdd`, `sMembers`, ...), and list operations (`lPush`, `rPush`, `lRange`, ...). The hash interface gains `hGet`, `hDel`, `hExists`, `hKeys`, `hVals`, `hIncrBy`, `hLen`.
- **camelCase-only method names** - the lowercase aliases `mset`, `mget`, `hset`, `hgetall` are removed. Only `mSet`, `mGet`, `hSet`, `hGetAll` remain.
- **`set()` gains `expiresIn`** - an optional millisecond TTL (uses Redis `PX`).
- **`onError` callback narrowed** - the `error` argument is now `unknown` instead of `any`, so accessing `.message` requires a type guard.
- **No behavioral change** to the Cluster connection or to any existing data method beyond the renames above.

## Who is affected

- **Anyone importing `RedisHelper`, `DefaultRedisHelper`, or `IRedisHelperOptions` by name** - update imports to the new names (breaking, see below).
- **Anyone calling `mset`, `mget`, `hset`, or `hgetall`** - switch to the camelCase form (breaking, see below).
- **Anyone reading `.message` (or another property) off the `error` in an `onError` callback** - add a type guard first (breaking, see below).
- **Anyone using `RedisClusterHelper`** - no action needed. It is a faithful rename that still passes `clusterOptions` straight to ioredis `Cluster`.
- **Anyone who wants Sentinel HA** - new opt-in feature via `RedisSentinelHelper` or `createRedisHelper({ mode: RedisModes.SENTINEL })`.
- **Anyone using Socket.IO, WebSocket, or the BullMQ queue helper** - no action needed. Their internal Redis typing was updated as part of this release.

## Breaking changes

> [!WARNING]
> Public class and type names changed. No aliases are provided.

### Renamed exports

| Before | After |
|--------|-------|
| `DefaultRedisHelper` | `AbstractRedisHelper` |
| `RedisHelper` | `RedisSingleHelper` |
| `IRedisHelperOptions` | `IRedisSingleHelperOptions` |

```typescript
// Before
import { RedisHelper, DefaultRedisHelper } from '@venizia/ignis-helpers';
import type { IRedisHelperOptions } from '@venizia/ignis-helpers';

const redis = new RedisHelper({ name: 'cache', host, port, password });
if (connection instanceof DefaultRedisHelper) { /* ... */ }

// After
import { RedisSingleHelper, AbstractRedisHelper } from '@venizia/ignis-helpers';
import type { IRedisSingleHelperOptions } from '@venizia/ignis-helpers';

const redis = new RedisSingleHelper({ name: 'cache', host, port, password });
if (connection instanceof AbstractRedisHelper) { /* ... */ }
```

### Lowercase method aliases removed

Only the camelCase method names remain.

| Removed | Use instead |
|---------|--------------|
| `mset` | `mSet` |
| `mget` | `mGet` |
| `hset` | `hSet` |
| `hgetall` | `hGetAll` |

### `onError` callback `error` is now `unknown`

```typescript
// Before
onError: ({ name, helper, error }) => {
  console.error(error.message); // compiled fine with `any`
}

// After
onError: ({ name, helper, error }) => {
  if (error instanceof Error) {
    console.error(error.message); // narrowing required
  }
}
```

### Type fields against `IRedisHelper`, not a concrete class

```typescript
// Before
class MyService {
  constructor(private redisConnection: DefaultRedisHelper) {}
}

// After
import type { IRedisHelper } from '@venizia/ignis-helpers';

class MyService {
  constructor(private redisConnection: IRedisHelper) {}
}
```

## Details

### `RedisSentinelHelper`

```typescript
import { RedisSentinelHelper } from '@venizia/ignis-helpers';

const redis = new RedisSentinelHelper({
  name: 'cache',
  masterName: 'mymaster',
  sentinels: [
    { host: '10.0.0.1', port: 26379 },
    { host: '10.0.0.2' },          // port defaults to 26379
  ],
  role: 'master',
  password: 'data-node-secret',
  sentinelPassword: 'sentinel-secret',
  autoConnect: false,
});

await redis.connect();
```

`masterName` maps to the ioredis `name` field (the Sentinel group name), distinct from the helper's own `name`. Pass `redisOptions` for any extra ioredis option - first-class fields always win.

### `createRedisHelper` factory

```typescript
import { createRedisHelper, RedisModes } from '@venizia/ignis-helpers';

const redis = createRedisHelper({
  mode: RedisModes.SINGLE,
  name: 'cache',
  host: 'localhost',
  port: 6379,
  password: 'secret',
});
// mode: RedisModes.CLUSTER   -> RedisClusterHelper
// mode: RedisModes.SENTINEL  -> RedisSentinelHelper
```

The factory is overloaded so TypeScript infers the concrete return type when `mode` is a literal.

### Segregated `IRedisHelper` interfaces

| Interface | Methods |
|-----------|---------|
| `IRedisConnection` | `getClient`, `duplicateClient`, `ping`, `connect`, `disconnect` |
| `IRedisKeyValue` | `set`, `get`, `del`, `keys`, `getString`, `getStrings`, `getObject`, `getObjects`, `mSet`, `mGet` |
| `IRedisHash` | `hSet`, `hGetAll`, `hGet`, `hDel`, `hExists`, `hKeys`, `hVals`, `hIncrBy`, `hLen` |
| `IRedisPubSub` | `publish`, `subscribe`, `unsubscribe` |
| `IRedisJson` | `jSet`, `jGet`, `jDelete`, `jNumberIncreaseBy`, `jStringAppend`, `jPush`, `jPop` |
| `IRedisCommand` | `execute` |
| `IRedisKey` | `exists`, `expire`, `expireAt`, `ttl`, `persist`, `incr`, `decr`, `incrBy`, `decrBy` |
| `IRedisSet` | `sAdd`, `sRem`, `sMembers`, `sIsMember`, `sCard` |
| `IRedisList` | `lPush`, `rPush`, `lPop`, `rPop`, `lRange`, `lLen` |

### Edge-case semantics

- Array-input methods (`exists`, `hDel`, `sAdd`, `sRem`, `lPush`, `rPush`) return `0` immediately on an empty array, without calling ioredis.
- Boolean-returning methods (`expire`, `expireAt`, `persist`, `hExists`, `sIsMember`) compare the ioredis numeric reply `=== 1`.
- `expireAt` takes epoch **seconds** (ioredis `expireat`). `set`'s `expiresIn` takes **milliseconds** (`PX`).

## See also

- [Migrating to the new Redis Helper API](/guides/migrations/redis-helpers-migration) - step-by-step import updates
- [Redis - Full Reference](/extensions/helpers/redis/reference) - every method on `IRedisHelper`

<details>
<summary>Files changed</summary>

**Helpers package** (`packages/helpers`) - the `redis` module is restructured folder-per-topology: `common/` (interfaces, types, constants), `base/abstract.helper.ts` (renamed from `default.helper.ts`), `single/`, `cluster/`, `sentinel/` (new), and `factory.ts` (new). `queue/bullmq`, `socket/socket-io`, and `socket/websocket` now type against `IRedisHelper`. Five new test files under `src/__tests__/redis/`.

**Core package** (`packages/core-server`) - the Socket.IO, WebSocket, and Auth components type against `IRedisHelper`/`AbstractRedisHelper`; the mail BullMQ executor uses `RedisSingleHelper` and `IRedisSingleHelperOptions`.

**Examples** - `vert`, `socket-io-test`, and `websocket-test` updated to `RedisSingleHelper`.

</details>
