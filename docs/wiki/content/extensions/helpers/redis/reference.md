---
title: Redis - Full Reference
description: Complete reference for the Redis helper class hierarchy, all three topology constructors, the full data API, lifecycle events, and framework integrations
difficulty: intermediate
---

# Redis - Full Reference

Exhaustive reference for `AbstractRedisHelper`, the three topology classes, the `createRedisHelper` factory, and every data-API method. For a readable introduction and the common tasks, start with the [Redis overview](/extensions/helpers/redis/).

Backed by **ioredis** under the hood.

**Files:**

- [`packages/helpers/src/modules/redis/base/abstract.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/base/abstract.helper.ts) - `AbstractRedisHelper`
- [`packages/helpers/src/modules/redis/single/single.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/single/single.helper.ts) - `RedisSingleHelper`
- [`packages/helpers/src/modules/redis/cluster/cluster.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/cluster/cluster.helper.ts) - `RedisClusterHelper`
- [`packages/helpers/src/modules/redis/sentinel/sentinel.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/sentinel/sentinel.helper.ts) - `RedisSentinelHelper`
- [`packages/helpers/src/modules/redis/factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/factory.ts) - `createRedisHelper` factory
- [`packages/helpers/src/modules/redis/common/interfaces.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/common/interfaces.ts) - `IRedisHelper` and its nine capability interfaces
- [`packages/helpers/src/modules/redis/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/common/types.ts) - option and callback types
- [`packages/helpers/src/modules/redis/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/common/constants.ts) - `RedisModes`, `RedisSentinelRoles`

## Find what you need

| You want to | Go to |
|---|---|
| See the class hierarchy and the nine capability interfaces | [Class and Interface Model](#class-and-interface-model) |
| Construct a single-node client | [Construction - Single](#construction---single) |
| Construct a cluster client | [Construction - Cluster](#construction---cluster) |
| Construct a Sentinel client, or understand Sentinel HA | [Construction - Sentinel](#construction---sentinel) |
| Pick a topology from configuration instead of hardcoding a class | [Selecting a Topology - the Factory](#selecting-a-topology---the-factory) |
| Understand `autoConnect`, the four lifecycle callbacks, or `duplicateClient()` | [Lifecycle and Events](#lifecycle-and-events) |
| Look up a method's signature and behavior | [Full Method Reference](#full-method-reference) |
| Wire the helper into BullMQ, Socket.IO, WebSocket, or Casbin | [Using the Helper Across IGNIS](#using-the-helper-across-ignis) |
| Avoid a production footgun | [Production Notes](#production-notes) |
| Copy the full import list | [Import Reference](#import-reference) |

## Class and Interface Model

### Class hierarchy

| Class | Extends | Notes |
|-------|---------|-------|
| `AbstractRedisHelper` | `BaseHelper` | Base class; implements `IRedisHelper`; never constructed directly |
| `RedisSingleHelper` | `AbstractRedisHelper` | ioredis `Redis` client; returns `Redis` from `getClient()` |
| `RedisClusterHelper` | `AbstractRedisHelper` | ioredis `Cluster` client; returns `Cluster` from `getClient()` |
| `RedisSentinelHelper` | `AbstractRedisHelper` | ioredis `Redis` client (Sentinel mode); returns `Redis` from `getClient()` |

> [!TIP] Typing rule
> Declare parameters and bindings as `IRedisHelper`. Use `instanceof AbstractRedisHelper` for runtime topology checks. Never type-check against the concrete subclasses unless you need topology-specific behavior.

### TRedisClient

```typescript
type TRedisClient = Redis | Cluster; // ioredis
```

`RedisSingleHelper` and `RedisSentinelHelper` return a `Redis` instance. `RedisClusterHelper` returns a `Cluster` instance. Both satisfy `TRedisClient`.

### IRedisHelper and its nine capability interfaces

`Source ->` [`packages/helpers/src/modules/redis/common/interfaces.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/common/interfaces.ts)

`IRedisHelper` extends all nine of the following:

| Interface | Responsibility |
|-----------|----------------|
| `IRedisConnection` | Connection lifecycle - `connect`, `disconnect`, `ping`, `getClient`, `duplicateClient` |
| `IRedisKey` | Key TTL and counters - `exists`, `expire`, `expireAt`, `ttl`, `persist`, `incr`/`decr` variants |
| `IRedisKeyValue` | String key-value - `get`, `set`, `del`, `keys`, `getString(s)`, `getObject(s)`, `mSet`, `mGet` |
| `IRedisHash` | Hash maps - `hSet`, `hGetAll`, `hGet`, `hDel`, `hExists`, `hKeys`, `hVals`, `hIncrBy`, `hLen` |
| `IRedisSet` | Sets - `sAdd`, `sRem`, `sMembers`, `sIsMember`, `sCard` |
| `IRedisList` | Lists - `lPush`, `rPush`, `lPop`, `rPop`, `lRange`, `lLen` |
| `IRedisPubSub` | Pub/Sub with optional zlib compression - `publish`, `subscribe`, `unsubscribe` |
| `IRedisJson` | RedisJSON module operations - `jSet`, `jGet`, `jDelete`, `jNumberIncreaseBy`, `jStringAppend`, `jPush`, `jPop` |
| `IRedisCommand` | Raw escape hatch - `execute(command, params?)` |

## Construction - Single

`Source ->` [`packages/helpers/src/modules/redis/single/single.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/single/single.helper.ts)

```typescript
import { RedisSingleHelper } from '@venizia/ignis-helpers';

const redis = new RedisSingleHelper({
  name: 'cache',
  host: 'localhost',
  port: 6379,
  password: 'secret',
  database: 0,
  autoConnect: true,
  maxRetry: 5,

  onInitialized: ({ name, helper }) => {
    console.log(`[${name}] initialized`);
  },
  onConnected: ({ name }) => {
    console.log(`[${name}] connected`);
  },
  onReady: ({ name }) => {
    console.log(`[${name}] ready`);
  },
  onError: ({ name, error }) => {
    console.error(`[${name}] error`, error);
  },
});
```

### IRedisSingleHelperOptions

Combines `IRedisSingleHelperProps` and `IRedisHelperCallbacks`.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | `string` | Yes | - | Helper identifier used in logs and as `IRedisHelper.name` |
| `host` | `string` | Yes | - | Redis server hostname |
| `port` | `string \| number` | Yes | - | Redis server port |
| `user` | `string` | No | - | Accepted by the type but not read by the constructor - has no effect. Set auth via `password` only. |
| `password` | `string` | Yes | - | Redis `requirepass` value |
| `database` | `number` | No | `0` | Redis database index (0-15) |
| `autoConnect` | `boolean` | No | `true` | Connect immediately; `false` uses ioredis `lazyConnect` |
| `maxRetry` | `number` | No | `0` | Max reconnect attempts; `0` = unlimited; `-1` = no retry |
| `onInitialized` | `(opts: { name: string; helper: IRedisHelper }) => void` | No | - | Fired synchronously after construction |
| `onConnected` | `(opts: { name: string; helper: IRedisHelper }) => void` | No | - | Fired on TCP connection established |
| `onReady` | `(opts: { name: string; helper: IRedisHelper }) => void` | No | - | Fired when client is ready for commands |
| `onError` | `(opts: { name: string; helper: IRedisHelper; error: unknown }) => void` | No | - | Fired on connection or command errors |

### Retry strategy

- **Backoff formula.** `Math.max(Math.min(attempt * 2000, 5000), 1000)` - starting at 1 s, capped at 5 s.
- **Stop condition.** Reconnect stops when `attempt > maxRetry` (if `maxRetry > -1`).
- **BullMQ requirement.** The framework always sets `maxRetriesPerRequest: null` internally, which BullMQ requires.

## Construction - Cluster

`Source ->` [`packages/helpers/src/modules/redis/cluster/cluster.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/cluster/cluster.helper.ts)

```typescript
import { RedisClusterHelper } from '@venizia/ignis-helpers';

const cluster = new RedisClusterHelper({
  name: 'cache-cluster',
  nodes: [
    { host: 'redis-node-1', port: 7000 },
    { host: 'redis-node-2', port: 7001 },
    { host: 'redis-node-3', port: 7002 },
  ],
  clusterOptions: {
    redisOptions: { password: 'cluster-password' },
  },
  onReady: ({ name }) => {
    console.log(`[${name}] cluster ready`);
  },
});
```

### IRedisClusterHelperOptions

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | `string` | Yes | - | Helper identifier |
| `nodes` | `Array<{ host: string; port: string \| number; password?: string }>` | Yes | - | Startup nodes - ioredis discovers the rest |
| `clusterOptions` | `ClusterOptions` | No | - | Passed verbatim to `new Cluster(nodes, clusterOptions)` |
| `onInitialized` / `onConnected` / `onReady` / `onError` | callbacks | No | - | Same shape as single |

> [!WARNING] No framework defaults injected
> Cluster does not apply the backoff retry strategy or `maxRetriesPerRequest: null` automatically. Pass those inside `clusterOptions.redisOptions` if your consumers (e.g. BullMQ) require them.

`duplicateClient()` on a cluster creates a **new** `Cluster` instance from the same startup nodes and options. ioredis `Cluster` doesn't implement `.duplicate()`, so the helper builds a fresh instance instead.

## Construction - Sentinel

`Source ->` [`packages/helpers/src/modules/redis/sentinel/sentinel.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/sentinel/sentinel.helper.ts)

### What Redis Sentinel is

Redis Sentinel is a high-availability (HA) architecture made of three process types:

```
  +------------------+      monitors      +--------------------+
  |  Sentinel (1)    |<------------------>|  Master (primary)  |
  +------------------+                    +--------------------+
  +------------------+         replication        |
  |  Sentinel (2)    |              +--------------+
  +------------------+              v
  +------------------+      +--------------------+
  |  Sentinel (3)    |      |  Replica (standby) |
  +------------------+      +--------------------+
```

- **Sentinels** form a quorum (typically 3 processes). They monitor the master, agree by majority vote when it is down, and promote a replica to master (failover).
- **Master** accepts all writes.
- **Replicas** replicate from master and serve reads when `role: 'slave'` is set.

### Why your app connects to sentinels, not the master

- **The master's address can change after a failover.** Hard-coding a master host would break on every failover.
- **You give ioredis the sentinel addresses instead**, plus the monitored master group name (`masterName`). ioredis asks a sentinel for the current master, then connects to it.
- **ioredis re-queries sentinels automatically after a failover** - no manual reconnection logic needed.
- **Your application code does not change during a failover.** The only observable effect is a few seconds of transient command failures. The retry strategy handles those.

### Constructor

```typescript
import { RedisSentinelHelper } from '@venizia/ignis-helpers';

const redis = new RedisSentinelHelper({
  name: 'ha-cache',          // helper identifier (logging/scope)
  masterName: 'mymaster',    // group name in sentinel.conf "sentinel monitor mymaster ..."
  sentinels: [
    { host: '10.0.0.1', port: 26379 },
    { host: '10.0.0.2', port: 26379 },
    { host: '10.0.0.3' },   // port defaults to 26379
  ],
  role: 'master',            // 'master' (default) or 'slave'
  password: 'data-secret',   // master/replica requirepass
  sentinelPassword: 'sentinel-secret', // sentinel.conf requirepass
  database: 0,
  autoConnect: true,
  maxRetry: 5,
});
```

### IRedisSentinelHelperOptions

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | `string` | Yes | - | Helper identifier (logs, `IRedisHelper.name`) |
| `masterName` | `string` | Yes | - | Sentinel-monitored master group name - maps to ioredis `name` |
| `sentinels` | `Array<{ host: string; port?: string \| number }>` | Yes | - | Sentinel process addresses |
| `role` | `TRedisSentinelRole` (`RedisSentinelRoles.MASTER \| SLAVE`) | No | `RedisSentinelRoles.MASTER` | Connect to master (writes) or a replica (reads) |
| `password` | `string` | No | - | Data-node `requirepass` (master and replicas) |
| `sentinelPassword` | `string` | No | - | Sentinel-process `requirepass` |
| `sentinelUsername` | `string` | No | - | Sentinel ACL username |
| `database` | `number` | No | `0` | Redis database index |
| `autoConnect` | `boolean` | No | `true` | Connect immediately |
| `maxRetry` | `number` | No | `0` | Max reconnect attempts |
| `redisOptions` | `Partial<RedisOptions>` | No | - | Extra ioredis options; first-class fields above always override matching keys here |
| `onInitialized` / `onConnected` / `onReady` / `onError` | callbacks | No | - | Same shape as single |

### Field clarity - name vs masterName

This is the most common source of confusion:

| Field | What it is | Where it goes |
|-------|-----------|---------------|
| `name` | The helper's own identifier used for logging and `IRedisHelper.name` | `AbstractRedisHelper` identifier |
| `masterName` | The master group being monitored by Sentinel processes, matching `sentinel monitor <name> ...` in sentinel.conf | Maps to ioredis `name` option |

They are independent. You can name the helper `'ha-cache'` while `masterName` is `'mymaster'`.

### The authentication model - 4 relationships

Sentinel deployments have four separate authentication relationships. The app configures two of them. The other two are server-side.

| # | From | To | App field | Server config |
|---|------|----|-----------|---------------|
| 1 | **App** | **Sentinel processes** | `sentinelPassword` | `requirepass` in sentinel.conf |
| 2 | **App** | **Data nodes** (master/replica) | `password` | `requirepass` in redis.conf |
| 3 | **Sentinel** | **Data nodes** | (not set by app) | `sentinel auth-pass <group> <pass>` in sentinel.conf |
| 4 | **Replica** | **Master** (replication) | (not set by app) | `masterauth` in redis.conf |

**Relationship 3 is the silent failure.** If the data nodes require a password but `sentinel.conf` has no `sentinel auth-pass`, the sentinel processes can't check master health. They trigger false failovers instead. Configure `sentinel auth-pass` on the server side, even when your app sets only `password`.

**Common cases:**
- Private network, sentinels unauthenticated: set only `password`.
- Fully secured cluster: set both `password` and `sentinelPassword`; configure relationships 3 and 4 on the servers.

### Failover behavior

When the master fails:

1. Sentinels reach quorum and promote a replica.
2. ioredis detects the master change via sentinel notification.
3. ioredis reconnects to the new master transparently.
4. Any in-flight commands during the few-second window may fail transiently - the retry strategy retries them.
5. **Your application code does not change.** The same `RedisSentinelHelper` instance continues to work after failover.

### Local testing with Docker Compose

The following Compose file starts a master, one replica, and one sentinel with full authentication. It demonstrates all four relationships.

```yaml
version: '3.8'

services:
  redis-master:
    image: redis:7-alpine
    command: redis-server --requirepass data-secret --masterauth data-secret
    ports:
      - '6379:6379'

  redis-replica:
    image: redis:7-alpine
    command: >
      redis-server
      --requirepass data-secret
      --masterauth data-secret
      --replicaof redis-master 6379
    depends_on:
      - redis-master

  redis-sentinel:
    image: redis:7-alpine
    command: >
      sh -c "
        echo 'sentinel monitor mymaster redis-master 6379 1' > /sentinel.conf &&
        echo 'sentinel auth-pass mymaster data-secret' >> /sentinel.conf &&
        echo 'sentinel down-after-milliseconds mymaster 3000' >> /sentinel.conf &&
        echo 'sentinel failover-timeout mymaster 10000' >> /sentinel.conf &&
        echo 'requirepass sentinel-secret' >> /sentinel.conf &&
        redis-sentinel /sentinel.conf
      "
    ports:
      - '26379:26379'
    depends_on:
      - redis-master
      - redis-replica
```

Connect and verify failover:

```typescript
import { RedisSentinelHelper } from '@venizia/ignis-helpers';

const redis = new RedisSentinelHelper({
  name: 'test',
  masterName: 'mymaster',
  sentinels: [{ host: 'localhost', port: 26379 }],
  password: 'data-secret',
  sentinelPassword: 'sentinel-secret',
  onReady: ({ name }) => console.log(`[${name}] ready`),
});

await redis.set({ key: 'hello', value: 'world' });
const val = await redis.getObject({ key: 'hello' });
console.log(val); // "world"

// Stop the master container - wait ~5 s - the replica is promoted.
// The same redis instance will reconnect automatically and continue working.
```

## Selecting a Topology - the Factory

`Source ->` [`packages/helpers/src/modules/redis/factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/factory.ts)

`createRedisHelper` is an overloaded factory that returns the concrete type when `mode` is a literal.

```typescript
import { createRedisHelper, RedisModes } from '@venizia/ignis-helpers';

// Type inferred as RedisSingleHelper
const single = createRedisHelper({
  mode: RedisModes.SINGLE,
  name: 'cache',
  host: process.env.REDIS_HOST!,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD!,
});

// Type inferred as RedisSentinelHelper
const sentinel = createRedisHelper({
  mode: RedisModes.SENTINEL,
  name: 'cache-ha',
  masterName: 'mymaster',
  sentinels: [{ host: process.env.SENTINEL_HOST! }],
  password: process.env.REDIS_PASSWORD!,
});
```

Switch by environment:

```typescript
import { createRedisHelper, RedisModes, type IRedisHelper } from '@venizia/ignis-helpers';

const mode = (process.env.REDIS_MODE ?? RedisModes.SINGLE) as typeof RedisModes.SINGLE;

const redis: IRedisHelper = createRedisHelper({
  mode,
  name: 'app-cache',
  host: process.env.REDIS_HOST!,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD!,
});
```

| `mode` value | Returns |
|---|---|
| `RedisModes.SINGLE` (`'single'`) | `RedisSingleHelper` |
| `RedisModes.CLUSTER` (`'cluster'`) | `RedisClusterHelper` |
| `RedisModes.SENTINEL` (`'sentinel'`) | `RedisSentinelHelper` |

Unknown mode throws an `ApplicationError`.

## Lifecycle and Events

`Source ->` [`packages/helpers/src/modules/redis/base/abstract.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/base/abstract.helper.ts)

### autoConnect and manual connect

When `autoConnect: true` (default), the ioredis client starts connecting immediately in the constructor. When `autoConnect: false`, ioredis uses `lazyConnect` mode and you must call `connect()` explicitly before issuing commands.

```typescript
// Lazy connect
const redis = new RedisSingleHelper({
  name: 'cache',
  host: 'localhost',
  port: 6379,
  password: 'secret',
  autoConnect: false,
});

await redis.connect(); // resolves true when status === 'ready'
```

### Connection methods

| Method | Behavior |
|--------|----------|
| `connect()` | Resolves `false` (no-op) if status is `ready`, `reconnecting`, or `connecting`; otherwise calls ioredis `connect()` and resolves `true` when status reaches `ready` |
| `disconnect()` | Resolves `false` (no-op) if status is `end` or `close`; otherwise sends `QUIT` and resolves `true` on `'OK'` |
| `ping()` | Sends `PING`; returns `'PONG'` |

### The four lifecycle callbacks

All helpers accept `IRedisHelperCallbacks`:

| Callback | Fired when | ioredis event |
|----------|-----------|---------------|
| `onInitialized` | Synchronously at the end of the constructor | - |
| `onConnected` | TCP connection is established | `connect` |
| `onReady` | Client is ready to accept commands | `ready` |
| `onError` | A connection or command error occurs | `error` |

The client also logs a `WARN` internally on `reconnecting` events (not surfaced as a callback).

### duplicateClient

```typescript
const dedicated = redis.duplicateClient();
```

- **Creates an independent ioredis connection** from the same configuration.
- **Implementation.** `AbstractRedisHelper.duplicateClient()` calls ioredis `client.duplicate()`. That copies the parent's `options`, including `lazyConnect`.
- **Lazy or immediate.** `lazyConnect` is set to `!autoConnect`. With the default `autoConnect: true`, the duplicate connects immediately (`lazyConnect: false`). With `autoConnect: false`, the duplicate is lazy - it connects on first use.
- **When to use it.** Whenever a consumer needs its own dedicated connection - Pub/Sub, BullMQ, Socket.IO adapters.
- **Cluster is different.** For `RedisClusterHelper`, `duplicateClient()` builds a new `Cluster` from the same startup nodes and options instead. ioredis `Cluster` has no `.duplicate()`.

## Full Method Reference

`Source ->` [`packages/helpers/src/modules/redis/common/interfaces.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/common/interfaces.ts) (signatures) and [`packages/helpers/src/modules/redis/base/abstract.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/base/abstract.helper.ts) (behavior)

### General notes (apply to all families)

- **Empty-input no-ops.** `keys`, `members`, `values`, `fields`, and `payload` are all array inputs. Pass an empty array and the method returns immediately, without calling ioredis - `0`, `[]`, or (for `mSet`) `void`, depending on the method. This avoids the "wrong number of arguments" error ioredis throws on empty varargs.
- **Boolean mapping.** `expire`, `expireAt`, `persist`, `hExists`, and `sIsMember` map ioredis numeric replies to `true` (`=== 1`) or `false`.
- **JSON auto-serialization.**

  | Method group | Behavior |
  |---|---|
  | `set`, `mSet`, `jSet`, `jPush` | `JSON.stringify` before writing |
  | `getObject`, `getObjects`, `jGet` | `JSON.parse` on read |
  | `get`, `mGet` | Return the raw string, unless you pass `transform` |

- **TTL units differ by field.**

  | Field | Unit | ioredis command |
  |---|---|---|
  | `set.options.expiresIn` | milliseconds | `PX` |
  | `expire.seconds` | seconds | `EXPIRE` |
  | `expireAt.atEpochSeconds` | Unix epoch seconds | `EXPIREAT` |

- **Pub/Sub errors.** On a subscription callback error, the helper logs the error and returns. It never throws - throwing inside an ioredis async callback would be an unhandled rejection.

### IRedisConnection - connection lifecycle

| Method | Signature | Behavior |
|--------|-----------|----------|
| `getClient` | `(): TRedisClient` | Returns the raw ioredis `Redis` or `Cluster` instance |
| `duplicateClient` | `(): TRedisClient` | Creates an independent ioredis connection (same config, separate socket) |
| `ping` | `(): Promise<string>` | Sends `PING`; returns `'PONG'` on success |
| `connect` | `(): Promise<boolean>` | Connects the client; resolves `false` if already connected/connecting/ready |
| `disconnect` | `(): Promise<boolean>` | Graceful `QUIT`; resolves `false` if already ended/closed |

### IRedisKey - key lifecycle and counters

| Method | Signature | Behavior |
|--------|-----------|----------|
| `exists` | `(opts: { keys: string[] }): Promise<number>` | Returns the count of keys that exist; empty `keys` returns `0` without calling Redis |
| `expire` | `(opts: { key: string; seconds: number }): Promise<boolean>` | Sets expiry in seconds; `true` if applied |
| `expireAt` | `(opts: { key: string; atEpochSeconds: number }): Promise<boolean>` | Sets expiry at an epoch second timestamp; `true` if applied |
| `ttl` | `(opts: { key: string }): Promise<number>` | Returns remaining TTL in seconds; `-1` = no expiry; `-2` = key missing |
| `persist` | `(opts: { key: string }): Promise<boolean>` | Removes expiry; `true` if the timeout was removed |
| `incr` | `(opts: { key: string }): Promise<number>` | Atomically increments integer at key by 1; returns new value |
| `decr` | `(opts: { key: string }): Promise<number>` | Atomically decrements integer at key by 1; returns new value |
| `incrBy` | `(opts: { key: string; value: number }): Promise<number>` | Atomically increments by `value`; returns new value |
| `decrBy` | `(opts: { key: string; value: number }): Promise<number>` | Atomically decrements by `value`; returns new value |

### IRedisKeyValue - string key-value

| Method | Signature | Behavior |
|--------|-----------|----------|
| `set<T>` | `(opts: { key: string; value: T; options?: { log?: boolean; expiresIn?: number } }): Promise<void>` | JSON-serializes `value` and writes it; `expiresIn` is in **milliseconds** (uses `PX`); `log: true` emits an info log |
| `get<T>` | `(opts: { key: string; transform?: (input: string) => T }): Promise<T \| null>` | Returns raw string or applies `transform`; `null` if key missing |
| `del` | `(opts: { keys: string[] }): Promise<number>` | Deletes one or more keys; empty `keys` returns `0` |
| `keys` | `(opts: { key: string }): Promise<string[]>` | Runs Redis `KEYS` with a glob pattern; avoid on large keyspaces - prefer `SCAN` via `execute` |
| `getString` | `(opts: { key: string }): Promise<string \| null>` | Alias for `get` without transform |
| `getStrings` | `(opts: { keys: string[] }): Promise<(string \| null)[]>` | Alias for `mGet` without transform |
| `getObject<T>` | `(opts: { key: string }): Promise<T \| null>` | `get` with `JSON.parse` transform |
| `getObjects` | `(opts: { keys: string[] }): Promise<(unknown \| null)[]>` | `mGet` with `JSON.parse` transform |
| `mSet<T>` | `(opts: { payload: Array<{ key: string; value: T }>; options?: { log?: boolean } }): Promise<void>` | Bulk write; each value is JSON-serialized; empty `payload` is a no-op |
| `mGet<T>` | `(opts: { keys: string[]; transform?: (input: string) => T }): Promise<(T \| null)[]>` | Bulk read with optional transform; empty `keys` returns `[]` |

### IRedisHash - hash maps

| Method | Signature | Behavior |
|--------|-----------|----------|
| `hSet<T>` | `(opts: { key: string; value: T; options?: { log?: boolean } }): Promise<number>` | Sets all fields in a hash object; returns number of **new** fields added |
| `hGetAll` | `(opts: { key: string; transform?: <T, R>(input: T) => R }): Promise<unknown>` | Returns all fields and values of a hash; applies optional transform |
| `hGet` | `(opts: { key: string; field: string }): Promise<string \| null>` | Returns the value of a single hash field |
| `hDel` | `(opts: { key: string; fields: string[] }): Promise<number>` | Deletes one or more hash fields; empty `fields` returns `0` |
| `hExists` | `(opts: { key: string; field: string }): Promise<boolean>` | `true` if the field exists in the hash |
| `hKeys` | `(opts: { key: string }): Promise<string[]>` | Returns all field names in the hash |
| `hVals` | `(opts: { key: string }): Promise<string[]>` | Returns all field values in the hash |
| `hIncrBy` | `(opts: { key: string; field: string; value: number }): Promise<number>` | Atomically increments a numeric hash field; returns new value |
| `hLen` | `(opts: { key: string }): Promise<number>` | Returns the number of fields in the hash |

### IRedisSet - sets

| Method | Signature | Behavior |
|--------|-----------|----------|
| `sAdd` | `(opts: { key: string; members: Array<string \| number> }): Promise<number>` | Adds members to a set; returns count of new members; empty `members` returns `0` |
| `sRem` | `(opts: { key: string; members: Array<string \| number> }): Promise<number>` | Removes members from a set; returns count removed; empty `members` returns `0` |
| `sMembers` | `(opts: { key: string }): Promise<string[]>` | Returns all members of the set |
| `sIsMember` | `(opts: { key: string; member: string \| number }): Promise<boolean>` | `true` if `member` belongs to the set |
| `sCard` | `(opts: { key: string }): Promise<number>` | Returns the number of members in the set |

### IRedisList - lists

| Method | Signature | Behavior |
|--------|-----------|----------|
| `lPush` | `(opts: { key: string; values: Array<string \| number> }): Promise<number>` | Prepends values to the list head; returns list length after push; empty `values` returns `0` |
| `rPush` | `(opts: { key: string; values: Array<string \| number> }): Promise<number>` | Appends values to the list tail; returns list length after push; empty `values` returns `0` |
| `lPop` | `(opts: { key: string }): Promise<string \| null>` | Removes and returns the head element; `null` if list is empty |
| `rPop` | `(opts: { key: string }): Promise<string \| null>` | Removes and returns the tail element; `null` if list is empty |
| `lRange` | `(opts: { key: string; start: number; stop: number }): Promise<string[]>` | Returns elements from `start` to `stop` (inclusive, 0-indexed, `-1` = last) |
| `lLen` | `(opts: { key: string }): Promise<number>` | Returns the number of elements in the list |

### IRedisPubSub - publish/subscribe

| Method | Signature | Behavior |
|--------|-----------|----------|
| `publish<T>` | `(opts: { topics: string[]; payload: T; useCompress?: boolean }): Promise<void>` | JSON-serializes `payload` into a `Buffer`, optionally zlib-deflates it, and publishes to each topic. Filters out empty/blank topics first; if none remain, logs an error and returns without publishing |
| `subscribe` | `(opts: { topic: string }): void` | Subscribes the client to `topic`; on subscription error the helper **logs** it and does not throw |
| `unsubscribe` | `(opts: { topic: string }): void` | Unsubscribes from `topic`; on error the helper **logs** it and does not throw |

> [!IMPORTANT]
> A subscribed ioredis connection enters subscriber mode and cannot run regular commands. Use `duplicateClient()` to obtain a separate connection for pub/sub.

```typescript
// Correct pattern - separate connections for data and pub/sub
const dataClient = new RedisSingleHelper({ name: 'data', host, port, password });
const subClient = new RedisSingleHelper({ name: 'sub',  host, port, password });

subClient.subscribe({ topic: 'events' });
subClient.getClient().on('message', (channel, message) => {
  const parsed = JSON.parse(message.toString());
  console.log(channel, parsed);
});

await dataClient.set({ key: 'foo', value: 'bar' });
```

### IRedisJson - RedisJSON module

Requires the [RedisJSON module](https://redis.io/docs/stack/json/) on the server.

| Method | Signature | Behavior |
|--------|-----------|----------|
| `jSet<T>` | `(opts: { key: string; path: string; value: T }): Promise<string \| null>` | Sets a JSON document at `path` (`JSON.SET`); value is `JSON.stringify`-ed |
| `jGet<T>` | `(opts: { key: string; path?: string }): Promise<T \| null>` | Retrieves the document or sub-path (`JSON.GET`); `path` defaults to `'$'` |
| `jDelete` | `(opts: { key: string; path?: string }): Promise<number>` | Deletes the document or sub-path (`JSON.DEL`); `path` defaults to `'$'`; returns count deleted |
| `jNumberIncreaseBy` | `(opts: { key: string; path: string; value: number }): Promise<string \| null>` | Increments a numeric field by `value` (`JSON.NUMINCRBY`) |
| `jStringAppend` | `(opts: { key: string; path: string; value: string }): Promise<number[] \| null>` | Appends `value` to a string field (`JSON.STRAPPEND`); returns new string lengths |
| `jPush<T>` | `(opts: { key: string; path: string; value: T }): Promise<number[] \| null>` | Appends `value` to an array field (`JSON.ARRAPPEND`); value is `JSON.stringify`-ed; returns new array lengths |
| `jPop<T>` | `(opts: { key: string; path: string }): Promise<T \| null>` | Pops the last element from an array field (`JSON.ARRPOP`) |

### IRedisCommand - raw escape hatch

| Method | Signature | Behavior |
|--------|-----------|----------|
| `execute<R>` | `(command: string, parameters?: Array<string \| number \| Buffer>): Promise<R>` | Calls any ioredis command directly via `client.call(command, parameters)` |

```typescript
// Use SCAN instead of KEYS on large keyspaces
const [cursor, keys] = await redis.execute<[string, string[]]>(
  'SCAN',
  [0, 'MATCH', 'user:*', 'COUNT', 100],
);

// Fetch server info
const info = await redis.execute<string>('INFO');
```

## Using the Helper Across IGNIS

All three topologies implement `IRedisHelper` and are interchangeable in every integration below. Switch topology by changing the helper you construct. The consumer code does not change.

### BullMQ (BullMQHelper)

`BullMQHelper` accepts a `redisConnection: IRedisHelper`. Internally it:
- Calls `redisConnection.duplicateClient()` to create dedicated `Queue` and `Worker` connections. BullMQ requires a separate connection per role.
- Calls `redisConnection.getClient() instanceof Cluster` to detect cluster topology and adjust BullMQ configuration.

`RedisSingleHelper` and `RedisSentinelHelper` are BullMQ-compatible out of the box. The framework sets `maxRetriesPerRequest: null` in `buildDefaultOpts`.

```typescript
import { BullMQHelper } from '@venizia/ignis-helpers/bullmq';
import { RedisSingleHelper } from '@venizia/ignis-helpers';

const redis = new RedisSingleHelper({ name: 'queue-redis', host, port, password });

const queue = BullMQHelper.newInstance({
  queueName: 'email',
  role: 'queue',
  redisConnection: redis,
});
```

### Socket.IO component (SocketIOServerHelper)

- **Resolved from a binding key.** The Socket.IO component resolves an `AbstractRedisHelper` from `@app/socket-io/redis-connection`.
- **Three dedicated connections.** `SocketIOServerHelper` calls `duplicateClient()` three times - once each for the pub channel, sub channel, and emitter adapter.
- **Any topology works.** Bind single, cluster, or Sentinel - the consumer code is identical:

```typescript
import { AbstractRedisHelper, RedisSentinelHelper } from '@venizia/ignis-helpers';

// In your Application preConfigure:
const redis = new RedisSentinelHelper({ name: 'socket-redis', masterName: 'mymaster', sentinels, password });
this.bind<AbstractRedisHelper>({ key: '@app/socket-io/redis-connection' }).to(redis);
```

See the Socket.IO component documentation for the full component registration and adapter setup.

### WebSocket component (WebSocket server and emitter)

- **Resolved from a binding key.** The WebSocket component resolves an `AbstractRedisHelper` from `@app/websocket/redis-connection`.
- **Two dedicated connections.** `WebSocketServerHelper` calls `duplicateClient()` for its pub and sub connections. The WebSocket emitter calls `duplicateClient()` again for its own pub connection.
- **Any topology works.** Bind single, cluster, or Sentinel:

```typescript
import { AbstractRedisHelper, RedisClusterHelper } from '@venizia/ignis-helpers';

const redis = new RedisClusterHelper({ name: 'ws-redis', nodes });
this.bind<AbstractRedisHelper>({ key: '@app/websocket/redis-connection' }).to(redis);
```

See the WebSocket component documentation for the full component registration.

### Casbin authorization enforcer

- **Configured via options.** The cached Casbin enforcer (`ICasbinEnforcerCachedRedis`) accepts `connection: IRedisHelper` inside its `options`.
- **Uses only the typed API.** It calls the helper's `get`, `set` (with `options.expiresIn`), and `del` to read, write, and invalidate cached policy keys. It never reaches the raw client.
- **Any topology works** as the `connection`:

```typescript
import type { IRedisHelper } from '@venizia/ignis-helpers';

// Shape of the cached-enforcer config (see the Authorization component docs for full setup):
const cached = {
  use: true,
  driver: CasbinEnforcerCachedDrivers.REDIS,
  options: {
    connection: redis as IRedisHelper, // any RedisSingleHelper / RedisClusterHelper / RedisSentinelHelper
    expiresIn: 300_000, // cached-policy TTL in milliseconds
    keyFn: ({ user }) => `authz:policy:${user.id}`,
  },
};
```

### Binding into an application

```typescript
import { RedisSingleHelper } from '@venizia/ignis-helpers';
import { BaseApplication } from '@venizia/ignis';

class MyApp extends BaseApplication {
  async preConfigure() {
    const redis = new RedisSingleHelper({
      name: 'cache',
      host: process.env.REDIS_HOST!,
      port: Number(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD!,
    });

    // Bind so components and services can resolve it
    this.bind<RedisSingleHelper>({ key: 'helpers.RedisCache' }).to(redis);
  }
}
```

## Production Notes

- **Use a singleton per logical connection.** Construct the helper once at startup and share it. Do not construct a new helper per request - each construction opens a new connection pool.
- **`duplicateClient()` for Pub/Sub.** A subscribed ioredis connection cannot run normal commands. Always call `duplicateClient()` to get a dedicated subscriber connection. Keep the main client for data operations.
- **Sentinel for HA; Cluster for sharding.** These are different problems. Sentinel gives you automatic failover for a single logical master. Cluster shards data across nodes. They are not interchangeable.
- **TTL units differ by field** - see the [units table above](#general-notes-apply-to-all-families). Mixing them up causes unexpected key expirations.
- **Sentinel `sentinel auth-pass` is a server-side requirement.** If your data nodes require a password, configure `sentinel auth-pass <group> <password>` in `sentinel.conf`, in addition to the app-side `password` field. Missing it causes false failovers, even when `password` is correct.
- **Avoid `keys()` in production.** The Redis `KEYS` command scans the entire keyspace and blocks the server. Use `execute('SCAN', [...])` for production pattern matching.

## Import Reference

```typescript
import {
  // Classes
  AbstractRedisHelper,
  RedisSingleHelper,
  RedisClusterHelper,
  RedisSentinelHelper,
  // Factory
  createRedisHelper,
  RedisModes,
  // Sentinel role const-class
  RedisSentinelRoles,
} from '@venizia/ignis-helpers';

import type {
  // Interface
  IRedisHelper,
  // Option types
  IRedisSingleHelperOptions,
  IRedisSingleHelperProps,
  IRedisClusterHelperOptions,
  IRedisClusterHelperProps,
  IRedisSentinelHelperOptions,
  IRedisSentinelHelperProps,
  IRedisHelperCallbacks,
  // Client + enum types
  TRedisClient,
  TRedisMode,
  TRedisSentinelRole,
} from '@venizia/ignis-helpers';
```

## See also

- [Redis overview](/extensions/helpers/redis/) - introduction and the most common tasks
- [Queue Helper](/extensions/helpers/queue/) - `BullMQHelper` uses the Redis helper as its connection backend
- [Socket.IO Component](/extensions/components/socket-io/) - uses `duplicateClient` for pub/sub adapter
- [WebSocket Component](/extensions/components/websocket/) - uses `duplicateClient` for pub/sub channels
- [Authorization Component](/extensions/components/authorization/) - Casbin enforcer uses the helper's `del`/`get`/`set` for cache operations
- [Migrating to the new Redis Helper API](/guides/migrations/redis-helpers-migration) - renames and breaking changes from the pre-refactor API
- [ioredis documentation](https://github.com/redis/ioredis) - underlying Redis client
- [Redis Sentinel documentation](https://redis.io/docs/management/sentinel/) - Sentinel architecture reference
- [RedisJSON documentation](https://redis.io/docs/stack/json/) - required for `j*` methods
