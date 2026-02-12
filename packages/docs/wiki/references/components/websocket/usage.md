# WebSocket -- Usage & Examples

> Server-side usage patterns, WebSocket Emitter, wire protocol, client tracking, Redis channel architecture, authentication flow, and delivery strategy.

## Using in Services/Controllers

Inject `WebSocketServerHelper` to interact with WebSocket:

```typescript
import {
  BaseService,
  inject,
  WebSocketBindingKeys,
  CoreBindings,
  BaseApplication,
} from '@venizia/ignis';
import { WebSocketServerHelper } from '@venizia/ignis-helpers';

export class NotificationService extends BaseService {
  // Lazy getter pattern -- helper is bound AFTER server starts
  private _ws: WebSocketServerHelper | null = null;

  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    private application: BaseApplication,
  ) {
    super({ scope: NotificationService.name });
  }

  private get ws(): WebSocketServerHelper {
    if (!this._ws) {
      this._ws = this.application.get<WebSocketServerHelper>({
        key: WebSocketBindingKeys.WEBSOCKET_INSTANCE,
        isOptional: true,
      }) ?? null;
    }

    if (!this._ws) {
      throw new Error('WebSocket not initialized');
    }

    return this._ws;
  }

  // Send to a specific client
  notifyClient(opts: { clientId: string; message: string }) {
    this.ws.send({
      destination: opts.clientId,
      payload: {
        topic: 'notification',
        data: { message: opts.message, time: new Date().toISOString() },
      },
    });
  }

  // Send to all sessions of a user (local instance only)
  notifyUser(opts: { userId: string; message: string }) {
    this.ws.sendToUser({
      userId: opts.userId,
      event: 'notification',
      data: { message: opts.message },
    });
  }

  // Send to a room
  notifyRoom(opts: { room: string; message: string }) {
    this.ws.send({
      destination: opts.room,
      payload: {
        topic: 'room:update',
        data: { message: opts.message },
      },
    });
  }

  // Broadcast to all clients
  broadcastAnnouncement(opts: { message: string }) {
    this.ws.send({
      payload: {
        topic: 'system:announcement',
        data: { message: opts.message },
      },
    });
  }
}
```

> [!IMPORTANT]
> **Lazy getter pattern**: Since `WebSocketServerHelper` is bound via a post-start hook, it is not available during DI construction. Use a lazy getter that resolves from the application container on first access.

> [!WARNING]
> **`send()` does not support cross-instance user targeting.** The `send()` method resolves `destination` by checking local `clients` map then local `rooms` map. There is no `USER` type in `send()`. To reach all sessions of a user across instances, use `sendToUser()` for local delivery or `WebSocketEmitter.toUser()` for Redis-based cross-instance delivery.

## WebSocket Emitter

`WebSocketEmitter` is a **standalone, lightweight Redis-only publisher** for sending WebSocket messages from processes that do not run a WebSocket server -- such as background workers, cron jobs, microservices, or CLI scripts.

It connects to Redis and publishes messages using the same `IRedisSocketMessage` envelope that `WebSocketServerHelper` listens for, so all connected server instances will receive and deliver the messages to their local clients.

#### When to Use WebSocketEmitter

| Scenario | Use |
|----------|-----|
| Send from a controller or service in the main app | `WebSocketServerHelper` (injected via DI) |
| Send from a background worker or cron job | `WebSocketEmitter` |
| Send from a separate microservice | `WebSocketEmitter` |
| Broadcast from a CLI script | `WebSocketEmitter` |

#### Emitter Setup

```typescript
import { WebSocketEmitter, RedisHelper } from '@venizia/ignis-helpers';

// 1. Create a Redis connection (same Redis instance as the WebSocket server)
const redisHelper = new RedisHelper({
  name: 'emitter-redis',
  host: process.env.REDIS_HOST ?? 'localhost',
  port: +(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
  autoConnect: false,
});

// 2. Create the emitter
const emitter = new WebSocketEmitter({
  identifier: 'my-worker-emitter', // Optional, defaults to 'WebSocketEmitter'
  redisConnection: redisHelper,
});

// 3. Configure (connects Redis pub client)
await emitter.configure();
```

#### Sending Messages

```typescript
// Send to a specific client by ID
await emitter.toClient({
  clientId: 'uuid-of-client',
  event: 'job:progress',
  data: { jobId: '123', progress: 75 },
});

// Send to all sessions of a user (cross-instance)
await emitter.toUser({
  userId: 'user-456',
  event: 'notification',
  data: { message: 'Your report is ready' },
});

// Send to a room
await emitter.toRoom({
  room: 'dashboard-viewers',
  event: 'data:update',
  data: { metric: 'cpu', value: 42.5 },
  exclude: ['client-id-to-skip'], // Optional: exclude specific clients
});

// Broadcast to all connected, authenticated clients
await emitter.broadcast({
  event: 'system:maintenance',
  data: { message: 'Scheduled maintenance in 10 minutes' },
});
```

#### Shutdown

```typescript
// Always shut down when done to release the Redis connection
await emitter.shutdown();
```

> [!NOTE]
> The emitter uses a fixed `serverId` of `'emitter'` instead of a random UUID. This means all server instances will process emitter messages (none will self-dedup). The emitter only needs a single Redis client (pub), not two (pub + sub) like the server helper.

> [!TIP]
> `WebSocketEmitter.toUser()` publishes to the `ws:user:{userId}` Redis channel. All server instances subscribed via `psubscribe('ws:user:*')` will receive it and call `sendToUser()` locally, reaching every session of that user across all instances. This is the **recommended way** to send to a user from outside the main application process.

## Wire Protocol

### Client-Server Message Format

All messages exchanged between client and server follow the `IWebSocketMessage` envelope:

```typescript
interface IWebSocketMessage<DataType = unknown> {
  event: string;    // Event name (system or custom)
  data?: DataType;  // Payload data
  id?: string;      // Optional message ID (application-defined)
}
```

Messages are serialized as JSON strings over the WebSocket connection. The `event` field is required -- messages without it are logged and dropped.

### System Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `authenticate` | Client --> Server | Auth credentials (<code v-pre>{ type, token, publicKey? }</code>) | Client sends credentials after connection opens |
| `connected` | Server --> Client | <code v-pre>{ id, userId, time, serverPublicKey?, salt? }</code> | Sent after successful authentication |
| `disconnect` | Both | -- | Connection closing |
| `join` | Client --> Server | <code v-pre>{ rooms: string[] }</code> | Request to join rooms |
| `leave` | Client --> Server | <code v-pre>{ rooms: string[] }</code> | Request to leave rooms |
| `error` | Server --> Client | <code v-pre>{ message: string }</code> | Error notification |
| `heartbeat` | Client --> Server | -- | Keep-alive ping (client sends, server updates `lastActivity`) |
| `encrypted` | Both | Varies | Encryption handshake data |

> [!NOTE]
> The `heartbeat` event is handled specially -- it updates the client's `lastActivity` timestamp and returns immediately without triggering any callbacks. Clients must send heartbeats within the `heartbeatTimeout` interval to avoid being disconnected with code `4002`.

### Close Codes

| Code | Reason | Trigger |
|------|--------|---------|
| `1001` | Server shutting down | `wsHelper.shutdown()` |
| `4001` | Authentication timeout | Client did not send `authenticate` within `authTimeout`, or `authenticateFn` did not complete within `authTimeout * 3` |
| `4002` | Heartbeat timeout | No messages received within `heartbeatTimeout` |
| `4003` | Authentication failed | `authenticateFn` returned `null`/`false` or threw an exception |
| `4004` | Encryption required | `requireEncryption: true` and either no `handshakeFn` configured or `handshakeFn` returned `null`/`false` |

### Redis Message Envelope

Cross-instance messages are published via Redis Pub/Sub using the `IRedisSocketMessage` envelope:

```typescript
interface IRedisSocketMessage<DataType = unknown> {
  serverId: string;                // Source server instance ID (UUID or 'emitter')
  type: TWebSocketMessageType;     // 'client' | 'user' | 'room' | 'broadcast'
  target?: string;                 // Target clientId / userId / room name
  event: string;                   // Event to deliver
  data: DataType;                  // Payload
  exclude?: string[];              // Client IDs to exclude from delivery
}
```

Messages from the same `serverId` are ignored (self-dedup) -- the sending server already delivered locally before publishing to Redis. Messages from the `WebSocketEmitter` use `serverId = 'emitter'`, which never matches any server's UUID, so all servers process them.

### Message Types

| Type | Channel Pattern | Description |
|------|----------------|-------------|
| `client` | `ws:client:{clientId}` | Direct to specific client |
| `user` | `ws:user:{userId}` | To all clients of a user |
| `room` | `ws:room:{roomName}` | To all clients in a room |
| `broadcast` | `ws:broadcast` | To all connected, authenticated clients |

## Client Tracking

### `IWebSocketClient` Interface

Each connected client is tracked in an in-memory `Map<string, IWebSocketClient>`:

```typescript
interface IWebSocketClient<
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;                           // Unique client ID (UUID, assigned during upgrade)
  userId?: string;                      // Set after authentication
  socket: IWebSocket;                   // Bun native WebSocket reference
  state: TWebSocketClientState;         // 'unauthorized' | 'authenticating' | 'authenticated' | 'disconnected'
  rooms: Set<string>;                   // Joined rooms (including default rooms and own clientId room)
  backpressured: boolean;               // True when socket.send() returns -1 (Bun backpressure)
  encrypted: boolean;                   // Whether client has completed encryption handshake
  connectedAt: number;                  // Connection timestamp (Date.now())
  lastActivity: number;                 // Last heartbeat/message timestamp (Date.now())
  metadata?: MetadataType;              // Custom metadata from authenticateFn return value
  serverPublicKey?: string;             // ECDH public key (set if encrypted)
  salt?: string;                        // Encryption salt (set if encrypted)
  authTimer?: ReturnType<typeof setTimeout>; // Auth timeout timer (cleared after auth)
}
```

### Client State Transitions

```
UNAUTHORIZED --(authenticate event)--> AUTHENTICATING
                                            |
                              +-------------+-------------+
                              |             |             |
                         auth fails    auth succeeds   timeout
                              |             |             |
                              v             v             v
                        DISCONNECTED   AUTHENTICATED  DISCONNECTED
                                            |
                                    (close / heartbeat timeout)
                                            |
                                            v
                                       DISCONNECTED
```

States are defined in the `WebSocketClientStates` constant class:

```typescript
class WebSocketClientStates {
  static readonly UNAUTHORIZED = 'unauthorized';
  static readonly AUTHENTICATING = 'authenticating';
  static readonly AUTHENTICATED = 'authenticated';
  static readonly DISCONNECTED = 'disconnected';
}
```

### Tracking Maps

The server maintains three index maps for efficient lookups:

| Map | Key | Value | Purpose |
|-----|-----|-------|---------|
| `clients` | `clientId` | `IWebSocketClient` | All connected clients |
| `users` | `userId` | `Set<clientId>` | Multi-session user index |
| `rooms` | `room` | `Set<clientId>` | Room membership index |

> [!TIP]
> A single user can have multiple client connections (e.g., browser tab + mobile). Use `getClientsByUser({ userId })` to reach all sessions. The `users` map entry is automatically cleaned up when the last client for a user disconnects.

## Redis Channel Architecture

### `WebSocketChannels` Class

```typescript
class WebSocketChannels {
  // --- Static channel names ---
  static readonly BROADCAST = 'ws:broadcast';
  static readonly ROOM_PREFIX = 'ws:room:';
  static readonly CLIENT_PREFIX = 'ws:client:';
  static readonly USER_PREFIX = 'ws:user:';

  // --- Channel builders ---
  static forRoom(opts: { room: string }): string;     // 'ws:room:{room}'
  static forClient(opts: { clientId: string }): string; // 'ws:client:{clientId}'
  static forUser(opts: { userId: string }): string;     // 'ws:user:{userId}'

  // --- Pattern builders (for Redis PSUBSCRIBE) ---
  static forRoomPattern(): string;   // 'ws:room:*'
  static forClientPattern(): string; // 'ws:client:*'
  static forUserPattern(): string;   // 'ws:user:*'
}
```

### Redis Client Type

Both `WebSocketServerHelper` and `WebSocketEmitter` support Redis single instance and Redis Cluster:

```typescript
type TRedisClient = Redis | Cluster;
```

The Redis client is obtained via `redisConnection.getClient().duplicate()`. The `duplicate()` call creates a fresh connection that inherits the parent's configuration (including cluster mode). This ensures WebSocket pub/sub traffic does not interfere with application Redis usage.

### Subscription Setup

During `configure()`, the server subscribes to all channels:

```typescript
// Direct subscribe (exact match)
redisSub.subscribe(WebSocketChannels.BROADCAST);            // 'ws:broadcast'

// Pattern subscribe (wildcard match)
redisSub.psubscribe(WebSocketChannels.forRoomPattern());    // 'ws:room:*'
redisSub.psubscribe(WebSocketChannels.forClientPattern());  // 'ws:client:*'
redisSub.psubscribe(WebSocketChannels.forUserPattern());    // 'ws:user:*'
```

> [!NOTE]
> Redis PSUBSCRIBE uses pattern matching -- a message published to `ws:room:chat-general` is received by all servers subscribed to `ws:room:*`. This allows the server to receive messages for any room without knowing room names in advance.

### Message Flow (Cross-Instance)

```
Server A                          Redis                         Server B
   |                                |                               |
   |-- send({ destination: room }) -|                               |
   |   1. sendToRoom() locally      |                               |
   |   2. publishToRedis() -------->|-- ws:room:chat ------>        |
   |                                |                    onRedisMessage()
   |                                |                      |-- skip if serverId === own
   |                                |                      +-- sendToRoom() locally
```

### Message Flow (Emitter to Servers)

```
WebSocketEmitter                  Redis                    Server A + Server B
   |                                |                               |
   |-- toUser({ userId }) -------->|-- ws:user:u1 -------->        |
   |   serverId = 'emitter'        |                    onRedisMessage()
   |                                |                      |-- serverId !== own -> process
   |                                |                      +-- sendToUser() locally
```

## Authentication Flow

```
Client                          Server
  |                                |
  |-- WS upgrade request -------->|
  |<-- 101 Switching Protocols ---|  (Bun handles upgrade)
  |                                |-- onClientConnect()
  |                                |   state = UNAUTHORIZED
  |                                |   subscribe(clientId)  <-- Bun topic for direct messaging
  |                                |   start authTimer (5s default)
  |                                |
  |-- { event: 'authenticate',    |
  |     data: { token: '...' } } >|-- handleAuthenticate()
  |                                |   state = AUTHENTICATING
  |                                |   replace timer with authTimeout * 3
  |                                |   await authenticateFn(data)
  |                                |     |
  |                                |   (if requireEncryption)
  |                                |     await handshakeFn(data)
  |                                |     enableClientEncryption()
  |                                |   state = AUTHENTICATED
  |                                |   index by userId
  |                                |   subscribe(BROADCAST_TOPIC)  <-- unless encrypted
  |                                |   joinRoom(clientId)          <-- auto-join own ID as room
  |                                |   joinRoom(default rooms)
  |                                |
  |<-- { event: 'connected',      |
  |      data: { id, userId,      |
  |        time, serverPublicKey?, |
  |        salt? } } -------------|
  |                                |-- clientConnectedFn()
```

### Authentication Timeout Details

There are two timeout phases:

1. **Initial timeout** (`authTimeout`, default 5 s): Starts when the client connects. If the client does not send an `authenticate` event within this window, the socket is closed with code `4001`.

2. **In-progress timeout** (`authTimeout * 3`, default 15 s): Replaces the initial timer when the `authenticate` event is received. This provides a longer window for the async `authenticateFn` (and optionally `handshakeFn`) to complete. If authentication does not finish within this window, the socket is closed with code `4001`.

### Client ID Auto-Join

After successful authentication, the server calls `joinRoom({ clientId, room: clientId })`. This means the client's own ID is registered as both a Bun native topic subscription (set during `onClientConnect`) and an application-level room. This enables targeting a specific client via `send({ destination: clientId })` or `sendToRoom({ room: clientId })`.

### Bun Topic Subscription Timing

| Topic | Subscribed At | Condition |
|-------|--------------|-----------|
| Client's own `clientId` | `onClientConnect()` (before auth) | Always |
| `BROADCAST_TOPIC` | `handleAuthenticate()` (after auth) | Only if `!client.encrypted` |
| Default rooms | `handleAuthenticate()` (after auth, via `joinRoom()`) | Only if `!client.encrypted` |
| Custom rooms | `handleJoin()` (on client request) | Only if `!client.encrypted` |

Encrypted clients are **never** subscribed to Bun native topics (except `clientId` which is set before encryption status is known). All delivery to encrypted clients goes through the per-client `outboundTransformer` path.

## Delivery Strategy

The helper uses a dual delivery strategy depending on whether encryption is active:

**Without encryption (fast path):**
- Room/broadcast messages use Bun's native `server.publish(topic, payload)` -- O(1) C++ fan-out
- Client-direct messages use `socket.send()` directly
- Zero JavaScript iteration for room fan-out

**With encryption (per-client path):**
- Encrypted clients are unsubscribed from all Bun native topics (`enableClientEncryption()`)
- Room/broadcast messages iterate clients individually, running each through `outboundTransformer`
- Uses `executePromiseWithLimit({ tasks, limit: encryptedBatchLimit })` for concurrency control
- Non-encrypted clients in the same room still use the Bun fast path

**With `exclude` parameter:**
- When `exclude` is provided in `sendToRoom()` or `broadcast()`, the fast path is bypassed even without encryption
- The server iterates all clients, skipping those in the `exclude` set

> [!IMPORTANT]
> When an `outboundTransformer` is bound, **all** room/broadcast messages fall back to the per-client iteration path (even for non-encrypted clients in the same room). This is because Bun native pub/sub cannot selectively apply transformations. Only bind `outboundTransformer` when you actually need per-client message transformation.

## See Also

- [Setup & Configuration](./) - Quick reference, imports, setup steps, configuration, and binding keys
- [API Reference](./api) - Architecture, WebSocketEmitter API, and internals
- [Error Reference](./errors) - Error conditions table and troubleshooting
- [WebSocketServerHelper](/references/helpers/websocket/) - Helper API documentation
- [Socket.IO Component](../socket-io/) - Node.js-compatible alternative with Socket.IO
- [Bun WebSocket Documentation](https://bun.sh/docs/api/websockets) - Official Bun WebSocket API reference
