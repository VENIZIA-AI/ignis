# WebSocket -- Error Reference

> Error conditions table and troubleshooting guide for the WebSocket component.

## Error Conditions

The server can send `error` events or close the connection under the following conditions:

| Error Message / Close Code | Trigger | Event Type |
|---------------------------|---------|------------|
| `"Invalid message format"` | Client sent non-JSON data | `error` event |
| `"Already authenticated"` | Client sent `authenticate` when state is not `UNAUTHORIZED` | `error` event |
| `"Not authenticated"` | Client sent a non-`authenticate`, non-`heartbeat` event while unauthenticated | `error` event |
| `"Authentication failed"` | `authenticateFn` returned `null`/`false` | `error` event + close `4003` |
| `"Authentication error"` | `authenticateFn` threw an exception | `error` event + close `4003` |
| `"Encryption handshake failed"` | `handshakeFn` returned `null`/`false` | `error` event + close `4004` |
| Close `4004` (no error event) | `requireEncryption: true` but no `handshakeFn` configured | close `4004` only |
| Close `4001` | Auth timeout (initial: no `authenticate` sent) | close `4001` only |
| Close `4001` | Auth in-progress timeout (`authenticateFn`/`handshakeFn` too slow) | close `4001` only |
| Close `4002` | Heartbeat timeout (no messages within `heartbeatTimeout`) | close `4002` only |
| Close `1001` | Server shutdown (`wsHelper.shutdown()`) | close `1001` only |
| `"Invalid redis connection!"` | Constructor: `redisConnection` is falsy | thrown `Error` (startup) |
| `"WebSocket upgrade failed"` | `server.upgrade()` returned `false` | HTTP `500` response |

## Troubleshooting

### "WebSocket not initialized"

**Cause**: You are trying to use `WebSocketServerHelper` before the server has started (e.g., during DI construction).

**Fix**: Use the lazy getter pattern shown in [Usage & Examples](./usage). Never `@inject` `WEBSOCKET_INSTANCE` directly in a constructor -- it does not exist yet at construction time.

### "Invalid instance of redisConnection"

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

### "Invalid authenticateFn to setup WebSocket server!"

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

### "Node.js runtime is not supported yet"

**Cause**: Running the application on Node.js. The WebSocket component only supports Bun.

**Fix**: Either switch to Bun runtime, or use the [Socket.IO Component](../socket-io/) which supports both Node.js and Bun.

### "Bun server instance not available!"

**Cause**: The post-start hook executed but could not obtain the Bun server instance. This typically means the server failed to start.

**Fix**: Check server startup logs for errors. Ensure `start()` completes successfully before post-start hooks run.

### WebSocket connects but messages are not received

**Cause**: Clients must send <code v-pre>{ event: 'authenticate', data: { type: '...', token: '...', publicKey?: '...' } }</code> after connecting. Unauthenticated clients are disconnected after the timeout (default: 5 seconds) and cannot receive messages other than `error` events.

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

### Client disconnected with code 4002

**Cause**: The client did not send any messages (including heartbeat) within the `heartbeatTimeout` period (default: 90 seconds).

**Fix**: Implement a heartbeat on the client side:

```javascript
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event: 'heartbeat' }));
  }
}, 30000);
```

## See Also

- [Setup & Configuration](./) - Quick reference, imports, setup steps, configuration, and binding keys
- [Usage & Examples](./usage) - Server-side usage, emitter, wire protocol, client tracking, and delivery strategy
- [API Reference](./api) - Architecture, WebSocketEmitter API, and internals
- [WebSocketServerHelper](/references/helpers/websocket/) - Helper API documentation
- [Socket.IO Component](../socket-io/) - Node.js-compatible alternative with Socket.IO
- [Bun WebSocket Documentation](https://bun.sh/docs/api/websockets) - Official Bun WebSocket API reference
