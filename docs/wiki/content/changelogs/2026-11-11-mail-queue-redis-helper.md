---
title: The BullMQ mail queue takes a ready Redis helper, so it runs on Sentinel and Cluster
description: "The mail queue's redis option is now an IRedisHelper (single, sentinel or cluster) instead of single-node options. The application owns the connection, and the executor no longer closes it."
packages: ['@venizia/ignis']
---

# Changelog - 2026-11-11

## The BullMQ mail queue takes a ready Redis helper, so it runs on Sentinel and Cluster

<Badge type="warning" text="Breaking" /> <Badge type="info" text="Bug Fix" />

**In one line.** The mail queue always built its own single-node Redis connection, so an app on Redis Sentinel or Cluster could not use it; `redis` is now a Redis helper you create.

## What changed

- **`redis` is an `IRedisHelper`.** Pass a `RedisSingleHelper`, `RedisSentinelHelper` or `RedisClusterHelper`. The executor builds no connection of its own.
- **You close it.** The queue and workers duplicate the helper's client. The executor's `close()` closes workers and queue, and leaves the helper open.
- **Cluster queue names.** On a cluster the queue name is wrapped in a `{hash tag}` so its keys share one slot.
- **`ioredis` for a compiled binary** is now the Redis helper's `module` option. `bullmq`'s `module` stays on the executor.

## Who is affected

- **Apps that use the BullMQ mail executor.** Create the helper yourself and pass it. Close it on shutdown.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> `bullmq.redis` no longer takes connection options.

**Before:**

```typescript
{
  type: MailQueueExecutorTypes.BULLMQ,
  bullmq: {
    redis: { name: 'mail-redis', host: 'redis', port: 6379, password },
    queue: { identifier: 'mail-queue', name: 'mail-queue' },
    mode: BullMQExecutorModes.BOTH,
  },
}
```

**After:**

```typescript
{
  type: MailQueueExecutorTypes.BULLMQ,
  bullmq: {
    redis: new RedisSingleHelper({ name: 'mail-redis', host: 'redis', port: 6379, password }),
    queue: { identifier: 'mail-queue', name: 'mail-queue' },
    mode: BullMQExecutorModes.BOTH,
  },
}
```

On Sentinel, pass `new RedisSentinelHelper({ name, sentinels, masterName })`; on Cluster, `new RedisClusterHelper({ name, nodes })`. See [Mail usage](/extensions/components/mail/usage#bullmq-executor).
