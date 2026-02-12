# Redis

Powerful Redis abstraction supporting single instances and clusters via `ioredis`, with automatic JSON serialization, connection lifecycle callbacks, Pub/Sub with optional zlib compression, RedisJSON operations, and raw command execution.

## Quick Reference

| Class | Extends | Use Case |
|-------|---------|----------|
| **`DefaultRedisHelper`** | `BaseHelper` | Base class with unified API for all Redis operations |
| **`RedisHelper`** | `DefaultRedisHelper` | Single Redis instance with auto-connect and retry strategy |
| **`RedisClusterHelper`** | `DefaultRedisHelper` | Redis cluster with multi-node support |

#### Import Paths

```typescript
// From the helpers package
import {
  DefaultRedisHelper,
  RedisHelper,
  RedisClusterHelper,
} from '@venizia/ignis-helpers';

// Or from the core package (re-exports everything)
import {
  DefaultRedisHelper,
  RedisHelper,
  RedisClusterHelper,
} from '@venizia/ignis';

// Types
import type {
  IRedisHelperOptions,
  IRedisClusterHelperOptions,
  IRedisHelperCallbacks,
  IRedisHelperProps,
  IRedisClusterHelperProps,
} from '@venizia/ignis-helpers';
```

## Creating an Instance

### Single Instance

Use `RedisHelper` for connecting to a single Redis server.

```typescript
import { RedisHelper } from '@venizia/ignis-helpers';

const redis = new RedisHelper({
  name: 'my-redis',
  host: 'localhost',
  port: 6379,
  password: 'secret',
  database: 0,
  autoConnect: true,
  maxRetry: 5,

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

#### `IRedisHelperOptions`

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `name` | `string` | Yes | -- | Unique identifier for this client instance |
| `host` | `string` | Yes | -- | Redis server hostname |
| `port` | `string \| number` | Yes | -- | Redis server port |
| `password` | `string` | Yes | -- | Redis password |
| `user` | `string` | No | -- | Redis username (ACL authentication) |
| `database` | `number` | No | `0` | Redis database index |
| `autoConnect` | `boolean` | No | `true` | Connect immediately on creation. When `false`, uses ioredis `lazyConnect` mode |
| `maxRetry` | `number` | No | `0` | Maximum reconnection attempts. `0` = unlimited retries. Values below `0` disable retry entirely |
| `onInitialized` | `(opts: { name: string; helper: DefaultRedisHelper }) => void` | No | -- | Called synchronously immediately after client construction |
| `onConnected` | `(opts: { name: string; helper: DefaultRedisHelper }) => void` | No | -- | Called when the TCP connection is established |
| `onReady` | `(opts: { name: string; helper: DefaultRedisHelper }) => void` | No | -- | Called when the client is ready to accept commands |
| `onError` | `(opts: { name: string; helper: DefaultRedisHelper; error: any }) => void` | No | -- | Called on connection or command errors |

**Retry strategy:** Exponential backoff clamped between 1s and 5s: `Math.max(Math.min(attempt * 2000, 5000), 1000)`. The ioredis option `maxRetriesPerRequest` is set to `null` internally, which is required for compatibility with BullMQ.

**ioredis configuration:** `RedisHelper` creates an ioredis `Redis` instance with `showFriendlyErrorStack: true` for better error diagnostics.

### Cluster

Use `RedisClusterHelper` for connecting to a Redis cluster.

```typescript
import { RedisClusterHelper } from '@venizia/ignis-helpers';

const cluster = new RedisClusterHelper({
  name: 'my-cluster',
  nodes: [
    { host: 'redis-node-1', port: 7000 },
    { host: 'redis-node-2', port: 7001, password: 'node-specific-pass' },
    { host: 'redis-node-3', port: 7002 },
  ],
  clusterOptions: {
    redisOptions: { password: 'cluster-password' },
  },

  onReady: ({ name }) => {
    console.log(`Cluster "${name}" ready`);
  },
});
```

#### `IRedisClusterHelperOptions`

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `name` | `string` | Yes | -- | Unique identifier for this cluster client |
| `nodes` | `Array<{ host: string; port: string \| number; password?: string }>` | Yes | -- | List of cluster node addresses |
| `clusterOptions` | `ClusterOptions` | No | -- | ioredis `ClusterOptions` passed directly to the `Cluster` constructor |
| `onInitialized` | `(opts: { name: string; helper: DefaultRedisHelper }) => void` | No | -- | Called synchronously immediately after cluster client construction |
| `onConnected` | `(opts: { name: string; helper: DefaultRedisHelper }) => void` | No | -- | Called when connected |
| `onReady` | `(opts: { name: string; helper: DefaultRedisHelper }) => void` | No | -- | Called when ready |
| `onError` | `(opts: { name: string; helper: DefaultRedisHelper; error: any }) => void` | No | -- | Called on errors |

### Lifecycle Callbacks

All Redis helpers accept the same lifecycle callbacks via `IRedisHelperCallbacks`:

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

## Usage

All operations below are available on both `RedisHelper` and `RedisClusterHelper` via the shared `DefaultRedisHelper` base class.

### Connection Management

```typescript
// Manual connect (when autoConnect is false)
const connected = await redis.connect();
// => true if status becomes 'ready', false if already connected/connecting

// Disconnect gracefully (sends QUIT command)
const disconnected = await redis.disconnect();
// => true if quit succeeded

// Health check
const pong = await redis.ping();
// => 'PONG'

// Access underlying ioredis client
const ioredisClient = redis.getClient();
// RedisHelper returns Redis, RedisClusterHelper returns Cluster
```

> [!NOTE]
> `connect()` resolves to `false` without action if the client status is already `ready`, `reconnecting`, or `connecting`. Similarly, `disconnect()` resolves to `false` if the status is `end` or `close`.

### Key-Value Operations

```typescript
// Set a value (auto-serialized to JSON)
await redis.set({ key: 'user:1', value: { name: 'Alice', age: 30 } });

// Set with logging enabled
await redis.set({ key: 'user:1', value: { name: 'Alice' }, options: { log: true } });

// Get raw string value
const raw = await redis.get({ key: 'user:1' });
// => '{"name":"Alice","age":30}'

// Get with custom transform
const parsed = await redis.get({
  key: 'user:1',
  transform: (input) => JSON.parse(input),
});

// Convenience: get as string (alias for get)
const str = await redis.getString({ key: 'user:1' });

// Convenience: get as parsed JSON object
const user = await redis.getObject({ key: 'user:1' });
// => { name: 'Alice', age: 30 }

// Delete keys
await redis.del({ keys: ['user:1', 'user:2'] });
```

### Multi-Key Operations

```typescript
// Set multiple keys at once
await redis.mset({
  payload: [
    { key: 'user:1', value: { name: 'Alice' } },
    { key: 'user:2', value: { name: 'Bob' } },
  ],
});

// Get multiple raw values
const values = await redis.mget({ keys: ['user:1', 'user:2'] });
// => ['{"name":"Alice"}', '{"name":"Bob"}']

// Get multiple with transform
const users = await redis.mget({
  keys: ['user:1', 'user:2'],
  transform: (el) => JSON.parse(el),
});

// Convenience: get multiple strings
const strings = await redis.getStrings({ keys: ['key1', 'key2'] });

// Convenience: get multiple parsed objects
const objects = await redis.getObjects({ keys: ['user:1', 'user:2'] });
```

> [!TIP]
> `mSet()`, `mGet()`, `hSet()`, and `hGetAll()` are camelCase aliases for `mset()`, `mget()`, `hset()`, and `hgetall()` respectively. Both forms are valid.

### Hash Operations

```typescript
// Set hash fields
await redis.hset({
  key: 'session:abc',
  value: { userId: 'u1', token: 'tok123', createdAt: '2025-01-01' },
});

// Set hash fields with logging
await redis.hset({
  key: 'session:abc',
  value: { userId: 'u1' },
  options: { log: true },
});

// Get all hash fields
const session = await redis.hgetall({ key: 'session:abc' });
// => { userId: 'u1', token: 'tok123', createdAt: '2025-01-01' }

// Get all hash fields with transform
const transformed = await redis.hgetall({
  key: 'session:abc',
  transform: (input) => ({ ...input, extra: true }),
});
```

### Key Scanning

```typescript
// Find keys matching a pattern
const matchingKeys = await redis.keys({ key: 'user:*' });
// => ['user:1', 'user:2', ...]
```

> [!WARNING]
> `keys()` uses the Redis `KEYS` command, which scans the entire keyspace. Avoid using it in production on large databases -- prefer `SCAN` via `execute()` instead.

### RedisJSON Operations

If your Redis server has the [RedisJSON](https://redis.io/docs/stack/json/) module installed, you can use the `j*` methods for native JSON document operations.

```typescript
// Set a JSON document
await redis.jSet({ key: 'doc:1', path: '$', value: { name: 'Alice', scores: [10, 20] } });

// Get entire document (path defaults to '$')
const doc = await redis.jGet({ key: 'doc:1' });

// Get a nested path
const scores = await redis.jGet({ key: 'doc:1', path: '$.scores' });

// Delete a JSON path
await redis.jDelete({ key: 'doc:1', path: '$.scores' });

// Delete entire document (path defaults to '$')
await redis.jDelete({ key: 'doc:1' });

// Increment a number at a path
await redis.jNumberIncreaseBy({ key: 'doc:1', path: '$.counter', value: 5 });

// Append to a string at a path
await redis.jStringAppend({ key: 'doc:1', path: '$.name', value: ' Smith' });

// Push to an array at a path
await redis.jPush({ key: 'doc:1', path: '$.tags', value: 'new-tag' });

// Pop from an array at a path
const popped = await redis.jPop({ key: 'doc:1', path: '$.tags' });
```

#### RedisJSON Method Signatures

| Method | Parameters | Returns | Redis Command |
|--------|-----------|---------|---------------|
| `jSet<T>()` | `{ key: string; path: string; value: T }` | `Promise<string \| null>` | `JSON.SET` |
| `jGet<T>()` | `{ key: string; path?: string }` | `Promise<T \| null>` | `JSON.GET` |
| `jDelete()` | `{ key: string; path?: string }` | `Promise<number>` | `JSON.DEL` |
| `jNumberIncreaseBy()` | `{ key: string; path: string; value: number }` | `Promise<string \| null>` | `JSON.NUMINCRBY` |
| `jStringAppend()` | `{ key: string; path: string; value: string }` | `Promise<number[] \| null>` | `JSON.STRAPPEND` |
| `jPush<T>()` | `{ key: string; path: string; value: T }` | `Promise<number[] \| null>` | `JSON.ARRAPPEND` |
| `jPop<T>()` | `{ key: string; path: string }` | `Promise<T \| null>` | `JSON.ARRPOP` |

`jGet` and `jDelete` default `path` to `'$'` (root) when omitted. All other `j*` methods require `path` explicitly.

### Pub/Sub

The helper supports Redis Pub/Sub for real-time messaging with optional zlib compression.

```typescript
// Subscribe to a topic
redis.subscribe({ topic: 'events' });

// Listen for messages on the underlying ioredis client
redis.getClient().on('message', (channel, message) => {
  if (channel === 'events') {
    console.log('Received:', JSON.parse(message));
  }
});

// Publish to one or more topics
await redis.publish({
  topics: ['events', 'audit-log'],
  payload: { action: 'user.created', userId: 'u1' },
});

// Publish with zlib compression
await redis.publish({
  topics: ['compressed-channel'],
  payload: { large: 'dataset' },
  useCompress: true,
});

// Unsubscribe from a topic
redis.unsubscribe({ topic: 'events' });
```

> [!IMPORTANT]
> When using Pub/Sub, the subscribing client enters subscriber mode and can only execute `SUBSCRIBE`, `PSUBSCRIBE`, `UNSUBSCRIBE`, `PUNSUBSCRIBE`, `PING`, and `QUIT` commands. Use a separate `RedisHelper` instance for Pub/Sub if you also need to perform regular data operations.

### Raw Command Execution

For commands not wrapped by the helper, use `execute()` to call any Redis command directly.

```typescript
// Execute any Redis command
const result = await redis.execute<string>('SET', ['mykey', 'myvalue', 'EX', 60]);

// Command without parameters
const info = await redis.execute<string>('INFO');

// SCAN instead of KEYS for production use
const [cursor, keys] = await redis.execute<[string, string[]]>(
  'SCAN', [0, 'MATCH', 'user:*', 'COUNT', 100],
);
```

## API Summary

| Method | Returns | Description |
|--------|---------|-------------|
| **Connection** | | |
| `connect()` | `Promise<boolean>` | Manual connect (no-op if already connected/connecting/ready) |
| `disconnect()` | `Promise<boolean>` | Graceful disconnect via `QUIT` (no-op if already ended/closed) |
| `ping()` | `Promise<string>` | Health check, returns `'PONG'` |
| `getClient()` | `Redis \| Cluster` | Access the underlying ioredis client |
| **Key-Value** | | |
| `set<T>(opts)` | `Promise<void>` | Set a key with JSON-serialized value. Options: `{ key, value, options?: { log } }` |
| `get<T>(opts)` | `Promise<T \| null>` | Get raw value with optional transform. Options: `{ key, transform? }` |
| `getString(opts)` | `Promise<string \| null>` | Get raw string value. Options: `{ key }` |
| `getObject(opts)` | `Promise<object \| null>` | Get value parsed as JSON. Options: `{ key }` |
| `del(opts)` | `Promise<number>` | Delete one or more keys. Options: `{ keys: string[] }` |
| **Multi-Key** | | |
| `mset<T>(opts)` / `mSet<T>(opts)` | `Promise<void>` | Set multiple key-value pairs. Options: `{ payload: Array<{ key, value }>, options?: { log } }` |
| `mget<T>(opts)` / `mGet<T>(opts)` | `Promise<(T \| null)[]>` | Get multiple values with optional transform. Options: `{ keys, transform? }` |
| `getStrings(opts)` | `Promise<(string \| null)[]>` | Get multiple raw string values. Options: `{ keys }` |
| `getObjects(opts)` | `Promise<(object \| null)[]>` | Get multiple values parsed as JSON. Options: `{ keys }` |
| **Hashes** | | |
| `hset<T>(opts)` / `hSet<T>(opts)` | `Promise<number>` | Set hash fields. Options: `{ key, value: Record<string, unknown>, options?: { log } }` |
| `hgetall(opts)` / `hGetAll(opts)` | `Promise<Record<string, string> \| null>` | Get all hash fields with optional transform. Options: `{ key, transform? }` |
| **Key Scanning** | | |
| `keys(opts)` | `Promise<string[]>` | Find keys matching a glob pattern. Options: `{ key }` |
| **RedisJSON** | | |
| `jSet<T>(opts)` | `Promise<string \| null>` | Set a JSON document at path (`JSON.SET`) |
| `jGet<T>(opts)` | `Promise<T \| null>` | Get a JSON document or path (`JSON.GET`) |
| `jDelete(opts)` | `Promise<number>` | Delete a JSON path (`JSON.DEL`) |
| `jNumberIncreaseBy(opts)` | `Promise<string \| null>` | Increment a number at path (`JSON.NUMINCRBY`) |
| `jStringAppend(opts)` | `Promise<number[] \| null>` | Append to a string at path (`JSON.STRAPPEND`) |
| `jPush<T>(opts)` | `Promise<number[] \| null>` | Push to an array at path (`JSON.ARRAPPEND`) |
| `jPop<T>(opts)` | `Promise<T \| null>` | Pop from an array at path (`JSON.ARRPOP`) |
| **Pub/Sub** | | |
| `subscribe(opts)` | `void` | Subscribe to a topic. Options: `{ topic }` |
| `publish<T>(opts)` | `Promise<void>` | Publish to one or more topics with optional compression. Options: `{ topics, payload, useCompress? }` |
| `unsubscribe(opts)` | `void` | Unsubscribe from a topic. Options: `{ topic }` |
| **Raw** | | |
| `execute<R>(command, parameters?)` | `Promise<R>` | Execute any Redis command directly |

## Troubleshooting

### "[execute] Invalid client to execute | command: ..."

**Cause:** `execute()` was called when the ioredis client is `null` or `undefined`. This typically happens if the helper was not properly constructed or the connection was never established.

**Fix:** Ensure the helper is instantiated correctly and, if using `autoConnect: false`, call `await redis.connect()` before issuing commands.

### "[subscribe] Failed to subscribe to topic: ..."

**Cause:** The ioredis `subscribe()` callback received an error. This can happen if the client lost its connection or the Redis server rejected the subscription.

**Fix:** Check that the Redis server is reachable and the client is in a valid state. Monitor the `onError` callback for connection issues.

### "[unsubscribe] Failed to unsubscribe from topic: ..."

**Cause:** The ioredis `unsubscribe()` callback received an error, usually due to a broken connection.

**Fix:** Same as above -- verify connectivity and client state.

### Connection Refused / Timeout

**Symptoms:** `ECONNREFUSED`, connection hangs, or `onError` fires immediately.

**Checklist:**
- Verify Redis is running and reachable at the configured `host:port`
- Check firewall rules and network access between your application and the Redis server
- If using `autoConnect: false`, ensure you call `await redis.connect()` before any operations
- Verify `password` is correct (Redis returns a generic error for auth failure)
- For clusters, ensure all node addresses are reachable and the cluster is healthy (`redis-cli cluster info`)

### Pub/Sub Subscriber Mode Conflicts

**Symptoms:** `ERR only (P|S)SUBSCRIBE / (P|S)UNSUBSCRIBE / PING / QUIT / RESET allowed in this context`

**Cause:** You called `subscribe()` on a client and then attempted a regular command (`get`, `set`, etc.) on the same client.

**Fix:** Use a separate connection for Pub/Sub:

```typescript
const dataClient = new RedisHelper({ name: 'data', host, port, password });
const subClient = new RedisHelper({ name: 'sub', host, port, password });

// Use subClient only for subscribe/unsubscribe
subClient.subscribe({ topic: 'events' });
subClient.getClient().on('message', (channel, msg) => { /* ... */ });

// Use dataClient for everything else
await dataClient.set({ key: 'foo', value: 'bar' });
```

### RedisJSON Commands Return Errors

**Symptoms:** `ERR unknown command 'JSON.SET'`

**Cause:** The RedisJSON module is not installed on your Redis server.

**Fix:** Install Redis Stack or the RedisJSON module. See [RedisJSON documentation](https://redis.io/docs/stack/json/).

## See Also

- **Related Concepts:**
  - [Services](/guides/core-concepts/services) - Using Redis in services

- **Other Helpers:**
  - [Helpers Index](../index) - All available helpers
  - [Queue Helper](../queue/) - BullMQ uses Redis as backend

- **References:**
  - [DataSources](/references/base/datasources) - Database connections

- **External Resources:**
  - [ioredis Documentation](https://github.com/redis/ioredis) - Redis client library
  - [Redis Commands](https://redis.io/commands/) - Redis command reference
  - [RedisJSON](https://redis.io/docs/stack/json/) - JSON module documentation

- **Best Practices:**
  - [Performance Optimization](/best-practices/performance-optimization) - Caching strategies
  - [Security Guidelines](/best-practices/security-guidelines) - Redis security
