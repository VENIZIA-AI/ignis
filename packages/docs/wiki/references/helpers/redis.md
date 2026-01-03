# Redis Helper

Powerful Redis abstraction supporting single instances and clusters via `ioredis`.

## Quick Reference

| Helper Class | Use Case |
|--------------|----------|
| **RedisHelper** | Single Redis instance |
| **RedisClusterHelper** | Redis cluster |
| **DefaultRedisHelper** | Base class with unified API |

### Supported Operations

| Operation | Methods |
|-----------|---------|
| **Key-Value** | `set()`, `get()`, `getObject()`, `del()` |
| **Hashes** | `hset()`, `hget()`, `hgetall()` |
| **JSON** (RedisJSON) | `jSet()`, `jGet()` (requires RedisJSON module) |
| **Pub/Sub** | `subscribe()`, `publish()`, `unsubscribe()` |
| **TTL** | Set expiration on keys |

## Creating a Redis Client

### Single Instance

Use the `RedisHelper` for connecting to a single Redis instance.

```typescript
import { RedisHelper } from '@venizia/ignis';

const redisClient = new RedisHelper({
  name: 'my-redis-client',
  host: 'localhost',
  port: 6379,
  password: 'password',
  autoConnect: true,
  maxRetry: 5,
});
```

### Redis Cluster

Use the `RedisClusterHelper` for connecting to a Redis cluster.

```typescript
import { RedisClusterHelper } from '@venizia/ignis';

const redisClusterClient = new RedisClusterHelper({
  name: 'my-redis-cluster',
  nodes: [
    { host: 'localhost', port: 7000 },
    { host: 'localhost', port: 7001 },
    // ... other nodes
  ],
});
```

## Basic Operations

The helper provides methods for common Redis commands.

### Key-Value

```typescript
// Set a value
await redisClient.set({ key: 'mykey', value: { a: 1, b: 2 } });

// Get a value
const value = await redisClient.getObject({ key: 'mykey' });
// => { a: 1, b: 2 }

// Delete a key
await redisClient.del({ keys: ['mykey'] });
```

### Hashes

```typescript
// Set hash fields
await redisClient.hset({ key: 'myhash', value: { field1: 'hello', field2: 'world' } });

// Get all hash fields
const hash = await redisClient.hgetall({ key: 'myhash' });
// => { field1: 'hello', field2: 'world' }
```

## RedisJSON

If your Redis server has the RedisJSON module installed, you can use the `j*` methods to work with JSON documents.

```typescript
// Set a JSON document
await redisClient.jSet({ key: 'mydoc', path: '$', value: { a: { b: 1 } } });

// Get a part of the document
const result = await redisClient.jGet({ key: 'mydoc', path: '$.a.b' });
// => [1]
```

## Pub/Sub

The helper also supports Redis Pub/Sub for real-time messaging.

```typescript
// Subscribe to a topic
redisClient.subscribe({ topic: 'my-channel' });

// Listen for messages (in a separate part of your app)
redisClient.getClient().on('message', (channel, message) => {
  if (channel === 'my-channel') {
    console.log('Received message:', JSON.parse(message));
  }
});

// Publish a message
await redisClient.publish({
  topics: ['my-channel'],
  payload: { data: 'some important update' },
});
```

## See Also

- **Related Concepts:**
  - [Services](/guides/core-concepts/services) - Using Redis in services

- **Other Helpers:**
  - [Helpers Index](./index) - All available helpers
  - [Queue Helper](./queue) - BullMQ uses Redis as backend

- **References:**
  - [DataSources](/references/base/datasources) - Database connections

- **External Resources:**
  - [ioredis Documentation](https://github.com/redis/ioredis) - Redis client library
  - [Redis Commands](https://redis.io/commands/) - Redis command reference
  - [RedisJSON](https://redis.io/docs/stack/json/) - JSON module documentation

- **Best Practices:**
  - [Performance Optimization](/best-practices/performance-optimization) - Caching strategies
  - [Security Guidelines](/best-practices/security-guidelines) - Redis security
