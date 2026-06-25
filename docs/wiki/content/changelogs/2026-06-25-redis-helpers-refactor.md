---
title: Redis Helpers Refactor - Abstract Base, Interfaces, Sentinel & Factory
description: Redis module restructured into folder-per-topology with segregated interfaces, AbstractRedisHelper base, RedisSentinelHelper, and a three-mode createRedisHelper factory.
---

# Changelog - 2026-06-25

## Redis Helpers Refactor - Abstract Base, Interfaces, Sentinel & Factory

The Redis module is restructured into a folder-per-topology layout with clean interface segregation, a renamed abstract base class, a new Sentinel topology, and a factory that selects the right helper from a `mode` option.

## Overview

- **`DefaultRedisHelper` renamed to `AbstractRedisHelper`** - the base is never constructed directly; only the concrete topology subclasses are
- **`RedisHelper` renamed to `RedisSingleHelper`** - explicit topology name; all constructor options unchanged
- **`IRedisHelperOptions` renamed to `IRedisSingleHelperOptions`** - matches the class rename
- **`IRedisHelper` interface** - segregated capability contract; consumers type against this rather than the concrete class
- **`RedisSentinelHelper`** - new topology helper for Sentinel HA (`sentinels` + `masterName`, optional `role`/`sentinelPassword`/`sentinelUsername`/`redisOptions`; sentinel port defaults to `26379`)
- **`createRedisHelper({ mode })`** - three-mode factory (`RedisModes.SINGLE | CLUSTER | SENTINEL`), overloaded to return the concrete type
- **Callback `error` type narrowed from `any` to `unknown`** - applies to all `onError` callbacks in `IRedisHelperCallbacks`
- **Circular import eliminated** - `common/interfaces.ts` declares pure capability contracts; `common/types.ts` references `IRedisHelper` (never the class)
- **No behavioral change** to the data API (key-value, hash, Pub/Sub, RedisJSON, raw command)
- **Cluster connection behavior is UNCHANGED** - `RedisClusterHelper` is a faithful rename and remains a pass-through of `clusterOptions` to ioredis `Cluster`; it does NOT use `buildDefaultOpts`. The only new connection behavior is the new `RedisSentinelHelper`

## Breaking Changes

> [!WARNING]
> Public class and type names changed. No aliases are provided. Update all imports.

### 1. `DefaultRedisHelper` renamed to `AbstractRedisHelper`

**Before:**
```typescript
import { DefaultRedisHelper } from '@venizia/ignis-helpers';

if (connection instanceof DefaultRedisHelper) { ... }
```

**After:**
```typescript
import { AbstractRedisHelper } from '@venizia/ignis-helpers';

if (connection instanceof AbstractRedisHelper) { ... }
```

### 2. `RedisHelper` renamed to `RedisSingleHelper`

**Before:**
```typescript
import { RedisHelper } from '@venizia/ignis-helpers';

const redis = new RedisHelper({ name: 'cache', host, port, password });
```

**After:**
```typescript
import { RedisSingleHelper } from '@venizia/ignis-helpers';

const redis = new RedisSingleHelper({ name: 'cache', host, port, password });
```

### 3. `IRedisHelperOptions` renamed to `IRedisSingleHelperOptions`

**Before:**
```typescript
import type { IRedisHelperOptions } from '@venizia/ignis-helpers';
```

**After:**
```typescript
import type { IRedisSingleHelperOptions } from '@venizia/ignis-helpers';
```

### 4. `onError` callback `error` type narrowed from `any` to `unknown`

**Before:**
```typescript
onError: ({ name, helper, error }) => {
  console.error(error.message); // compiled fine with `any`
}
```

**After:**
```typescript
onError: ({ name, helper, error }) => {
  if (error instanceof Error) {
    console.error(error.message); // narrowing required
  }
}
```

### 5. Consumers should type against `IRedisHelper`, not the concrete class

**Before:**
```typescript
redisConnection: DefaultRedisHelper;
```

**After:**
```typescript
import type { IRedisHelper } from '@venizia/ignis-helpers';

redisConnection: IRedisHelper;
```

## New Features

### `RedisSentinelHelper`

Connects through a Redis Sentinel quorum for automatic failover.

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

`masterName` maps to the ioredis `name` field (the Sentinel group name), which is distinct from the helper's own `name`. Pass `redisOptions` for any extra ioredis option; first-class fields always win.

### `createRedisHelper` factory + `RedisModes`

Select topology from config without importing all three classes:

```typescript
import { createRedisHelper, RedisModes } from '@venizia/ignis-helpers';

const redis = createRedisHelper({
  mode: RedisModes.SINGLE,
  name: 'cache',
  host: 'localhost',
  port: 6379,
  password: 'secret',
});
// mode: RedisModes.CLUSTER -> RedisClusterHelper
// mode: RedisModes.SENTINEL -> RedisSentinelHelper
```

The factory is overloaded so TypeScript infers the concrete return type when `mode` is a literal. `RedisModes` is a const-class with `SINGLE | CLUSTER | SENTINEL`.

### Segregated `IRedisHelper` interfaces

`IRedisHelper` composes six sub-interfaces:

| Interface | Methods |
|-----------|---------|
| `IRedisConnection` | `getClient`, `duplicateClient`, `ping`, `connect`, `disconnect` |
| `IRedisKeyValue` | `set`, `get`, `del`, `keys`, `getString`, `getStrings`, `getObject`, `getObjects`, `mset`/`mSet`, `mget`/`mGet` |
| `IRedisHash` | `hset`/`hSet`, `hgetall`/`hGetAll` |
| `IRedisPubSub` | `publish`, `subscribe`, `unsubscribe` |
| `IRedisJson` | `jSet`, `jGet`, `jDelete`, `jNumberIncreaseBy`, `jStringAppend`, `jPush`, `jPop` |
| `IRedisCommand` | `execute` |

## New Features (camelCase cleanup + expanded data API)

### camelCase-only standardization

The lowercase method aliases (`mset`, `mget`, `hset`, `hgetall`) have been removed. Only the camelCase forms (`mSet`, `mGet`, `hSet`, `hGetAll`) remain. Internal callers (`getStrings`, `getObjects`) have been updated accordingly.

### Expanded data API

`IRedisHelper` now composes three additional sub-interfaces:

| New Interface | Methods |
|---------------|---------|
| `IRedisKey` | `exists`, `expire`, `expireAt`, `ttl`, `persist`, `incr`, `decr`, `incrBy`, `decrBy` |
| `IRedisSet` | `sAdd`, `sRem`, `sMembers`, `sIsMember`, `sCard` |
| `IRedisList` | `lPush`, `rPush`, `lPop`, `rPop`, `lRange`, `lLen` |

`IRedisHash` is extended with: `hGet`, `hDel`, `hExists`, `hKeys`, `hVals`, `hIncrBy`, `hLen`.

`IRedisKeyValue.set` gains an `expiresIn?: number` option (milliseconds, uses Redis `PX`). `expireAt` takes epoch **seconds** via ioredis `expireat`.

Array-input methods (`exists`, `hDel`, `sAdd`, `sRem`, `lPush`, `rPush`) return `0` immediately on an empty array without calling ioredis. Boolean-returning methods (`expire`, `expireAt`, `persist`, `hExists`, `sIsMember`) compare the ioredis numeric reply `=== 1`.

## Files Changed

### Helpers Package (`packages/helpers`)

| File | Changes |
|------|---------|
| `src/modules/redis/common/interfaces.ts` | New: segregated `IRedis*` capability interfaces + `IRedisHelper` |
| `src/modules/redis/common/types.ts` | Rewritten: props/options renamed; callbacks reference `IRedisHelper`; `error: unknown` |
| `src/modules/redis/common/constants.ts` | New: `RedisModes` const-class + `TRedisMode` |
| `src/modules/redis/common/index.ts` | Updated: exports constants, interfaces, and types |
| `src/modules/redis/base/abstract.helper.ts` | New: `AbstractRedisHelper` (renamed from `DefaultRedisHelper`); adds `buildRetryStrategy`/`buildDefaultOpts` statics |
| `src/modules/redis/base/default.helper.ts` | Deleted (replaced by `abstract.helper.ts`) |
| `src/modules/redis/base/index.ts` | Updated: exports only `abstract.helper` |
| `src/modules/redis/single/single.helper.ts` | New: `RedisSingleHelper` (moved from `base/single.helper.ts`, renamed) |
| `src/modules/redis/single/index.ts` | New barrel |
| `src/modules/redis/base/single.helper.ts` | Deleted (moved to `single/`) |
| `src/modules/redis/cluster/cluster.helper.ts` | Updated: extends `AbstractRedisHelper` (faithful pass-through, behavior unchanged) |
| `src/modules/redis/cluster/index.ts` | Fixed (was empty) |
| `src/modules/redis/sentinel/sentinel.helper.ts` | New: `RedisSentinelHelper` |
| `src/modules/redis/sentinel/index.ts` | New barrel |
| `src/modules/redis/factory.ts` | New: `createRedisHelper` overloaded factory |
| `src/modules/redis/index.ts` | Updated: wires all topology barrels + factory |
| `src/modules/queue/bullmq/helper.ts` | Updated: `IRedisHelper` instead of `DefaultRedisHelper` |
| `src/modules/socket/socket-io/common/types.ts` | Updated: `IRedisHelper` instead of `DefaultRedisHelper` |
| `src/modules/socket/websocket/common/types.ts` | Updated: `IRedisHelper` instead of `DefaultRedisHelper` |
| `src/__tests__/redis/single.helper.test.ts` | New |
| `src/__tests__/redis/cluster.helper.test.ts` | New |
| `src/__tests__/redis/sentinel.helper.test.ts` | New |
| `src/__tests__/redis/conformance.test.ts` | New |
| `src/__tests__/redis/factory.test.ts` | New |

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/components/socket-io/component.ts` | Updated: `AbstractRedisHelper` for `instanceof`/`Binding` |
| `src/components/websocket/component.ts` | Updated: `AbstractRedisHelper` for `instanceof`/`Binding` |
| `src/components/socket-io/common/types.ts` | Updated: `IRedisHelper` type |
| `src/components/websocket/common/types.ts` | Updated: `IRedisHelper` type |
| `src/components/auth/authorize/common/types.ts` | Updated: `IRedisHelper` type |
| `src/components/mail/helpers/executors/bull-mq-executor.helper.ts` | Updated: `RedisSingleHelper` + `IRedisSingleHelperOptions` |

### Examples

| File | Changes |
|------|---------|
| `examples/vert/src/application.ts` | Updated: `RedisSingleHelper` |
| `examples/socket-io-test/src/application.ts` | Updated: `RedisSingleHelper` |
| `examples/websocket-test/src/application.ts` | Updated: `RedisSingleHelper` |

## Migration Guide

### Step 1: Update Redis helper imports

```typescript
// Before
import { RedisHelper, DefaultRedisHelper } from '@venizia/ignis-helpers';
import type { IRedisHelperOptions } from '@venizia/ignis-helpers';

// After
import { RedisSingleHelper, AbstractRedisHelper } from '@venizia/ignis-helpers';
import type { IRedisSingleHelperOptions, IRedisHelper } from '@venizia/ignis-helpers';
```

### Step 2: Replace construction calls

```typescript
// Before
const redis = new RedisHelper({ name, host, port, password });

// After
const redis = new RedisSingleHelper({ name, host, port, password });
```

### Step 3: Update field types to `IRedisHelper`

```typescript
// Before
class MyService {
  constructor(private redisConnection: DefaultRedisHelper) {}
}

// After
class MyService {
  constructor(private redisConnection: IRedisHelper) {}
}
```

### Step 4: Update `instanceof` checks

```typescript
// Before
if (!(conn instanceof DefaultRedisHelper)) throw ...;

// After
if (!(conn instanceof AbstractRedisHelper)) throw ...;
```

### Step 5: Narrow `error` in `onError`

Any `onError` handler that accessed `.message` or other properties on the raw `error` argument must narrow the type first (e.g., `if (error instanceof Error)`).
