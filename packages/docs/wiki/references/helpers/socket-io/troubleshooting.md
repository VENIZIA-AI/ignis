# Troubleshooting

### `configure()` not called -- server does not accept connections

**Symptom:** The `SocketIOServerHelper` is constructed but no clients can connect. No `connection` events fire.

**Cause:** The constructor only stores options and initializes Redis client duplicates. The IO server, Redis adapter, emitter, and connection handler are all set up inside `configure()`, which is async and must be awaited explicitly.

**Fix:**
```typescript
const helper = new SocketIOServerHelper({ /* ... */ });
await helper.configure(); // Required before the server is operational
```

### Redis connections hang during `configure()`

**Symptom:** `configure()` never resolves. The server is stuck at "Configuring IO Server".

**Cause:** The duplicated Redis clients inherit `lazyConnect` from the parent. If the parent was configured with `lazyConnect: true`, the duplicated clients start in `'wait'` status. `configure()` calls `client.connect()` for clients in `'wait'` status, but if the Redis server is unreachable, the `ready` event never fires.

**Fix:** Ensure the Redis server is reachable and that the `redisConnection` helper has successfully connected before passing it to `SocketIOServerHelper`. The `configure()` method registers error handlers on all three clients, so check the logs for `Redis adapter pub error`, `Redis adapter sub error`, or `Redis emitter error` messages.

### Client `authenticate()` silently does nothing

**Symptom:** Calling `client.authenticate()` has no effect. No `authenticate` event reaches the server.

**Cause:** The `authenticate()` method guards against two conditions: the socket must be connected (`this.client.connected`) and the state must be `UNAUTHORIZED`. If either check fails, the method returns early with only a warning log.

**Fix:** Ensure `authenticate()` is called only after the `onConnected` callback fires, and that the client has not already started authentication. Check the client logs for `Cannot authenticate` warning messages.
