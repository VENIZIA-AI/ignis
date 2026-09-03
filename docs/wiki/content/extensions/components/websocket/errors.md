---
title: WebSocket Component - Error Reference
description: Error conditions, close codes, and troubleshooting for the WebSocket component
difficulty: intermediate
---

# Error Reference

Every error condition the WebSocket component and helper can raise, plus fixes for the ones you'll actually hit.

## Error conditions

| Error Message / Close Code | Trigger | Event Type |
|---------------------------|---------|------------|
| `"Invalid message format"` | Client sent non-JSON data | `error` event |
| `"Already authenticated"` | Client sent `authenticate` while state was not `UNAUTHORIZED` | `error` event |
| `"Not authenticated"` | Client sent a non-`authenticate`, non-`heartbeat` event while unauthenticated | `error` event |
| `"Authentication failed"` | `authenticateFn` returned `null`/`false` | `error` event + close `4003` |
| `"Authentication error"` | `authenticateFn` threw | `error` event + close `4003` |
| `"Encryption handshake failed"` | `handshakeFn` returned `null`/`false` | `error` event + close `4004` |
| Close `4004` (no error event) | `requireEncryption: true` but no `handshakeFn` configured | close `4004` only |
| Close `4001` | Auth timeout - no `authenticate` sent within `authTimeout` | close `4001` only |
| Close `4001` | Auth in-progress timeout - `authenticateFn`/`handshakeFn` slower than `authTimeout * 3` | close `4001` only |
| Close `4002` | Heartbeat timeout - no messages within `heartbeatTimeout` | close `4002` only |
| Close `1001` | Server shutdown (`wsHelper.shutdown()`) | close `1001` only |
| `"Invalid redis connection!"` | Constructor: `redisConnection` is falsy | thrown `Error` (startup) |
| `"WebSocket upgrade failed"` | `server.upgrade()` returned `false` | HTTP `500` response |

### Component-level errors

| Method | Condition | Error Message |
|--------|-----------|---------------|
| `binding()` | `application` is falsy | `"[binding] Invalid application to bind WebSocketComponent"` |
| `binding()` | Node.js runtime detected | `"[WebSocketComponent] Node.js runtime is not supported yet. Please use Bun runtime."` |
| `resolveBindings()` | `REDIS_CONNECTION` fails `isRedisHelper()` | `"[WebSocketComponent][resolveBindings] Invalid instance of redisConnection ..."` |
| `resolveBindings()` | `AUTHENTICATE_HANDLER` is falsy | `"[WebSocketComponent] Invalid authenticateFn to setup WebSocket server!"` |
| `registerBunHook()` | Bun server instance not available | `"[WebSocketComponent] Bun server instance not available!"` |

## Troubleshooting

### "WebSocket not initialized"

- **Cause:** `WebSocketServerHelper` was accessed before the server started - for example during DI construction.
- **Fix:** Use the lazy getter pattern from [Usage & Examples](./usage). Never `@inject` `WEBSOCKET_INSTANCE` in a constructor - it does not exist yet at that point.

### "Invalid instance of redisConnection"

- **Cause:** The value bound to `REDIS_CONNECTION` is not an `AbstractRedisHelper` instance. It is not a `RedisSingleHelper`, `RedisClusterHelper`, or `RedisSentinelHelper`.
- **Fix:** Bind one of the concrete topology helpers, not a raw `ioredis` client.

```typescript
import { WebSocketBindingKeys } from '@venizia/ignis/websocket';

// Correct
this.bind({ key: WebSocketBindingKeys.REDIS_CONNECTION })
  .toValue(new RedisSingleHelper({ name: 'websocket', host, port, password }));

// Wrong: raw ioredis client, not an AbstractRedisHelper
this.bind({ key: WebSocketBindingKeys.REDIS_CONNECTION }).toValue(new Redis(6379));
```

### "Invalid authenticateFn to setup WebSocket server!"

- **Cause:** No function bound to `AUTHENTICATE_HANDLER`, or it was bound as `null`.
- **Fix:** Bind a valid authentication function before registering the component.

```typescript
import { WebSocketBindingKeys } from '@venizia/ignis/websocket';

this.bind<TWebSocketAuthenticateFn>({ key: WebSocketBindingKeys.AUTHENTICATE_HANDLER }).toValue(
  async data => {
    const user = await verifyJWT(data.token as string);
    return user ? { userId: user.id } : null;
  },
);
```

### "Node.js runtime is not supported yet"

- **Cause:** Running on Node.js. The WebSocket component only supports Bun.
- **Fix:** Switch to Bun, or use the [Socket.IO Component](../socket-io/) instead - it supports both runtimes.

### "Bun server instance not available!"

- **Cause:** The post-start hook ran but could not obtain the Bun server instance - typically the server failed to start.
- **Fix:** Check server startup logs. Confirm `start()` completes successfully before post-start hooks run.

### WebSocket connects but no messages arrive

- **Cause:** The client never sent `{ event: 'authenticate', data: { ... } }`. Unauthenticated clients are disconnected after `authTimeout` (5s default) and receive only `error` events.
- **Fix:** Authenticate immediately after the connection opens.

```javascript
const ws = new WebSocket('wss://example.com/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({ event: 'authenticate', data: { type: 'Bearer', token: 'your-jwt-token' } }));
};

ws.onmessage = event => {
  const msg = JSON.parse(event.data);
  if (msg.event === 'connected') {
    console.log('Authenticated! Client ID:', msg.data.id);
  }
};
```

### Client disconnected with code 4002

- **Cause:** No message (including `heartbeat`) arrived within `heartbeatTimeout` (90s default).
- **Fix:** Send a heartbeat on an interval shorter than the timeout.

```javascript
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event: 'heartbeat' }));
  }
}, 30000);
```

## See also

- [Overview](./) - quick start, imports, common configuration tasks
- [Usage & Examples](./usage) - injecting the helper, `WebSocketEmitter`, wire protocol, client tracking, delivery strategy
- [Full Reference](./api) - binding keys, configuration options, `WebSocketEmitter` API, internals
- [WebSocketServerHelper](/extensions/helpers/websocket/) - helper API documentation
- [Socket.IO Component](../socket-io/) - Node.js-compatible alternative
- [Bun WebSocket Documentation](https://bun.sh/docs/api/websockets) - official Bun WebSocket API reference
