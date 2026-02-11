# Quick Reference

| Helper | Package | Purpose |
|--------|---------|---------|
| [`WebSocketServerHelper`](./creating-instance#websocketserverhelper) | `@venizia/ignis-helpers` | Bun-native WebSocket server with auth, rooms, Redis scaling |
| [`WebSocketEmitter`](./creating-instance#websocketemitter) | `@venizia/ignis-helpers` | Publish messages to WebSocket clients from any process via Redis |

::: details Import Paths

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
:::


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


::: details Type Definitions

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
interface IWebSocketClient<MetadataType extends Record<string, unknown> = Record<string, unknown>> {
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
}
```

### `IWebSocketData<MetadataType>`

Data attached during `server.upgrade()`:

```typescript
interface IWebSocketData<MetadataType extends Record<string, unknown> = Record<string, unknown>> {
  clientId: string;
  userId?: string;
  metadata?: MetadataType;
}
```

### `IWebSocketServerOptions<AuthDataType, MetadataType>`

```typescript
interface IWebSocketServerOptions<
  AuthDataType extends Record<string, unknown> = Record<string, unknown>,
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> {
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

  authenticateFn: TWebSocketAuthenticateFn<AuthDataType, MetadataType>;
  validateRoomFn?: TWebSocketValidateRoomFn;
  clientConnectedFn?: TWebSocketClientConnectedFn<MetadataType>;
  clientDisconnectedFn?: TWebSocketClientDisconnectedFn;
  messageHandler?: TWebSocketMessageHandler;
  outboundTransformer?: TWebSocketOutboundTransformer<unknown, MetadataType>;
  handshakeFn?: TWebSocketHandshakeFn<AuthDataType>;   // Required when requireEncryption is true
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
// Authentication -- return { userId, metadata } on success, null/false to reject
type TWebSocketAuthenticateFn<
  AuthDataType extends Record<string, unknown> = Record<string, unknown>,
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> = (
  opts: AuthDataType,
) => ValueOrPromise<{ userId?: string; metadata?: MetadataType } | null | false>;

// Handshake -- ECDH key exchange during authentication
// Return { serverPublicKey } on success, null/false to reject
type TWebSocketHandshakeFn<
  AuthDataType extends Record<string, unknown> = Record<string, unknown>,
> = (opts: {
  clientId: string;
  userId?: string;
  data: AuthDataType;
}) => ValueOrPromise<{ serverPublicKey: string } | null | false>;

// Room validation -- return allowed subset of requested rooms
type TWebSocketValidateRoomFn = (opts: {
  clientId: string;
  userId?: string;
  rooms: string[];
}) => ValueOrPromise<string[]>;

// Post-authentication callback
type TWebSocketClientConnectedFn<
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> = (opts: {
  clientId: string;
  userId?: string;
  metadata?: MetadataType;
}) => ValueOrPromise<void>;

// Disconnect callback
type TWebSocketClientDisconnectedFn = (opts: {
  clientId: string;
  userId?: string;
}) => ValueOrPromise<void>;

// Custom event handler -- called for non-system events from authenticated clients
type TWebSocketMessageHandler = (opts: {
  clientId: string;
  userId?: string;
  message: IWebSocketMessage;
}) => ValueOrPromise<void>;

// Outbound transformer -- intercepts messages before socket.send()
// Return transformed { event, data } or null to use original payload
type TWebSocketOutboundTransformer<
  DataType = unknown,
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> = (opts: {
  client: IWebSocketClient<MetadataType>;
  event: string;
  data: DataType;
}) => ValueOrPromise<TNullable<{ event: string; data: DataType }>>;
```
:::
