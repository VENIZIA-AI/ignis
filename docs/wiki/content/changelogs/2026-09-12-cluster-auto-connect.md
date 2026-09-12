---
title: A Redis Cluster Takes autoConnect Like Every Other Topology
description: RedisClusterHelper gains the autoConnect field that single and sentinel already had, and states enableOfflineQueue instead of inheriting it from ioredis. Your own clusterOptions still wins.
---

# Changelog - 2026-09-12

## A Redis cluster takes `autoConnect` like every other topology

<Badge type="tip" text="Enhancement" />

**In one line.** `RedisSingleHelper` and `RedisSentinelHelper` both took `autoConnect`; the cluster
took neither it nor `lazyConnect`, so every caller that needed lazy timing hand-threaded raw ioredis
options.

```typescript
// before - the rule lived at the call site, written out each time
new RedisClusterHelper({
  name: 'cache-cluster',
  nodes,
  clusterOptions: {
    redisOptions: { password },
    enableOfflineQueue: true,
    lazyConnect: true,
  },
});

// now
new RedisClusterHelper({
  name: 'cache-cluster',
  nodes,
  autoConnect: false,
  clusterOptions: { redisOptions: { password } },
});
```

## Why the timing matters

An application binds the Redis connection during setup and a component connects it during boot.
Connect the cluster eagerly and it is already mid-handshake when that component runs, so the second
`connect()` is refused. Single and sentinel have carried `lazyConnect: !autoConnect` since they were
written. The cluster forwarded `clusterOptions` verbatim into `new Cluster(...)` and applied nothing,
so the same rule had to be spelled out by hand at every call site.

## Two options are now stated, not inherited

| Option | Value | Why |
|--------|-------|-----|
| `lazyConnect` | `!autoConnect` | The rule single and sentinel already follow |
| `enableOfflineQueue` | `true` | Commands issued between bind and connect must queue, not throw |

`enableOfflineQueue: true` was already the effective behaviour, but it came from the ioredis default
rather than from IGNIS. It is written down now, so it cannot move under you on an ioredis upgrade.

## Your `clusterOptions` is still the last word

The two defaults are applied **below** `clusterOptions`, not above it:

```typescript
{ enableOfflineQueue: true, lazyConnect: !autoConnect, ...clusterOptions }
```

That ordering is deliberate. A caller already threading `clusterOptions: { lazyConnect: true }`
keeps exactly the timing it has today, and a caller with a considered reason to set
`enableOfflineQueue: false` still gets it. `autoConnect` is the ergonomic knob; `clusterOptions`
remains the raw hatch.

This is the one place cluster differs from sentinel, where the first-class fields win over the
`redisOptions` hatch. Cluster inverts it because `clusterOptions` was the only way to set this
timing before today, and changing that silently would be a regression rather than a feature.

## What did not change

`RedisClusterHelper` still does **not** apply `buildDefaultOpts` - no backoff `retryStrategy`, no
`maxRetriesPerRequest: null`. ioredis Cluster ignores `redisOptions.retryStrategy`, and injecting
`maxRetriesPerRequest: null` would flip per-node command-failure semantics. Pass either inside
`clusterOptions.redisOptions` when a consumer such as BullMQ needs it.

## Who is affected

**You build a cluster today and pass `clusterOptions`.** Nothing. Your options still win, byte for
byte. Replace the hand-written `lazyConnect` with `autoConnect: false` when it suits you.

**You build a cluster and pass no `clusterOptions`.** Nothing. The default `autoConnect: true`
resolves to `lazyConnect: false`, which is what ioredis did already.

**You want lazy timing.** Pass `autoConnect: false` instead of reaching for raw ioredis options.

**Files:**

- [`packages/helpers/src/modules/redis/cluster/cluster.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/cluster/cluster.helper.ts) - `RedisClusterHelper`
- [`packages/helpers/src/modules/redis/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/common/types.ts) - `IRedisClusterHelperProps`
