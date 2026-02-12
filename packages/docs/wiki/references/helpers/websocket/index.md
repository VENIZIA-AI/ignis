# WebSocket

Bun-native WebSocket server and Redis-backed emitter for real-time communication with post-connection authentication, room management, cross-instance messaging, and optional per-client encryption.

> [!IMPORTANT]
> **Bun only.** The `WebSocketServerHelper` uses Bun's native WebSocket API and will not work on Node.js. For Node.js support, use the [Socket.IO Helper](../socket-io/) instead.

## Quick Reference

| Class | Extends | Role |
|-------|---------|------|
| `WebSocketServerHelper` | `BaseHelper` | Bun-native WebSocket server with auth, rooms, heartbeat, Redis Pub/Sub scaling |
| `WebSocketEmitter` | `BaseHelper` | Publish messages to WebSocket clients from any process via Redis |

#### Import Paths

```typescript
// Server helper
import { WebSocketServerHelper } from '@venizia/ignis-helpers';

// Emitter helper
import { WebSocketEmitter } from '@venizia/ignis-helpers';

// Types and constants
import type {
  IWebSocketServerOptions,
  IWebSocketEmitterOptions,
  IWebSocketClient,
  IWebSocketMessage,
  TWebSocketAuthenticateFn,
  TWebSocketValidateRoomFn,
  TWebSocketClientConnectedFn,
  TWebSocketClientDisconnectedFn,
  TWebSocketMessageHandler,
  TWebSocketOutboundTransformer,
  TWebSocketHandshakeFn,
} from '@venizia/ignis-helpers';

import {
  WebSocketEvents,
  WebSocketChannels,
  WebSocketDefaults,
  WebSocketMessageTypes,
  WebSocketClientStates,
} from '@venizia/ignis-helpers';
```

## Creating an Instance

### Server

`WebSocketServerHelper` wraps Bun's native WebSocket server with built-in authentication, client tracking, room management, Redis Pub/Sub for horizontal scaling, and application-level heartbeat.

```typescript
import { WebSocketServerHelper } from '@venizia/ignis-helpers';

const helper = new WebSocketServerHelper({
  identifier: 'my-ws-server',
  path: '/ws',
  server: bunServerInstance,           // Bun.Server
  redisConnection: myRedisHelper,      // DefaultRedisHelper
  authenticateFn: async (data) => {
    const { token } = data as { token: string };
    const user = await verifyJWT(token);
    if (!user) return null;            // Reject
    return { userId: user.id };        // Accept
  },
  validateRoomFn: ({ clientId, userId, rooms }) => {
    return rooms.filter(room => room.startsWith('public-'));
  },
  clientConnectedFn: ({ clientId, userId }) => {
    console.log('Client authenticated:', clientId, userId);
  },
  clientDisconnectedFn: ({ clientId, userId }) => {
    console.log('Client disconnected:', clientId, userId);
  },
  messageHandler: ({ clientId, userId, message }) => {
    console.log('Custom event:', message.event, message.data);
  },
});

await helper.configure();
```

#### `IWebSocketServerOptions`

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `identifier` | `string` | Yes | -- | Unique name for this WebSocket server instance |
| `path` | `string` | No | `'/ws'` | URL path for WebSocket upgrade requests |
| `server` | `IBunServer` | Yes | -- | Bun server instance (provides `publish()` for native pub/sub) |
| `redisConnection` | `DefaultRedisHelper` | Yes | -- | Redis helper for cross-instance messaging. Creates 2 duplicate connections internally |
| `defaultRooms` | `string[]` | No | `['ws-default', 'ws-notification']` | Rooms clients auto-join after authentication |
| `serverOptions` | `IBunWebSocketConfig` | No | See defaults below | Bun native WebSocket configuration |
| `authTimeout` | `number` | No | `5000` (5s) | Milliseconds before unauthenticated clients are disconnected (close code `4001`) |
| `heartbeatInterval` | `number` | No | `30000` (30s) | Milliseconds between heartbeat sweeps |
| `heartbeatTimeout` | `number` | No | `90000` (90s) | Milliseconds of inactivity before a client is closed (close code `4002`) |
| `encryptedBatchLimit` | `number` | No | `10` | Max concurrent encryption operations for room/broadcast delivery |
| `requireEncryption` | `boolean` | No | `false` | When `true`, clients must complete ECDH handshake during auth or get disconnected (code `4004`) |
| `authenticateFn` | `TWebSocketAuthenticateFn` | Yes | -- | Called when client sends `{ event: 'authenticate' }`. Return `{ userId, metadata }` on success, `null`/`false` to reject |
| `validateRoomFn` | `TWebSocketValidateRoomFn` | No | -- | Called when client requests to join rooms. Return allowed room names. All joins are rejected if not provided |
| `clientConnectedFn` | `TWebSocketClientConnectedFn` | No | -- | Called after successful authentication |
| `clientDisconnectedFn` | `TWebSocketClientDisconnectedFn` | No | -- | Called when a client disconnects |
| `messageHandler` | `TWebSocketMessageHandler` | No | -- | Called for non-system events from authenticated clients |
| `outboundTransformer` | `TWebSocketOutboundTransformer` | No | -- | Intercepts outbound messages before `socket.send()`. Enables per-client encryption |
| `handshakeFn` | `TWebSocketHandshakeFn` | No | -- | ECDH key exchange callback. Required when `requireEncryption` is `true`. Returns `{ serverPublicKey, salt }` on success |

#### Generic Type Parameters

`WebSocketServerHelper` supports two generics for type-safe auth payloads and client metadata:

```typescript
interface AuthPayload { type: string; token: string; publicKey?: string }
interface UserMetadata { role: string; permissions: string[] }

const helper = new WebSocketServerHelper<AuthPayload, UserMetadata>({
  identifier: 'typed-ws',
  server: bunServer,
  redisConnection: redis,
  authenticateFn: async (data) => {
    // data is typed as AuthPayload
    const user = await verifyJWT(data.token);
    if (!user) return null;
    return {
      userId: user.id,
      metadata: { role: user.role, permissions: user.permissions },
    };
  },
  clientConnectedFn: ({ metadata }) => {
    // metadata is typed as UserMetadata | undefined
    if (metadata?.role === 'admin') {
      console.log('Admin connected with permissions:', metadata.permissions);
    }
  },
});
```

### Emitter

`WebSocketEmitter` is a lightweight Redis-only publisher for sending messages to WebSocket clients from non-WebSocket processes (background workers, microservices, cron jobs). It uses `serverId: 'emitter'` so all server instances process its messages (no dedup).

```typescript
import { WebSocketEmitter } from '@venizia/ignis-helpers';

const emitter = new WebSocketEmitter({
  identifier: 'my-emitter',
  redisConnection: myRedisHelper,
});

await emitter.configure();
```

#### `IWebSocketEmitterOptions`

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `identifier` | `string` | No | `'WebSocketEmitter'` | Unique name for logging |
| `redisConnection` | `DefaultRedisHelper` | Yes | -- | Redis helper. Creates 1 duplicate connection internally |

## Usage

### Server Setup

After constructing the helper, call `configure()` to initialize Redis connections, set up pub/sub subscriptions, and start the heartbeat timer. Then wire the Bun WebSocket handler into your server:

```typescript
const helper = new WebSocketServerHelper({
  identifier: 'my-ws',
  server: bunServer,
  redisConnection: redis,
  authenticateFn: async (data) => {
    const user = await verifyJWT((data as { token: string }).token);
    return user ? { userId: user.id } : null;
  },
});

await helper.configure();

// Get the Bun WebSocket handler
const wsHandler = helper.getBunWebSocketHandler();

// Wire into the Bun server
bunServer.reload({
  fetch: myFetchHandler,
  websocket: wsHandler,
});
```

### Handling Connections

The server implements a post-connection authentication flow. Clients connect first (the WebSocket upgrade is always accepted), then must send an `authenticate` event with credentials before they can interact.

```
Client                          Server (WebSocketServerHelper)
  |                                |
  |-- WebSocket upgrade ---------> |  server.upgrade(req, { data: { clientId } })
  |                                |
  |-- open event ----------------> |  onClientConnect()
  |                                |    |-- Create client entry (state: UNAUTHORIZED)
  |                                |    |-- Subscribe to clientId topic (Bun pub/sub)
  |                                |    +-- Start authTimeout (5s default)
  |                                |
  | { event: 'authenticate',       |
  |   data: { token: '...' } } --> |  handleAuthenticate()
  |                                |    |-- Set state: AUTHENTICATING
  |                                |    +-- Call authenticateFn(data)
  |                                |
  |                                |  -- Success: { userId, metadata } --
  |                                |    |-- Set state: AUTHENTICATED
  |                                |    |-- Index by userId
  |                                |    |-- Join default rooms
  | <-- { event: 'connected',      |    +-- Send 'connected' event
  |       data: { id, userId,      |
  |         time } } ------------- |
  |                                |
  |                                |  -- Failure: null/false --
  | <-- { event: 'error' } ------- |    +-- Close with code 4003
```

#### Client States

| State | Value | Description |
|-------|-------|-------------|
| `WebSocketClientStates.UNAUTHORIZED` | `'unauthorized'` | Initial state after connection |
| `WebSocketClientStates.AUTHENTICATING` | `'authenticating'` | `authenticate` event received, awaiting `authenticateFn` |
| `WebSocketClientStates.AUTHENTICATED` | `'authenticated'` | Successfully authenticated, fully operational |
| `WebSocketClientStates.DISCONNECTED` | `'disconnected'` | Client has disconnected |

#### Close Codes

| Code | Meaning | Trigger |
|------|---------|---------|
| `4001` | Authentication timeout | Client did not authenticate within `authTimeout` (5s default) |
| `4002` | Heartbeat timeout | No activity for `heartbeatTimeout` (90s default) |
| `4003` | Authentication failed | `authenticateFn` returned `null`/`false` or threw |
| `4004` | Encryption required | `requireEncryption` is `true` and `handshakeFn` rejected or was not configured |
| `1001` | Going away | Server shutting down gracefully |

### Sending Messages

#### Local Delivery

Send messages directly to clients, users, or rooms on the current server instance:

```typescript
// Send to a specific client
helper.sendToClient({
  clientId: 'abc-123',
  event: 'notification',
  data: { message: 'Hello!' },
});

// Send to all clients belonging to a user
helper.sendToUser({
  userId: 'user-123',
  event: 'notification',
  data: { message: 'You have a new message' },
});

// Send to all clients in a room
helper.sendToRoom({
  room: 'ws-notification',
  event: 'alert',
  data: { level: 'warning', text: 'CPU high' },
});

// Send to all clients in a room, excluding specific clients
helper.sendToRoom({
  room: 'game-lobby',
  event: 'player-moved',
  data: { x: 10, y: 20 },
  exclude: ['abc-123'],
});
```

#### Cross-Instance Delivery

Use `send()` to deliver messages both locally and via Redis for horizontal scaling:

```typescript
// Send to specific client (local + Redis)
helper.send({
  destination: clientId,
  payload: { topic: 'notification', data: { message: 'Hello!' } },
});

// Send to room (local + Redis)
helper.send({
  destination: 'ws-notification',
  payload: { topic: 'alert', data: { level: 'warning', text: 'CPU high' } },
});

// Broadcast to all (local + Redis)
helper.send({
  payload: { topic: 'system:announcement', data: { text: 'Maintenance in 5 min' } },
});
```

### Broadcasting

Broadcast to all authenticated clients on the current instance:

```typescript
helper.broadcast({
  event: 'system:announcement',
  data: { text: 'Maintenance in 5 min' },
});

// With exclusions
helper.broadcast({
  event: 'system:announcement',
  data: { text: 'Maintenance in 5 min' },
  exclude: ['abc-123'],
});
```

### Emitter Pattern

Use `WebSocketEmitter` from processes that do not run a WebSocket server (background workers, microservices, cron jobs):

```typescript
const emitter = new WebSocketEmitter({
  identifier: 'cron-emitter',
  redisConnection: redis,
});
await emitter.configure();

// Send to a specific client
await emitter.toClient({
  clientId: 'abc-123',
  event: 'notification',
  data: { message: 'Your report is ready' },
});

// Send to all sessions of a user
await emitter.toUser({
  userId: 'user-123',
  event: 'notification',
  data: { message: 'New message from admin' },
});

// Send to a room
await emitter.toRoom({
  room: 'ws-notification',
  event: 'alert',
  data: { level: 'critical', text: 'Database failover' },
});

// Broadcast to all clients
await emitter.broadcast({
  event: 'system:announcement',
  data: { text: 'Scheduled maintenance in 5 minutes' },
});

// Graceful shutdown
await emitter.shutdown();
```

### Rooms

After authentication, clients auto-join default rooms (configurable via `defaultRooms`, defaults to `['ws-default', 'ws-notification']`) and their own `clientId` room.

#### Client-Initiated Room Management

Clients can request to join or leave rooms by sending events:

```javascript
// Client-side (browser)
ws.send(JSON.stringify({ event: 'join', data: { rooms: ['game-lobby', 'chat-room'] } }));
ws.send(JSON.stringify({ event: 'leave', data: { rooms: ['game-lobby'] } }));
```

> [!WARNING]
> Without a `validateRoomFn` bound, clients **cannot** join any custom rooms. All join requests are silently rejected. This is a security-by-default design.

Room names are validated before joining:
- Must be a non-empty string
- Maximum 256 characters
- Cannot start with the internal prefix `ws:` (reserved for Redis channels)

#### Programmatic Room Management

From your service code, manage rooms directly via the helper:

```typescript
// Join a room
helper.joinRoom({ clientId: 'abc-123', room: 'game-lobby' });

// Leave a room
helper.leaveRoom({ clientId: 'abc-123', room: 'game-lobby' });

// Get clients in a room
const clients = helper.getClientsByRoom({ room: 'game-lobby' });
console.log('Room has', clients.length, 'clients');
```

### Heartbeat

The WebSocket helper uses a **passive heartbeat** model. The server does not send pings to clients. Instead, clients must periodically send `{ event: 'heartbeat' }` messages to keep their connection alive.

1. The server runs a periodic sweep at `heartbeatInterval` (default: 30s).
2. On each sweep, it checks every authenticated client's `lastActivity` timestamp.
3. If `now - lastActivity > heartbeatTimeout` (default: 90s), the client is closed with code `4002`.
4. Any message from the client (including `{ event: 'heartbeat' }`) updates `lastActivity`.

```javascript
// Client-side (browser)
const ws = new WebSocket('wss://example.com/ws');

// After authentication, start heartbeat
const heartbeatInterval = setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event: 'heartbeat' }));
  }
}, 30000); // Every 30 seconds

ws.onclose = () => clearInterval(heartbeatInterval);
```

> [!NOTE]
> `sendPings` and `idleTimeout` in the Bun server options are **transport-level** mechanisms. They are separate from the application-level heartbeat system which tracks `lastActivity` via actual message content.

### Encryption

The WebSocket helper supports **per-client encryption** via an outbound transformer -- a callback that intercepts every outbound message before `socket.send()`.

#### Enforced Encryption

When `requireEncryption` is `true`, clients must complete an ECDH key exchange during authentication:

```typescript
const helper = new WebSocketServerHelper({
  identifier: 'encrypted-ws',
  server: bunServer,
  redisConnection: redis,
  requireEncryption: true,
  authenticateFn: async (data) => {
    const user = await verifyJWT(data.token as string);
    return user ? { userId: user.id } : null;
  },
  handshakeFn: async ({ clientId, userId, data }) => {
    const clientPubKeyB64 = data.publicKey as string;
    if (!clientPubKeyB64) return null; // Reject

    const peerKey = await ecdh.importPublicKey({ rawKeyB64: clientPubKeyB64 });
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const saltB64 = Buffer.from(salt).toString('base64');
    const aesKey = await ecdh.deriveAESKey({
      privateKey: serverKeyPair.keyPair.privateKey,
      peerPublicKey: peerKey,
      salt,
    });

    clientKeys.set(clientId, aesKey);
    return { serverPublicKey: serverKeyPair.publicKeyB64, salt: saltB64 };
  },
  outboundTransformer: async ({ client, event, data }) => {
    if (!client.encrypted) return null;
    const aesKey = clientKeys.get(client.id);
    if (!aesKey) return null;
    const encrypted = await ecdh.encrypt({
      message: JSON.stringify({ event, data }),
      secret: aesKey,
    });
    return { event: 'encrypted', data: encrypted };
  },
});
```

> [!IMPORTANT]
> When `requireEncryption` is `true`, `handshakeFn` **must** be provided. If it is missing, the server logs an error and closes the client with code `4004`.

#### Optional Encryption

If encryption is optional, call `enableClientEncryption()` manually after a key exchange in your `messageHandler`:

```typescript
messageHandler: async ({ clientId, message }) => {
  if (message.event === 'handshake') {
    const peerKey = await ecdh.importPublicKey({ rawKeyB64: message.data.publicKey });
    const aesKey = await ecdh.deriveAESKey({
      privateKey: serverKeyPair.privateKey,
      peerPublicKey: peerKey,
    });

    clientKeys.set(clientId, aesKey);
    helper.enableClientEncryption({ clientId });

    helper.sendToClient({
      clientId,
      event: 'handshake-complete',
      data: { publicKey: serverKeyPair.publicKeyB64 },
    });
  }
};
```

> [!IMPORTANT]
> When an `outboundTransformer` is configured, **Bun native pub/sub is bypassed** for `sendToRoom()` and `broadcast()`. All clients are iterated individually so the transformer runs per-client. This trades O(1) fan-out for per-client encryption capability.

### Redis Integration

The server creates **two** dedicated Redis connections (duplicated from your `redisConnection`):

| Connection | Purpose |
|------------|---------|
| `redisPub` | Publish messages to other server instances |
| `redisSub` | Subscribe to messages from other server instances |

```
Server A                      Redis                     Server B
+-----------+              +----------+               +-----------+
| WS Server |--redisPub-->|          |<--redisPub----| WS Server |
|           |<--redisSub--|  Pub/Sub |---redisSub--->|           |
+-----------+              +----------+               +-----------+
```

Every server instance generates a unique `serverId` (UUID) at construction. Messages from the same server are skipped on receipt to prevent double delivery.

## Troubleshooting

### "Client disconnects immediately with close code 4001"

The client connects but is disconnected before it can interact.

This happens when the client does not send `{ event: 'authenticate', data: { ... } }` within `authTimeout` (default: 5 seconds). Common causes:

- The client is sending the auth payload in the wrong format (e.g., `{ type: 'auth' }` instead of `{ event: 'authenticate' }`).
- The client is waiting for a server-initiated message before authenticating. The server sends nothing after the WebSocket upgrade -- the client must initiate.
- Network latency or slow token retrieval causes the auth message to arrive after the timeout window.

> [!TIP]
> Send `{ event: 'authenticate', data: { token: '...' } }` immediately in the `onopen` handler. If your auth token retrieval is slow, increase `authTimeout` in the server options.

### "Redis subscription messages are not received across instances"

`helper.send()` delivers locally but other server instances do not receive the message.

- The Redis connection passed to `WebSocketServerHelper` is a single-instance `Redis` client, but your deployment uses Redis Cluster. The duplicated pub/sub clients must be compatible with your Redis topology.
- `configure()` was not awaited. The Redis subscriptions are set up asynchronously during `configure()`. If you accept WebSocket connections before it resolves, subscriptions may not be active.
- A firewall or Redis ACL is blocking `SUBSCRIBE`/`PSUBSCRIBE` commands on the duplicated clients.

> [!IMPORTANT]
> Always `await helper.configure()` before accepting connections. Verify your Redis connection supports pub/sub (check ACLs, ensure cluster mode is consistent).

### "`requireEncryption` is true but clients get disconnected with code 4004"

Authentication succeeds but the client is immediately closed with code `4004`.

- `handshakeFn` is not provided in the options. The server logs `"requireEncryption is true but no handshakeFn configured"` and closes the client.
- `handshakeFn` returns `null` or `false`, indicating the handshake was rejected (e.g., missing `publicKey` in the auth payload).

> [!TIP]
> Ensure `handshakeFn` is configured when `requireEncryption` is `true`, and that the client includes the required key exchange data (e.g., `publicKey`) in the authenticate payload.

### "[WebSocketServerHelper] Invalid redis connection!"

Thrown during construction when `redisConnection` is `null`/`undefined`. Ensure you pass a valid `DefaultRedisHelper` instance.

### "[WebSocketEmitter] Invalid redis connection!"

Thrown during `WebSocketEmitter` construction when `redisConnection` is `null`/`undefined`. Ensure you pass a valid `DefaultRedisHelper` instance.

### "Redis client did not become ready within 30000ms"

Thrown during `configure()` when a Redis client fails to reach `ready` status. Check that the Redis server is reachable and the parent `DefaultRedisHelper` connection is properly configured.

## See Also

- [API Reference](./api) -- Full method signatures, types, and constants
- [Socket.IO Helper](../socket-io/) -- Socket.IO-based alternative with Node.js support
- [Redis Helper](../redis/) -- `RedisHelper` used for cross-instance messaging
- [Crypto Helper](../crypto/) -- ECDH key exchange for WebSocket encryption
- [WebSocket Component](/references/components/websocket/) -- Component-level lifecycle integration
