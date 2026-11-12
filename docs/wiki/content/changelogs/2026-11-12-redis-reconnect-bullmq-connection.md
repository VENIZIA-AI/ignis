---
title: Redis helpers reconnect by default, and BullMQ no longer leaks a connection per queue
description: "maxRetry defaults to 5 with an exponential backoff on single, sentinel and cluster helpers, a bad value is refused, a cluster is BullMQ-ready by default, and BullMQHelper stops duplicating the Redis client."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-11-12

## Redis helpers reconnect by default, and BullMQ no longer leaks a connection per queue

<Badge type="warning" text="Breaking" /> <Badge type="info" text="Bug Fix" />

**In one line.** A Redis restart no longer leaves workers and queues dead until the process restarts, and a `BullMQHelper` no longer leaves one Redis connection behind per queue and worker.

## What changed

- **Reconnect by default.** `maxRetry` defaults to `5` on `RedisSingleHelper`, `RedisSentinelHelper` and `RedisClusterHelper`. It was `0`: the helper gave up on the first failed attempt and never reconnected. `0` still means no reconnect, and `-1` reconnects forever.
- **A new backoff.** The wait is exponential from 1 s, doubling, capped at 30 s, with half of each wait randomized (`RedisDefaults.RECONNECT_BACKOFF`, computed by `RetryHelper.computeBackoffDelayMs`). It was 2 s, 4 s, then 5 s.
- **A log when it gives up.** One error line says the helper stopped reconnecting.
- **A bad value is refused.** `maxRetry` must be `0`, `-1` or a positive integer. A negative number other than `-1`, a fraction or `NaN` throws when the helper is built.
- **Cluster parity.** `RedisClusterHelper` takes `maxRetry`, reconnects through `clusterRetryStrategy`, and sets `redisOptions.maxRetriesPerRequest: null` by default, which BullMQ workers need. `clusterOptions` still overrides.
- **No leaked connection.** `BullMQHelper` hands the helper's own client to BullMQ instead of `duplicateClient()`. BullMQ never quits a client it is handed, so every duplicate stayed open after `close()`. BullMQ opens and closes its own blocking connection for a worker.

## Who is affected

- **Apps that relied on no reconnect.** Set `maxRetry: 0`.
- **Apps that set `maxRetry` already.** Nothing changes except the wait between attempts. A value such as `-2` or `1.5` now throws at construction.
- **Apps with a cluster behind BullMQ.** Remove the `maxRetriesPerRequest: null` you passed in `clusterOptions.redisOptions`; it is the default now. If you pass your own `redisOptions`, it replaces the default, so keep that field in it.
- **Apps with `BullMQHelper`.** No action. Open connections drop by one per queue and worker.

## Breaking changes

> [!WARNING]
> The default of `maxRetry` changes from `0` to `5`, and the backoff delays change. An app that needs the helper to give up at once sets `maxRetry: 0`.

See the [Redis helper reference](/extensions/helpers/redis/reference#retry-strategy) and the [queue helper page](/extensions/helpers/queue/#the-redis-connection-requirement).
