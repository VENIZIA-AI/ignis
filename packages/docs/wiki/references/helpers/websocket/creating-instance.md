# Creating an Instance

## WebSocketServerHelper

Wraps Bun's native WebSocket server with built-in post-connection authentication flow, client tracking, room management, Redis Pub/Sub for cross-instance messaging, and application-level heartbeat.

```typescript
new WebSocketServerHelper<AuthDataType, MetadataType>(opts: IWebSocketServerOptions<AuthDataType, MetadataType>)
```

### Options

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `identifier` | `string` | Yes | -- | Unique name for this WebSocket server instance |
| `path` | `string` | No | `'/ws'` | URL path for WebSocket upgrade requests |
| `server` | `IBunServer` | Yes | -- | Bun server instance (provides `publish()` for native pub/sub) |
| `redisConnection` | `DefaultRedisHelper` | Yes | -- | Redis helper for cross-instance messaging. Creates 2 duplicate connections internally |
| `defaultRooms` | `string[]` | No | `['ws-default', 'ws-notification']` | Rooms clients auto-join after authentication |
| `serverOptions` | `IBunWebSocketConfig` | No | See [Bun WebSocket Handler](./usage#bun-websocket-handler) | Bun native WebSocket configuration |
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
| `handshakeFn` | `TWebSocketHandshakeFn` | No* | -- | Key exchange callback invoked during auth when `requireEncryption` is `true`. Receives auth payload, returns `{ serverPublicKey, salt }` on success. *Required when `requireEncryption` is `true` |

### Example

```typescript
import { WebSocketServerHelper } from '@venizia/ignis-helpers';

const helper = new WebSocketServerHelper({
  identifier: 'my-ws-server',
  path: '/ws',
  server: bunServerInstance,           // Bun.Server
  redisConnection: myRedisHelper,
  authenticateFn: async (data) => {
    const { type, token } = data as { type: string; token: string; publicKey?: string };
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


## Generic Type Parameters

`WebSocketServerHelper` supports two generic type parameters for type-safe authentication payloads and client metadata:

| Parameter | Constraint | Default | Description |
|-----------|-----------|---------|-------------|
| `AuthDataType` | `extends Record<string, unknown>` | `Record<string, unknown>` | Shape of the authentication payload from clients |
| `MetadataType` | `extends Record<string, unknown>` | `Record<string, unknown>` | Shape of user metadata stored on clients |

### Typed Usage

```typescript
interface AuthPayload { type: string; token: string; publicKey?: string }
interface UserMetadata { role: string; permissions: string[] }

const helper = new WebSocketServerHelper<AuthPayload, UserMetadata>({
  identifier: 'typed-ws',
  server: bunServer,
  redisConnection: redis,
  authenticateFn: async (data) => {
    // data is typed as AuthPayload -- no casting needed
    const user = await verifyJWT(data.token);
    if (!user) return null;
    return {
      userId: user.id,
      metadata: { role: user.role, permissions: user.permissions },
      // metadata is typed as UserMetadata -- type errors if shape doesn't match
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

### Default (Untyped) Usage

When no generics are specified, all types default to `Record<string, unknown>` -- fully backward compatible:

```typescript
// These are equivalent:
const helper = new WebSocketServerHelper({ ... });
const helper = new WebSocketServerHelper<Record<string, unknown>, Record<string, unknown>>({ ... });
```

### Generic Flow

The generics flow through the entire type chain:

```
IWebSocketServerOptions<AuthDataType, MetadataType>
  -> authenticateFn: TWebSocketAuthenticateFn<AuthDataType, MetadataType>
  -> handshakeFn?: TWebSocketHandshakeFn<AuthDataType>
  -> clientConnectedFn?: TWebSocketClientConnectedFn<MetadataType>
  -> outboundTransformer?: TWebSocketOutboundTransformer<unknown, MetadataType>

WebSocketServerHelper<AuthDataType, MetadataType>
  -> getClients() returns IWebSocketClient<MetadataType>
  -> getClientsByUser() returns IWebSocketClient<MetadataType>[]
  -> getClientsByRoom() returns IWebSocketClient<MetadataType>[]
```


## WebSocketEmitter

Lightweight Redis-only publisher for sending messages to WebSocket clients from non-WebSocket processes (background workers, microservices, cron jobs). Uses `serverId: 'emitter'` so all server instances will process its messages (no dedup).

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
