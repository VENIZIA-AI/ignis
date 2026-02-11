# WebSocket Helpers

Bun-native WebSocket server and emitter for real-time communication. Provides post-connection authentication, room management, Redis Pub/Sub scaling, application-level heartbeat, and lifecycle management out of the box.

## Quick Reference

| Helper | Package | Purpose |
|--------|---------|---------|
| [`WebSocketServerHelper`](#websocketserverhelper) | `@venizia/ignis-helpers` | Bun-native WebSocket server with auth, rooms, Redis scaling |
| [`WebSocketEmitter`](#websocketemitter) | `@venizia/ignis-helpers` | Publish messages to WebSocket clients from any process via Redis |

### Import Paths

```typescript
// Server helper
import { WebSocketServerHelper } from '@venizia/ignis-helpers';

// Emitter helper
import { WebSocketEmitter } from '@venizia/ignis-helpers';

// Types and constants
import {
  IWebSocket,
  IBunServer,
  IBunWebSocketConfig,
  IBunWebSocketHandler,
  IWebSocketMessage,
  IRedisSocketMessage,
  IWebSocketClient,
  IWebSocketData,
  IWebSocketServerOptions,
  IWebSocketEmitterOptions,
  TWebSocketAuthenticateFn,
  TWebSocketValidateRoomFn,
  TWebSocketClientConnectedFn,
  TWebSocketClientDisconnectedFn,
  TWebSocketMessageHandler,
  TWebSocketOutboundTransformer,
  TWebSocketHandshakeFn,
  TWebSocketClientState,
  WebSocketEvents,
  WebSocketChannels,
  WebSocketDefaults,
  WebSocketMessageTypes,
  WebSocketClientStates,
  TWebSocketEvent,
  TWebSocketMessageType,
} from '@venizia/ignis-helpers';
```

> [!IMPORTANT]
> **Bun only.** This WebSocket implementation uses Bun's native WebSocket API. It will throw an error if you attempt to use it on a Node.js runtime. For Node.js support, use the [Socket.IO Helper](./socket-io) instead.

---

# WebSocketServerHelper

Wraps Bun's native WebSocket server with built-in post-connection authentication flow, client tracking, room management, Redis Pub/Sub for cross-instance messaging, and application-level heartbeat.

## Constructor

```typescript
new WebSocketServerHelper(opts: IWebSocketServerOptions)
```

### Options

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `identifier` | `string` | Yes | -- | Unique name for this WebSocket server instance |
| `path` | `string` | No | `'/ws'` | URL path for WebSocket upgrade requests |
| `server` | `IBunServer` | Yes | -- | Bun server instance (provides `publish()` for native pub/sub) |
| `redisConnection` | `DefaultRedisHelper` | Yes | -- | Redis helper for cross-instance messaging. Creates 2 duplicate connections internally |
| `defaultRooms` | `string[]` | No | `['ws-default', 'ws-notification']` | Rooms clients auto-join after authentication |
| `serverOptions` | `IBunWebSocketConfig` | No | See [Bun WebSocket Config](#bun-websocket-handler) | Bun native WebSocket configuration |
| `authTimeout` | `number` | No | `5000` (5s) | Milliseconds before unauthenticated clients are disconnected (close code `4001`) |
| `heartbeatInterval` | `number` | No | `30000` (30s) | Milliseconds between heartbeat sweeps |
| `heartbeatTimeout` | `number` | No | `90000` (90s) | Milliseconds of inactivity before a client is considered stale (close code `4002`) |
| `authenticateFn` | `TWebSocketAuthenticateFn` | Yes | -- | Called when client sends `{ event: 'authenticate' }`. Return `{ userId, metadata }` on success, `null`/`false` to reject |
| `validateRoomFn` | `TWebSocketValidateRoomFn` | No | -- | Called when client requests to join rooms. Return allowed room names. Joins rejected if not provided |
| `clientConnectedFn` | `TWebSocketClientConnectedFn` | No | -- | Called after successful authentication |
| `clientDisconnectedFn` | `TWebSocketClientDisconnectedFn` | No | -- | Called when a client disconnects |
| `messageHandler` | `TWebSocketMessageHandler` | No | -- | Called for non-system events from authenticated clients |
| `outboundTransformer` | `TWebSocketOutboundTransformer` | No | -- | Intercepts outbound messages before `socket.send()`. When set, enables per-client encryption support |
| `encryptedBatchLimit` | `number` | No | `10` | Max concurrent encryption operations for `sendToRoom()` / `broadcast()`. Uses [`executePromiseWithLimit`](/references/utilities/promise) |
| `requireEncryption` | `boolean` | No | `false` | When `true`, clients must complete ECDH handshake during authentication or get disconnected (close code `4004`) |
| `handshakeFn` | `TWebSocketHandshakeFn` | No* | -- | Key exchange callback invoked during auth when `requireEncryption` is `true`. Receives auth payload, returns `{ serverPublicKey }` on success. *Required when `requireEncryption` is `true` |

### Constructor Example

```typescript
import { WebSocketServerHelper } from '@venizia/ignis-helpers';

const helper = new WebSocketServerHelper({
  identifier: 'my-ws-server',
  path: '/ws',
  server: bunServerInstance,           // Bun.Server
  redisConnection: myRedisHelper,
  authenticateFn: async (data) => {
    const token = data.token as string;
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
  // Optional: outbound transformer for per-client encryption
  outboundTransformer: async ({ client, event, data }) => {
    if (!client.encrypted) return null; // null = use default { event, data }
    const encrypted = await encryptForClient(client, JSON.stringify({ event, data }));
    return { event: 'encrypted', data: encrypted };
  },
});

await helper.configure();
```

---

## Methods

### `getClients(opts?): IWebSocketClient | Map<string, IWebSocketClient> | undefined`

Returns tracked clients.

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts.id` | `string` (optional) | Specific client ID. If omitted, returns all clients |

```typescript
// Get all clients
const allClients = helper.getClients() as Map<string, IWebSocketClient>;
console.log('Connected:', allClients.size);

// Get specific client
const client = helper.getClients({ id: clientId }) as IWebSocketClient | undefined;
if (client) {
  console.log('State:', client.state);
  console.log('Rooms:', Array.from(client.rooms));
}
```

### `getClientsByUser(opts): IWebSocketClient[]`

Returns all clients for a given user ID.

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts.userId` | `string` | User ID to look up |

```typescript
const clients = helper.getClientsByUser({ userId: 'user-123' });
console.log('User has', clients.length, 'active connections');
```

### `getClientsByRoom(opts): IWebSocketClient[]`

Returns all clients in a given room.

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts.room` | `string` | Room name to look up |

```typescript
const clients = helper.getClientsByRoom({ room: 'ws-default' });
console.log('Room has', clients.length, 'clients');
```

### `getPath(): string`

Returns the configured WebSocket path.

```typescript
const path = helper.getPath(); // '/ws'
```

### `getBunWebSocketHandler(): IBunWebSocketHandler`

Returns the Bun WebSocket handler object containing lifecycle callbacks (`open`, `message`, `close`, `drain`) and native configuration. This is passed to `server.reload({ websocket })`.

```typescript
const wsHandler = helper.getBunWebSocketHandler();

bunServer.reload({
  fetch: myFetchHandler,
  websocket: wsHandler,
});
```

### `joinRoom(opts): void`

Programmatically join a client to a room.

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts.clientId` | `string` | Client ID |
| `opts.room` | `string` | Room name to join |

```typescript
helper.joinRoom({ clientId: 'abc-123', room: 'game-lobby' });
```

### `leaveRoom(opts): void`

Programmatically remove a client from a room.

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts.clientId` | `string` | Client ID |
| `opts.room` | `string` | Room name to leave |

```typescript
helper.leaveRoom({ clientId: 'abc-123', room: 'game-lobby' });
```

### `enableClientEncryption(opts): void`

Enable encryption for a client. Unsubscribes the client from all Bun native topics so `server.publish()` won't reach them -- messages are delivered individually through the `outboundTransformer` instead.

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts.clientId` | `string` | Client ID to enable encryption for |

```typescript
// Typically called after ECDH key exchange completes
helper.enableClientEncryption({ clientId: 'abc-123' });
```

> [!IMPORTANT]
> After encryption is enabled, the client's `encrypted` flag is set to `true` and it is unsubscribed from all Bun native pub/sub topics (broadcast + rooms). This is **irreversible** for the lifetime of the connection. All subsequent messages are delivered individually through the outbound transformer.

### `sendToClient(opts): void`

Send a message directly to a specific client (local delivery only).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `opts.clientId` | `string` | Yes | Target client ID |
| `opts.event` | `string` | Yes | Event name |
| `opts.data` | `unknown` | Yes | Event payload |
| `opts.doLog` | `boolean` | No | Log the emission |

```typescript
helper.sendToClient({
  clientId: 'abc-123',
  event: 'notification',
  data: { message: 'Hello!' },
});
```

### `sendToUser(opts): void`

Send a message to all local clients belonging to a user (local delivery only).

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts.userId` | `string` | Target user ID |
| `opts.event` | `string` | Event name |
| `opts.data` | `unknown` | Event payload |

```typescript
helper.sendToUser({
  userId: 'user-123',
  event: 'notification',
  data: { message: 'You have a new message' },
});
```

### `sendToRoom(opts): void`

Send a message to all clients in a room (local delivery only).

**Delivery strategy** depends on whether an `outboundTransformer` is configured:

| Condition | Strategy |
|-----------|----------|
| No `outboundTransformer` | Bun native pub/sub O(1) C++ fan-out |
| `outboundTransformer` set | Iterates all room clients individually via `executePromiseWithLimit` (max `encryptedBatchLimit` concurrent) |
| `exclude` provided | Always iterates clients individually (can't exclude from Bun pub/sub) |

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `opts.room` | `string` | Yes | Target room name |
| `opts.event` | `string` | Yes | Event name |
| `opts.data` | `unknown` | Yes | Event payload |
| `opts.exclude` | `string[]` | No | Client IDs to skip |

```typescript
helper.sendToRoom({
  room: 'ws-notification',
  event: 'alert',
  data: { level: 'warning', text: 'CPU high' },
});
```

### `broadcast(opts): void`

Send a message to all authenticated clients on this instance (local delivery only).

**Delivery strategy** follows the same pattern as [`sendToRoom`](#sendtoroom-opts-void):

| Condition | Strategy |
|-----------|----------|
| No `outboundTransformer` | Bun native pub/sub O(1) C++ fan-out via broadcast topic |
| `outboundTransformer` set | Iterates all authenticated clients individually with concurrency limit |
| `exclude` provided | Always iterates clients individually |

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `opts.event` | `string` | Yes | Event name |
| `opts.data` | `unknown` | Yes | Event payload |
| `opts.exclude` | `string[]` | No | Client IDs to skip |

```typescript
helper.broadcast({
  event: 'system:announcement',
  data: { text: 'Maintenance in 5 min' },
});
```

### `send(opts): void`

**Public API** -- sends a message both locally and via Redis for cross-instance delivery. This is the primary method for sending messages from services and controllers.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `opts.destination` | `string` | No | Client ID or room name. If omitted, broadcasts to all |
| `opts.payload.topic` | `string` | Yes | Event name |
| `opts.payload.data` | `T` | Yes | Event payload |
| `opts.doLog` | `boolean` | No | Log the emission (default: `false`) |
| `opts.cb` | `() => void` | No | Callback executed via `setImmediate` after emit |

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

### `configure(): Promise<void>`

Initializes Redis connections, sets up subscriptions, and starts the heartbeat timer. Must be called after construction and before accepting connections.

```typescript
await helper.configure();
```

### `shutdown(): Promise<void>`

Full graceful shutdown -- clears heartbeat timer, disconnects all clients, cleans up tracking maps, quits Redis connections.

```typescript
await helper.shutdown();
```

---

## Authentication Flow

The server implements a post-connection authentication pattern. Clients connect first (WebSocket upgrade is always accepted), then must send an `authenticate` event with credentials before they can interact.

```
Client                          Server (WebSocketServerHelper)
  |                                |
  |-- WebSocket upgrade ---------> |  server.upgrade(req, { data: { clientId } })
  |                                |
  |-- open event ----------------> |  onClientConnect()
  |                                |    |-- Create client entry (state: UNAUTHORIZED)
  |                                |    |-- Subscribe to clientId topic (Bun pub/sub)
  |                                |    +-- Start authTimeout (5s)
  |                                |
  | { event: 'authenticate',       |
  |-- data: { token: '...' } } --> |  onClientMessage() -> handleAuthenticate()
  |                                |    |-- Set state: AUTHENTICATING
  |                                |    +-- Call authenticateFn(data)
  |                                |
  |                                |  -- authenticateFn returns { userId } --
  |                                |    |-- Set state: AUTHENTICATED
  |                                |    |
  |                                |    |-- [requireEncryption = true?]
  |                                |    |     +-- Call handshakeFn({ clientId, userId, data })
  |                                |    |     |   Return { serverPublicKey } or null/false
  |                                |    |     |
  |                                |    |     +-- handshake success:
  |                                |    |     |     enableClientEncryption({ clientId })
  |                                |    |     |     Store serverPublicKey in metadata
  |                                |    |     |
  |                                |    |     +-- handshake failure/rejected:
  |                                |    |           Send error event
  |                                |    |           Close with code 4004
  |                                |    |
  |                                |    |-- Index by userId
  |                                |    |-- Subscribe to broadcast topic (skipped if encrypted)
  |                                |    |-- Join default rooms
  | <-- { event: 'connected',      |    |-- Send 'connected' event with { id, userId, time,
  |       data: { id, userId,      |    |     serverPublicKey? }
  |       serverPublicKey? } } --- |    +-- Call clientConnectedFn()
  |                                |
  |                                |  -- authenticateFn returns null/false --
  | <-- { event: 'error',          |    |-- Send error event
  |       data: { message } } ---- |    +-- Close with code 4003
  |                                |
  |                                |  -- authTimeout (5s) expires --
  |                                |    +-- Close with code 4001 (if still UNAUTHORIZED)
```

### `IWebSocketClient` Tracked State

Each connected client is tracked with:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Client ID (UUID assigned during upgrade) |
| `userId` | `string?` | User ID from `authenticateFn` result (set after auth) |
| `socket` | `IWebSocket` | Bun WebSocket handle |
| `state` | `TWebSocketClientState` | Authentication state |
| `rooms` | `Set<string>` | Rooms the client has joined |
| `backpressured` | `boolean` | Whether the socket has backpressure |
| `encrypted` | `boolean` | Whether encryption is enabled (unsubscribed from Bun topics) |
| `connectedAt` | `number` | Timestamp of connection (`Date.now()`) |
| `lastActivity` | `number` | Timestamp of last message received |
| `metadata` | `Record<string, unknown>?` | Custom metadata from `authenticateFn` result |

### Client States

```
  +----------------+     authenticate      +----------------+    auth success   +---------------+
  |  UNAUTHORIZED  | -------------------->  | AUTHENTICATING  | ----------------> | AUTHENTICATED  |
  +----------------+                        +----------------+                   +---------------+
                                                   |                                    |
                                   auth failure     |                                    |
                                   close(4003)      |                                    |
                                                    v                                    |
                                            +---------------+                            |
                                            | DISCONNECTED  | <--------------------------+
                                            +---------------+   disconnect / timeout
```

| State | Value | Description |
|-------|-------|-------------|
| `WebSocketClientStates.UNAUTHORIZED` | `'unauthorized'` | Initial state after connection |
| `WebSocketClientStates.AUTHENTICATING` | `'authenticating'` | `authenticate` event received, awaiting `authenticateFn` |
| `WebSocketClientStates.AUTHENTICATED` | `'authenticated'` | Successfully authenticated, fully operational |
| `WebSocketClientStates.DISCONNECTED` | `'disconnected'` | Client has disconnected |

---

## Room Management

After authentication, clients can join and leave rooms via events or programmatically from service code.

### Built-in Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `join` | Client -> Server | `{ rooms: string[] }` | Join one or more rooms |
| `leave` | Client -> Server | `{ rooms: string[] }` | Leave one or more rooms |

These handlers are registered automatically and only work for authenticated clients.

### Room Validation

Client room join requests are validated using the `validateRoomFn` callback. If no `validateRoomFn` is configured, **all join requests are rejected** for security.

```typescript
const helper = new WebSocketServerHelper({
  // ...
  validateRoomFn: ({ clientId, userId, rooms }) => {
    // Only allow rooms prefixed with 'public-' or the user's own room
    return rooms.filter(room =>
      room.startsWith('public-') || room === `user-${userId}`
    );
  },
});
```

The function receives the client ID, optional user ID, and requested rooms. It must return the subset of rooms the client is allowed to join.

### Default Rooms

Authenticated clients auto-join these rooms (configurable via `defaultRooms`):

| Room | Constant | Purpose |
|------|----------|---------|
| `ws-default` | `WebSocketDefaults.ROOM` | General-purpose room for all clients |
| `ws-notification` | `WebSocketDefaults.NOTIFICATION_ROOM` | Notification delivery room |

Additionally, every client is auto-subscribed to their own `clientId` topic via Bun native pub/sub on connect, and joined to their `clientId` room after authentication.

### Programmatic Room Management

From your service code, manage rooms via the helper:

```typescript
// Join a room
helper.joinRoom({ clientId, room: 'game-lobby' });

// Leave a room
helper.leaveRoom({ clientId, room: 'game-lobby' });

// Get clients in a room
const clients = helper.getClientsByRoom({ room: 'game-lobby' });
```

---

## Encryption & Outbound Transformer

The WebSocket helper supports **per-client encryption** via an outbound transformer -- a callback that intercepts every outbound message before `socket.send()`. Combined with `enableClientEncryption()`, this enables end-to-end encrypted communication using ECDH key exchange.

### How It Works

```
                                outboundTransformer configured?
                                          |
                             +------------+------------+
                             |                         |
                            No                        Yes
                             |                         |
                    Bun native pub/sub         Iterate all clients
                    O(1) C++ fan-out           individually with
                    (fastest path)             concurrency limit
                                                       |
                                               client.encrypted?
                                                  |         |
                                                 Yes        No
                                                  |         |
                                           Run transformer  Plain delivery
                                           (encrypt data)   { event, data }
```

### Outbound Transformer

The `outboundTransformer` callback receives the client, event, and data. Return a transformed `{ event, data }` object, or `null` to use the original payload.

```typescript
const helper = new WebSocketServerHelper({
  // ...
  outboundTransformer: async ({ client, event, data }) => {
    if (!client.encrypted) {
      return null; // Not encrypted — use original { event, data }
    }

    // Encrypt the payload using the client's derived AES key
    const aesKey = clientKeys.get(client.id);
    const encrypted = await ecdh.encrypt({
      message: JSON.stringify({ event, data }),
      secret: aesKey,
    });

    return { event: 'encrypted', data: encrypted };
  },
});
```

> [!IMPORTANT]
> When an `outboundTransformer` is configured, **Bun native pub/sub is disabled** for `sendToRoom()` and `broadcast()`. All clients are iterated individually so the transformer runs per-client. This trades O(1) fan-out for per-client encryption capability.

### Enforced Encryption (`requireEncryption`)

When `requireEncryption` is `true`, the server **requires** clients to complete an ECDH key exchange during authentication. If the `handshakeFn` rejects or isn't configured, the client is disconnected with close code `4004`.

```typescript
const helper = new WebSocketServerHelper({
  // ...
  requireEncryption: true,
  handshakeFn: async ({ clientId, userId, data }) => {
    const clientPublicKeyB64 = data.publicKey as string;
    if (!clientPublicKeyB64) return null; // Reject — no public key

    const peerKey = await ecdh.importPublicKey({ rawKeyB64: clientPublicKeyB64 });
    const aesKey = await ecdh.deriveAESKey({
      privateKey: serverKeyPair.keyPair.privateKey,
      peerPublicKey: peerKey,
    });

    clientKeys.set(clientId, aesKey);
    return { serverPublicKey: serverKeyPair.publicKeyB64 };
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

**How it works during authentication:**

1. Client sends `{ event: 'authenticate', data: { token: '...', publicKey: '...' } }`
2. Server calls `authenticateFn(data)` — validates token
3. If auth succeeds and `requireEncryption` is `true`:
   - Server calls `handshakeFn({ clientId, userId, data })` with the same auth payload
   - If `handshakeFn` returns `{ serverPublicKey }` — encryption is enabled, `enableClientEncryption()` is called automatically
   - If `handshakeFn` returns `null`/`false` — client is rejected with close code `4004`
4. The `connected` event includes `serverPublicKey` so the client can derive the shared secret

> [!IMPORTANT]
> When `requireEncryption` is `true`, `handshakeFn` **must** be provided. If it's missing, the server will log an error and close the client with code `4004`.

### Manual Client Encryption (without `requireEncryption`)

If encryption is optional, call `enableClientEncryption()` manually after a key exchange in your `messageHandler`:

```typescript
messageHandler: async ({ clientId, message }) => {
  if (message.event === 'handshake') {
    // Client sends their ECDH public key
    const peerKey = await ecdh.importPublicKey({ rawKeyB64: message.data.publicKey });
    const aesKey = await ecdh.deriveAESKey({
      privateKey: serverKeyPair.privateKey,
      peerPublicKey: peerKey,
    });

    // Store the derived key for this client
    clientKeys.set(clientId, aesKey);

    // Enable encryption — unsubscribes from Bun topics
    helper.enableClientEncryption({ clientId });

    // Confirm to client
    helper.sendToClient({
      clientId,
      event: 'handshake-complete',
      data: { publicKey: serverKeyPair.publicKeyB64 },
    });
  }
};
```

### Delivery Model

The delivery strategy is **conditional** -- the presence of `outboundTransformer` determines the path:

| Method | No transformer | Transformer configured |
|--------|---------------|----------------------|
| `sendToClient()` | Direct `socket.send()` | Transformer runs if `client.encrypted`, then `socket.send()` |
| `sendToRoom()` | Bun `server.publish()` (O(1)) | Iterates all room clients via `executePromiseWithLimit` |
| `broadcast()` | Bun `server.publish()` (O(1)) | Iterates all authenticated clients via `executePromiseWithLimit` |
| `sendToRoom({ exclude })` | Iterates clients | Iterates clients (same -- can't exclude from pub/sub) |

### Concurrency Control

When iterating clients individually, `sendToRoom()` and `broadcast()` use [`executePromiseWithLimit`](/references/utilities/promise) to prevent unbounded promise storms with many clients:

```typescript
// Default: 10 concurrent encryption operations
const helper = new WebSocketServerHelper({
  // ...
  encryptedBatchLimit: 20, // Tune based on encryption cost and CPU cores
});
```

The `encryptedBatchLimit` (default: `10`) controls the sliding window -- starts `N` tasks, and as each completes, the next one begins. This bounds CPU usage for expensive operations like ECDH-derived AES-GCM encryption.

### Complete ECDH + WebSocket Example (Enforced Encryption)

```typescript
import { ECDH, WebSocketServerHelper } from '@venizia/ignis-helpers';

const ecdh = ECDH.withAlgorithm();
const serverKeyPair = await ecdh.generateKeyPair();
const clientKeys = new Map<string, CryptoKey>();

const helper = new WebSocketServerHelper({
  identifier: 'encrypted-ws',
  server: bunServer,
  redisConnection: redis,
  requireEncryption: true,
  encryptedBatchLimit: 10,
  authenticateFn: async (data) => {
    const user = await verifyJWT(data.token as string);
    return user ? { userId: user.id } : null;
  },
  // Key exchange runs during auth — client must include publicKey in auth payload
  handshakeFn: async ({ clientId, data }) => {
    const clientPubKeyB64 = data.publicKey as string;
    if (!clientPubKeyB64) return null; // Reject — client didn't send a public key

    const peerKey = await ecdh.importPublicKey({ rawKeyB64: clientPubKeyB64 });
    const aesKey = await ecdh.deriveAESKey({
      privateKey: serverKeyPair.keyPair.privateKey,
      peerPublicKey: peerKey,
    });

    clientKeys.set(clientId, aesKey);
    return { serverPublicKey: serverKeyPair.publicKeyB64 };
  },
  clientDisconnectedFn: ({ clientId }) => {
    clientKeys.delete(clientId);
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

await helper.configure();
```

**Client-side flow:**
```javascript
const ws = new WebSocket('wss://example.com/ws');

ws.onopen = () => {
  // Send auth + public key in a single message
  ws.send(JSON.stringify({
    event: 'authenticate',
    data: {
      token: 'my-jwt-token',
      publicKey: clientPublicKeyB64, // ECDH P-256 public key
    },
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.event === 'connected') {
    // msg.data.serverPublicKey contains the server's ECDH public key
    const sharedSecret = deriveSharedSecret(clientPrivateKey, msg.data.serverPublicKey);
    // Now all subsequent messages from the server are encrypted
  }
};
```

---

## Heartbeat

The WebSocket helper uses a **passive heartbeat** model. The server does not send pings to clients. Instead, clients must periodically send `{ event: 'heartbeat' }` messages to keep their connection alive.

### How It Works

1. The server runs a periodic **sweep timer** at `HEARTBEAT_INTERVAL` (default: 30 seconds).
2. On each sweep, the server checks every authenticated client's `lastActivity` timestamp.
3. If `now - lastActivity > HEARTBEAT_TIMEOUT` (default: 90 seconds), the client is closed with code `4002` ("Heartbeat timeout").
4. Any message from the client (including `{ event: 'heartbeat' }`) updates `lastActivity`.

### Client-Side Implementation

Clients must send a heartbeat message periodically (recommended: every 30 seconds):

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

### Close Codes

| Code | Meaning | Trigger |
|------|---------|---------|
| `4001` | Authentication timeout | Client did not authenticate within `authTimeout` (5s) |
| `4002` | Heartbeat timeout | No activity for `heartbeatTimeout` (90s) |
| `4003` | Authentication failed | `authenticateFn` returned `null`/`false` or threw |
| `4004` | Encryption required | `requireEncryption` is `true` and `handshakeFn` rejected or was not configured |
| `1001` | Going away | Server shutting down gracefully |

---

## Redis Integration

The helper creates **two** dedicated Redis connections (duplicated from your `redisConnection`):

| Connection | Purpose |
|------------|---------|
| `redisPub` | Publish messages to other server instances |
| `redisSub` | Subscribe to messages from other server instances |

### Channel Architecture

```
Server A                      Redis                     Server B
+-----------+              +----------+               +-----------+
| WS Server |--redisPub-->|          |<--redisPub----| WS Server |
|           |<--redisSub--|  Pub/Sub |---redisSub--->|           |
|           |              |          |               |           |
+-----------+              +----------+               +-----------+
```

### Channel Patterns

| Channel | Pattern | Purpose |
|---------|---------|---------|
| `ws:broadcast` | Direct subscribe | Broadcast to all clients across all instances |
| `ws:room:{roomName}` | Pattern subscribe (`ws:room:*`) | Room-targeted messages |
| `ws:client:{clientId}` | Pattern subscribe (`ws:client:*`) | Client-targeted messages |
| `ws:user:{userId}` | Pattern subscribe (`ws:user:*`) | User-targeted messages (all sessions) |

### Deduplication

Every server instance generates a unique `serverId` (UUID) at construction. When a message arrives via Redis, the server checks `message.serverId` against its own ID. Messages from the same server are skipped to prevent double delivery.

### Horizontal Scaling

With Redis configured, you can run multiple server instances behind a load balancer:

```
Client A --> Load Balancer --> Server 1 (WebSocket + Redis Pub/Sub)
Client B -->       |       --> Server 2 (WebSocket + Redis Pub/Sub)
Client C -->       |       --> Server 3 (WebSocket + Redis Pub/Sub)
                   |
              All servers share messages via Redis
```

Events emitted via `helper.send()` are delivered locally **and** published to Redis, so they propagate across all instances automatically.

---

## Bun WebSocket Handler

The `getBunWebSocketHandler()` method returns an `IBunWebSocketHandler` object that contains both lifecycle callbacks and native Bun WebSocket configuration. This object is spread into `server.reload({ websocket })`.

### Lifecycle Callbacks

| Callback | When | What Happens |
|----------|------|--------------|
| `open` | WebSocket connection established | Extracts `clientId` from `socket.data`, calls `onClientConnect()` |
| `message` | Message received | Updates `lastActivity`, calls `onClientMessage()` for routing |
| `close` | Connection closed | Calls `onClientDisconnect()` for cleanup |
| `drain` | Backpressure cleared | Sets `client.backpressured = false` |

### Bun Native Configuration

The following Bun-native options are passed through via `serverOptions`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `perMessageDeflate` | `boolean` | `undefined` | Enable per-message compression |
| `maxPayloadLength` | `number` | `128 * 1024` (128KB) | Maximum incoming message size in bytes |
| `idleTimeout` | `number` | `60` (seconds) | Bun-level idle timeout (transport layer) |
| `backpressureLimit` | `number` | `1024 * 1024` (1MB) | Backpressure threshold in bytes |
| `closeOnBackpressureLimit` | `boolean` | `undefined` | Close socket when backpressure limit is exceeded |
| `sendPings` | `boolean` | `true` | Enable Bun transport-level pings |
| `publishToSelf` | `boolean` | `false` | Whether `server.publish()` delivers to the publishing socket |

> [!NOTE]
> `sendPings` and `idleTimeout` are Bun **transport-level** mechanisms. They are separate from the application-level heartbeat system which tracks `lastActivity` via actual message content.

---

## Built-in Events Reference

| Event | Constant | Direction | When |
|-------|----------|-----------|------|
| `authenticate` | `WebSocketEvents.AUTHENTICATE` | Client -> Server | Client sends credentials for authentication |
| `connected` | `WebSocketEvents.CONNECTED` | Server -> Client | Authentication succeeded, client is fully connected |
| `disconnect` | `WebSocketEvents.DISCONNECT` | Internal | Client disconnects (handled via Bun `close` callback) |
| `join` | `WebSocketEvents.JOIN` | Client -> Server | Request to join rooms |
| `leave` | `WebSocketEvents.LEAVE` | Client -> Server | Request to leave rooms |
| `error` | `WebSocketEvents.ERROR` | Server -> Client | Error message (invalid format, not authenticated, auth failed) |
| `heartbeat` | `WebSocketEvents.HEARTBEAT` | Client -> Server | Keep-alive message from client |

---

## `configure()` Internals

The `configure()` method sets up Redis connections and subscriptions:

```
configure()  [async]
  |
  |-- Register error handlers on redisPub, redisSub
  |
  |-- Connect duplicated clients (if status === 'wait')
  |
  |-- Await all Redis connections ready
  |     +-- Promise.all([waitForRedisReady(pub), waitForRedisReady(sub)])
  |
  |-- Setup Redis subscriptions
  |     |-- subscribe(ws:broadcast)             -- direct subscribe
  |     |-- psubscribe(ws:room:*)               -- pattern subscribe
  |     |-- psubscribe(ws:client:*)             -- pattern subscribe
  |     |-- psubscribe(ws:user:*)               -- pattern subscribe
  |     |-- on('message', onRedisMessage)        -- handle direct messages
  |     +-- on('pmessage', onRedisMessage)       -- handle pattern messages
  |
  +-- Start heartbeat timer
        +-- setInterval(heartbeatAll, heartbeatInterval)
```

---

## Shutdown Sequence

```
shutdown()  [async]
  |
  |-- Clear heartbeat timer
  |     +-- clearInterval(heartbeatTimer)
  |
  |-- Disconnect all clients
  |     +-- For each tracked client:
  |           +-- socket.close(1001, 'Server shutting down')
  |
  |-- Clear tracking maps
  |     |-- clients.clear()
  |     |-- users.clear()
  |     +-- rooms.clear()
  |
  +-- Quit Redis clients (parallel)
        |-- redisPub.quit()
        +-- redisSub.quit()
```

---

# WebSocketEmitter

Lightweight Redis-only publisher for sending messages to WebSocket clients from non-WebSocket processes (background workers, microservices, cron jobs). Uses `serverId: 'emitter'` so all server instances will process its messages (no dedup).

## Constructor

```typescript
new WebSocketEmitter(opts: IWebSocketEmitterOptions)
```

### Options

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `identifier` | `string` | No | `'WebSocketEmitter'` | Unique name for logging |
| `redisConnection` | `DefaultRedisHelper` | Yes | -- | Redis helper. Creates 1 duplicate connection internally |

### Example

```typescript
import { WebSocketEmitter } from '@venizia/ignis-helpers';

const emitter = new WebSocketEmitter({
  identifier: 'my-emitter',
  redisConnection: myRedisHelper,
});

await emitter.configure();
```

---

## Methods

### `configure(): Promise<void>`

Initializes the Redis connection. Must be called before emitting.

```typescript
await emitter.configure();
```

### `toClient(opts): Promise<void>`

Send a message to a specific client via Redis.

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts.clientId` | `string` | Target client ID |
| `opts.event` | `string` | Event name |
| `opts.data` | `unknown` | Event payload |

```typescript
await emitter.toClient({
  clientId: 'abc-123',
  event: 'notification',
  data: { message: 'Your report is ready' },
});
```

### `toUser(opts): Promise<void>`

Send a message to all sessions of a specific user via Redis.

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts.userId` | `string` | Target user ID |
| `opts.event` | `string` | Event name |
| `opts.data` | `unknown` | Event payload |

```typescript
await emitter.toUser({
  userId: 'user-123',
  event: 'notification',
  data: { message: 'New message from admin' },
});
```

### `toRoom(opts): Promise<void>`

Send a message to all clients in a room via Redis.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `opts.room` | `string` | Yes | Target room name |
| `opts.event` | `string` | Yes | Event name |
| `opts.data` | `unknown` | Yes | Event payload |
| `opts.exclude` | `string[]` | No | Client IDs to exclude |

```typescript
await emitter.toRoom({
  room: 'ws-notification',
  event: 'alert',
  data: { level: 'critical', text: 'Database failover' },
});
```

### `broadcast(opts): Promise<void>`

Broadcast a message to all clients across all server instances via Redis.

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts.event` | `string` | Event name |
| `opts.data` | `unknown` | Event payload |

```typescript
await emitter.broadcast({
  event: 'system:announcement',
  data: { text: 'Scheduled maintenance in 5 minutes' },
});
```

### `shutdown(): Promise<void>`

Quits the Redis connection.

```typescript
await emitter.shutdown();
```

---

## Constants Reference

### `WebSocketEvents`

| Constant | Value | Description |
|----------|-------|-------------|
| `AUTHENTICATE` | `'authenticate'` | Client -> Server auth request |
| `CONNECTED` | `'connected'` | Server -> Client auth success |
| `DISCONNECT` | `'disconnect'` | Disconnection event |
| `JOIN` | `'join'` | Room join request |
| `LEAVE` | `'leave'` | Room leave request |
| `ERROR` | `'error'` | Server -> Client error message |
| `HEARTBEAT` | `'heartbeat'` | Client -> Server keep-alive |

Utility methods:

```typescript
WebSocketEvents.isValid('authenticate'); // true
WebSocketEvents.isValid('invalid');      // false
WebSocketEvents.SCHEME_SET;             // Set { 'authenticate', 'connected', 'disconnect', 'join', 'leave', 'error', 'heartbeat' }
```

### `WebSocketChannels`

| Constant / Method | Value | Description |
|-------------------|-------|-------------|
| `BROADCAST` | `'ws:broadcast'` | Broadcast channel |
| `ROOM_PREFIX` | `'ws:room:'` | Room channel prefix |
| `CLIENT_PREFIX` | `'ws:client:'` | Client channel prefix |
| `USER_PREFIX` | `'ws:user:'` | User channel prefix |
| `forRoom({ room })` | `'ws:room:{room}'` | Build room channel |
| `forClient({ clientId })` | `'ws:client:{clientId}'` | Build client channel |
| `forUser({ userId })` | `'ws:user:{userId}'` | Build user channel |
| `forRoomPattern()` | `'ws:room:*'` | Room pattern for `psubscribe` |
| `forClientPattern()` | `'ws:client:*'` | Client pattern for `psubscribe` |
| `forUserPattern()` | `'ws:user:*'` | User pattern for `psubscribe` |

### `WebSocketDefaults`

| Constant | Value | Description |
|----------|-------|-------------|
| `PATH` | `'/ws'` | Default WebSocket path |
| `ROOM` | `'ws-default'` | Default room |
| `NOTIFICATION_ROOM` | `'ws-notification'` | Default notification room |
| `BROADCAST_TOPIC` | `'ws:internal:broadcast'` | Bun pub/sub broadcast topic |
| `MAX_PAYLOAD_LENGTH` | `131072` (128KB) | Maximum incoming payload size |
| `IDLE_TIMEOUT` | `60` (seconds) | Bun transport idle timeout |
| `BACKPRESSURE_LIMIT` | `1048576` (1MB) | Bun backpressure threshold |
| `SEND_PINGS` | `true` | Bun transport pings |
| `PUBLISH_TO_SELF` | `false` | Bun pub/sub self-delivery |
| `AUTH_TIMEOUT` | `5000` (5s) | Authentication timeout |
| `HEARTBEAT_INTERVAL` | `30000` (30s) | Heartbeat sweep interval |
| `HEARTBEAT_TIMEOUT` | `90000` (90s) | Heartbeat inactivity threshold |
| `ENCRYPTED_BATCH_LIMIT` | `10` | Max concurrent encryption operations for room/broadcast delivery |

### `WebSocketMessageTypes`

| Constant | Value | Description |
|----------|-------|-------------|
| `CLIENT` | `'client'` | Message targeted at a specific client |
| `USER` | `'user'` | Message targeted at all sessions of a user |
| `ROOM` | `'room'` | Message targeted at a room |
| `BROADCAST` | `'broadcast'` | Message targeted at all clients |

Utility methods:

```typescript
WebSocketMessageTypes.isValid('room'); // true
WebSocketMessageTypes.SCHEME_SET;     // Set { 'client', 'user', 'room', 'broadcast' }
```

### `WebSocketClientStates`

| Constant | Value | Description |
|----------|-------|-------------|
| `UNAUTHORIZED` | `'unauthorized'` | Initial state after connection |
| `AUTHENTICATING` | `'authenticating'` | Auth in progress |
| `AUTHENTICATED` | `'authenticated'` | Successfully authenticated |
| `DISCONNECTED` | `'disconnected'` | Client has disconnected |

Utility methods:

```typescript
WebSocketClientStates.isValid('authenticated'); // true
WebSocketClientStates.SCHEME_SET;               // Set { 'unauthorized', 'authenticating', 'authenticated', 'disconnected' }
```

---

## Type Definitions

### `IWebSocket<T>`

Bun WebSocket handle interface (defined locally to avoid `@types/bun` dependency in `tsc`):

```typescript
interface IWebSocket<T = unknown> {
  readonly data: T;
  readonly remoteAddress: string;
  readonly readyState: number;

  send(data: string | ArrayBufferView | ArrayBuffer | SharedArrayBuffer, compress?: boolean): number;
  subscribe(topic: string): void;
  unsubscribe(topic: string): void;
  isSubscribed(topic: string): boolean;
  close(code?: number, reason?: string): void;
  cork(cb: (ws: IWebSocket<T>) => void): void;
}
```

### `IBunServer`

Bun server interface for native pub/sub:

```typescript
interface IBunServer {
  readonly pendingWebSockets: number;
  publish(
    topic: string,
    data: string | ArrayBufferView | ArrayBuffer | SharedArrayBuffer,
    compress?: boolean,
  ): number;
}
```

### `IBunWebSocketConfig`

Bun native WebSocket configuration:

```typescript
interface IBunWebSocketConfig {
  perMessageDeflate?: boolean;
  maxPayloadLength?: number;
  idleTimeout?: number;
  backpressureLimit?: number;
  closeOnBackpressureLimit?: boolean;
  sendPings?: boolean;
  publishToSelf?: boolean;
}
```

### `IBunWebSocketHandler`

Return type of `getBunWebSocketHandler()`:

```typescript
interface IBunWebSocketHandler extends IBunWebSocketConfig {
  open: (socket: IWebSocket) => void;
  message: (socket: IWebSocket, message: string | Buffer) => void;
  close: (socket: IWebSocket, code: number, reason: string) => void;
  drain: (socket: IWebSocket) => void;
}
```

### `IWebSocketMessage<DataType>`

Client <-> Server message envelope:

```typescript
interface IWebSocketMessage<DataType = unknown> {
  event: string;
  data?: DataType;
  id?: string;
}
```

### `IRedisSocketMessage<DataType>`

Internal Redis Pub/Sub message envelope:

```typescript
interface IRedisSocketMessage<DataType = unknown> {
  serverId: string;
  type: TWebSocketMessageType;    // 'client' | 'user' | 'room' | 'broadcast'
  target?: string;
  event: string;
  data: DataType;
  exclude?: string[];
}
```

### `IWebSocketClient<MetadataType>`

```typescript
interface IWebSocketClient<MetadataType = Record<string, unknown>> {
  id: string;
  userId?: string;
  socket: IWebSocket;
  state: TWebSocketClientState;
  rooms: Set<string>;
  backpressured: boolean;
  encrypted: boolean;
  connectedAt: number;
  lastActivity: number;
  metadata?: MetadataType;
}
```

### `IWebSocketData<MetadataType>`

Data attached during `server.upgrade()`:

```typescript
interface IWebSocketData<MetadataType = Record<string, unknown>> {
  clientId: string;
  userId?: string;
  metadata?: MetadataType;
}
```

### `IWebSocketServerOptions`

```typescript
interface IWebSocketServerOptions {
  identifier: string;
  path?: string;
  redisConnection: DefaultRedisHelper;
  server: IBunServer;
  defaultRooms?: string[];
  serverOptions?: IBunWebSocketConfig;
  authTimeout?: number;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
  encryptedBatchLimit?: number;   // Default: 10
  requireEncryption?: boolean;    // Default: false

  authenticateFn: TWebSocketAuthenticateFn;
  validateRoomFn?: TWebSocketValidateRoomFn;
  clientConnectedFn?: TWebSocketClientConnectedFn;
  clientDisconnectedFn?: TWebSocketClientDisconnectedFn;
  messageHandler?: TWebSocketMessageHandler;
  outboundTransformer?: TWebSocketOutboundTransformer;
  handshakeFn?: TWebSocketHandshakeFn;   // Required when requireEncryption is true
}
```

### `IWebSocketEmitterOptions`

```typescript
interface IWebSocketEmitterOptions {
  identifier?: string;
  redisConnection: DefaultRedisHelper;
}
```

### Callback Types

```typescript
// Authentication — return { userId, metadata } on success, null/false to reject
type TWebSocketAuthenticateFn = (
  data: Record<string, unknown>,
) => ValueOrPromise<{ userId?: string; metadata?: Record<string, unknown> } | null | false>;

// Room validation — return allowed subset of requested rooms
type TWebSocketValidateRoomFn = (opts: {
  clientId: string;
  userId?: string;
  rooms: string[];
}) => ValueOrPromise<string[]>;

// Post-authentication callback
type TWebSocketClientConnectedFn = (opts: {
  clientId: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}) => ValueOrPromise<void>;

// Disconnect callback
type TWebSocketClientDisconnectedFn = (opts: {
  clientId: string;
  userId?: string;
}) => ValueOrPromise<void>;

// Custom event handler — called for non-system events from authenticated clients
type TWebSocketMessageHandler = (opts: {
  clientId: string;
  userId?: string;
  message: IWebSocketMessage;
}) => ValueOrPromise<void>;

// Outbound transformer — intercepts messages before socket.send()
// Return transformed { event, data } or null to use original payload
type TWebSocketOutboundTransformer<DataType = unknown> = (opts: {
  client: IWebSocketClient;
  event: string;
  data: DataType;
}) => ValueOrPromise<TNullable<{ event: string; data: DataType }>>;

// Handshake — ECDH key exchange during authentication
// Return { serverPublicKey } on success, null/false to reject
type TWebSocketHandshakeFn = (opts: {
  clientId: string;
  userId?: string;
  data: Record<string, unknown>;
}) => ValueOrPromise<{ serverPublicKey: string } | null | false>;
```

---

## Key Differences from Socket.IO

> [!NOTE]
> The WebSocket helper is a fundamentally different approach from the Socket.IO helper. Consider these differences when choosing between the two.

| Aspect | WebSocket Helper | Socket.IO Helper |
|--------|-----------------|------------------|
| **Runtime** | Bun only (throws on Node.js) | Node.js + Bun |
| **Protocol** | Pure WebSocket (RFC 6455) | Socket.IO protocol (WebSocket + polling fallback) |
| **Authentication** | Post-connection event (`{ event: 'authenticate' }`) | Post-connection event (`authenticate` Socket.IO event) |
| **Cross-Instance** | Redis Pub/Sub (2 connections) | Redis Adapter + Redis Emitter (3 connections) |
| **Intra-Instance** | Bun native pub/sub (C++ fan-out, O(1)) | Socket.IO in-memory rooms |
| **Heartbeat** | Application-level passive (server sweeps, client sends) | Socket.IO built-in ping/pong |
| **Max Payload** | 128KB default | Configurable via Socket.IO `maxHttpBufferSize` |
| **Polling Fallback** | None -- pure WebSocket only | HTTP long-polling fallback |
| **Message Format** | JSON envelope: `{ event, data, id? }` | Socket.IO binary protocol |
| **Encryption** | Built-in outbound transformer + ECDH support | Manual (middleware/plugin) |
| **Emitter** | `WebSocketEmitter` (1 Redis connection) | `@socket.io/redis-emitter` |
| **Client Library** | Browser-native `WebSocket` API | `socket.io-client` |

---

## See Also

- **Related Concepts:**
  - [Services](/guides/core-concepts/services) -- Using helpers in service layer

- **Other Helpers:**
  - [Helpers Index](./index) -- All available helpers
  - [Redis Helper](./redis) -- `RedisHelper` used for WebSocket cross-instance messaging
  - [Crypto Helper](./crypto) -- ECDH key exchange for WebSocket encryption
  - [Socket.IO Helper](./socket-io) -- Alternative real-time helper with Node.js support

- **References:**
  - [WebSocket Component](/references/components/websocket) -- Component setup and lifecycle integration

- **External Resources:**
  - [Bun WebSocket API](https://bun.sh/docs/api/websockets) -- Official Bun WebSocket documentation
  - [WebSocket Protocol (RFC 6455)](https://datatracker.ietf.org/doc/html/rfc6455) -- WebSocket specification
