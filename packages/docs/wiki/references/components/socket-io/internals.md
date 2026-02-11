# Component Internals

## `resolveBindings()`

Reads all binding keys from the DI container and validates required ones:

| Binding | Validation | Error on Failure |
|---------|-----------|------------------|
| `SERVER_OPTIONS` | Optional, merged with defaults | -- |
| `REDIS_CONNECTION` | Must be `instanceof DefaultRedisHelper` | `"Invalid instance of redisConnection"` |
| `AUTHENTICATE_HANDLER` | Must be a function (non-null) | `"Invalid authenticateFn"` |
| `VALIDATE_ROOM_HANDLER` | Optional, checked via `isBound()` | -- |
| `CLIENT_CONNECTED_HANDLER` | Optional, checked via `isBound()` | -- |

## `registerBunHook()`

Registers a post-start hook that:

1. Dynamically imports `@socket.io/bun-engine`
2. Creates a `BunEngine` instance with CORS config bridging
3. Creates `SocketIOServerHelper` with `runtime: RuntimeModules.BUN`
4. Awaits `socketIOHelper.configure()` which waits for all Redis connections to be ready before initializing the adapter and emitter
5. Binds the helper to `SOCKET_IO_INSTANCE`
6. Calls `serverInstance.reload()` to wire the engine's `fetch` and `websocket` handlers into the running Bun server

**CORS type bridging**: Socket.IO and `@socket.io/bun-engine` have slightly different CORS type definitions. The component extracts individual fields explicitly to avoid type mismatches without using `as any`.

## `registerNodeHook()`

Registers a post-start hook that:

1. Gets the HTTP server instance via `getServerInstance()`
2. Creates `SocketIOServerHelper` with `runtime: RuntimeModules.NODE`
3. Awaits `socketIOHelper.configure()` which waits for all Redis connections to be ready before initializing the adapter and emitter
4. Binds the helper to `SOCKET_IO_INSTANCE`

Node mode is simpler because Socket.IO natively attaches to `node:http.Server`.

## Post-Start Hook System

The component relies on `AbstractApplication`'s post-start hook system:

### API

```typescript
// Register a hook (during binding phase)
application.registerPostStartHook({
  identifier: string,     // Unique name for logging
  hook: () => ValueOrPromise<void>,  // Async function to execute
});

// Get the server instance (available after start)
application.getServerInstance<T>(): T | undefined;
```

### How Hooks Execute

```
executePostStartHooks()
  |-- Hook 1: "socket-io-initialize"
  |     |-- performance.now() -> start
  |     |-- await hook()
  |     +-- log: "Executed hook | identifier: socket-io-initialize | took: 12.5 (ms)"
  |-- Hook 2: "another-hook"
  |     +-- ...
  +-- (hooks run sequentially in registration order)
```

- Hooks run **sequentially** (not parallel) to guarantee ordering
- Each hook is timed with `performance.now()` for diagnostics
- If a hook throws, it propagates to `start()` and the server fails to start

## Graceful Shutdown

Always shut down the Socket.IO server before stopping the application:

```typescript
override async stop(): Promise<void> {
  // 1. Shut down Socket.IO (disconnects all clients, closes IO server, quits Redis)
  const socketIOHelper = this.get<SocketIOServerHelper>({
    key: SocketIOBindingKeys.SOCKET_IO_INSTANCE,
    isOptional: true,
  });

  if (socketIOHelper) {
    await socketIOHelper.shutdown();
  }

  // 2. Disconnect Redis helper
  if (this.redisHelper) {
    await this.redisHelper.disconnect();
  }

  // 3. Stop the HTTP/Bun server
  await super.stop();
}
```

### Shutdown Sequence

```
socketIOHelper.shutdown()
  |-- Disconnect all tracked clients
  |     |-- clearInterval(ping)
  |     |-- clearTimeout(authenticateTimeout)
  |     +-- socket.disconnect()
  |-- clients.clear()
  |-- io.close() -- closes the Socket.IO server
  +-- Redis cleanup
        |-- redisPub.quit()
        |-- redisSub.quit()
        +-- redisEmitter.quit()
```
