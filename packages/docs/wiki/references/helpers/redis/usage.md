# Usage

All operations below are available on both `RedisHelper` and `RedisClusterHelper` via the shared `DefaultRedisHelper` base class.

## Connection

```typescript
// Manual connect (when autoConnect is false)
const connected = await redisClient.connect();
// => true if status is 'ready', false if already connected/connecting

// Disconnect gracefully
const disconnected = await redisClient.disconnect();
// => true if quit succeeded

// Health check
const pong = await redisClient.ping();
// => 'PONG'

// Access underlying ioredis client
const ioredisClient = redisClient.getClient();
// RedisHelper returns Redis, RedisClusterHelper returns Cluster
```

> [!NOTE]
> `connect()` is a no-op if the client status is already `ready`, `reconnecting`, or `connecting`. Similarly, `disconnect()` is a no-op if the status is `end` or `close`.

## Key-Value Operations

```typescript
// Set a value (auto-serialized to JSON)
await redisClient.set({ key: 'mykey', value: { a: 1, b: 2 } });

// Set with logging enabled
await redisClient.set({ key: 'mykey', value: { a: 1 }, options: { log: true } });

// Get raw string value
const raw = await redisClient.get({ key: 'mykey' });
// => '{"a":1,"b":2}'

// Get with custom transform
const parsed = await redisClient.get({
  key: 'mykey',
  transform: (input) => JSON.parse(input),
});

// Convenience: get as string (alias for get)
const str = await redisClient.getString({ key: 'mykey' });

// Convenience: get as parsed JSON object
const obj = await redisClient.getObject({ key: 'mykey' });
// => { a: 1, b: 2 }

// Delete keys
await redisClient.del({ keys: ['mykey', 'anotherkey'] });
```

## Multi-Key Operations

```typescript
// Set multiple keys at once
await redisClient.mset({
  payload: [
    { key: 'user:1', value: { name: 'Alice' } },
    { key: 'user:2', value: { name: 'Bob' } },
  ],
});

// Get multiple raw values
const values = await redisClient.mget({ keys: ['user:1', 'user:2'] });
// => ['{"name":"Alice"}', '{"name":"Bob"}']

// Get multiple with transform
const users = await redisClient.mget({
  keys: ['user:1', 'user:2'],
  transform: (el) => JSON.parse(el),
});

// Convenience: get multiple strings
const strings = await redisClient.getStrings({ keys: ['key1', 'key2'] });

// Convenience: get multiple parsed objects
const objects = await redisClient.getObjects({ keys: ['user:1', 'user:2'] });
```

> [!TIP]
> `mSet()`, `mGet()`, `hSet()`, and `hGetAll()` are camelCase aliases for `mset()`, `mget()`, `hset()`, and `hgetall()` respectively. Both forms are valid.

## Hash Operations

```typescript
// Set hash fields
await redisClient.hset({
  key: 'myhash',
  value: { field1: 'hello', field2: 'world' },
});

// Get all hash fields
const hash = await redisClient.hgetall({ key: 'myhash' });
// => { field1: 'hello', field2: 'world' }

// Get all with transform
const transformed = await redisClient.hgetall({
  key: 'myhash',
  transform: (input) => ({ ...input, extra: true }),
});
```

## Key Scanning

```typescript
// Find keys matching a pattern
const matchingKeys = await redisClient.keys({ key: 'user:*' });
// => ['user:1', 'user:2', ...]
```

> [!WARNING]
> `keys()` uses the Redis `KEYS` command, which scans the entire keyspace. Avoid using it in production on large databases -- prefer `SCAN` via `execute()` instead.

## RedisJSON

If your Redis server has the [RedisJSON](https://redis.io/docs/stack/json/) module installed, you can use the `j*` methods for native JSON document operations.

```typescript
// Set a JSON document
await redisClient.jSet({ key: 'mydoc', path: '$', value: { a: { b: 1 } } });

// Get a part of the document
const result = await redisClient.jGet({ key: 'mydoc', path: '$.a.b' });
// => [1]

// Get entire document (path defaults to '$')
const doc = await redisClient.jGet({ key: 'mydoc' });

// Delete a JSON path
await redisClient.jDelete({ key: 'mydoc', path: '$.a' });

// Delete entire document (path defaults to '$')
await redisClient.jDelete({ key: 'mydoc' });

// Increment a number
await redisClient.jNumberIncreaseBy({ key: 'mydoc', path: '$.counter', value: 5 });

// Append to a string
await redisClient.jStringAppend({ key: 'mydoc', path: '$.name', value: ' Smith' });

// Push to an array
await redisClient.jPush({ key: 'mydoc', path: '$.tags', value: 'new-tag' });

// Pop from an array
const popped = await redisClient.jPop({ key: 'mydoc', path: '$.tags' });
```

::: details RedisJSON Method Signatures

| Method | Parameters | Returns | Redis Command |
|--------|-----------|---------|---------------|
| `jSet<T>()` | `{ key, path, value: T }` | `Promise<string \| null>` | `JSON.SET` |
| `jGet<T>()` | `{ key, path? }` | `Promise<T \| null>` | `JSON.GET` |
| `jDelete()` | `{ key, path? }` | `Promise<number>` | `JSON.DEL` |
| `jNumberIncreaseBy()` | `{ key, path, value: number }` | `Promise<string \| null>` | `JSON.NUMINCRBY` |
| `jStringAppend()` | `{ key, path, value: string }` | `Promise<number[] \| null>` | `JSON.STRAPPEND` |
| `jPush<T>()` | `{ key, path, value: T }` | `Promise<number[] \| null>` | `JSON.ARRAPPEND` |
| `jPop<T>()` | `{ key, path }` | `Promise<T \| null>` | `JSON.ARRPOP` |

All `path` parameters default to `'$'` (root) when omitted, except for `jSet`, `jNumberIncreaseBy`, `jStringAppend`, and `jPush` where `path` is required.

:::

## Pub/Sub

The helper supports Redis Pub/Sub for real-time messaging with optional zlib compression.

```typescript
// Subscribe to a topic
redisClient.subscribe({ topic: 'my-channel' });

// Listen for messages (on the underlying ioredis client)
redisClient.getClient().on('message', (channel, message) => {
  if (channel === 'my-channel') {
    console.log('Received message:', JSON.parse(message));
  }
});

// Publish a message to one or more topics
await redisClient.publish({
  topics: ['my-channel', 'another-channel'],
  payload: { data: 'some important update' },
});

// Publish with zlib compression
await redisClient.publish({
  topics: ['compressed-channel'],
  payload: { large: 'dataset' },
  useCompress: true,
});

// Unsubscribe from a topic
redisClient.unsubscribe({ topic: 'my-channel' });
```

> [!IMPORTANT]
> When using Pub/Sub, the subscribing client enters subscriber mode and can only execute `SUBSCRIBE`, `PSUBSCRIBE`, `UNSUBSCRIBE`, `PUNSUBSCRIBE`, `PING`, and `QUIT` commands. Use `redisClient.getClient().duplicate()` to create a separate connection for Pub/Sub if you need the same client for other operations.

## Raw Command Execution

For commands not wrapped by the helper, use `execute()` to call any Redis command directly.

```typescript
// Execute any Redis command
const result = await redisClient.execute<string>('SET', ['mykey', 'myvalue', 'EX', 60]);

// Command without parameters
const info = await redisClient.execute<string>('INFO');

// SCAN instead of KEYS for production
const [cursor, keys] = await redisClient.execute<[string, string[]]>('SCAN', [0, 'MATCH', 'user:*', 'COUNT', 100]);
```
