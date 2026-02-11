# Troubleshooting

### Connection Refused / Timeout

**Symptoms:** `ECONNREFUSED`, connection hangs, or `onError` fires immediately.

**Checklist:**
- Verify Redis is running and reachable at the configured `host:port`
- Check firewall rules and network access between your application and the Redis server
- If using `autoConnect: false`, ensure you call `await redisClient.connect()` before any operations
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
