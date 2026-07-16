---
title: Redis
description: A single data API - get/set, hashes, sets, lists, pub/sub, RedisJSON - across single-node, cluster, and Sentinel topologies
difficulty: intermediate
---

# Redis

The Redis helper gives you one data API that works identically whether you are talking to a single node, a sharded cluster, or a Sentinel-managed high-availability pair.

## In one example

Construct a single-node helper and round-trip a value through it.

```typescript
import { RedisSingleHelper } from '@venizia/ignis-helpers';

const redis = new RedisSingleHelper({
  name: 'cache',
  host: 'localhost',
  port: 6379,
  password: 'secret',
});

await redis.set({ key: 'session:42', value: { userId: 42, active: true } });

const session = await redis.getObject<{ userId: number; active: boolean }>({
  key: 'session:42',
});
console.log(session); // { userId: 42, active: true }
```

`autoConnect` defaults to `true`, so the client starts connecting inside the constructor - no explicit `connect()` call needed for this example.

## How it works

- **Three topologies, one interface.** `RedisSingleHelper`, `RedisClusterHelper`, and `RedisSentinelHelper` all extend `AbstractRedisHelper` and implement `IRedisHelper`. Only the constructor options differ - the data API (`get`, `hSet`, `publish`, ...) is identical, so code written against `IRedisHelper` works with any topology unchanged.

| Topology | Class | Fits |
|----------|-------|------|
| Single node | `RedisSingleHelper` | One Redis instance |
| Cluster | `RedisClusterHelper` | Data sharded across nodes |
| Sentinel | `RedisSentinelHelper` | Automatic failover for one logical master |

- **Pick a topology via the factory.** `createRedisHelper({ mode })` picks a topology from configuration - it is overloaded to return the concrete class when `mode` is a literal (`RedisModes.SINGLE | CLUSTER | SENTINEL`).
- **Connection lifecycle is automatic.** With `autoConnect: true` (default) the ioredis client starts connecting in the constructor; with `autoConnect: false` you call `connect()` yourself.
- **Reconnects back off automatically.** The backoff grows with each attempt, capped between 1 and 5 seconds, up to `maxRetry` attempts (`0` = unlimited, the default; `-1` = no retry).
- **BullMQ compatibility differs by topology.** `maxRetriesPerRequest: null` is always set for single and Sentinel helpers, which is what makes them BullMQ-compatible out of the box. Cluster does not get this automatically - see the [Full reference](/extensions/helpers/redis/reference).
- **Values are JSON-serialized automatically.** `set`, `mSet`, `jSet`, and `jPush` call `JSON.stringify` before writing; `getObject`, `getObjects`, and `jGet` parse on read. Plain `get`/`mGet` return the raw stored string unless you pass a `transform` function - reach for `getObject`/`getObjects` when you wrote the value with `set`.
- **Every method is camelCase.** `hSet`, `lPush`, `sAdd` - even where the underlying ioredis/Redis command is lowercase (`hset`, `lpush`, `sadd`). There is no lowercase alias.

## Common tasks

### Pick a topology

Switch topology by changing `mode` and its matching options; the rest of your code does not change.

```typescript
import { createRedisHelper, RedisModes, type IRedisHelper } from '@venizia/ignis-helpers';

const redis: IRedisHelper = createRedisHelper({
  mode: RedisModes.SINGLE, // or RedisModes.CLUSTER / RedisModes.SENTINEL
  name: 'app-cache',
  host: process.env.REDIS_HOST!,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD!,
});
```

See [Full reference](/extensions/helpers/redis/reference) for the cluster (`nodes`) and Sentinel (`sentinels`, `masterName`) constructor shapes.

### Cache a value with a TTL

`options.expiresIn` on `set` is in **milliseconds**, but `ttl()` reports remaining time in **seconds** - mixing the two up is the most common bug with this helper.

```typescript
await redis.set({
  key: 'session:42',
  value: { userId: 42 },
  options: { expiresIn: 60_000 }, // 60 seconds
});

const remaining = await redis.ttl({ key: 'session:42' }); // seconds; -1 = no expiry, -2 = missing
```

### Publish and subscribe

A subscribed ioredis connection cannot run regular commands, so use a second helper instance for subscribing and keep the first for data operations.

```typescript
const subscriber = new RedisSingleHelper({ name: 'sub', host: 'localhost', port: 6379, password: 'secret' });

subscriber.subscribe({ topic: 'events' });
subscriber.getClient().on('message', (channel, message) => {
  console.log(channel, JSON.parse(message.toString()));
});

await redis.publish({ topics: ['events'], payload: { type: 'user.created' } });
```

### Hashes, sets, and lists

Same key convention, one method family per data structure.

```typescript
await redis.hSet({ key: 'user:42', value: { name: 'Ada', role: 'admin' } });
const role = await redis.hGet({ key: 'user:42', field: 'role' });

await redis.sAdd({ key: 'tags:42', members: ['vip', 'beta'] });
await redis.lPush({ key: 'queue:emails', values: ['welcome@example.com'] });
```

### Drop to a raw command

`execute` calls any ioredis command directly - useful for commands the typed API does not cover, like `SCAN` (prefer it over `keys()` in production, which blocks the server on large keyspaces).

```typescript
const [cursor, matched] = await redis.execute<[string, string[]]>('SCAN', [
  0,
  'MATCH',
  'user:*',
  'COUNT',
  100,
]);
```

## See also

- [Full reference](/extensions/helpers/redis/reference) - every method group, topology option, and lifecycle event
- [Queue Helper](/extensions/helpers/queue/) - `BullMQHelper` uses a Redis helper as its connection backend
- [Socket.IO Component](/extensions/components/socket-io/) - resolves an `AbstractRedisHelper` and calls `duplicateClient()` for its pub/sub adapter
- [Authorization Component](/extensions/components/authorization/) - the cached Casbin enforcer uses the helper's `get`/`set`/`del`
- [Migrating to the new Redis Helper API](/guides/migrations/redis-helpers-migration) - renames and breaking changes from the pre-refactor API

**Files:**

- [`packages/helpers/src/modules/redis/base/abstract.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/base/abstract.helper.ts) - `AbstractRedisHelper`, the shared data API
- [`packages/helpers/src/modules/redis/single/single.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/single/single.helper.ts) - `RedisSingleHelper`
- [`packages/helpers/src/modules/redis/cluster/cluster.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/cluster/cluster.helper.ts) - `RedisClusterHelper`
- [`packages/helpers/src/modules/redis/sentinel/sentinel.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/sentinel/sentinel.helper.ts) - `RedisSentinelHelper`
- [`packages/helpers/src/modules/redis/factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/factory.ts) - `createRedisHelper` factory
