# Component Internals

## `resolveBindings()`

Reads all binding keys from the DI container and validates required ones:

| Binding | Validation | Error on Failure |
|---------|-----------|------------------|
| `SERVER_OPTIONS` | Optional, merged with defaults | -- |
| `REDIS_CONNECTION` | Must be `instanceof DefaultRedisHelper` | `"Invalid instance of redisConnection"` |
| `AUTHENTICATE_HANDLER` | Must be a function (non-null) | `"Invalid authenticateFn"` |
| `VALIDATE_ROOM_HANDLER` | Optional | -- |
| `CLIENT_CONNECTED_HANDLER` | Optional | -- |
| `CLIENT_DISCONNECTED_HANDLER` | Optional | -- |
| `MESSAGE_HANDLER` | Optional | -- |
| `OUTBOUND_TRANSFORMER` | Optional | -- |
| `HANDSHAKE_HANDLER` | Optional (required if `requireEncryption`) | -- |

## `registerBunHook()`

Registers a post-start hook that:

1. Gets the Bun server instance via `getServerInstance<TBunServerInstance>()`
2. Gets the Hono server via `getServer()`
3. Creates `WebSocketServerHelper` with all resolved bindings and server options
4. Awaits `wsHelper.configure()` which waits for Redis connections and sets up subscriptions
5. Binds the helper to `WEBSOCKET_INSTANCE`
6. Creates a custom `fetch` handler that routes WebSocket upgrades vs HTTP requests
7. Calls `serverInstance.reload({ fetch, websocket })` to wire WebSocket into the running Bun server

## Runtime Check

The component checks the runtime during `binding()`:

```typescript
const runtime = RuntimeModules.detect();
if (runtime === RuntimeModules.NODE) {
  throw getError({
    message: '[WebSocketComponent] Node.js runtime is not supported yet. Please use Bun runtime.',
  });
}
```

This check runs at component initialization time (before any hooks are registered), failing fast if the runtime is incompatible.

## Graceful Shutdown

Always shut down the WebSocket server before stopping the application:

```typescript
override async stop(): Promise<void> {
  // 1. Shut down WebSocket (disconnects all clients, quits Redis)
  const wsHelper = this.get<WebSocketServerHelper>({
    key: WebSocketBindingKeys.WEBSOCKET_INSTANCE,
    isOptional: true,
  });

  if (wsHelper) {
    await wsHelper.shutdown();
  }

  // 2. Disconnect Redis helper
  if (this.redisHelper) {
    await this.redisHelper.disconnect();
  }

  // 3. Stop the Bun server
  await super.stop();
}
```

## Shutdown Sequence

```
wsHelper.shutdown()
  |-- Clear heartbeat timer
  |     +-- clearInterval(heartbeatTimer)
  |
  |-- Disconnect all tracked clients
  |     +-- For each client: socket.close(1001, 'Server shutting down')
  |
  |-- Clear tracking maps
  |     |-- clients.clear()
  |     |-- users.clear()
  |     +-- rooms.clear()
  |
  +-- Redis cleanup (parallel)
        |-- redisPub.quit()
        +-- redisSub.quit()
```
