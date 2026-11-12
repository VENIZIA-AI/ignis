---
title: Redis helpers reconnect by default, and BullMQ closes the connections it opens
description: "maxRetry defaults to 5 with an exponential backoff on single, sentinel and cluster helpers, a bad value is refused, a cluster is BullMQ-ready by default, and BullMQHelper quits the connections it opens."
packages: ['@venizia/ignis-helpers']
migration:
  - id: redis-default-retry
    symbols: [maxRetry, RedisSingleHelper, RedisSentinelHelper, RedisClusterHelper]
    upgrade:
      steps:
        - "To keep the helper giving up at once, set maxRetry: 0. The default is now 5, with a backoff that doubles from 1 s to 30 s."
        - "Pass maxRetry as 0, -1 or a positive integer: a negative number other than -1, a fraction or NaN throws when the helper is built."
        - "On a cluster behind BullMQ, remove the maxRetriesPerRequest: null you set in clusterOptions.redisOptions; it is the default now."
    downgrade:
      steps:
        - "Set maxRetry: 0 to get the older no-reconnect default. The older 2 s, 4 s, 5 s delays cannot be restored by configuration; pin the previous version for them."
  - id: bullmq-helper-own-client
    symbols: [BullMQHelper]
    upgrade:
      steps:
        - "No code change. BullMQHelper still gives each queue and worker its own duplicate of the Redis client, and now quits those duplicates in close(). Back BullMQ with a Redis helper whose maxRetry is -1: BullMQ never reconnects a client that ioredis gave up on, and the helper logs an error when that happens."
    downgrade:
      steps:
        - "No app change; the older version leaves each duplicate open after close()."
---

# Changelog - 2026-11-12

## Redis helpers reconnect by default, and BullMQ closes the connections it opens

<Badge type="warning" text="Breaking Change" /> <Badge type="info" text="Bug Fix" />

**In one line.** A Redis restart no longer leaves workers and queues dead until the process restarts, and a `BullMQHelper` no longer leaves one Redis connection behind per queue and worker after `close()`.

## What changed

- **Reconnect by default.** `maxRetry` defaults to `5` on `RedisSingleHelper`, `RedisSentinelHelper` and `RedisClusterHelper`. It was `0`: the helper gave up on the first failed attempt and never reconnected. `0` still means no reconnect, and `-1` reconnects forever.
- **A new backoff.** The wait is exponential from 1 s, doubling, capped at 30 s, with half of each wait randomized (`RedisDefaults.RECONNECT_BACKOFF`, computed by `RetryHelper.computeBackoffDelayMs`). It was 2 s, 4 s, then 5 s.
- **A log when it gives up.** One error line says the helper stopped reconnecting.
- **A bad value is refused.** `maxRetry` must be `0`, `-1` or a positive integer. A negative number other than `-1`, a fraction or `NaN` throws when the helper is built.
- **Cluster parity.** `RedisClusterHelper` takes `maxRetry`, reconnects through `clusterRetryStrategy`, and sets `redisOptions.maxRetriesPerRequest: null` by default, which BullMQ workers need. `clusterOptions` still overrides, and your own `redisOptions` is merged with that default key by key.
- **No leaked connection.** `BullMQHelper` keeps handing each queue and worker a `duplicateClient()`, and now quits it in `close()`. BullMQ never quits a client it is handed, so every duplicate used to stay open.
- **A worker could start without its blocking connection.** Reported on a lazy Redis cluster helper shared by about 25 queues and workers, with the workers built before the cluster was ready: on the shared client some workers never opened their blocking connection and consumed nothing. Handing each queue and worker its own duplicate removes that path. The exact trigger inside BullMQ is not confirmed.
- **A loud error when the connection ends.** BullMQ never reconnects a client that ioredis stopped reconnecting, and no job moves on it. `BullMQHelper` now logs an error when its connection ends for good (not when `close()` ended it). Back BullMQ with a Redis helper whose `maxRetry` is `-1`.
- **`connect()` is safe to call twice.** On a cluster, `connect()` while the client is between `connecting` and `ready` no longer rejects with "already connecting/connected"; it answers `false`, like the other in-flight states.

## Who is affected

- **Apps that relied on no reconnect.** Set `maxRetry: 0`.
- **Apps that set `maxRetry` already.** Nothing changes except the wait between attempts. A value such as `-2` or `1.5` now throws at construction.
- **Apps with a cluster behind BullMQ.** You can remove the `maxRetriesPerRequest: null` you passed in `clusterOptions.redisOptions`; it is the default now, and it survives your own `redisOptions`.
- **Apps with `BullMQHelper`.** No action. Connections no longer pile up across `close()`. Give the Redis helper behind BullMQ `maxRetry: -1`.

## Breaking changes

> [!WARNING]
> The default of `maxRetry` changes from `0` to `5`, and the backoff delays change. An app that needs the helper to give up at once sets `maxRetry: 0`.

See the [Redis helper reference](/extensions/helpers/redis/reference#retry-strategy) and the [queue helper page](/extensions/helpers/queue/#the-redis-connection-requirement).
