# Creating an Instance

## Single Instance

Use `RedisHelper` for connecting to a single Redis instance.

```typescript
import { RedisHelper } from '@venizia/ignis-helpers';

const redisClient = new RedisHelper({
  name: 'my-redis-client',
  host: 'localhost',
  port: 6379,
  password: 'password',
  database: 0,         // Redis DB index (default: 0)
  autoConnect: true,    // Connect immediately (default: true)
  maxRetry: 5,          // Max reconnection attempts (0 = unlimited, default: 0)

  // Lifecycle callbacks
  onInitialized: ({ name, helper }) => {
    console.log(`Redis "${name}" initialized`);
  },
  onConnected: ({ name }) => {
    console.log(`Redis "${name}" connected`);
  },
  onReady: ({ name }) => {
    console.log(`Redis "${name}" ready`);
  },
  onError: ({ name, error }) => {
    console.error(`Redis "${name}" error:`, error);
  },
});
```

::: details IRedisHelperOptions

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | `string` | Yes | -- | Unique identifier for this client |
| `host` | `string` | Yes | -- | Redis host |
| `port` | `string \| number` | Yes | -- | Redis port |
| `password` | `string` | Yes | -- | Redis password |
| `user` | `string` | No | -- | Redis username (ACL) |
| `database` | `number` | No | `0` | Redis DB index |
| `autoConnect` | `boolean` | No | `true` | Connect immediately on creation. When `false`, uses `lazyConnect` |
| `maxRetry` | `number` | No | `0` | Max reconnection attempts. `0` = unlimited. `-1` or lower disables retry |
| `onInitialized` | `function` | No | -- | Called immediately after client creation |
| `onConnected` | `function` | No | -- | Called when the TCP connection is established |
| `onReady` | `function` | No | -- | Called when the client is ready to accept commands |
| `onError` | `function` | No | -- | Called on connection or command errors |

**Retry strategy:** Exponential backoff clamped between 1s and 5s (`Math.max(Math.min(attempt * 2000, 5000), 1000)`).

:::

## Redis Cluster

Use `RedisClusterHelper` for connecting to a Redis cluster.

```typescript
import { RedisClusterHelper } from '@venizia/ignis-helpers';

const redisClusterClient = new RedisClusterHelper({
  name: 'my-redis-cluster',
  nodes: [
    { host: 'localhost', port: 7000 },
    { host: 'localhost', port: 7001, password: 'node-specific-pass' },
    // ... other nodes
  ],
  clusterOptions: {
    // ioredis ClusterOptions (optional)
    redisOptions: { password: 'cluster-password' },
  },

  // Same lifecycle callbacks as RedisHelper
  onReady: ({ name }) => {
    console.log(`Cluster "${name}" ready`);
  },
});
```

::: details IRedisClusterHelperOptions

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | `string` | Yes | -- | Unique identifier for this cluster client |
| `nodes` | `Array<{ host, port, password? }>` | Yes | -- | Cluster node addresses |
| `clusterOptions` | `ClusterOptions` | No | -- | ioredis `ClusterOptions` passed directly to the `Cluster` constructor |
| `onInitialized` | `function` | No | -- | Called immediately after cluster client creation |
| `onConnected` | `function` | No | -- | Called when connected |
| `onReady` | `function` | No | -- | Called when ready |
| `onError` | `function` | No | -- | Called on errors |

:::

## Lifecycle Callbacks

All Redis helpers accept lifecycle callbacks for monitoring connection health:

```typescript
interface IRedisHelperCallbacks {
  onInitialized?: (opts: { name: string; helper: DefaultRedisHelper }) => void;
  onConnected?: (opts: { name: string; helper: DefaultRedisHelper }) => void;
  onReady?: (opts: { name: string; helper: DefaultRedisHelper }) => void;
  onError?: (opts: { name: string; helper: DefaultRedisHelper; error: any }) => void;
}
```

| Callback | Redis Event | When |
|----------|-------------|------|
| `onInitialized` | -- | Immediately after client construction (synchronous) |
| `onConnected` | `connect` | TCP connection established |
| `onReady` | `ready` | Client ready to accept commands |
| `onError` | `error` | Connection or command error |

Additionally, the client internally logs a warning on `reconnecting` events.
