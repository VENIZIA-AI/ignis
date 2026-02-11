# Troubleshooting

## "WebSocket not initialized"

**Cause**: You are trying to use `WebSocketServerHelper` before the server has started (e.g., during DI construction).

**Fix**: Use the lazy getter pattern shown in the [Setup Guide](./setup-guide#step-3-use-in-servicescontrollers). Never `@inject` `WEBSOCKET_INSTANCE` directly in a constructor -- it does not exist yet at construction time.

## "Invalid instance of redisConnection"

**Cause**: The value bound to `REDIS_CONNECTION` is not an instance of `DefaultRedisHelper` (or its subclass `RedisHelper`).

**Fix**: Use `RedisHelper` (recommended) or `DefaultRedisHelper`:

```typescript
// Correct
this.bind({ key: WebSocketBindingKeys.REDIS_CONNECTION })
  .toValue(new RedisHelper({ name: 'websocket', host, port, password }));

// Wrong -- raw ioredis client
this.bind({ key: WebSocketBindingKeys.REDIS_CONNECTION })
  .toValue(new Redis(6379));  // This is NOT a DefaultRedisHelper!
```

## "Invalid authenticateFn to setup WebSocket server!"

**Cause**: No authentication function was bound to `AUTHENTICATE_HANDLER`, or it was bound as `null`.

**Fix**: Bind a valid authentication function before registering the component:

```typescript
this.bind<TWebSocketAuthenticateFn>({
  key: WebSocketBindingKeys.AUTHENTICATE_HANDLER,
}).toValue(async (data) => {
  const token = data.token as string;
  const user = await verifyJWT(token);
  return user ? { userId: user.id } : null;
});
```

## "Node.js runtime is not supported yet"

**Cause**: Running the application on Node.js. The WebSocket component only supports Bun.

**Fix**: Either switch to Bun runtime, or use the [Socket.IO Component](../socket-io/) which supports both Node.js and Bun.

## "Bun server instance not available!"

**Cause**: The post-start hook executed but could not obtain the Bun server instance. This typically means the server failed to start.

**Fix**: Check server startup logs for errors. Ensure `start()` completes successfully before post-start hooks run.

## WebSocket connects but messages are not received

**Cause**: Clients must send `{ event: 'authenticate', data: { type: '...', token: '...', publicKey?: '...' } }` after connecting. Unauthenticated clients are disconnected after the timeout (default: 5 seconds) and cannot receive messages other than `error` events.

**Fix**: Ensure your client authenticates immediately after connection:

```javascript
const ws = new WebSocket('wss://example.com/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({
    event: 'authenticate',
    data: { type: 'Bearer', token: 'your-jwt-token' },
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.event === 'connected') {
    console.log('Authenticated! Client ID:', msg.data.id);
    // Now ready to send/receive events
  }
};
```

## Client disconnected with code 4002

**Cause**: The client did not send any messages (including heartbeat) within the `heartbeatTimeout` period (default: 90 seconds).

**Fix**: Implement a heartbeat on the client side:

```javascript
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event: 'heartbeat' }));
  }
}, 30000);
```
