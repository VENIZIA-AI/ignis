---
title: Socket.IO
description: Runtime-agnostic Socket.IO server and client helpers with a built-in authentication handshake and Redis-backed horizontal scaling
difficulty: intermediate
---

# Socket.IO

`SocketIOServerHelper` and `SocketIOClientHelper` wrap `socket.io` with a mandatory post-connection authentication handshake and room management. A Redis adapter makes sure events reach a client no matter which server instance it's connected to.

These are the raw classes: construct and `configure()` them yourself. Need the server helper inside an IGNIS app instead? [`SocketIOComponent`](/extensions/components/socket-io/) wires it into DI for you, on both Node.js and Bun.

## In one example

The smallest working server: construct with a Redis connection and an `authenticateFn`, then `configure()`.

```typescript
import { createServer } from 'node:http';
import { RedisSingleHelper } from '@venizia/ignis-helpers';
import { SocketIOServerHelper } from '@venizia/ignis-helpers/socket-io';

const httpServer = createServer();

const redisHelper = new RedisSingleHelper({
  name: 'socket-redis',
  host: 'localhost',
  port: 6379,
  password: '',
});

const socketServer = new SocketIOServerHelper({
  identifier: 'my-socket-server',
  runtime: 'node',
  server: httpServer,
  redisConnection: redisHelper,
  serverOptions: { cors: { origin: '*' } },
  authenticateFn: async handshake => !!handshake.auth?.token,
});

await socketServer.configure();
httpServer.listen(3000);
```

A client connects at the transport level, then must explicitly authenticate before it can join rooms or exchange events:

```typescript
import { SocketIOClientHelper } from '@venizia/ignis-helpers/socket-io';

const client = new SocketIOClientHelper({
  identifier: 'app-client',
  host: 'http://localhost:3000',
  options: {
    path: '/socket.io',
    extraHeaders: { Authorization: 'Bearer my-jwt-token' },
  },
  onConnected: () => client.authenticate(),
  onAuthenticated: () => client.emit({ topic: 'ready', data: {} }),
});
```

## How it works

- **Two independent helpers, both extending `BaseHelper`:**

| Helper | Wraps |
|--------|-------|
| `SocketIOServerHelper` | a `socket.io` `Server` |
| `SocketIOClientHelper` | a `socket.io-client` `Socket` |

- **The client isn't locked to this server.** It can talk to any `socket.io` server, not only this one.
- **Runtime-agnostic server.** Pass a Node.js `http.Server` for `runtime: 'node'`, or an `@socket.io/bun-engine` instance for `runtime: 'bun'`.
- **Redis is mandatory server-side.** `configure()` duplicates the parent `redisConnection` into three dedicated clients:

| Client | Powers |
|--------|--------|
| `redisPub` + `redisSub` | `@socket.io/redis-adapter` - cross-instance room broadcast |
| `redisEmitter` | `@socket.io/redis-emitter` - used by `send()` |

- **Boot fails fast on a broken Redis connection.** `configure()` waits for all three clients to reach `ready`. It rejects after 30 seconds if any never do, so a broken Redis connection fails boot instead of hanging it.
- **Authentication is a step separate from connecting.** A client connects at the transport level in state `UNAUTHORIZED`, then must emit `'authenticate'`. The server then calls `authenticateFn(handshake)`.
- **Only `true` authenticates.** It moves the client to `AUTHENTICATED` and joins it to `defaultRooms`.
- **Unauthenticated clients time out.** A client that never authenticates within `authenticateTimeout` is disconnected. That includes a client whose `authenticateFn` is still pending when the timeout fires.
- **Heartbeat has no pong check.** Once authenticated, the server pings on `pingInterval` as a keep-alive. A silently dead connection is only caught when the underlying transport itself notices.
- **Custom rooms need `validateRoomFn`.** Room joins beyond `defaultRooms` are rejected unless you supply `validateRoomFn`.

**Defaults**

| Option | Default | Purpose |
|--------|---------|---------|
| `authenticateTimeout` | 10s | Disconnects a client that never authenticates |
| `pingInterval` | 30s | Server heartbeat interval once authenticated |

## Common tasks

### Send a message from the server

`send()` goes through the Redis emitter, so it reaches the target on any server instance. Omit `destination` to broadcast to everyone.

```typescript
socketServer.send({
  destination: 'some-room', // socket ID, room name, or omitted to broadcast
  payload: { topic: 'notification', data: { message: 'Hello!' } },
  callback: () => console.log('queued'),
});
```

### Listen for a custom event

Register on the server with `on()`. Subscribe on the client with `subscribe()`.

```typescript
socketServer.on({
  topic: 'custom-event',
  handler: (data: { userId: string }) => console.log('received:', data),
});

client.subscribe({
  event: 'notification',
  handler: data => console.log('notification:', data),
});
```

### Manage rooms

Clients request rooms with `joinRooms()` / `leaveRooms()`. The server filters join requests through `validateRoomFn`.

```typescript
const socketServer = new SocketIOServerHelper({
  // ...
  defaultRooms: ['general', 'announcements'],
  validateRoomFn: async ({ socket, rooms }) => rooms.filter(room => room.startsWith('public-')),
});

client.joinRooms({ rooms: ['public-chat'] });
client.leaveRooms({ rooms: ['public-chat'] });
```

### Emit from the client

```typescript
client.emit({
  topic: 'chat-message',
  data: { text: 'Hello, world!' },
  callback: () => console.log('emit completed'),
});
```

### Shut down cleanly

```typescript
await socketServer.shutdown(); // disconnects clients, closes IO server, quits all 3 Redis clients
client.shutdown();              // removes listeners, disconnects, resets state
```

## See also

- [Full reference](./api) - every method signature, type, constant, and error case
- [Socket.IO Component](/extensions/components/socket-io/) - DI-managed lifecycle wrapper around this helper
- [WebSocket Helper](../websocket/) - Bun-native alternative with no `socket.io` dependency
- [Redis Helper](../redis/) - `RedisSingleHelper` / `RedisClusterHelper` used as `redisConnection`

**Files:**

- [`packages/helpers/src/modules/socket/socket-io/server/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/socket-io/server/helper.ts) - `SocketIOServerHelper`
- [`packages/helpers/src/modules/socket/socket-io/client/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/socket-io/client/helper.ts) - `SocketIOClientHelper`
- [`packages/helpers/src/modules/socket/socket-io/common/types/`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/socket-io/common/types) - option and callback types
- [`packages/helpers/src/modules/socket/socket-io/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/socket-io/common/constants.ts) - `SocketIOConstants`, `SocketIOClientStates`
