# WebSocket -- API Reference

> Architecture, method signatures, internals, and type definitions.

## Architecture

The WebSocket helper provides two classes: `WebSocketServerHelper` for managing a Bun-native WebSocket server with Redis Pub/Sub, and `WebSocketEmitter` for publishing messages from external processes.

#### Architecture Diagram

```
                     WebSocketServerHelper
                    +---------------------------------------------------+
                    |                                                   |
                    |  constructor(opts)                                |
                    |    |-- identifier, path, serverId (UUID)         |
                    |    |-- Store callbacks (auth, rooms, messages)   |
                    |    |-- Apply defaults (rooms, timeouts)          |
                    |    +-- initRedisClients(redisConnection)         |
                    |          +-- redisPub = client.duplicate()       |
                    |          +-- redisSub = client.duplicate()       |
                    |                                                   |
                    |  configure()  [async]                             |
                    |    |-- Connect Redis clients (if lazyConnect)    |
                    |    |-- await Redis ready (pub + sub)             |
                    |    |-- setupRedisSubscriptions()                 |
                    |    |     |-- subscribe(ws:broadcast)             |
                    |    |     |-- psubscribe(ws:room:*)               |
                    |    |     |-- psubscribe(ws:client:*)             |
                    |    |     +-- psubscribe(ws:user:*)               |
                    |    +-- startHeartbeatTimer()                     |
                    |                                                   |
                    |  getBunWebSocketHandler()                         |
                    |    +-- Returns { open, message, close, drain,    |
                    |         ...serverOptions }                       |
                    |                                                   |
                    +---------------------------------------------------+

                     WebSocketEmitter
                    +---------------------------------------------------+
                    |  constructor(opts)                                |
                    |    +-- redisPub = client.duplicate()              |
                    |                                                   |
                    |  configure()  [async]                             |
                    |    +-- await Redis ready                          |
                    |                                                   |
                    |  toClient / toUser / toRoom / broadcast           |
                    |    +-- publish(channel, IRedisSocketMessage)      |
                    +---------------------------------------------------+
```

#### Client Connection Lifecycle

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
  |                 |     +-- Join default rooms + clientId room
  |                 |     +-- Send 'connected' event
  |                 |     +-- Call clientConnectedFn()
  |                 +-- Failure:
  |                       +-- Send 'error' event
  |                       +-- Close with code 4003
  |
  +-- Auth timeout expires (if still UNAUTHORIZED)
  |     +-- Close with code 4001
  |
  +-- Heartbeat sweep (every heartbeatInterval)
  |     +-- If now - lastActivity > heartbeatTimeout
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

#### Redis 2-Client Architecture

```
RedisHelper (parent -- NOT consumed)
  |
  +-- client.duplicate() --> redisPub    (publishes cross-instance messages)
  |
  +-- client.duplicate() --> redisSub    (subscribes to cross-instance messages)
```

Both single-instance `Redis` and `Cluster` connections from ioredis are supported. The parent `RedisHelper` connection remains independent.

## Server API

### `WebSocketServerHelper` Constructor

```typescript
constructor(opts: IWebSocketServerOptions<AuthDataType, MetadataType>)
```

Creates the server helper, generates a unique `serverId` (UUID), stores all options with defaults, and initializes two Redis client duplicates. Throws if `redisConnection` is falsy.

### `configure()`

```typescript
configure(): Promise<void>
```

Initializes Redis connections, sets up pub/sub subscriptions, and starts the heartbeat timer. Must be called after construction and before accepting connections.

#### Internal Flow

1. Register error handlers on `redisPub` and `redisSub`
2. Connect duplicated clients if status is `'wait'` (lazyConnect mode)
3. `await Promise.all([waitForRedisReady(pub), waitForRedisReady(sub)])`
4. Set up Redis subscriptions (direct + pattern subscribe)
5. Start heartbeat timer via `setInterval(heartbeatAll, heartbeatInterval)`

### `getBunWebSocketHandler()`

```typescript
getBunWebSocketHandler(): IBunWebSocketHandler
```

Returns the Bun WebSocket handler object containing lifecycle callbacks and native configuration. Pass this to `server.reload({ websocket })`.

#### Lifecycle Callbacks

| Callback | When | Behavior |
|----------|------|----------|
| `open` | WebSocket connection established | Extracts `clientId` from `socket.data`, calls `onClientConnect()` |
| `message` | Message received | Updates `lastActivity`, calls `onClientMessage()` for routing |
| `close` | Connection closed | Calls `onClientDisconnect()` for cleanup |
| `drain` | Backpressure cleared | Sets `client.backpressured = false` |

#### Bun Native Configuration

These values are spread from `serverOptions` into the returned handler:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `perMessageDeflate` | `boolean` | `undefined` | Enable per-message compression |
| `maxPayloadLength` | `number` | `131072` (128KB) | Maximum incoming message size in bytes |
| `idleTimeout` | `number` | `60` (seconds) | Bun-level idle timeout (transport layer) |
| `backpressureLimit` | `number` | `1048576` (1MB) | Backpressure threshold in bytes |
| `closeOnBackpressureLimit` | `boolean` | `undefined` | Close socket when backpressure limit is exceeded |
| `sendPings` | `boolean` | `true` | Enable Bun transport-level pings |
| `publishToSelf` | `boolean` | `false` | Whether `server.publish()` delivers to the publishing socket |

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

When called without arguments or with an empty opts, returns the full `Map<string, IWebSocketClient>`. When called with `{ id }`, returns the specific client entry or `undefined`.

### `getClientsByUser()`

```typescript
getClientsByUser(opts: { userId: string }): IWebSocketClient<MetadataType>[]
```

Returns all clients belonging to the given user ID. Returns an empty array if the user has no active connections.

### `getClientsByRoom()`

```typescript
getClientsByRoom(opts: { room: string }): IWebSocketClient<MetadataType>[]
```

Returns all clients in the given room. Returns an empty array if the room does not exist or is empty.

### `onClientConnect()`

```typescript
onClientConnect(opts: { clientId: string; socket: IWebSocket }): void
```

Handles a new WebSocket connection. Creates an `IWebSocketClient` entry with state `UNAUTHORIZED`, subscribes the socket to its own `clientId` topic (Bun native pub/sub), and starts the authentication timeout. Returns early if the client ID already exists.

### `onClientMessage()`

```typescript
onClientMessage(opts: { clientId: string; raw: string }): void
```

Routes incoming messages. Parses JSON, then:

- `heartbeat` events: silently consumed (updates `lastActivity` via the `message` callback)
- `authenticate` events: delegates to `handleAuthenticate()`
- Unauthenticated clients sending non-auth events: receives an `error` event (`'Not authenticated'`)
- `join` / `leave` events: delegates to room handlers
- All other events: delegates to `messageHandler` (if configured)

Sends an `error` event (`'Invalid message format'`) if JSON parsing fails.

### `onClientDisconnect()`

```typescript
onClientDisconnect(opts: { clientId: string }): void
```

Cleans up a disconnected client:

1. Clears auth timeout if pending
2. Removes from user index
3. Removes from all rooms
4. Removes from clients map
5. Invokes `clientDisconnectedFn` callback

### `joinRoom()`

```typescript
joinRoom(opts: { clientId: string; room: string }): void
```

Programmatically joins a client to a room. Adds to the room index, adds to the client's room set, and subscribes the socket to the room's Bun native pub/sub topic (unless the client has encryption enabled).

### `leaveRoom()`

```typescript
leaveRoom(opts: { clientId: string; room: string }): void
```

Removes a client from a room. Removes from the room index, removes from the client's room set, and unsubscribes the socket from the Bun native pub/sub topic.

### `enableClientEncryption()`

```typescript
enableClientEncryption(opts: { clientId: string }): void
```

Enables encryption for a client. Unsubscribes the client from all Bun native pub/sub topics (broadcast topic + all rooms) so `server.publish()` will not reach them. Messages are instead delivered individually through the `outboundTransformer`. No-op if the client is already encrypted or does not exist.

> [!WARNING]
> This is **irreversible** for the lifetime of the connection. Once encrypted, the client cannot be switched back to Bun native pub/sub delivery.

### `sendToClient()`

```typescript
sendToClient(opts: {
  clientId: string;
  event: string;
  data: unknown;
  doLog?: boolean;
}): void
```

Sends a message to a specific client (local delivery only). If the client has encryption enabled and an `outboundTransformer` is configured, the transformer runs before delivery. Otherwise, sends the raw `{ event, data }` JSON.

### `sendToUser()`

```typescript
sendToUser(opts: {
  userId: string;
  event: string;
  data: unknown;
}): void
```

Sends a message to all local clients belonging to a user. Iterates the user's client set and calls `sendToClient()` for each.

### `sendToRoom()`

```typescript
sendToRoom(opts: {
  room: string;
  event: string;
  data: unknown;
  exclude?: string[];
}): void
```

Sends a message to all clients in a room (local delivery only).

#### Delivery Strategy

| Condition | Strategy |
|-----------|----------|
| No `outboundTransformer`, no `exclude` | Bun native `server.publish()` -- O(1) C++ fan-out |
| `outboundTransformer` set, no `exclude` | Iterates all room clients via `executePromiseWithLimit` (max `encryptedBatchLimit` concurrent) |
| `exclude` provided | Always iterates clients individually (cannot exclude from Bun pub/sub) |

### `broadcast()`

```typescript
broadcast(opts: {
  event: string;
  data: unknown;
  exclude?: string[];
}): void
```

Sends a message to all authenticated clients on this instance (local delivery only). Delivery strategy follows the same pattern as `sendToRoom()`:

| Condition | Strategy |
|-----------|----------|
| No `outboundTransformer`, no `exclude` | Bun native `server.publish()` via broadcast topic |
| `outboundTransformer` set, no `exclude` | Iterates all authenticated clients with concurrency limit |
| `exclude` provided | Always iterates clients individually |

### `send()`

```typescript
send<T = unknown>(opts: {
  destination?: string;
  payload: { topic: string; data: T };
  doLog?: boolean;
  cb?: () => void;
}): void
```

Public API for cross-instance messaging. Delivers locally **and** publishes to Redis so other server instances receive the message.

Routing logic:

| `destination` | Local delivery | Redis channel |
|---------------|----------------|---------------|
| Omitted | `broadcast()` | `ws:broadcast` |
| Matches a local client ID | `sendToClient()` | `ws:client:{clientId}` |
| Matches a local room name | `sendToRoom()` | `ws:room:{room}` |
| Neither (remote target) | None | `ws:room:{destination}` |

Silent no-op when `payload` is falsy, `payload.topic` is falsy, or `payload.data` is `undefined`.

If `cb` is provided, it is executed asynchronously via `setTimeout(cb, 0)`.

### `shutdown()`

```typescript
shutdown(): Promise<void>
```

Graceful shutdown:

1. Clear heartbeat timer
2. Close all client sockets with code `1001` (`'Server shutting down'`)
3. Trigger disconnect callbacks for all tracked clients
4. Clear `clients`, `users`, and `rooms` maps
5. `await Promise.all([redisPub.quit(), redisSub.quit()])`

## Emitter API

### `WebSocketEmitter` Constructor

```typescript
constructor(opts: IWebSocketEmitterOptions)
```

Creates the emitter, duplicates one Redis client from `redisConnection`. Throws if `redisConnection` is falsy.

### `configure()`

```typescript
configure(): Promise<void>
```

Connects the Redis client (if in `'wait'` status) and waits for it to reach `ready` status. Must be called before emitting.

### `toClient()`

```typescript
toClient(opts: {
  clientId: string;
  event: string;
  data: unknown;
}): Promise<void>
```

Publishes a message to the `ws:client:{clientId}` Redis channel. All server instances subscribed via `psubscribe('ws:client:*')` will deliver it to the target client if connected locally.

### `toUser()`

```typescript
toUser(opts: {
  userId: string;
  event: string;
  data: unknown;
}): Promise<void>
```

Publishes a message to the `ws:user:{userId}` Redis channel. All server instances deliver it to every session belonging to that user.

### `toRoom()`

```typescript
toRoom(opts: {
  room: string;
  event: string;
  data: unknown;
  exclude?: string[];
}): Promise<void>
```

Publishes a message to the `ws:room:{room}` Redis channel. All server instances deliver it to every client in that room.

### `broadcast()`

```typescript
broadcast(opts: {
  event: string;
  data: unknown;
}): Promise<void>
```

Publishes a message to the `ws:broadcast` Redis channel. All server instances deliver it to every authenticated client.

### `shutdown()`

```typescript
shutdown(): Promise<void>
```

Quits the Redis connection.

## Types Reference

### Wire Protocol

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
  type: TWebSocketMessageType;    // 'client' | 'user' | 'room' | 'broadcast'
  target?: string;
  event: string;
  data: DataType;
  exclude?: string[];
}
```

### Client Tracking

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

### Bun Interfaces

```typescript
/** Bun WebSocket handle (defined locally to avoid @types/bun dependency) */
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

### Server Options

```typescript
interface IWebSocketServerOptions<
  AuthDataType extends Record<string, unknown> = Record<string, unknown>,
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> {
  identifier: string;
  path?: string;                    // Default: '/ws'
  redisConnection: DefaultRedisHelper;
  server: IBunServer;
  defaultRooms?: string[];          // Default: ['ws-default', 'ws-notification']
  serverOptions?: IBunWebSocketConfig;
  authTimeout?: number;             // Default: 5000
  heartbeatInterval?: number;       // Default: 30000
  heartbeatTimeout?: number;        // Default: 90000
  encryptedBatchLimit?: number;     // Default: 10
  requireEncryption?: boolean;      // Default: false

  authenticateFn: TWebSocketAuthenticateFn<AuthDataType, MetadataType>;
  validateRoomFn?: TWebSocketValidateRoomFn;
  clientConnectedFn?: TWebSocketClientConnectedFn<MetadataType>;
  clientDisconnectedFn?: TWebSocketClientDisconnectedFn;
  messageHandler?: TWebSocketMessageHandler;
  outboundTransformer?: TWebSocketOutboundTransformer<unknown, MetadataType>;
  handshakeFn?: TWebSocketHandshakeFn<AuthDataType>;
}

interface IWebSocketEmitterOptions {
  identifier?: string;              // Default: 'WebSocketEmitter'
  redisConnection: DefaultRedisHelper;
}
```

### Callback Types

```typescript
/** Authentication -- return { userId, metadata } on success, null/false to reject */
type TWebSocketAuthenticateFn<
  AuthDataType extends Record<string, unknown> = Record<string, unknown>,
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> = (
  opts: AuthDataType,
) => ValueOrPromise<{ userId?: string; metadata?: MetadataType } | null | false>;

/** ECDH key exchange during auth -- return { serverPublicKey, salt } or null/false */
type TWebSocketHandshakeFn<
  AuthDataType extends Record<string, unknown> = Record<string, unknown>,
> = (opts: {
  clientId: string;
  userId?: string;
  data: AuthDataType;
}) => ValueOrPromise<{ serverPublicKey: string; salt: string } | null | false>;

/** Room validation -- return the allowed subset of requested rooms */
type TWebSocketValidateRoomFn = (opts: {
  clientId: string;
  userId?: string;
  rooms: string[];
}) => ValueOrPromise<string[]>;

/** Post-authentication callback */
type TWebSocketClientConnectedFn<
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> = (opts: {
  clientId: string;
  userId?: string;
  metadata?: MetadataType;
}) => ValueOrPromise<void>;

/** Disconnect callback */
type TWebSocketClientDisconnectedFn = (opts: {
  clientId: string;
  userId?: string;
}) => ValueOrPromise<void>;

/** Custom event handler for non-system events from authenticated clients */
type TWebSocketMessageHandler = (opts: {
  clientId: string;
  userId?: string;
  message: IWebSocketMessage;
}) => ValueOrPromise<void>;

/** Outbound transformer -- intercepts messages before socket.send() */
type TWebSocketOutboundTransformer<
  DataType = unknown,
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> = (opts: {
  client: IWebSocketClient<MetadataType>;
  event: string;
  data: DataType;
}) => ValueOrPromise<TNullable<{ event: string; data: DataType }>>;
```

### State Types

```typescript
type TWebSocketClientState = 'unauthorized' | 'authenticating' | 'authenticated' | 'disconnected';
type TWebSocketEvent = 'authenticate' | 'connected' | 'disconnect' | 'join' | 'leave' | 'error' | 'heartbeat' | 'encrypted';
type TWebSocketMessageType = 'client' | 'user' | 'room' | 'broadcast';
```

## Constants

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

Utility methods:

```typescript
WebSocketEvents.isValid('authenticate'); // true
WebSocketEvents.isValid('invalid');      // false
WebSocketEvents.SCHEME_SET;             // Set of all valid event strings
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
| `SEND_PINGS` | `true` | Bun transport pings enabled |
| `PUBLISH_TO_SELF` | `false` | Bun pub/sub self-delivery disabled |
| `AUTH_TIMEOUT` | `5000` (5s) | Authentication timeout |
| `HEARTBEAT_INTERVAL` | `30000` (30s) | Heartbeat sweep interval |
| `HEARTBEAT_TIMEOUT` | `90000` (90s) | Heartbeat inactivity threshold |
| `ENCRYPTED_BATCH_LIMIT` | `10` | Max concurrent encryption operations |

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
WebSocketClientStates.SCHEME_SET;               // Set of all valid state strings
```

## See Also

- [Setup & Usage](./) -- Getting started, examples, and troubleshooting
- [Socket.IO Helper](../socket-io/) -- Socket.IO-based alternative with Node.js support
