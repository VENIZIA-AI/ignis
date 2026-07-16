---
title: WebSocket Component - Usage & Examples
description: Injecting the WebSocket helper, the standalone emitter, wire protocol, client tracking, and delivery strategy
difficulty: intermediate
---

# Usage & Examples

Task-oriented patterns for working with the WebSocket component once it is registered: sending messages, reading the wire protocol, and understanding delivery.

## Inject the helper in a service or controller

`WebSocketServerHelper` is bound to `WEBSOCKET_INSTANCE` inside a post-start hook, so it does not exist at DI-construction time. Use a lazy getter that resolves from the application container on first access.

```typescript
import { BaseService, inject, CoreBindings, BaseApplication } from '@venizia/ignis';
import { WebSocketBindingKeys } from '@venizia/ignis/websocket';
import { WebSocketServerHelper } from '@venizia/ignis-helpers';

export class NotificationService extends BaseService {
  private _ws: WebSocketServerHelper | null = null;

  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({ scope: NotificationService.name });
  }

  private get ws(): WebSocketServerHelper {
    if (!this._ws) {
      this._ws =
        this.application.get<WebSocketServerHelper>({
          key: WebSocketBindingKeys.WEBSOCKET_INSTANCE,
          isOptional: true,
        }) ?? null;
    }

    if (!this._ws) {
      throw new Error('WebSocket not initialized');
    }
    return this._ws;
  }

  notifyClient(opts: { clientId: string; message: string }) {
    this.ws.sendToClient({ clientId: opts.clientId, event: 'notification', data: { message: opts.message } });
  }

  notifyUser(opts: { userId: string; message: string }) {
    this.ws.sendToUser({ userId: opts.userId, event: 'notification', data: { message: opts.message } });
  }

  notifyRoom(opts: { room: string; message: string }) {
    this.ws.sendToRoom({ room: opts.room, event: 'room:update', data: { message: opts.message } });
  }

  broadcastAnnouncement(opts: { message: string }) {
    this.ws.broadcast({ event: 'system:announcement', data: { message: opts.message } });
  }
}
```

- **Never `@inject` `WEBSOCKET_INSTANCE` in a constructor.** It is not bound yet at that point - the lazy getter is the only correct pattern.
- **`sendToClient`/`sendToUser`/`sendToRoom`/`broadcast` are local-only.** They fan out to clients connected to this process. Cross-instance delivery goes through `send()` (Redis-backed) or `WebSocketEmitter` - see below.
- **`send({ destination, payload })` resolves `destination` dynamically** against local clients, then local rooms, then falls back to publishing as a `ROOM` message on Redis. There is no `userId` destination in `send()` - use `sendToUser()` (local) or `WebSocketEmitter.toUser()` (cross-instance) to reach every session of a user.

## Send from a process with no WebSocket server

`WebSocketEmitter` is a standalone, Redis-only publisher for background workers, cron jobs, other microservices, or CLI scripts - anything that needs to push a WebSocket message without running a server. It publishes the same `IRedisSocketMessage` envelope the server helper listens for, so every connected server instance delivers it to its local clients.

| Scenario | Use |
|----------|-----|
| Controller or service inside the main app | `WebSocketServerHelper` (injected via DI) |
| Background worker or cron job | `WebSocketEmitter` |
| Separate microservice | `WebSocketEmitter` |
| CLI script | `WebSocketEmitter` |

```typescript
import { WebSocketEmitter, RedisSingleHelper } from '@venizia/ignis-helpers';

const redisHelper = new RedisSingleHelper({ name: 'emitter-redis', host: 'localhost', port: 6379, autoConnect: false });

const emitter = new WebSocketEmitter({ identifier: 'my-worker-emitter', redisConnection: redisHelper });
await emitter.configure(); // connects the Redis pub client

await emitter.toClient({ clientId: 'uuid-of-client', event: 'job:progress', data: { jobId: '123', progress: 75 } });
await emitter.toUser({ userId: 'user-456', event: 'notification', data: { message: 'Your report is ready' } });
await emitter.toRoom({ room: 'dashboard-viewers', event: 'data:update', data: { metric: 'cpu', value: 42.5 }, exclude: ['client-id-to-skip'] });
await emitter.broadcast({ event: 'system:maintenance', data: { message: 'Scheduled maintenance in 10 minutes' } });

await emitter.shutdown(); // always release the Redis connection when done
```

- **Fixed `serverId`.** The emitter always publishes with `serverId: 'emitter'`, which never matches a server's `crypto.randomUUID()` - so every server instance processes its messages, none self-dedup.
- **One Redis client, not two.** The emitter only needs a pub client; the server helper needs pub + sub.
- **`toUser()` is the recommended cross-instance path.** It publishes to `ws:user:{userId}`; every server subscribed via `psubscribe('ws:user:*')` receives it and calls `sendToUser()` locally, reaching every session of that user across all instances.

## Read the wire protocol

Every message between client and server is a JSON-serialized `IWebSocketMessage` envelope:

```typescript
interface IWebSocketMessage<DataType = unknown> {
  event: string;    // Required - messages without it are logged and dropped
  data?: DataType;
  id?: string;       // Optional, application-defined
}
```

**System events**

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `authenticate` | Client -> Server | <code v-pre>{ type, token, publicKey? }</code> | Sent after connection opens |
| `connected` | Server -> Client | <code v-pre>{ id, userId, time, serverPublicKey?, salt? }</code> | Sent after successful authentication |
| `disconnect` | Both | -- | Connection closing |
| `join` | Client -> Server | <code v-pre>{ rooms: string[] }</code> | Request to join rooms |
| `leave` | Client -> Server | <code v-pre>{ rooms: string[] }</code> | Request to leave rooms |
| `error` | Server -> Client | <code v-pre>{ message: string }</code> | Error notification |
| `heartbeat` | Client -> Server | -- | Keep-alive; server updates `lastActivity`, no callback fires |
| `encrypted` | Both | Varies | Encryption handshake data |

**Close codes**

| Code | Reason | Trigger |
|------|--------|---------|
| `1001` | Server shutting down | `wsHelper.shutdown()` |
| `4001` | Authentication timeout | No `authenticate` within `authTimeout`, or `authenticateFn`/`handshakeFn` didn't finish within `authTimeout * 3` |
| `4002` | Heartbeat timeout | No messages within `heartbeatTimeout` |
| `4003` | Authentication failed | `authenticateFn` returned `null`/`false` or threw |
| `4004` | Encryption required | `requireEncryption: true` and no `handshakeFn`, or it returned `null`/`false` |

**Redis Pub/Sub envelope** (cross-instance messages only):

```typescript
interface IRedisSocketMessage<DataType = unknown> {
  serverId: string;                // Source server UUID, or 'emitter'
  type: 'client' | 'user' | 'room' | 'broadcast';
  target?: string;                 // Target clientId / userId / room name
  event: string;
  data: DataType;
  exclude?: string[];              // Client IDs to skip during delivery
}
```

| Type | Channel Pattern | Description |
|------|----------------|-------------|
| `client` | `ws:client:{clientId}` | Direct to specific client |
| `user` | `ws:user:{userId}` | To all clients of a user |
| `room` | `ws:room:{roomName}` | To all clients in a room |
| `broadcast` | `ws:broadcast` | To all connected, authenticated clients |

- **Self-dedup by `serverId`.** A server ignores Redis messages carrying its own `serverId` - it already delivered locally before publishing. `WebSocketEmitter` messages use `serverId: 'emitter'`, which never matches, so all servers process them.

## Track connected clients

Each connection is an `IWebSocketClient` entry in an in-memory `Map<string, IWebSocketClient>`:

```typescript
interface IWebSocketClient<MetadataType extends Record<string, unknown> = Record<string, unknown>> {
  id: string;                    // UUID, assigned during upgrade
  userId?: string;               // Set after authentication
  socket: IWebSocket;            // Bun native WebSocket reference
  state: 'unauthorized' | 'authenticating' | 'authenticated' | 'disconnected';
  rooms: Set<string>;            // Joined rooms, including default rooms + own clientId room
  backpressured: boolean;        // True when socket.send() returned -1
  encrypted: boolean;            // Completed the encryption handshake
  connectedAt: number;
  lastActivity: number;          // Last heartbeat/message timestamp
  metadata?: MetadataType;       // From authenticateFn's return value
  serverPublicKey?: string;
  salt?: string;
}
```

**State transitions**

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
                                            v
                                       DISCONNECTED
```

**Index maps**

| Map | Key | Value | Purpose |
|-----|-----|-------|---------|
| `clients` | `clientId` | `IWebSocketClient` | All connected clients |
| `users` | `userId` | `Set<clientId>` | Multi-session user index |
| `rooms` | `room` | `Set<clientId>` | Room membership index |

- **One user, many sessions.** `getClientsByUser({ userId })` returns every session for a user (browser tab, mobile app, ...). The `users` map entry is removed automatically once the last session disconnects.

## Understand the authentication flow

```
Client                          Server
  |-- WS upgrade request -------->|
  |<-- 101 Switching Protocols ---|  (Bun handles the upgrade)
  |                                |-- state = UNAUTHORIZED, subscribe(clientId), start authTimer (5s)
  |-- { event: 'authenticate',    |
  |     data: { token: '...' } } >|-- state = AUTHENTICATING, replace timer with authTimeout * 3
  |                                |   await authenticateFn(data)
  |                                |   (if requireEncryption) await handshakeFn(data)
  |                                |   state = AUTHENTICATED, index by userId
  |                                |   subscribe(BROADCAST_TOPIC) + joinRoom(clientId + default rooms)  <- unless encrypted
  |<-- { event: 'connected', ... }-|
  |                                |-- clientConnectedFn()
```

- **Two timeout phases, not one.** The initial `authTimeout` (5s default) starts on connect and closes with `4001` if no `authenticate` event arrives. Once `authenticate` is received, that timer is replaced with `authTimeout * 3` (15s default) to give the async `authenticateFn` (and `handshakeFn`) room to complete.
- **A client's own ID becomes a room.** After authentication, `joinRoom({ clientId, room: clientId })` runs automatically - this is what lets `send({ destination: clientId })` or `sendToRoom({ room: clientId })` target one specific client.
- **Encrypted clients skip Bun's native topics.** A client's own `clientId` topic is subscribed before auth (always). `BROADCAST_TOPIC` and rooms are subscribed after auth, but only when `!client.encrypted`. Encrypted clients rely entirely on the per-client `outboundTransformer` path.

## Understand the delivery strategy

The helper picks a delivery path per call, based on encryption and `exclude`:

| Condition | Path |
|-----------|------|
| No encryption, no `exclude` | Bun's native `server.publish(topic, payload)` - O(1) C++ fan-out, zero JS iteration |
| No encryption, `exclude` provided | Iterates clients in the room/broadcast set, skipping excluded IDs |
| Encryption active | Unsubscribed from Bun topics; iterates clients individually through `outboundTransformer`, bounded by `executePromiseWithLimit({ limit: encryptedBatchLimit })` |
| `outboundTransformer` bound at all | **All** room/broadcast sends fall back to per-client iteration, even for non-encrypted clients in the same room - Bun's native pub/sub cannot selectively transform |

> [!IMPORTANT]
> Only bind `outboundTransformer` when you actually need per-client message transformation (e.g. per-client encryption). Binding it removes the fast path for every room/broadcast send, encrypted or not.

## See also

- [Overview](./) - quick start, imports, and common configuration tasks
- [Full Reference](./api) - lifecycle diagram, binding keys, `WebSocketEmitter` API, internals
- [Error Reference](./errors) - error conditions and troubleshooting
- [WebSocketServerHelper](/extensions/helpers/websocket/) - helper API documentation
- [Socket.IO Component](../socket-io/) - Node.js-compatible alternative
- [Bun WebSocket Documentation](https://bun.sh/docs/api/websockets) - official Bun WebSocket API reference
