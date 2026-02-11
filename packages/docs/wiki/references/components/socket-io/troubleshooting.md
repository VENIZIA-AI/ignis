# Troubleshooting

## "SocketIO not initialized"

**Cause**: You're trying to use `SocketIOServerHelper` before the server has started (e.g., during DI construction).

**Fix**: Use the lazy getter pattern shown in the [Setup Guide](./setup-guide#step-3-use-in-servicescontrollers). Never `@inject` `SOCKET_IO_INSTANCE` directly in a constructor -- it doesn't exist yet at construction time.

## "Invalid instance of redisConnection"

**Cause**: The value bound to `REDIS_CONNECTION` is not an instance of `DefaultRedisHelper` (or its subclass `RedisHelper`).

**Fix**: Use `RedisHelper` (recommended) or `DefaultRedisHelper`:

```typescript
// Correct
this.bind({ key: SocketIOBindingKeys.REDIS_CONNECTION })
  .toValue(new RedisHelper({ name: 'socket-io', host, port, password }));

// Wrong -- raw ioredis client
this.bind({ key: SocketIOBindingKeys.REDIS_CONNECTION })
  .toValue(new Redis(6379));  // This is NOT a DefaultRedisHelper!
```

## "Cannot find module '@socket.io/bun-engine'"

**Cause**: Running on Bun runtime without the optional peer dependency installed.

**Fix**: `bun add @socket.io/bun-engine`

## Socket.IO connects but events aren't received

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
