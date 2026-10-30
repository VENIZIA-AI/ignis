---
title: A Redis Cluster Takes autoConnect Like Every Other Topology
description: RedisClusterHelper gains the autoConnect option that single and sentinel already had, and your own clusterOptions still wins.
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-09-12

## A Redis cluster takes `autoConnect` like every other topology

<Badge type="tip" text="Enhancement" />

**In one line.** `RedisClusterHelper` now takes `autoConnect`, so lazy connect no longer needs raw ioredis options.

```typescript
new RedisClusterHelper({
  name: 'cache-cluster',
  nodes,
  autoConnect: false,
  clusterOptions: { redisOptions: { password } },
});
```

## What changed

- **`autoConnect`.** Sets `lazyConnect` to `!autoConnect`, the rule single and sentinel already follow. Use `autoConnect: false` when a component connects the cluster during boot, otherwise a second `connect()` is refused.
- **`enableOfflineQueue: true` is stated.** It was already the effective behaviour, but came from the ioredis default. It is now set by IGNIS, so an ioredis upgrade cannot move it.
- **Your `clusterOptions` still wins.** The defaults are applied below it (`{ enableOfflineQueue: true, lazyConnect: !autoConnect, ...clusterOptions }`). A caller passing `clusterOptions: { lazyConnect: true }` or `enableOfflineQueue: false` keeps exactly that. This is the one place cluster differs from sentinel, where the first-class fields win.

## Who is affected

- **You pass `clusterOptions` today.** Nothing. Your options still win. You may replace a hand-written `lazyConnect` with `autoConnect: false`.
- **You pass no `clusterOptions`.** Nothing. The default `autoConnect: true` resolves to `lazyConnect: false`, as before.

## Details

- `RedisClusterHelper` still does not apply `buildDefaultOpts`: no backoff `retryStrategy` and no `maxRetriesPerRequest: null`. Pass either inside `clusterOptions.redisOptions` when a consumer such as BullMQ needs it.
