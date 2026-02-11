# API Summary

::: details API Summary

| Method | Returns | Description |
|--------|---------|-------------|
| **Connection** | | |
| `connect()` | `Promise<boolean>` | Manual connect (no-op if already connected) |
| `disconnect()` | `Promise<boolean>` | Graceful disconnect via `QUIT` |
| `ping()` | `Promise<string>` | Health check, returns `'PONG'` |
| `getClient()` | `Redis \| Cluster` | Access underlying ioredis client |
| **Key-Value** | | |
| `set(opts)` | `Promise<void>` | Set a key with JSON-serialized value |
| `get(opts)` | `Promise<T \| null>` | Get raw value with optional transform |
| `getString(opts)` | `Promise<string \| null>` | Get raw string value |
| `getObject(opts)` | `Promise<T \| null>` | Get value parsed as JSON |
| `del(opts)` | `Promise<number>` | Delete one or more keys |
| **Multi-Key** | | |
| `mset(opts)` / `mSet(opts)` | `Promise<void>` | Set multiple key-value pairs |
| `mget(opts)` / `mGet(opts)` | `Promise<(T \| null)[]>` | Get multiple values with optional transform |
| `getStrings(opts)` | `Promise<(string \| null)[]>` | Get multiple raw string values |
| `getObjects(opts)` | `Promise<(T \| null)[]>` | Get multiple values parsed as JSON |
| **Hashes** | | |
| `hset(opts)` / `hSet(opts)` | `Promise<number>` | Set hash fields |
| `hgetall(opts)` / `hGetAll(opts)` | `Promise<Record \| null>` | Get all hash fields with optional transform |
| **Key Scanning** | | |
| `keys(opts)` | `Promise<string[]>` | Find keys matching a pattern |
| **RedisJSON** | | |
| `jSet(opts)` | `Promise<string \| null>` | Set a JSON document (`JSON.SET`) |
| `jGet(opts)` | `Promise<T \| null>` | Get a JSON document or path (`JSON.GET`) |
| `jDelete(opts)` | `Promise<number>` | Delete a JSON path (`JSON.DEL`) |
| `jNumberIncreaseBy(opts)` | `Promise<string \| null>` | Increment a number (`JSON.NUMINCRBY`) |
| `jStringAppend(opts)` | `Promise<number[] \| null>` | Append to a string (`JSON.STRAPPEND`) |
| `jPush(opts)` | `Promise<number[] \| null>` | Push to an array (`JSON.ARRAPPEND`) |
| `jPop(opts)` | `Promise<T \| null>` | Pop from an array (`JSON.ARRPOP`) |
| **Pub/Sub** | | |
| `subscribe(opts)` | `void` | Subscribe to a topic |
| `publish(opts)` | `Promise<void>` | Publish to one or more topics with optional compression |
| `unsubscribe(opts)` | `void` | Unsubscribe from a topic |
| **Raw** | | |
| `execute(command, params?)` | `Promise<R>` | Execute any Redis command directly |

:::
