---
title: Socket.IO Component - Error Reference
description: Error conditions, failure messages, and troubleshooting for the Socket.IO component, server helper, and client helper
difficulty: intermediate
---

# Error Reference

Every error condition the Socket.IO component and its two helpers can raise, plus fixes for the ones you'll actually hit.

## Error conditions

### Component errors

| Method | Condition | Error message |
|---|---|---|
| `binding()` | `application` is falsy | `"[binding] Invalid application to bind SocketIOComponent"` |
| `binding()` | Unsupported runtime | `"[SocketIOComponent] Unsupported runtime: <runtime>"` |
| `resolveBindings()` | `REDIS_CONNECTION` fails `isRedisHelper()` | `"Invalid instance of redisConnection..."` |
| `resolveBindings()` | `AUTHENTICATE_HANDLER` is falsy | `"[DANGER][SocketIOComponent] Invalid authenticateFn to setup io socket server!"` |
| `registerNodeHook()` | HTTP server not available | `"[SocketIOComponent] HTTP server not available for Node.js runtime!"` |

### Server helper errors

| Method | Condition | Error message |
|---|---|---|
| `setRuntime()` | Node.js runtime, `server` missing | `"[SocketIOServerHelper] Invalid HTTP server for Node.js runtime!"` |
| `setRuntime()` | Bun runtime, `engine` missing | `"[SocketIOServerHelper] Invalid @socket.io/bun-engine instance for Bun runtime!"` |
| `setRuntime()` | Unknown runtime | `"[SocketIOServerHelper] Unsupported runtime!"` |
| `initRedisClients()` | `redisConnection` is falsy | `"Invalid redis connection to config socket.io adapter!"` |
| `initIOServer()` | Node.js, `server` missing at configure time | `"[DANGER] Invalid HTTP server instance to init Socket.io server!"` |
| `initIOServer()` | Bun, `engine` missing at configure time | `"[DANGER] Invalid @socket.io/bun-engine instance to init Socket.io server!"` |
| `initIOServer()` | Unknown runtime at configure time | `"[configure] Unsupported runtime: <runtime>"` |
| `getEngine()` | Runtime is not Bun | `"[getEngine] Engine is only available for Bun runtime!"` |
| `on()` | `topic` is empty | `"[on] Invalid topic to start binding handler"` |
| `on()` | `handler` is falsy | `"[on] Invalid event handler \| topic: <topic>"` |
| `on()` | IO server not initialized | `"[on] IOServer is not initialized yet!"` |

### Client helper errors

| Method | Condition | statusCode | Error message |
|---|---|---|---|
| `emit()` | Socket not connected | `400` | `"Invalid socket client state to emit"` |
| `emit()` | `topic` is falsy | `400` | `"Topic is required to emit"` |

### Server authentication errors (sent to the client)

| Condition | Event | Message |
|---|---|---|
| `authenticateFn` returned `false` | `unauthenticated` | `"Invalid token to authenticate! Please login again!"` |
| `authenticateFn` threw an error | `unauthenticated` | `"Failed to authenticate connection! Please login again!"` |

## Troubleshooting

### "SocketIO not initialized"

- **Cause:** You used `SocketIOServerHelper` before the server started - typically during DI construction.
- **Fix:** Use the lazy getter pattern from [Usage & Examples](./usage#inject-the-helper-in-a-service-or-controller). Never `@inject` `SOCKET_IO_INSTANCE` in a constructor - it doesn't exist yet at that point.

### "Invalid instance of redisConnection"

- **Cause:** The value bound to `REDIS_CONNECTION` isn't an `AbstractRedisHelper` instance - not a `RedisSingleHelper`, `RedisClusterHelper`, or `RedisSentinelHelper`.
- **Fix:** Bind one of the concrete topology helpers, never a raw `ioredis` client.

```typescript
import { SocketIOBindingKeys } from '@venizia/ignis/socket-io';

// Correct - single instance
this.bind({ key: SocketIOBindingKeys.REDIS_CONNECTION })
  .toValue(new RedisSingleHelper({ name: 'socket-io', host, port, password }));

// Correct - cluster mode
this.bind({ key: SocketIOBindingKeys.REDIS_CONNECTION })
  .toValue(new RedisClusterHelper({ name: 'socket-io', nodes, password }));

// Wrong - raw ioredis client, not an AbstractRedisHelper
this.bind({ key: SocketIOBindingKeys.REDIS_CONNECTION }).toValue(new Redis(6379));
```

### "Cannot find module '@socket.io/bun-engine'"

- **Cause:** Running on Bun without the optional peer dependency installed.
- **Fix:** `bun add @socket.io/bun-engine`

### Socket.IO connects but events aren't received

- **Cause:** The client never emitted `authenticate`. Unauthenticated clients are disconnected after the timeout (default: 10 seconds).
- **Fix:** Emit `authenticate` right after connecting.

```typescript
socket.on('connect', () => {
  socket.emit('authenticate');
});

socket.on('authenticated', data => {
  // Now ready to send/receive events
});
```

### "Invalid socket client state to emit"

- **Cause:** You called `emit()` on `SocketIOClientHelper` while the socket wasn't connected.
- **Fix:** Confirm the socket is connected before emitting. Check `client.getSocketClient().connected`, or wait for the `onConnected` callback.

### Client disconnects immediately after connecting

- **Cause:** The authentication timeout expired (default: 10 seconds) before the client emitted `authenticate`.
- **Fix:** Emit `authenticate` immediately on connect, or raise `authenticateTimeout` in the server helper options.

### Room join requests are silently rejected

- **Cause:** No `validateRoomFn` is bound. Every join is rejected by design when it's missing - security-by-default.
- **Fix:** Bind a `VALIDATE_ROOM_HANDLER` that returns the list of allowed rooms.

## See also

- [Overview](./) - quick start, imports, common configuration tasks
- [Usage & Examples](./usage) - full setup steps, server-side usage, client helper, advanced patterns
- [Full Reference](./api) - architecture, configuration reference, method signatures, internals, types
