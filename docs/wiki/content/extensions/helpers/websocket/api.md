---
title: WebSocket - Full Reference
description: Complete reference for WebSocketServerHelper and WebSocketEmitter - constructors, every method, the client lifecycle, types, and constants
difficulty: intermediate
---

# WebSocket - Full Reference

Exhaustive reference for `WebSocketServerHelper` and `WebSocketEmitter`. For a readable introduction and the most common tasks, start with the [WebSocket overview](/extensions/helpers/websocket/).

**Files:**

- [`packages/helpers/src/modules/socket/websocket/server/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/websocket/server/helper.ts) - `WebSocketServerHelper`
- [`packages/helpers/src/modules/socket/websocket/emitter/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/websocket/emitter/helper.ts) - `WebSocketEmitter`
- [`packages/helpers/src/modules/socket/websocket/common/types/`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/websocket/common/types) - option, callback, and wire types
- [`packages/helpers/src/modules/socket/websocket/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/websocket/common/constants.ts) - `WebSocketEvents`, `WebSocketChannels`, `WebSocketDefaults`, `WebSocketMessageTypes`, `WebSocketClientStates`

## Find what you need

| You want to | Go to |
|---|---|
| See every class and its role at a glance | [Quick Reference](#quick-reference) |
| Follow a connection from upgrade to disconnect | [Client connection lifecycle](#client-connection-lifecycle) |
| Look up every server constructor option | [`IWebSocketServerOptions`](#iwebsocketserveroptions) |
| Send to one client, a user, a room, or everyone (same process) | [Server API](#server-api) |
| Send to clients on any server instance, or publish from a process with no server of its own | [Server API](#server-api) / [Emitter API](#emitter-api) |
| Look up a wire type, option type, or callback signature | [Types Reference](#types-reference) |
| Look up an event name, channel, default, or close code | [Constants](#constants) |
| Debug a stuck, rejected, or cross-instance delivery problem | [Troubleshooting](#troubleshooting) |

## Quick Reference

| Class | Extends | Role |
|-------|---------|------|
| `WebSocketServerHelper` | `BaseHelper` | Bun-native WebSocket server with auth, rooms, heartbeat, Redis Pub/Sub scaling |
| `WebSocketEmitter` | `BaseHelper` | Publish messages to WebSocket clients from any process via Redis |

### Import Reference

```typescript
import { WebSocketServerHelper, WebSocketEmitter } from '@venizia/ignis-helpers';

import type {
  IWebSocketServerOptions,
  IWebSocketEmitterOptions,
  IWebSocketClient,
  IWebSocketData,
  IWebSocketMessage,
  IRedisSocketMessage,
  IWebSocket,
  IBunServer,
  IBunWebSocketConfig,
  IBunWebSocketHandler,
  TWebSocketAuthenticateFn,
  TWebSocketValidateRoomFn,
  TWebSocketClientConnectedFn,
  TWebSocketClientDisconnectedFn,
  TWebSocketMessageHandler,
  TWebSocketOutboundTransformer,
  TWebSocketHandshakeFn,
  TWebSocketClientState,
  TWebSocketEvent,
  TWebSocketMessageType,
} from '@venizia/ignis-helpers';

import {
  WebSocketEvents,
  WebSocketChannels,
  WebSocketDefaults,
  WebSocketMessageTypes,
  WebSocketClientStates,
} from '@venizia/ignis-helpers';
```

## Architecture

`Source ->` [`server/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/websocket/server/helper.ts), [`emitter/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/websocket/emitter/helper.ts)

```
                     WebSocketServerHelper
                    +---------------------------------------------------+
                    |  constructor(opts)                                |
                    |    |-- identifier, path, serverId (UUID)          |
                    |    |-- Store callbacks (auth, rooms, messages)    |
                    |    |-- Apply defaults (rooms, timeouts)           |
                    |    +-- initRedisClients(redisConnection)          |
                    |          +-- redisPub = duplicateClient()         |
                    |          +-- redisSub = duplicateClient()         |
                    |                                                   |
                    |  configure()  [async]                             |
                    |    |-- Connect Redis clients (if lazyConnect)     |
                    |    |-- await Redis ready (pub + sub)              |
                    |    |-- setupRedisSubscriptions()                  |
                    |    |     |-- subscribe(ws:broadcast)              |
                    |    |     |-- psubscribe(ws:room:*)                |
                    |    |     |-- psubscribe(ws:client:*)              |
                    |    |     +-- psubscribe(ws:user:*)                |
                    |    +-- startHeartbeatTimer()                      |
                    |                                                   |
                    |  getBunWebSocketHandler()                         |
                    |    +-- Returns { open, message, close, drain,     |
                    |         ...serverOptions }                        |
                    +---------------------------------------------------+

                     WebSocketEmitter
                    +---------------------------------------------------+
                    |  constructor(opts)                                |
                    |    +-- redisPub = duplicateClient()                |
                    |                                                   |
                    |  configure()  [async]                             |
                    |    +-- await Redis ready                          |
                    |                                                   |
                    |  toClient / toUser / toRoom / broadcast           |
                    |    +-- publish(channel, IRedisSocketMessage)      |
                    +---------------------------------------------------+
```

### Client connection lifecycle

```
Client connects via WebSocket upgrade
  |
  +-- onClientConnect({ clientId, socket })
  |     +-- Create IWebSocketClient entry (state: UNAUTHORIZED)
  |     +-- Subscribe to clientId topic (Bun native pub/sub)
  |     +-- Start auth timeout (authTimeout ms)
  |
  +-- Client sends { event: 'authenticate', data: { ... } }
  |     +-- handleAuthenticate()
  |           +-- Set state: AUTHENTICATING
  |           +-- Extended timeout (authTimeout * 3) for async auth
  |           +-- Call authenticateFn(data)
  |                 +-- Success:
  |                 |     +-- Set state: AUTHENTICATED
  |                 |     +-- [requireEncryption?] -> handshakeFn() -> enableClientEncryption()
  |                 |     +-- Index by userId
  |                 |     +-- Subscribe to broadcast topic (unless encrypted)
  |                 |     +-- Join clientId room + defaultRooms
  |                 |     +-- Send 'connected' event
  |                 |     +-- Call clientConnectedFn()
  |                 +-- Failure (null/false or throw):
  |                       +-- Send 'error' event
  |                       +-- Close with code 4003
  |
  +-- Auth timeout expires (still UNAUTHORIZED or AUTHENTICATING)
  |     +-- Close with code 4001
  |
  +-- Heartbeat sweep (every heartbeatInterval)
  |     +-- If now - lastActivity > heartbeatTimeout (AUTHENTICATED clients only)
  |           +-- Close with code 4002
  |
  +-- Client disconnects
        +-- onClientDisconnect()
              +-- Clear auth timer
              +-- Remove from user index
              +-- Remove from all rooms
              +-- Remove from clients map
              +-- Call clientDisconnectedFn()
```

### Redis two-client architecture

```
Server A                      Redis                     Server B
+-----------+              +----------+               +-----------+
| WS Server |--redisPub-->|          |<--redisPub----| WS Server |
|           |<--redisSub--|  Pub/Sub |---redisSub--->|           |
+-----------+              +----------+               +-----------+
```

- **Duplication.** `WebSocketServerHelper` duplicates its `redisConnection` twice (`redisPub`, `redisSub`); `WebSocketEmitter` duplicates it once (`redisPub` only).
- **Connection types.** Both single-instance `Redis` and `Cluster` connections from ioredis are supported - the parent helper connection stays independent and unconsumed.
- **Dedup on receipt.** Every server instance generates a unique `serverId` (UUID) at construction. A message carrying that same `serverId` on receipt is skipped, so the originating instance never delivers to itself twice.

## Server API

`Source ->` [`server/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/websocket/server/helper.ts)

### Constructor

```typescript
constructor(opts: IWebSocketServerOptions<AuthDataType, MetadataType>)
```

On construction:

- Generates a unique `serverId` (UUID).
- Stores all options, with defaults applied.
- Initializes two duplicated Redis clients (`redisPub`, `redisSub`).

Throws `getError({ statusCode: 500, message: '[WebSocketServerHelper] Invalid redis connection!' })` if `redisConnection` is falsy.

#### Generic type parameters

| Type parameter | Types | Default |
|---|---|---|
| `AuthDataType` | The payload passed to `authenticateFn`/`handshakeFn` | `Record<string, unknown>` |
| `MetadataType` | The value returned as `metadata` and stored on `IWebSocketClient` | `Record<string, unknown>` |

```typescript
interface AuthPayload { type: string; token: string; publicKey?: string }
interface UserMetadata { role: string; permissions: string[] }

const helper = new WebSocketServerHelper<AuthPayload, UserMetadata>({
  identifier: 'typed-ws',
  server: bunServer,
  redisConnection: redis,
  authenticateFn: async data => {
    // data is typed as AuthPayload
    const user = await verifyJWT(data.token);
    return user ? { userId: user.id, metadata: { role: user.role, permissions: user.permissions } } : null;
  },
  clientConnectedFn: ({ metadata }) => {
    // metadata is typed as UserMetadata | undefined
    if (metadata?.role === 'admin') console.log('admin connected');
  },
});
```

### `IWebSocketServerOptions`

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `identifier` | `string` | Yes | - | Unique name for this instance; also used as the `BaseHelper` logging scope |
| `path` | `string` | No | `'/ws'` | URL path for WebSocket upgrade requests |
| `server` | `IBunServer` | Yes | - | Bun server instance (provides `publish()` for native pub/sub) |
| `redisConnection` | `IRedisHelper` | Yes | - | Redis helper for cross-instance messaging; duplicated twice internally |
| `defaultRooms` | `string[]` | No | `['ws-default', 'ws-notification']` | Rooms every client auto-joins after authentication |
| `serverOptions` | `IBunWebSocketConfig` | No | See [Bun native configuration](#bun-native-configuration) | Bun native WebSocket configuration |
| `authTimeout` | `number` | No | `5000` (5s) | Milliseconds before an unauthenticated client is disconnected (close code `4001`); extended to `authTimeout * 3` while `authenticateFn` is in flight |
| `heartbeatInterval` | `number` | No | `30000` (30s) | Milliseconds between heartbeat sweeps |
| `heartbeatTimeout` | `number` | No | `90000` (90s) | Milliseconds of inactivity before an authenticated client is closed (close code `4002`) |
| `encryptedBatchLimit` | `number` | No | `10` | Max concurrent `outboundTransformer` invocations during room/broadcast delivery |
| `requireEncryption` | `boolean` | No | `false` | When `true`, clients must complete the handshake during auth or get disconnected (code `4004`) |
| `authenticateFn` | `TWebSocketAuthenticateFn` | Yes | - | Called on `{ event: 'authenticate' }`. Return `{ userId, metadata }` to accept, `null`/`false` (or throw) to reject |
| `validateRoomFn` | `TWebSocketValidateRoomFn` | No | - | Called on `{ event: 'join' }`. Return the allowed subset of requested rooms. All joins are rejected when this is not provided |
| `clientConnectedFn` | `TWebSocketClientConnectedFn` | No | - | Called after successful authentication |
| `clientDisconnectedFn` | `TWebSocketClientDisconnectedFn` | No | - | Called during disconnect cleanup |
| `messageHandler` | `TWebSocketMessageHandler` | No | - | Called for events other than `authenticate`, `heartbeat`, `join`, `leave` from authenticated clients |
| `outboundTransformer` | `TWebSocketOutboundTransformer` | No | - | Intercepts outbound `{ event, data }` before `socket.send()`; enables per-client encryption |
| `handshakeFn` | `TWebSocketHandshakeFn` | No | - | Required when `requireEncryption` is `true`. Returns `{ serverPublicKey, salt }` to accept, `null`/`false` to reject |

- **All callbacks run through `invokeHook()`.** Applies to `authenticateFn`, `validateRoomFn`, `clientConnectedFn`, `clientDisconnectedFn`, `messageHandler`, and `handshakeFn`.
- **Failures do not crash the process.** A synchronous throw inside a Bun socket handler is caught and logged. A rejected promise is logged the same way, via `voidExecution`.

### `configure()`

```typescript
configure(): Promise<void>
```

Must be called after construction and before accepting connections.

1. Registers `error` listeners on `redisPub` and `redisSub`.
2. Connects both duplicated clients if their status is `'wait'` (`lazyConnect` mode).
3. `await Promise.all([waitForRedisReady(redisPub), waitForRedisReady(redisSub)])`.
4. Subscribes: `subscribe('ws:broadcast')`, `psubscribe('ws:room:*')`, `psubscribe('ws:client:*')`, `psubscribe('ws:user:*')` - awaited together before proceeding.
5. Starts the heartbeat timer: `setInterval(heartbeatAll, heartbeatInterval)`.

### `getBunWebSocketHandler()`

```typescript
getBunWebSocketHandler(): IBunWebSocketHandler
```

Returns the Bun WebSocket handler object. Pass it to `server.reload({ websocket })`.

| Callback | When | Behavior |
|----------|------|----------|
| `open` | Connection established | Reads `clientId` from `socket.data`, calls `onClientConnect()` |
| `message` | Message received | Updates `client.lastActivity`, calls `onClientMessage()` for routing |
| `close` | Connection closed | Calls `onClientDisconnect()` for cleanup |
| `drain` | Backpressure cleared | Sets `client.backpressured = false` |

#### Bun native configuration

- **`serverOptions` is spread into the returned handler.** `WebSocketServerHelper` only applies its own default for `sendPings`, `idleTimeout`, and `maxPayloadLength`.
- **Everything else falls through to Bun.** The remaining fields are `undefined` unless you set them. Bun applies its own runtime default in that case.

| Option | Type | Helper default | Description |
|--------|------|-----------------|--------------|
| `sendPings` | `boolean` | `true` | Bun transport-level pings |
| `idleTimeout` | `number` | `60` (seconds) | Bun-level idle timeout (transport layer, separate from `heartbeatTimeout`) |
| `maxPayloadLength` | `number` | `131072` (128KB) | Maximum incoming message size in bytes |
| `perMessageDeflate` | `boolean` | not set by the helper | Enable per-message compression |
| `backpressureLimit` | `number` | not set by the helper | Backpressure threshold in bytes |
| `closeOnBackpressureLimit` | `boolean` | not set by the helper | Close socket when the backpressure limit is exceeded |
| `publishToSelf` | `boolean` | not set by the helper | Whether `server.publish()` delivers to the publishing socket |

### `getPath()`

```typescript
getPath(): string
```

Returns the configured WebSocket path (default: `'/ws'`).

### `getClients()`

```typescript
getClients(opts?: { id?: string }):
  | IWebSocketClient<MetadataType>
  | Map<string, IWebSocketClient<MetadataType>>
  | undefined
```

Without `id` (or an empty `opts`), returns the full `Map<string, IWebSocketClient>`. With `{ id }`, returns that client entry or `undefined`.

### `getClientsByUser()`

```typescript
getClientsByUser(opts: { userId: string }): IWebSocketClient<MetadataType>[]
```

Returns every client belonging to `userId`; `[]` if the user has no active connections.

### `getClientsByRoom()`

```typescript
getClientsByRoom(opts: { room: string }): IWebSocketClient<MetadataType>[]
```

Returns every client in `room`; `[]` if the room does not exist or is empty.

### `onClientConnect()`

```typescript
onClientConnect(opts: { clientId: string; socket: IWebSocket }): void
```

Handles a new WebSocket connection:

- Creates an `IWebSocketClient` entry with state `UNAUTHORIZED`.
- Subscribes the socket to its own `clientId` topic (Bun native pub/sub).
- Starts the authentication timeout.

If the client ID already exists, it returns early and logs `'Client already existed'`.

### `onClientMessage()`

```typescript
onClientMessage(opts: { clientId: string; raw: string }): void
```

Routes an incoming message:

- Parses `raw` as JSON. On failure, sends `{ event: 'error', data: { message: 'Invalid message format' } }` and returns.
- A parsed message with no `event` field is logged and dropped.
- `heartbeat`: consumed silently (`lastActivity` is already updated by the `message` callback before this runs).
- `authenticate`: delegates to `handleAuthenticate()`.
- Any other event, when the client is not `AUTHENTICATED`: sends `{ event: 'error', data: { message: 'Not authenticated' } }`.
- `join` / `leave`: delegate to the internal room handlers.
- Everything else: delegates to `messageHandler` via `invokeHook()`, if configured; otherwise logged at `debug` and dropped.

### `onClientDisconnect()`

```typescript
onClientDisconnect(opts: { clientId: string }): void
```

Cleans up a disconnected client:

- Clears the pending auth timer.
- Removes the client from its user's index.
- Removes it from every joined room.
- Removes it from the clients map.

It then invokes `clientDisconnectedFn`.

### `joinRoom()`

```typescript
joinRoom(opts: { clientId: string; room: string }): void
```

Adds `clientId` to the room index and to `client.rooms`, and subscribes the socket to the room's Bun native pub/sub topic. An encrypted client skips the subscribe step - delivery goes through the transformer instead. No-op if the client does not exist.

### `leaveRoom()`

```typescript
leaveRoom(opts: { clientId: string; room: string }): void
```

Removes `clientId` from the room index and from `client.rooms`, and unsubscribes the socket from the room's topic. No-op if the client does not exist.

#### Room name validation (client-initiated `join`/`leave` only)

`handleJoin()` filters requested room names before calling `validateRoomFn`:

- Must be a non-empty string.
- Maximum 256 characters.
- Cannot start with `ws:` (reserved for the internal Redis channel prefix).

- **Rejection is silent.** No error goes back to the client - the join is only rejected and logged. That happens when:
  - every requested room is filtered out,
  - `validateRoomFn` is not configured, or
  - it resolves to an empty array.
- **`leave` does not re-filter.** `{ event: 'leave' }` only processes rooms the client is actually a member of (`client.rooms.has(room)`).
- **Programmatic calls bypass validation.** `joinRoom()`/`leaveRoom()` called directly skip all of the above.

### `enableClientEncryption()`

```typescript
enableClientEncryption(opts: { clientId: string }): void
```

Unsubscribes the client from every Bun native pub/sub topic (the broadcast topic plus all joined rooms), so `server.publish()` no longer reaches it. Messages are instead delivered individually through `outboundTransformer`. No-op if the client is already encrypted or does not exist.

> [!WARNING]
> Irreversible for the lifetime of the connection. Once a client is encrypted it cannot be switched back to Bun native pub/sub delivery.

### `sendToClient()`

```typescript
sendToClient(opts: { clientId: string; event: string; data: unknown; doLog?: boolean }): void
```

- **Local delivery only.**
- **Encrypted client, `outboundTransformer` configured.** The transformer runs (async) before `socket.send()`. A transformer error is logged, and the message is dropped.
- **Otherwise.** Sends `JSON.stringify({ event, data })` directly.
- **`doLog: true`** emits an info log after delivery.

### `sendToUser()`

```typescript
sendToUser(opts: { userId: string; event: string; data: unknown }): void
```

Local delivery only. Iterates the user's client set and calls `sendToClient()` for each.

### `sendToRoom()`

```typescript
sendToRoom(opts: { room: string; event: string; data: unknown; exclude?: string[] }): void
```

Local delivery only.

| Condition | Strategy |
|-----------|----------|
| No `outboundTransformer`, no `exclude` | Bun native `server.publish(room, payload)` - O(1) C++ fan-out |
| `outboundTransformer` set, no `exclude` | Iterates room clients via `executePromiseWithLimit` (max `encryptedBatchLimit` concurrent) |
| `exclude` provided | Always iterates clients individually - Bun pub/sub cannot exclude |

### `broadcast()`

```typescript
broadcast(opts: { event: string; data: unknown; exclude?: string[] }): void
```

Local delivery only, to `AUTHENTICATED` clients. Same delivery strategy as `sendToRoom()`, publishing to `WebSocketDefaults.BROADCAST_TOPIC` (`'ws:internal:broadcast'`) instead of a room topic when no transformer/exclude applies.

### `send()`

```typescript
send<T = unknown>(opts: {
  destination?: string;
  payload: { topic: string; data: T };
  doLog?: boolean;
  callback?: () => void;
}): void
```

Cross-instance messaging: delivers locally **and** publishes to Redis so other server instances receive it.

| `destination` | Local delivery | Redis channel |
|---------------|----------------|----------------|
| Omitted | `broadcast()` | `ws:broadcast` |
| Matches a locally-tracked client ID | `sendToClient()` | `ws:client:{clientId}` |
| Matches a locally-tracked room name | `sendToRoom()` | `ws:room:{room}` |
| Matches neither (remote target) | None | `ws:room:{destination}` |

Silent no-op when `payload` is falsy, `payload.topic` is falsy, or `payload.data` is `undefined`. When `callback` is provided it runs via `setTimeout(callback, 0)` regardless of delivery outcome.

### `shutdown()`

```typescript
shutdown(): Promise<void>
```

1. Clears the heartbeat timer.
2. Closes every client socket with code `1001` (`'Server shutting down'`).
3. Calls `onClientDisconnect()` for every tracked client (clears auth timers, removes from indexes, invokes `clientDisconnectedFn`).
4. Clears the `clients`, `users`, and `rooms` maps.
5. `await Promise.all([redisPub.quit(), redisSub.quit()])`.

## Emitter API

`Source ->` [`emitter/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/websocket/emitter/helper.ts)

- **Role.** A Redis-only publisher for processes with no WebSocket server of their own - background workers, other microservices, cron jobs.
- **No self-skip.** It always publishes with `serverId: 'emitter'`, so every server instance processes the message. There is no dedup skip on the sending side.

### Constructor

```typescript
constructor(opts: IWebSocketEmitterOptions)
```

Duplicates one Redis client from `redisConnection`. Throws `getError({ statusCode: 500, message: '[WebSocketEmitter] Invalid redis connection!' })` if `redisConnection` is falsy.

### `IWebSocketEmitterOptions`

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `identifier` | `string` | No | `'WebSocketEmitter'` | Instance name; also the `BaseHelper` logging scope |
| `redisConnection` | `IRedisHelper` | Yes | - | Redis helper; duplicated once internally |

### `configure()`

```typescript
configure(): Promise<void>
```

Connects the Redis client (if status is `'wait'`) and `await`s it reaching `'ready'`. Must be called before emitting.

### `toClient()`

```typescript
toClient(opts: { clientId: string; event: string; data: unknown }): Promise<void>
```

Publishes to `ws:client:{clientId}`. Every server instance subscribed via `psubscribe('ws:client:*')` delivers it to that client if connected locally.

### `toUser()`

```typescript
toUser(opts: { userId: string; event: string; data: unknown }): Promise<void>
```

Publishes to `ws:user:{userId}`. Every server instance delivers it to every session belonging to that user.

### `toRoom()`

```typescript
toRoom(opts: { room: string; event: string; data: unknown; exclude?: string[] }): Promise<void>
```

Publishes to `ws:room:{room}`. Every server instance delivers it to every client in that room.

### `broadcast()`

```typescript
broadcast(opts: { event: string; data: unknown }): Promise<void>
```

Publishes to `ws:broadcast`. Every server instance delivers it to every authenticated client.

### `shutdown()`

```typescript
shutdown(): Promise<void>
```

Quits the duplicated Redis connection.

## Types Reference

`Source ->` [`common/types/`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/websocket/common/types)

### Wire protocol

```typescript
/** Client <-> Server message envelope */
interface IWebSocketMessage<DataType = unknown> {
  event: string;
  data?: DataType;
  id?: string;
}

/** Internal Redis Pub/Sub message envelope */
interface IRedisSocketMessage<DataType = unknown> {
  serverId: string;
  type: TWebSocketMessageType; // 'client' | 'user' | 'room' | 'broadcast'
  target?: string;
  event: string;
  data: DataType;
  exclude?: string[];
}
```

### Client tracking

```typescript
interface IWebSocketClient<
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> {
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
  serverPublicKey?: string;
  salt?: string;
  authTimer?: ReturnType<typeof setTimeout>;
}

/** Data attached during server.upgrade() */
interface IWebSocketData<
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> {
  clientId: string;
  userId?: string;
  metadata?: MetadataType;
}
```

### Bun interfaces

```typescript
/** Bun WebSocket handle - defined locally to avoid an @types/bun dependency */
interface IWebSocket<T = unknown> {
  readonly data: T;
  readonly remoteAddress: string;
  readonly readyState: number;

  send(data: string | ArrayBufferView | ArrayBuffer | SharedArrayBuffer, compress?: boolean): number;
  subscribe(topic: string): void;
  unsubscribe(topic: string): void;
  isSubscribed(topic: string): boolean;
  close(code?: number, reason?: string): void;
  cork(callback: (ws: IWebSocket<T>) => void): void;
}

/** Bun server interface for native pub/sub */
interface IBunServer {
  readonly pendingWebSockets: number;
  publish(
    topic: string,
    data: string | ArrayBufferView | ArrayBuffer | SharedArrayBuffer,
    compress?: boolean,
  ): number;
}

/** Bun native WebSocket configuration */
interface IBunWebSocketConfig {
  perMessageDeflate?: boolean;
  maxPayloadLength?: number;
  idleTimeout?: number;
  backpressureLimit?: number;
  closeOnBackpressureLimit?: boolean;
  sendPings?: boolean;
  publishToSelf?: boolean;
}

/** Return type of getBunWebSocketHandler() */
interface IBunWebSocketHandler extends IBunWebSocketConfig {
  open: (socket: IWebSocket) => void;
  message: (socket: IWebSocket, message: string | Buffer) => void;
  close: (socket: IWebSocket, code: number, reason: string) => void;
  drain: (socket: IWebSocket) => void;
}
```

### Server and emitter options

```typescript
interface IWebSocketServerOptions<
  AuthDataType extends Record<string, unknown> = Record<string, unknown>,
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> {
  identifier: string;
  path?: string; // Default: '/ws'
  redisConnection: IRedisHelper;
  server: IBunServer;
  defaultRooms?: string[]; // Default: ['ws-default', 'ws-notification']
  serverOptions?: IBunWebSocketConfig;
  authTimeout?: number; // Default: 5_000
  heartbeatInterval?: number; // Default: 30_000
  heartbeatTimeout?: number; // Default: 90_000
  encryptedBatchLimit?: number; // Default: 10
  requireEncryption?: boolean; // Default: false

  authenticateFn: TWebSocketAuthenticateFn<AuthDataType, MetadataType>;
  validateRoomFn?: TWebSocketValidateRoomFn;
  clientConnectedFn?: TWebSocketClientConnectedFn<MetadataType>;
  clientDisconnectedFn?: TWebSocketClientDisconnectedFn;
  messageHandler?: TWebSocketMessageHandler;
  outboundTransformer?: TWebSocketOutboundTransformer<unknown, MetadataType>;
  handshakeFn?: TWebSocketHandshakeFn<AuthDataType>; // Required when requireEncryption is true
}

interface IWebSocketEmitterOptions {
  identifier?: string; // Default: 'WebSocketEmitter'
  redisConnection: IRedisHelper;
}
```

### Callback types

```typescript
/** Authentication - return { userId, metadata } to accept, null/false to reject */
type TWebSocketAuthenticateFn<
  AuthDataType extends Record<string, unknown> = Record<string, unknown>,
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> = (
  opts: AuthDataType,
) => ValueOrPromise<{ userId?: string; metadata?: MetadataType } | null | false>;

/** Handshake during auth - return { serverPublicKey, salt } to accept, null/false to reject */
type TWebSocketHandshakeFn<
  AuthDataType extends Record<string, unknown> = Record<string, unknown>,
> = (opts: {
  clientId: string;
  userId?: string;
  data: AuthDataType;
}) => ValueOrPromise<{ serverPublicKey: string; salt: string } | null | false>;

/** Room validation - return the allowed subset of requested rooms */
type TWebSocketValidateRoomFn = (opts: {
  clientId: string;
  userId?: string;
  rooms: string[];
}) => ValueOrPromise<string[]>;

/** Post-authentication callback */
type TWebSocketClientConnectedFn<
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> = (opts: { clientId: string; userId?: string; metadata?: MetadataType }) => ValueOrPromise<void>;

/** Disconnect callback */
type TWebSocketClientDisconnectedFn = (opts: {
  clientId: string;
  userId?: string;
}) => ValueOrPromise<void>;

/** Custom event handler for events other than authenticate/heartbeat/join/leave */
type TWebSocketMessageHandler = (opts: {
  clientId: string;
  userId?: string;
  message: IWebSocketMessage;
}) => ValueOrPromise<void>;

/** Outbound transformer - intercepts messages before socket.send() */
type TWebSocketOutboundTransformer<
  DataType = unknown,
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> = (opts: {
  client: IWebSocketClient<MetadataType>;
  event: string;
  data: DataType;
}) => ValueOrPromise<TNullable<{ event: string; data: DataType }>>;
```

### State types

```typescript
type TWebSocketClientState = 'unauthorized' | 'authenticating' | 'authenticated' | 'disconnected';
type TWebSocketEvent = 'authenticate' | 'connected' | 'disconnect' | 'join' | 'leave' | 'error' | 'heartbeat' | 'encrypted';
type TWebSocketMessageType = 'client' | 'user' | 'room' | 'broadcast';
```

## Constants

`Source ->` [`common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/websocket/common/constants.ts)

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
| `ENCRYPTED` | `'encrypted'` | Encrypted message wrapper |

```typescript
WebSocketEvents.isValid('authenticate'); // true
WebSocketEvents.isValid('invalid');      // false
WebSocketEvents.SCHEME_SET;              // Set of all valid event strings
```

### `WebSocketChannels`

| Constant / Method | Value | Description |
|-------------------|-------|-------------|
| `BROADCAST` | `'ws:broadcast'` | Broadcast channel |
| `ROOM_PREFIX` | `'ws:room:'` | Room channel prefix |
| `CLIENT_PREFIX` | `'ws:client:'` | Client channel prefix |
| `USER_PREFIX` | `'ws:user:'` | User channel prefix |
| `forRoom({ room })` | `'ws:room:{room}'` | Build a room channel name |
| `forClient({ clientId })` | `'ws:client:{clientId}'` | Build a client channel name |
| `forUser({ userId })` | `'ws:user:{userId}'` | Build a user channel name |
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
| `BACKPRESSURE_LIMIT` | `1048576` (1MB) | Bun backpressure threshold (Bun's own default, not applied by the helper) |
| `SEND_PINGS` | `true` | Bun transport pings enabled |
| `PUBLISH_TO_SELF` | `false` | Bun pub/sub self-delivery disabled (Bun's own default, not applied by the helper) |
| `AUTH_TIMEOUT` | `5000` (5s) | Authentication timeout |
| `HEARTBEAT_INTERVAL` | `30000` (30s) | Heartbeat sweep interval |
| `HEARTBEAT_TIMEOUT` | `90000` (90s, 3x interval) | Heartbeat inactivity threshold |
| `ENCRYPTED_BATCH_LIMIT` | `10` | Max concurrent `outboundTransformer` invocations |

### `WebSocketMessageTypes`

| Constant | Value | Description |
|----------|-------|-------------|
| `CLIENT` | `'client'` | Message targeted at a specific client |
| `USER` | `'user'` | Message targeted at all sessions of a user |
| `ROOM` | `'room'` | Message targeted at a room |
| `BROADCAST` | `'broadcast'` | Message targeted at all clients |

```typescript
WebSocketMessageTypes.isValid('room'); // true
WebSocketMessageTypes.SCHEME_SET;      // Set { 'client', 'user', 'room', 'broadcast' }
```

### `WebSocketClientStates`

| Constant | Value | Description |
|----------|-------|-------------|
| `UNAUTHORIZED` | `'unauthorized'` | Initial state after connection |
| `AUTHENTICATING` | `'authenticating'` | `authenticate` event received, awaiting `authenticateFn` |
| `AUTHENTICATED` | `'authenticated'` | Successfully authenticated, fully operational |
| `DISCONNECTED` | `'disconnected'` | Client has disconnected |

```typescript
WebSocketClientStates.isValid('authenticated'); // true
WebSocketClientStates.SCHEME_SET;               // Set of all valid state strings
```

### Close codes

| Code | Meaning | Trigger |
|------|---------|---------|
| `4001` | Authentication timeout | Client did not authenticate within `authTimeout` (or `authTimeout * 3` once `authenticateFn` started) |
| `4002` | Heartbeat timeout | No activity for `heartbeatTimeout` |
| `4003` | Authentication failed | `authenticateFn` returned `null`/`false` or threw |
| `4004` | Encryption required | `requireEncryption` is `true` and `handshakeFn` is missing or rejected |
| `1001` | Going away | Server shutting down gracefully (`shutdown()`) |

## Troubleshooting

### Client disconnects immediately with close code 4001

- **Symptom.** The client connects but is closed before it can interact - it did not send `{ event: 'authenticate', data: { ... } }` within `authTimeout` (default 5s).
- **Wrong message shape.** e.g. sending `{ type: 'auth' }` instead of `{ event: 'authenticate' }`.
- **Client waits for the server first.** The server sends nothing after upgrade - the client must initiate.
- **Slow token retrieval.** Pushes the auth message past the timeout window.

> [!TIP]
> Send `{ event: 'authenticate', data: { token: '...' } }` immediately in the client's `onopen` handler. If token retrieval is slow, raise `authTimeout`.

### `helper.send()` delivers locally but other instances never receive it

- **Topology mismatch.** A single-instance Redis client against a Redis Cluster deployment will not route correctly.
- **Configure ordering.** `await helper.configure()` must run to completion before you start accepting connections - subscriptions are set up asynchronously.
- **Network/ACL.** No firewall or ACL should block `SUBSCRIBE`/`PSUBSCRIBE` on the duplicated clients.

### `requireEncryption` is true but clients get disconnected with code 4004

- **`handshakeFn` missing.** The server logs `"requireEncryption is true but no handshakeFn configured"` and closes the client.
- **`handshakeFn` rejected.** It returned `null`/`false` - typically because required key-exchange data (e.g. `publicKey`) was missing from the authenticate payload.

### `[WebSocketServerHelper] Invalid redis connection!` / `[WebSocketEmitter] Invalid redis connection!`

Thrown synchronously during construction when `redisConnection` is `null`/`undefined`. Pass a valid `IRedisHelper` instance (e.g. `RedisSingleHelper`).

### `Redis client did not become ready within 30000ms`

Thrown during `configure()` when a duplicated Redis client fails to reach `'ready'` status. Check that the Redis server is reachable and the underlying `IRedisHelper` instance is configured correctly.

## See also

- [WebSocket overview](/extensions/helpers/websocket/) - getting started and the most common tasks
- [Socket.IO Helper](/extensions/helpers/socket-io/) - Socket.IO-based alternative with Node.js support
- [Redis Helper](/extensions/helpers/redis/) - `RedisSingleHelper` / `RedisClusterHelper` used for cross-instance messaging
- [WebSocket Component](/extensions/components/websocket/) - component-level lifecycle integration
