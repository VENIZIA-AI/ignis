---
title: Migrating to the new Redis Helper API
description: Breaking changes and migration steps for the IGNIS Redis helper refactor - folder-per-topology, AbstractRedisHelper, camelCase methods, Sentinel, and the createRedisHelper factory
---

# Migrating to the new Redis Helper API

> **Audience:** any application upgrading `@venizia/ignis-helpers` (and `@venizia/ignis`) across the Redis helper refactor release. This guide describes exactly what breaks and how to migrate. It applies to every consumer - it is not specific to any one app.

---

## 0. TL;DR

The IGNIS Redis module was restructured into one base class plus three topologies (single / cluster / sentinel) behind a segregated `IRedisHelper` interface. Several public symbols were **renamed with no back-compat aliases (clean break)**, and the lowercase hash/multi methods were removed in favor of camelCase. Your project **will not compile** against the new version until you apply the renames in §1.

Nothing in your data or Redis server changes - this is a code-level rename plus a few additive features. The single and cluster connection behavior is byte-for-byte identical to before; only the new `RedisSentinelHelper` introduces new behavior.

| Effort | What |
|--------|------|
| **Low - mechanical renames** | Apply the rename table in §1 and the method renames in §1.2. Compiler-guided: every stale reference becomes a type error. |

---

## 1. What changed (breaking)

### 1.1 Class and type renames (no aliases)

| Old (removed) | New |
|---------------|-----|
| `DefaultRedisHelper` | `AbstractRedisHelper` |
| `RedisHelper` | `RedisSingleHelper` |
| `IRedisHelperOptions` | `IRedisSingleHelperOptions` |
| `IRedisHelperProps` | `IRedisSingleHelperProps` |

`RedisClusterHelper` is **unchanged** in name and behavior.

`AbstractRedisHelper` is the base class (never constructed directly). Use it only where you need an `instanceof` check or a concrete-class binding; for plain typing prefer the `IRedisHelper` interface.

### 1.2 Lowercase methods removed - use camelCase

The duplicate lowercase aliases were removed. The camelCase forms are now the only API.

| Old (removed) | New |
|---------------|-----|
| `.hset(...)` | `.hSet(...)` |
| `.hgetall(...)` | `.hGetAll(...)` |
| `.mset(...)` | `.mSet(...)` |
| `.mget(...)` | `.mGet(...)` |

Single-word methods (`get`, `set`, `del`, `keys`, `publish`, `subscribe`) are unchanged.

### 1.3 Callback type narrowed

`IRedisHelperCallbacks.onError` now receives `error: unknown` (was `error: any`). This only affects you if you access properties on `error` without narrowing first.

---

## 2. Find every affected site

Run this in your project root. Every match is a site to migrate:

```bash
grep -rnE 'DefaultRedisHelper|\bRedisHelper\b|IRedisHelper(Options|Props)\b|\.(hset|mset|hgetall|mget)\(' src
```

`\bRedisHelper\b` matches the bare class only - it will not match `RedisClusterHelper` / `RedisSingleHelper`.

After migrating, re-run it; a clean result plus a green `tsc` means you are done.

---

## 3. Migration steps (before / after)

### Constructing a single-node connection

```typescript
// Before
import { RedisHelper } from '@venizia/ignis-helpers';
const redis = new RedisHelper({ name: 'cache', host, port, password });

// After
import { RedisSingleHelper } from '@venizia/ignis-helpers';
const redis = new RedisSingleHelper({ name: 'cache', host, port, password });
```

### Typing a Redis connection (config, fields, params)

Prefer the interface for plain typing:

```typescript
// Before
import { DefaultRedisHelper } from '@venizia/ignis-helpers';
function useRedis(connection: DefaultRedisHelper) { /* ... */ }

// After
import type { IRedisHelper } from '@venizia/ignis-helpers';
function useRedis(connection: IRedisHelper) { /* ... */ }
```

### instanceof checks and concrete bindings

Use the `isRedisHelper` brand check (you cannot `instanceof` an interface, and `instanceof` against
the base class answers `false` for a helper built by a second installed copy of the package):

```typescript
// Before
if (connection instanceof DefaultRedisHelper) { /* ... */ }

// After
import { isRedisHelper } from '@venizia/ignis-helpers';
if (isRedisHelper(connection)) { /* ... */ }
```

### Options type rename

```typescript
// Before
import type { IRedisHelperOptions } from '@venizia/ignis-helpers';

// After
import type { IRedisSingleHelperOptions } from '@venizia/ignis-helpers';
```

### Hash and multi-key calls

```typescript
// Before
await redis.hset({ key, value });
const all = await redis.hgetall({ key });
await redis.mset({ payload });
const many = await redis.mget({ keys });

// After
await redis.hSet({ key, value });
const all = await redis.hGetAll({ key });
await redis.mSet({ payload });
const many = await redis.mGet({ keys });
```

---

## 4. Runtime behavior changes to verify

These compile unchanged but behave slightly differently. All are strictly safer; verify only if your code depended on the old behavior.

| Method | Old behavior | New behavior |
|--------|--------------|--------------|
| `subscribe` / `unsubscribe` | threw inside the ioredis callback on a subscription error (an unhandled async throw) | logs the error and returns; never throws |
| `del` / `mGet` / `mSet` | forwarded empty input to Redis, which throws "wrong number of arguments" | empty input is a no-op: returns `0` / `[]` / void without a Redis call |

If you wrapped `subscribe(...)` in a `try/catch` expecting it to throw, that branch no longer fires. If you relied on `del([])` throwing, it now returns `0`.

---

## 5. What you gain (additive - no action required)

These are new and do not break anything:

- **`RedisSentinelHelper`** - Redis Sentinel topology with automatic failover. See the [Redis Helper full reference](/extensions/helpers/redis/reference#construction-sentinel) (Sentinel section).
- **`createRedisHelper({ mode })`** - a factory that builds the right helper from `RedisModes.SINGLE | CLUSTER | SENTINEL`, so you can pick a topology from config.
- **`RedisModes`** and **`RedisSentinelRoles`** - const-classes for the enumerable mode/role strings, with matching `TRedisMode` / `TRedisSentinelRole` types.
- **Expanded data API** - key lifecycle and counters (`exists`, `expire`, `expireAt`, `ttl`, `persist`, `incr`, `decr`, `incrBy`, `decrBy`), hash completion (`hGet`, `hDel`, `hExists`, `hKeys`, `hVals`, `hIncrBy`, `hLen`), sets (`sAdd`, `sRem`, `sMembers`, `sIsMember`, `sCard`), and lists (`lPush`, `rPush`, `lPop`, `rPop`, `lRange`, `lLen`).
- **`set` TTL option** - `set({ key, value, options: { expiresIn } })` where `expiresIn` is milliseconds (uses `PX`).
- **All three topologies are interchangeable** - anywhere an `IRedisHelper` is accepted (BullMQ, Socket.IO, WebSocket, the Casbin cache), you can now pass a single, cluster, or sentinel helper without changing the consumer.

---

## 6. Migration checklist

- [ ] Run the grep in §2; note every match.
- [ ] Apply the §1.1 class/type renames.
- [ ] Apply the §1.2 lowercase to camelCase method renames.
- [ ] Switch plain-typed connection references to `IRedisHelper`; keep `AbstractRedisHelper` for `instanceof` / concrete bindings.
- [ ] Narrow `onError` usage if you read fields off `error`.
- [ ] Review §4 if you relied on subscribe throwing or empty-input throwing.
- [ ] Re-run the grep (clean) and `tsc` (green); run your test suite.

When the grep is clean and the build is green, the migration is complete - there is no data or server-side change to perform.
