# Socket.IO -- Error Reference

> Error conditions, failure messages, and troubleshooting for the Socket.IO component, server helper, and client helper.

## Error Conditions

### Component Errors

| Method | Condition | Error Message |
|--------|-----------|---------------|
| `binding()` | `application` is falsy | `"[binding] Invalid application to bind SocketIOComponent"` |
| `binding()` | Unsupported runtime | `"[SocketIOComponent] Unsupported runtime: <runtime>"` |
| `resolveBindings()` | `REDIS_CONNECTION` not instanceof `DefaultRedisHelper` | `"Invalid instance of redisConnection | Please init connection with RedisHelper for single redis connection or RedisClusterHelper for redis cluster mode!"` |
| `resolveBindings()` | `AUTHENTICATE_HANDLER` is falsy | `"[DANGER][SocketIOComponent] Invalid authenticateFn to setup io socket server!"` |
| `registerNodeHook()` | HTTP server not available | `"[SocketIOComponent] HTTP server not available for Node.js runtime!"` |

### Server Helper Errors

| Method | Condition | Error Message |
|--------|-----------|---------------|
| `setRuntime()` | Node.js runtime, `server` missing | `"[SocketIOServerHelper] Invalid HTTP server for Node.js runtime!"` |
| `setRuntime()` | Bun runtime, `engine` missing | `"[SocketIOServerHelper] Invalid @socket.io/bun-engine instance for Bun runtime!"` |
| `setRuntime()` | Unknown runtime | `"[SocketIOServerHelper] Unsupported runtime!"` |
| `initRedisClients()` | `redisConnection` is falsy | `"Invalid redis connection to config socket.io adapter!"` |
| `initIOServer()` | Node.js runtime, `server` missing at configure time | `"[DANGER] Invalid HTTP server instance to init Socket.io server!"` |
| `initIOServer()` | Bun runtime, `engine` missing at configure time | `"[DANGER] Invalid @socket.io/bun-engine instance to init Socket.io server!"` |
| `initIOServer()` | Unknown runtime at configure time | `"[configure] Unsupported runtime: <runtime>"` |
| `getEngine()` | Runtime is not Bun | `"[getEngine] Engine is only available for Bun runtime!"` |
| `on()` | `topic` is empty | `"[on] Invalid topic to start binding handler"` |
| `on()` | `handler` is falsy | `"[on] Invalid event handler | topic: <topic>"` |
| `on()` | IO server not initialized | `"[on] IOServer is not initialized yet!"` |

### Client Helper Errors

| Method | Condition | Error Message |
|--------|-----------|---------------|
| `emit()` | Socket not connected | `"Invalid socket client state to emit"` (statusCode: 400) |
| `emit()` | `topic` is falsy | `"Topic is required to emit"` (statusCode: 400) |

### Server Authentication Errors (sent to client)

| Condition | Event | Message |
|-----------|-------|---------|
| `authenticateFn` returned `false` | `unauthenticated` | `"Invalid token to authenticate! Please login again!"` |
| `authenticateFn` threw an error | `unauthenticated` | `"Failed to authenticate connection! Please login again!"` |

## Troubleshooting

### "SocketIO not initialized"

**Cause**: You're trying to use `SocketIOServerHelper` before the server has started (e.g., during DI construction).

**Fix**: Use the lazy getter pattern shown in the [Usage & Examples](./usage) page. Never `@inject` `SOCKET_IO_INSTANCE` directly in a constructor -- it doesn't exist yet at construction time.

### "Invalid instance of redisConnection"

**Cause**: The value bound to `REDIS_CONNECTION` is not an instance of `DefaultRedisHelper` (or its subclasses `RedisHelper` / `RedisClusterHelper`).

**Fix**: Use `RedisHelper` (single instance) or `RedisClusterHelper` (cluster mode):

```typescript
// Correct -- single instance
this.bind({ key: SocketIOBindingKeys.REDIS_CONNECTION })
  .toValue(new RedisHelper({ name: 'socket-io', host, port, password }));

// Correct -- cluster mode
this.bind({ key: SocketIOBindingKeys.REDIS_CONNECTION })
  .toValue(new RedisClusterHelper({ name: 'socket-io', nodes, password }));

// Wrong -- raw ioredis client
this.bind({ key: SocketIOBindingKeys.REDIS_CONNECTION })
  .toValue(new Redis(6379));  // This is NOT a DefaultRedisHelper!
```

### "Cannot find module '@socket.io/bun-engine'"

**Cause**: Running on Bun runtime without the optional peer dependency installed.

**Fix**: `bun add @socket.io/bun-engine`

### Socket.IO connects but events aren't received

**Cause**: Clients must emit `authenticate` after connecting. Unauthenticated clients are disconnected after the timeout (default: 10 seconds).

**Fix**: Ensure your client emits the authenticate event:

```typescript
socket.on('connect', () => {
  socket.emit('authenticate');
});

socket.on('authenticated', (data) => {
  // Now ready to send/receive events
});
```

### "Invalid socket client state to emit"

**Cause**: Calling `emit()` on `SocketIOClientHelper` when the socket is not connected.

**Fix**: Ensure the socket is connected before emitting. Check `client.getSocketClient().connected` or wait for the `onConnected` callback.

### Client disconnects immediately after connecting

**Cause**: The authentication timeout expired (default: 10 seconds). The client connected but did not emit `authenticate` in time.

**Fix**: Emit `authenticate` immediately on connect, or increase the `authenticateTimeout` in the server helper options.

### Room join requests are silently rejected

**Cause**: No `validateRoomFn` is bound. Without a validation function, all room join requests are rejected by design (security-by-default).

**Fix**: Bind a `VALIDATE_ROOM_HANDLER` that returns the list of allowed rooms.

## See Also

- [Setup & Configuration](./) -- Quick reference, installation, bindings, constants
- [Usage & Examples](./usage) -- Server-side usage, client helper, advanced patterns
- [API Reference](./api) -- Architecture, method signatures, internals, types
