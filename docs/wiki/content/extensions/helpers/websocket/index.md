---
title: WebSocket
description: Bun-native WebSocket server and Redis-backed emitter for real-time communication
difficulty: intermediate
---

# WebSocket

A Bun-native WebSocket server with post-connection authentication, rooms, heartbeat, and Redis Pub/Sub for horizontal scaling, plus a Redis-only emitter for publishing to it from other processes.

> [!IMPORTANT]
> **Bun only.** `WebSocketServerHelper` uses Bun's native WebSocket API and will not run on Node.js. For Node.js, use the [Socket.IO Helper](../socket-io/) instead.

## In one example

The smallest working server: authenticate, then send.

```typescript
import { WebSocketServerHelper } from '@venizia/ignis-helpers';

const helper = new WebSocketServerHelper({
  identifier: 'my-ws-server',
  server: bunServer, // Bun.Server
  redisConnection: redis, // IRedisHelper
  authenticateFn: async data => {
    const { token } = data as { token: string };
    const user = await verifyJWT(token);
    return user ? { userId: user.id } : null; // null rejects
  },
});

await helper.configure();

bunServer.reload({
  fetch: myFetchHandler,
  websocket: helper.getBunWebSocketHandler(),
});
```

A client connects, then authenticates before it can send or receive anything else:

```javascript
const ws = new WebSocket('wss://example.com/ws');
ws.onopen = () => ws.send(JSON.stringify({ event: 'authenticate', data: { token: '...' } }));
```

## How it works

- **Every connection starts unauthenticated.** The WebSocket upgrade always succeeds; the client starts as `UNAUTHORIZED` and must send `{ event: 'authenticate' }` within `authTimeout` (5s default) or get closed with code `4001`.
- **`authenticateFn` decides accept or reject.** On success the client is indexed by `userId`, joins `defaultRooms`, and moves to `AUTHENTICATED`.
- **Delivery has two tiers** - local-only fan-out on this process, or a Redis Pub/Sub layer that also reaches other server instances:

| Tier | Methods | Reach | Mechanism |
|------|---------|-------|-----------|
| Local-only | `sendToClient`, `sendToUser`, `sendToRoom`, `broadcast` | Clients connected to this process | Bun's native `server.publish()` - O(1) fan-out when possible |
| Cross-instance | `send()`, `WebSocketEmitter` | Clients on any server instance | Redis Pub/Sub, via the server's duplicated `redisPub`/`redisSub` connections |

- **Liveness is passive.** The server never pings clients - they must periodically send `{ event: 'heartbeat' }`. A sweep every `heartbeatInterval` (30s) closes anyone silent for longer than `heartbeatTimeout` (90s) with code `4002`.
- **Encryption is opt-in per client.** An `outboundTransformer` callback intercepts every outbound message before `socket.send()`. Once a client is encrypted, Bun native pub/sub is bypassed for it - `sendToRoom`/`broadcast` fall back to iterating encrypted clients individually.

## Common tasks

### Send to a client, user, or room (same process)

```typescript
helper.sendToClient({ clientId: 'abc-123', event: 'notification', data: { message: 'Hello!' } });
helper.sendToUser({ userId: 'user-123', event: 'notification', data: { message: 'New message' } });
helper.sendToRoom({ room: 'ws-notification', event: 'alert', data: { level: 'warning' } });
```

### Send across all server instances

Use `send()` from within the server process, or `WebSocketEmitter` from a process with no WebSocket server (worker, cron job):

```typescript
helper.send({
  destination: 'ws-notification',
  payload: { topic: 'alert', data: { level: 'warning', text: 'CPU high' } },
});
```

```typescript
import { WebSocketEmitter } from '@venizia/ignis-helpers';

const emitter = new WebSocketEmitter({ identifier: 'cron-emitter', redisConnection: redis });
await emitter.configure();

await emitter.toRoom({ room: 'ws-notification', event: 'alert', data: { level: 'critical' } });
```

### Broadcast to everyone

```typescript
helper.broadcast({ event: 'system:announcement', data: { text: 'Maintenance in 5 min' } });
```

### Let clients join rooms

Clients can only join custom rooms when you supply `validateRoomFn` - without it, every join request is rejected by default:

```typescript
const helper = new WebSocketServerHelper({
  // ...
  validateRoomFn: ({ userId, rooms }) => rooms.filter(room => room.startsWith('public-')),
});
```

```javascript
// Client-side
ws.send(JSON.stringify({ event: 'join', data: { rooms: ['game-lobby'] } }));
```

### React to connect and disconnect

```typescript
const helper = new WebSocketServerHelper({
  // ...
  clientConnectedFn: ({ clientId, userId }) => console.log('connected', clientId, userId),
  clientDisconnectedFn: ({ clientId, userId }) => console.log('disconnected', clientId, userId),
});
```

## See also

- [Full reference](./api) - every option, method signature, type, and constant
- [Socket.IO Helper](../socket-io/) - Socket.IO-based alternative with Node.js support
- [Redis Helper](../redis/) - `RedisSingleHelper` / `RedisClusterHelper` used for cross-instance messaging
- [Crypto Helper](../crypto/) - ECDH key exchange for WebSocket encryption
- [WebSocket Component](/extensions/components/websocket/) - component-level lifecycle integration

**Files:**

- [`packages/helpers/src/modules/socket/websocket/server/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/websocket/server/helper.ts) - `WebSocketServerHelper`
- [`packages/helpers/src/modules/socket/websocket/emitter/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/websocket/emitter/helper.ts) - `WebSocketEmitter`
- [`packages/helpers/src/modules/socket/websocket/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/websocket/common/types.ts) - option and callback types
- [`packages/helpers/src/modules/socket/websocket/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/websocket/common/constants.ts) - `WebSocketEvents`, `WebSocketChannels`, `WebSocketDefaults`, `WebSocketMessageTypes`, `WebSocketClientStates`
