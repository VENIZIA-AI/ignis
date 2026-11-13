---
title: Redis - Full Reference
description: Complete reference for the Redis helper class hierarchy, all three topology constructors, the full data API, lifecycle events, and framework integrations
difficulty: intermediate
---

# Redis - Full Reference

Exhaustive reference for `AbstractRedisHelper`, the three topology classes, the `RedisHelperFactory` factory, and every data-API method. For a readable introduction and the common tasks, start with the [Redis overview](/extensions/helpers/redis/).

Backed by **ioredis** under the hood.

**Files:**

- [`packages/helpers/src/modules/redis/base/abstract.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/base/abstract.helper.ts) - `AbstractRedisHelper`
- [`packages/helpers/src/modules/redis/single/single.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/single/single.helper.ts) - `RedisSingleHelper`
- [`packages/helpers/src/modules/redis/cluster/cluster.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/cluster/cluster.helper.ts) - `RedisClusterHelper`
- [`packages/helpers/src/modules/redis/sentinel/sentinel.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/sentinel/sentinel.helper.ts) - `RedisSentinelHelper`
- [`packages/helpers/src/modules/redis/factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/factory.ts) - `RedisHelperFactory`
- [`packages/helpers/src/modules/redis/common/interfaces.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/common/interfaces.ts) - `IRedisHelper` and its nine capability interfaces
- [`packages/helpers/src/modules/redis/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/common/types.ts) - the types more than one mode shares: `IRedisNode`, `IRedisCredentials`, `TRedisClient`, `IRedisHelperCallbacks`, `IRedisModuleOption`
- [`packages/helpers/src/modules/redis/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/common/constants.ts) - `RedisDefaults`
- [`packages/helpers/src/modules/redis/single/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/single/types.ts), [`cluster/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/cluster/types.ts) and [`sentinel/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/sentinel/types.ts) - the props and options type of each mode
- [`packages/helpers/src/modules/redis/sentinel/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/redis/sentinel/constants.ts) - `RedisSentinelRoles`, `RedisSentinelDefaults`

## Find what you need

| You want to | Go to |
|---|---|
| See the class hierarchy and the nine capability interfaces | [Class and Interface Model](#class-and-interface-model) |
| Construct a single-node client | [Construction - Single](#construction-single) |
| Construct a cluster client | [Construction - Cluster](#construction-cluster) |
| Construct a Sentinel client, or understand Sentinel HA | [Construction - Sentinel](#construction-sentinel) |
| Pick a topology from configuration instead of hardcoding a class | [Selecting a Topology - the Factory](#selecting-a-topology-the-factory) |
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
> Declare parameters and bindings as `IRedisHelper`. Use `isRedisHelper(value)` for runtime checks - it reads a `Symbol.for` brand, so it still answers `true` for a helper built by a second installed copy of the package, where `instanceof AbstractRedisHelper` answers `false`. Never type-check against the concrete subclasses unless you need topology-specific behavior.

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

Combines `IRedisSingleHelperProps`, `IRedisHelperCallbacks` and `IRedisModuleOption`. `IRedisSingleHelperProps` extends the two shared pieces of `redis/common/types.ts`: `IRedisNode` (`host`, `port?`) and `IRedisCredentials` (`username?`, `password?`), both exported from the helpers barrel.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | `string` | Yes | - | Helper identifier used in logs and as `IRedisHelper.name` |
| `host` | `string` | Yes | - | Redis server hostname |
| `port` | `string \| number` | No | `6379` | Redis server port |
| `username` | `string` | No | - | The Redis ACL user to authenticate as, with `password` |
| `password` | `string` | No | - | Redis `requirepass` value (or the ACL user's password) |
| `database` | `number` | No | `0` | Redis database index (0-15) |
| `autoConnect` | `boolean` | No | `true` | Connect immediately; `false` uses ioredis `lazyConnect` |
| `maxRetry` | `number` | No | `5` | Reconnect attempts before giving up - see [Retry strategy](#retry-strategy) |
| `module` | `typeof import('ioredis')` | No | loaded by name | [Compiled binary](./#run-in-a-compiled-binary): `ioredis` itself, for `bun build --compile` with no `node_modules` |
| `onInitialized` | `(opts: { name: string; helper: IRedisHelper }) => void` | No | - | Fired synchronously after construction |
| `onConnected` | `(opts: { name: string; helper: IRedisHelper }) => void` | No | - | Fired on TCP connection established |
| `onReady` | `(opts: { name: string; helper: IRedisHelper }) => void` | No | - | Fired when client is ready for commands |
| `onError` | `(opts: { name: string; helper: IRedisHelper; error: unknown }) => void` | No | - | Fired on connection or command errors |

Notes on the fields:

- `username`: omit it to authenticate as the `default` user.
- `password`: omit it for a Redis with no password.
- A node has no credentials of its own, in any mode: ioredis cannot honor them (it reads only the host and port of a Sentinel endpoint, and applies a cluster node's credentials to the startup nodes only).
- One rule in all three modes: top-level `username` and `password` are the data nodes' credentials. A sentinel keeps the Sentinel processes' own in `sentinel.username` and `sentinel.password`. A cluster applies them through `redisOptions`, so every node gets them, including nodes found after startup; as in Sentinel, a first-class credential that is given wins over `redisOptions`, which only fills what is unset.
- `maxRetry`: `0` = no reconnect; `-1` = reconnect forever; any other value is refused at construction.

### Retry strategy

All three helpers (single, sentinel and cluster) reconnect the same way. ioredis calls the strategy with `attempt` starting at `1`; the wait comes from `RetryHelper.computeBackoffDelayMs` with `RedisDefaults.RECONNECT_BACKOFF`: exponential from 1 s, doubling, capped at 30 s, with equal jitter (each wait is between half and all of the computed delay).

| `attempt` | Delay |
|---|---|
| 1 | 0.5 - 1 s |
| 2 | 1 - 2 s |
| 3 | 2 - 4 s |
| 6 and later | up to 30 s |

- **Backoff resets on success.** ioredis sets `retryAttempts` back to `0` once the client reaches `ready`.
- **Stop condition.** Reconnect stops when `attempt > maxRetry`, unless `maxRetry` is `-1`. The helper logs an error once when it gives up. `maxRetry: 0` stops on the first attempt.
- **Bad values are refused.** `maxRetry` must be `0`, `-1` or a positive integer; a negative number other than `-1`, a fraction or `NaN` throws when the helper is built.
- **This strategy does not retry commands.** It only schedules reconnection.
- **BullMQ requirement.** The framework sets `maxRetriesPerRequest: null` by default, which BullMQ requires. On a cluster it is a default of `redisOptions`, so an app's own `redisOptions.maxRetriesPerRequest` overrides it.

### What happens to commands while the connection is down

`maxRetriesPerRequest: null` turns off the per-request retry limit, so ioredis parks commands in its offline queue instead of failing them after N attempts. How that ends depends on `maxRetry`.

| `maxRetry` | Outcome for queued commands |
|---|---|
| `-1` or a positive number | Flushed to the server once the client reconnects, until `maxRetry` attempts fail |
| `0` | Rejected with `Connection is closed.` as soon as the client gives up |

The default of 5 attempts rides out a restart of a few seconds. To survive a longer outage or a failover without losing commands, set `maxRetry: -1`.

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
  username: 'app-user',        // data-node ACL user (omit it for the default user)
  password: 'cluster-password',
  onReady: ({ name }) => {
    console.log(`[${name}] cluster ready`);
  },
});
```

### IRedisClusterHelperOptions

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | `string` | Yes | - | Helper identifier |
| `nodes` | `IRedisNode[]` | Yes | - | Startup nodes; ioredis finds the rest. Port defaults to `6379`. No per-node credentials: see [Credentials](#credentials-on-a-cluster) |
| `username` | `string` | No | - | The ACL user of every data node, with `password`. Sent through `redisOptions` |
| `password` | `string` | No | - | The password of every data node. Sent through `redisOptions`, so nodes found after startup get it |
| `autoConnect` | `boolean` | No | `true` | Connect immediately; `false` sets `lazyConnect` so you call `connect()` later |
| `maxRetry` | `number` | No | `5` | Reconnect attempts before giving up - see [Retry strategy](#retry-strategy) |
| `clusterOptions` | `ClusterOptions` | No | - | Merged over the four defaults, then passed to `new Cluster` |
| `module` | `typeof import('ioredis')` | No | loaded by name | Same as single |
| `onInitialized` / `onConnected` / `onReady` / `onError` | callbacks | No | - | Same shape as single |

#### Credentials on a cluster

A node has no credentials of its own because ioredis gives nodes discovered after startup only `redisOptions` (host and port come from the cluster), so a per-node password reaches the startup nodes and nothing else. `username` and `password` are applied through `redisOptions` instead, so every node gets them. The rule is the same as in Sentinel: a first-class credential that is given wins, and `clusterOptions.redisOptions` only fills what is unset. The other `clusterOptions` knobs keep it as the last word.

The four defaults of `clusterOptions`: `enableOfflineQueue: true`, `lazyConnect`, `clusterRetryStrategy` and `redisOptions.maxRetriesPerRequest: null`.

### Bind early, connect later

An application usually binds the connection during setup and lets a component connect it during boot. Connect the cluster eagerly and it is mid-handshake by then, so the second `connect()` is refused. Set `autoConnect: false` and the client waits:

```typescript
const cluster = new RedisClusterHelper({
  name: 'cache-cluster',
  nodes: [{ host: 'redis-node-1', port: 7000 }],
  autoConnect: false,
});

// later, during boot
await cluster.connect();
```

The helper sets these cluster options before your own:

| Option | Value | Why it is stated, not inherited |
|--------|-------|--------------------------------|
| `lazyConnect` | `!autoConnect` | The same rule single and sentinel already follow |
| `enableOfflineQueue` | `true` | Commands issued between bind and connect must queue, not throw |
| `clusterRetryStrategy` | the [retry strategy](#retry-strategy) for `maxRetry` (default `5`) | Reconnects the cluster the way single and sentinel reconnect |
| `redisOptions.maxRetriesPerRequest` | `null` | BullMQ requires it |

`clusterOptions` is merged **over** all of them, so it stays the last word. A caller already passing `clusterOptions: { lazyConnect: true }` keeps exactly the timing it has today. `redisOptions` is merged key by key: passing your own (a password, TLS) keeps `maxRetriesPerRequest: null` unless you set that key yourself.

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
- **You give ioredis the sentinel addresses instead**, plus the monitored master group name (`sentinel.masterName`). ioredis asks a sentinel for the current master, then connects to it.
- **ioredis re-queries sentinels automatically after a failover** - no manual reconnection logic needed.
- **Your application code does not change during a failover.** The only observable effect is a few seconds of transient command failures. Set `maxRetry: -1` so the client reconnects and drains its queued commands - `maxRetry: 0` rejects them instead (the default is `5`).

### Constructor

```typescript
import { RedisSentinelHelper, RedisSentinelRoles } from '@venizia/ignis-helpers';

const redis = new RedisSentinelHelper({
  name: 'ha-cache',          // helper identifier (logging/scope)
  sentinel: {
    masterName: 'mymaster',    // group name in sentinel.conf "sentinel monitor mymaster ..."
    role: RedisSentinelRoles.MASTER, // MASTER (default) or SLAVE
    password: 'sentinel-secret', // sentinel.conf requirepass
    nodes: [
      { host: '10.0.0.1', port: 26379 },
      { host: '10.0.0.2', port: 26379 },
      { host: '10.0.0.3' },   // port defaults to 26379
    ],
  },
  username: 'app-user',      // data-node ACL user (omit it for the default user)
  password: 'data-secret',   // master/replica password
  database: 0,
  autoConnect: true,
  maxRetry: 5,
});
```

### IRedisSentinelHelperOptions

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | `string` | Yes | - | Helper identifier (logs, `IRedisHelper.name`) |
| `sentinel` | `IRedisCredentials & { masterName; role?; nodes }` | Yes | - | Everything that belongs to Sentinel; see the table below |
| `username` | `string` | No | - | Data-node ACL user (master and replicas), with `password` |
| `password` | `string` | No | - | Data-node password (master and replicas) |
| `database` | `number` | No | `0` | Redis database index |
| `autoConnect` | `boolean` | No | `true` | Connect immediately |
| `maxRetry` | `number` | No | `5` | Reconnect attempts before giving up - see [Retry strategy](#retry-strategy) |
| `redisOptions` | `Partial<RedisOptions>` | No | - | Extra ioredis options. A first-class field wins over its key here; an unset auth field falls back to it |
| `module` | `typeof import('ioredis')` | No | loaded by name | Same as single |
| `onInitialized` / `onConnected` / `onReady` / `onError` | callbacks | No | - | Same shape as single |

### Field clarity - name vs sentinel.masterName

This is the most common source of confusion:

| Field | What it is | Where it goes |
|-------|-----------|---------------|
| `name` | The helper's own identifier used for logging and `IRedisHelper.name` | `AbstractRedisHelper` identifier |
| `sentinel.masterName` | The master group being monitored by Sentinel processes, matching `sentinel monitor <name> ...` in sentinel.conf | Maps to ioredis `name` option |

They are independent. You can name the helper `'ha-cache'` while `sentinel.masterName` is `'mymaster'`.

The fields of `sentinel`:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `masterName` | `string` | Yes | - | Sentinel-monitored master group name - maps to ioredis `name` |
| `role` | `TRedisSentinelRole` (`RedisSentinelRoles.MASTER \| SLAVE`) | No | `RedisSentinelRoles.MASTER` | Connect to the master (writes) or a replica (reads) |
| `username` | `string` | No | - | ACL user of the Sentinel processes |
| `password` | `string` | No | - | `requirepass` of the Sentinel processes |
| `nodes` | `IRedisNode[]` | Yes | - | Sentinel addresses; port defaults to `26379`. No per-node credentials: use `sentinel.username` and `.password` |

Other ioredis Sentinel options (`sentinelTLS`, `natMap`, `preferredSlaves`) stay reachable through `redisOptions`.

### The authentication model - 4 relationships

Sentinel deployments have four separate authentication relationships. The app configures two of them. The other two are server-side.

| # | From | To | App field | Server config |
|---|------|----|-----------|---------------|
| 1 | **App** | **Sentinel processes** | `sentinel.username`, `sentinel.password` | `requirepass` in sentinel.conf |
| 2 | **App** | **Data nodes** (master/replica) | `username`, `password` | `requirepass` or an ACL user in redis.conf |
| 3 | **Sentinel** | **Data nodes** | (not set by app) | `sentinel auth-pass <group> <pass>` in sentinel.conf |
| 4 | **Replica** | **Master** (replication) | (not set by app) | `masterauth` in redis.conf |

**Relationship 3 is the silent failure.** If the data nodes require a password but `sentinel.conf` has no `sentinel auth-pass`, the sentinel processes can't check master health. They trigger false failovers instead. Configure `sentinel auth-pass` on the server side, even when your app sets only `password`.

**Common cases:**
- Private network, sentinels unauthenticated: set only `password` (and `username` for an ACL user).
- Fully secured cluster: set both `password` and `sentinel.password`; configure relationships 3 and 4 on the servers.

### Failover behavior

When the master fails:

1. Sentinels reach quorum and promote a replica.
2. ioredis detects the master change via sentinel notification.
3. ioredis reconnects to the new master transparently.
4. Commands issued during the few-second window queue up, then flush once the client reconnects. This needs `maxRetry: -1` or a positive `maxRetry`; `0` rejects them.
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
  sentinel: {
    masterName: 'mymaster',
    password: 'sentinel-secret',
    nodes: [{ host: 'localhost', port: 26379 }],
  },
  password: 'data-secret',
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

`RedisHelperFactory` has one static method per topology. Each takes the options of that topology and returns its concrete helper.

```typescript
import { RedisHelperFactory } from '@venizia/ignis-helpers';

// Type: RedisSingleHelper
const single = RedisHelperFactory.single({
  name: 'cache',
  host: process.env.REDIS_HOST!,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD!,
});

// Type: RedisSentinelHelper
const sentinel = RedisHelperFactory.sentinel({
  name: 'cache-ha',
  sentinel: { masterName: 'mymaster', nodes: [{ host: process.env.SENTINEL_HOST! }] },
  password: process.env.REDIS_PASSWORD!,
});
```

| Method | Options | Returns |
|---|---|---|
| `RedisHelperFactory.single(opts)` | `IRedisSingleHelperOptions` | `RedisSingleHelper` |
| `RedisHelperFactory.cluster(opts)` | `IRedisClusterHelperOptions` | `RedisClusterHelper` |
| `RedisHelperFactory.sentinel(opts)` | `IRedisSentinelHelperOptions` | `RedisSentinelHelper` |

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
| `connect()` | Calls ioredis `connect()`; resolves `true` when status reaches `ready` |
| `disconnect()` | Sends `QUIT`; resolves `true` on `'OK'` |
| `ping()` | Sends `PING`; returns `'PONG'` |

- `connect()` resolves `false` (no-op) if status is `ready`, `reconnecting`, or `connecting`.
- `disconnect()` resolves `false` (no-op) if status is `end` or `close`.

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

- **Empty-input no-ops.** `keys`, `members`, `values`, `fields`, and `payload` are all array inputs. An empty array skips the ioredis call and returns immediately - this avoids the "wrong number of arguments" error ioredis throws on empty varargs.

  | Return value | Applies to |
  |---|---|
  | `0` | Count methods - `del`, `hDel`, `sRem`, `sAdd`, `lPush`, `rPush` |
  | `[]` | Array reads - `mGet`, `sMembers` |
  | `void` (no-op) | `mSet` |
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
| `publish<T>` | `(opts: { topics: string[]; payload: T; useCompress?: boolean }): Promise<void>` | JSON-serializes `payload`, optionally deflates it, and publishes to each topic |
| `subscribe` | `(opts: { topic: string }): void` | Subscribes the client to `topic`; on subscription error the helper **logs** it and does not throw |
| `unsubscribe` | `(opts: { topic: string }): void` | Unsubscribes from `topic`; on error the helper **logs** it and does not throw |

`publish` filters out empty or blank topics first. If none remain, it logs an error and returns without publishing.

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
- Passes `redisConnection.duplicateClient()` to the `Queue` and to the `Worker`, so each connects by itself whatever state the shared client is in. BullMQ never quits a client it is handed, so the helper quits each duplicate in `close()`. A duplicate that ends for good (ioredis stopped reconnecting) is logged as an error: give the helper `maxRetry: -1`.
- Checks `redisConnection.getClient()` structurally (`isCluster === true`, or a `nodes` function) to detect cluster topology and adjust BullMQ configuration.

`RedisSingleHelper`, `RedisSentinelHelper` and `RedisClusterHelper` are BullMQ-compatible out of the box. The framework sets `maxRetriesPerRequest: null` on each.

```typescript
import { BullMQHelper } from '@venizia/ignis-helpers/bullmq';
import { BullQueueRoles, RedisSingleHelper } from '@venizia/ignis-helpers';

const redis = new RedisSingleHelper({ name: 'queue-redis', host, port, password });

const queue = BullMQHelper.newInstance({
  queueName: 'email',
  identifier: 'email-queue',
  role: BullQueueRoles.QUEUE,
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
const redis = new RedisSentinelHelper({ name: 'socket-redis', sentinel: { masterName: 'mymaster', nodes }, password });
this.bind<AbstractRedisHelper>({ key: '@app/socket-io/redis-connection' }).toValue(redis);
```

See the Socket.IO component documentation for the full component registration and adapter setup.

### WebSocket component (WebSocket server and emitter)

- **Resolved from a binding key.** The WebSocket component resolves an `AbstractRedisHelper` from `@app/websocket/redis-connection`.
- **Two dedicated connections.** `WebSocketServerHelper` calls `duplicateClient()` for its pub and sub connections. The WebSocket emitter calls `duplicateClient()` again for its own pub connection.
- **Any topology works.** Bind single, cluster, or Sentinel:

```typescript
import { AbstractRedisHelper, RedisClusterHelper } from '@venizia/ignis-helpers';

const redis = new RedisClusterHelper({ name: 'ws-redis', nodes });
this.bind<AbstractRedisHelper>({ key: '@app/websocket/redis-connection' }).toValue(redis);
```

See the WebSocket component documentation for the full component registration.

### Casbin authorization enforcer

- **Configured via options.** The cached Casbin enforcer (`ICasbinEnforcerCachedRedis`) accepts `connection: IRedisHelper` inside its `options`.
- **Uses only the typed API.** It calls the helper's `get`, `set` (with `options.expiresIn`), and `del` to read, write, and invalidate cached policy keys. It never reaches the raw client.
- **Any topology works** as the `connection`:

```typescript
import { RedisSingleHelper } from '@venizia/ignis-helpers';
import type { IRedisHelper } from '@venizia/ignis-helpers';

// Any RedisSingleHelper / RedisClusterHelper / RedisSentinelHelper is an IRedisHelper:
const redis: IRedisHelper = new RedisSingleHelper({ name: 'authz-cache', host: 'localhost', port: 6379 });

// Shape of the cached-enforcer config (see the Authorization component docs for full setup):
const cached = {
  use: true,
  driver: CasbinEnforcerCachedDrivers.REDIS,
  options: {
    connection: redis,
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
    this.bind<RedisSingleHelper>({ key: 'helpers.RedisCache' }).toValue(redis);
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
  RedisHelperFactory,
  // Sentinel const-classes
  RedisSentinelRoles,
  RedisSentinelDefaults,
  // Defaults shared by the modes
  RedisDefaults,
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
  IRedisModuleOption,
  // Shared pieces of the props types
  IRedisNode,
  IRedisCredentials,
  // Client + enum types
  TRedisClient,
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
