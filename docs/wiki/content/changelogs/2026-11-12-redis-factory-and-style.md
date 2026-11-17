---
title: Redis factory has one method per topology, and a few helper types are stricter
description: "RedisHelperFactory.create({ mode }) is replaced by RedisHelperFactory.single, .cluster and .sentinel; the unused Redis user option, RedisModes and some isValid/SCHEME_SET statics are removed; a few helper types use unknown instead of any."
packages: ['@venizia/ignis-helpers']
migration:
  - id: redis-factory-per-topology
    symbols: [RedisHelperFactory.create, RedisModes, TRedisMode, TCreateRedisHelperOptions]
    upgrade:
      before: |
        const redis = RedisHelperFactory.create({
          mode: RedisModes.SINGLE,
          name: 'cache',
          host: '127.0.0.1',
          port: 6379,
        });
      after: |
        const redis = RedisHelperFactory.single({
          name: 'cache',
          host: '127.0.0.1',
          port: 6379,
        });
    downgrade:
      steps:
        - "Call RedisHelperFactory.create({ mode, ...options }) with RedisModes.SINGLE, CLUSTER or SENTINEL instead of single, cluster or sentinel."
        - "Keep your own mode constants if you removed RedisModes from your code."
  - id: redis-single-user-option
    symbols: [RedisSingleHelper]
    upgrade:
      steps:
        - "Remove the user option from RedisSingleHelper options; it was never read. Set the credential with password."
    downgrade:
      steps:
        - "Nothing to undo: the older version accepts user and ignores it."
  - id: bullmq-helper-type-arguments
    symbols: [BullMQHelper]
    upgrade:
      before: |
        const queue: BullMQHelper<unknown, unknown> = new BullMQHelper<TElement, unknown>({ ... });
        onWorkerData: (job: Job<TElement>) => Promise<void>,
      after: |
        const queue = new BullMQHelper<TElement, TResult>({ ... });
        onWorkerData: (job: Job<TElement, TResult>) => Promise<TResult>,
    downgrade:
      steps:
        - "Types only. Restore the any defaults by leaving the type arguments off; handlers keep compiling against the older any callbacks."
---

# Changelog - 2026-11-12

## Redis factory has one method per topology, and a few helper types are stricter

<Badge type="warning" text="Breaking Change" />

**In one line.** Pick a Redis topology by calling `RedisHelperFactory.single`, `.cluster` or `.sentinel`; each takes the options of its own topology and returns its own helper class.

## What changed

- **One method per topology.** `RedisHelperFactory.create({ mode, ... })` is gone. Call `single(opts)`, `cluster(opts)` or `sentinel(opts)` with the same options you passed before, without `mode`.
- **`RedisModes` and `TRedisMode` are removed.** Nothing selects a topology by a mode string any more.
- **The Redis `user` option is removed.** `RedisSingleHelper` accepted it and never used it. Set the credential with `password`.
- **Unused `isValid` and `SCHEME_SET` statics are removed** from `S3Audiences`, `QueueStatuses`, `BullQueueRoles`, `KafkaHealthStatuses`, `KafkaBrokersDownReasons`, `FetcherVariants`, `UrlSchemes`, `TcpClientStates`, `MimeTypes`, `DataTypes`, `FieldMappingDataTypes` and `RedisSentinelRoles`. The constant values do not change.
- **Stricter types.** `IUploadFile` and `IObjectMetadata` index signatures, `IUploadResult.metaLink.data`, the `options` of `IStorageHelper.getObject`, and the `BullMQHelper` default generics and worker callbacks use `unknown` instead of `any`. `onWorkerData` now returns `Promise<TQueueResult>`.

## Who is affected

- **Apps that call `RedisHelperFactory.create`.** Rename the call as shown below.
- **Apps that pass `user` to `RedisSingleHelper`.** Remove it; it had no effect.
- **Apps that read `RedisModes`, `TRedisMode` or one of the removed statics.** Use the topology method, or compare against the constant values you need.
- **Apps that read an extra field of an `IUploadFile` or `IObjectMetadata`.** The value is now `unknown`; narrow it.
- **Apps that use `BullMQHelper`.** Types only, but breaking: a helper typed `BullMQHelper<TElement, unknown>` no longer assigns to `BullMQHelper<unknown, unknown>`, and a handler `(job: Job<X>) => Promise<void>` no longer fits the `unknown` defaults. Pass explicit type arguments `BullMQHelper<TElement, TResult>` with handlers `(job: Job<TElement, TResult>) => Promise<TResult>`. Do not widen to `<unknown, unknown>`; no cast is needed.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> `RedisHelperFactory.create` no longer exists, so code that calls it does not compile. The `namespace-functions` codemod does not rewrite `createRedisHelper` either: the right method depends on the topology, so change the call by hand.

**Before:**

```typescript
import { RedisHelperFactory, RedisModes } from '@venizia/ignis-helpers';

const redis = RedisHelperFactory.create({
  mode: RedisModes.SINGLE,
  name: 'cache',
  host: '127.0.0.1',
  port: 6379,
});
```

**After:**

```typescript
import { RedisHelperFactory } from '@venizia/ignis-helpers';

const redis = RedisHelperFactory.single({
  name: 'cache',
  host: '127.0.0.1',
  port: 6379,
});
```

See the [Redis helper reference](/extensions/helpers/redis/reference#selecting-a-topology-the-factory).
