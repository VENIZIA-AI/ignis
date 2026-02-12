# WebSocket -- Setup & Configuration

> Bun-native real-time, bidirectional communication using pure WebSocket -- with Redis Pub/Sub for horizontal scaling, application-level heartbeat, and post-connection authentication.

> [!IMPORTANT]
> **Bun only.** The WebSocket component will throw an error if the runtime is Node.js. For Node.js support, use the [Socket.IO Component](../socket-io/) instead.

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` (core component) + `@venizia/ignis-helpers` (helper classes) |
| **Component** | `WebSocketComponent` |
| **Server Helper** | [`WebSocketServerHelper`](/references/helpers/websocket/) |
| **Emitter Helper** | `WebSocketEmitter` (standalone Redis publisher) |
| **Runtimes** | Bun only (throws on Node.js) |
| **Scaling** | Redis Pub/Sub (ioredis -- single or Cluster) |

#### Import Paths
```typescript
// From core -- component + binding keys only
import {
  WebSocketComponent,
  WebSocketBindingKeys,
} from '@venizia/ignis';

// From helpers -- types, helpers, constants
import {
  WebSocketServerHelper,
  WebSocketEmitter,
  WebSocketDefaults,
  WebSocketEvents,
  WebSocketChannels,
  WebSocketClientStates,
  WebSocketMessageTypes,
} from '@venizia/ignis-helpers';

import type {
  IWebSocketServerOptions,
  IWebSocketEmitterOptions,
  IWebSocketClient,
  IWebSocketMessage,
  IRedisSocketMessage,
  IBunWebSocketConfig,
  TWebSocketAuthenticateFn,
  TWebSocketValidateRoomFn,
  TWebSocketClientConnectedFn,
  TWebSocketClientDisconnectedFn,
  TWebSocketMessageHandler,
  TWebSocketOutboundTransformer,
  TWebSocketHandshakeFn,
} from '@venizia/ignis-helpers';
```

> [!NOTE]
> `IServerOptions` (the core component's subset type) is **not** exported from `@venizia/ignis`. Only `WebSocketBindingKeys` and `WebSocketComponent` are exported from the core package. All helper types, constants, and classes are imported from `@venizia/ignis-helpers`.

### Use Cases

- Live notifications and alerts
- Real-time chat and messaging
- Collaborative editing (docs, whiteboards)
- Live data streams (dashboards, monitoring)
- Multiplayer game state synchronization
- IoT device communication
- Background job progress updates (via `WebSocketEmitter`)
- Cross-service event broadcasting (via `WebSocketEmitter`)

## Setup

### Step 1: Install Dependencies

```bash
# Core dependency (already included via @venizia/ignis)
# ioredis is required for Redis Pub/Sub
bun add ioredis
```

### Step 2: Bind Required Services

In your application's `preConfigure()` method, bind the required services and register the component:

#### Full Setup Example
```typescript
import {
  BaseApplication,
  WebSocketComponent,
  WebSocketBindingKeys,
} from '@venizia/ignis';
import {
  RedisHelper,
} from '@venizia/ignis-helpers';
import type {
  TWebSocketAuthenticateFn,
  TWebSocketValidateRoomFn,
  TWebSocketClientConnectedFn,
  TWebSocketClientDisconnectedFn,
  TWebSocketMessageHandler,
  TWebSocketOutboundTransformer,
  TWebSocketHandshakeFn,
  IWebSocketServerOptions,
  IBunWebSocketConfig,
  ValueOrPromise,
} from '@venizia/ignis-helpers';

export class Application extends BaseApplication {
  private redisHelper: RedisHelper;

  preConfigure(): ValueOrPromise<void> {
    this.setupWebSocket();
    // ... other setup
  }

  setupWebSocket() {
    // 1. Redis connection (required for cross-instance messaging)
    this.redisHelper = new RedisHelper({
      name: 'websocket-redis',
      host: process.env.REDIS_HOST ?? 'localhost',
      port: +(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD,
      autoConnect: false,
    });

    this.bind<RedisHelper>({
      key: WebSocketBindingKeys.REDIS_CONNECTION,
    }).toValue(this.redisHelper);

    // 2. Authentication handler (required)
    const authenticateFn: TWebSocketAuthenticateFn = async (data) => {
      const token = data.token as string;
      if (!token) return null;

      const user = await verifyJWT(token);
      if (!user) return null;

      return { userId: user.id, metadata: { role: user.role } };
    };

    this.bind<TWebSocketAuthenticateFn>({
      key: WebSocketBindingKeys.AUTHENTICATE_HANDLER,
    }).toValue(authenticateFn);

    // 3. Room validation handler (optional -- joins rejected without this)
    const validateRoomFn: TWebSocketValidateRoomFn = ({ clientId, userId, rooms }) => {
      return rooms.filter(room => room.startsWith('public-'));
    };

    this.bind<TWebSocketValidateRoomFn>({
      key: WebSocketBindingKeys.VALIDATE_ROOM_HANDLER,
    }).toValue(validateRoomFn);

    // 4. Client connected handler (optional)
    const clientConnectedFn: TWebSocketClientConnectedFn = ({ clientId, userId }) => {
      console.log('Client connected:', clientId, userId);
    };

    this.bind<TWebSocketClientConnectedFn>({
      key: WebSocketBindingKeys.CLIENT_CONNECTED_HANDLER,
    }).toValue(clientConnectedFn);

    // 5. Client disconnected handler (optional)
    const clientDisconnectedFn: TWebSocketClientDisconnectedFn = ({ clientId, userId }) => {
      console.log('Client disconnected:', clientId, userId);
    };

    this.bind<TWebSocketClientDisconnectedFn>({
      key: WebSocketBindingKeys.CLIENT_DISCONNECTED_HANDLER,
    }).toValue(clientDisconnectedFn);

    // 6. Message handler (optional -- for custom events)
    const messageHandler: TWebSocketMessageHandler = ({ clientId, userId, message }) => {
      console.log('Custom event:', message.event, message.data);
    };

    this.bind<TWebSocketMessageHandler>({
      key: WebSocketBindingKeys.MESSAGE_HANDLER,
    }).toValue(messageHandler);

    // 7. Outbound transformer (optional -- for per-client encryption)
    const outboundTransformer: TWebSocketOutboundTransformer = async ({ client, event, data }) => {
      if (!client.encrypted) return null;
      // Encrypt using client's derived AES key (from ECDH handshake)
      const encrypted = await encryptForClient(client.id, JSON.stringify({ event, data }));
      return { event: 'encrypted', data: encrypted };
    };

    this.bind<TWebSocketOutboundTransformer>({
      key: WebSocketBindingKeys.OUTBOUND_TRANSFORMER,
    }).toValue(outboundTransformer);

    // 8. Handshake handler (optional -- required when requireEncryption is true)
    const handshakeFn: TWebSocketHandshakeFn = async ({ clientId, data }) => {
      const clientPubKey = data.publicKey as string;
      if (!clientPubKey) return null; // Reject -- no public key provided
      const salt = crypto.getRandomValues(new Uint8Array(32));
      const saltB64 = Buffer.from(salt).toString('base64');
      const aesKey = await deriveSharedSecret(clientPubKey, salt);
      storeClientKey(clientId, aesKey);
      return { serverPublicKey: serverPublicKeyB64, salt: saltB64 };
    };

    this.bind<TWebSocketHandshakeFn>({
      key: WebSocketBindingKeys.HANDSHAKE_HANDLER,
    }).toValue(handshakeFn);

    // 9. Server options (optional -- customize defaults)
    this.bind<Partial<IWebSocketServerOptions>>({
      key: WebSocketBindingKeys.SERVER_OPTIONS,
    }).toValue({
      identifier: 'my-app-websocket',
      requireEncryption: true,
    });

    // 10. Register the component
    this.component(WebSocketComponent);
  }
}
```

## Configuration

The core component's `IServerOptions` interface controls the WebSocket server setup. Default values come from `DEFAULT_SERVER_OPTIONS` and `WebSocketDefaults`:

```typescript
{
  identifier: 'WEBSOCKET_SERVER',
  path: '/ws',                         // WebSocketDefaults.PATH
  defaultRooms: [                      // Joined automatically after auth
    'ws-default',                      // WebSocketDefaults.ROOM
    'ws-notification',                 // WebSocketDefaults.NOTIFICATION_ROOM
  ],
  heartbeatInterval: 30000,            // 30 seconds (WebSocketDefaults.HEARTBEAT_INTERVAL)
  heartbeatTimeout: 90000,             // 90 seconds (WebSocketDefaults.HEARTBEAT_TIMEOUT)
  requireEncryption: false,
  serverOptions: {                     // Bun native WebSocket config (IBunWebSocketConfig)
    sendPings: true,                   // WebSocketDefaults.SEND_PINGS
    idleTimeout: 60,                   // WebSocketDefaults.IDLE_TIMEOUT (seconds)
    maxPayloadLength: 131072,          // WebSocketDefaults.MAX_PAYLOAD_LENGTH (128 KB)
  },
}
```

To customize options, bind a partial options object before registering the component:

#### Custom Server Options Example
```typescript
import { WebSocketBindingKeys } from '@venizia/ignis';

this.bind({
  key: WebSocketBindingKeys.SERVER_OPTIONS,
}).toValue({
  identifier: 'my-app-websocket',
  path: '/realtime',
  defaultRooms: ['general', 'announcements'],  // Override default rooms
  heartbeatInterval: 20000,                     // More frequent heartbeats
  heartbeatTimeout: 60000,                      // Shorter timeout
  requireEncryption: true,                      // Require ECDH handshake
  serverOptions: {
    maxPayloadLength: 2097152,                  // 2 MB max payload
    backpressureLimit: 2097152,                 // 2 MB backpressure limit
  },
});
```

> [!NOTE]
> `authTimeout` and `encryptedBatchLimit` are properties of the helper's `IWebSocketServerOptions`, not the core component's `IServerOptions`. The component uses the helper defaults for those (`5000` ms and `10` respectively). If you need to customize them, you must set them on the helper directly (not via binding keys).

### `WebSocketDefaults` Constants

All tunable defaults are defined in the `WebSocketDefaults` class. The helper falls back to these when no explicit value is provided.

| Constant | Value | Description |
|----------|-------|-------------|
| `PATH` | `'/ws'` | Default WebSocket endpoint path |
| `ROOM` | `'ws-default'` | Default room name |
| `NOTIFICATION_ROOM` | `'ws-notification'` | Default notification room name |
| `BROADCAST_TOPIC` | `'ws:internal:broadcast'` | Internal Bun pub/sub broadcast topic |
| `MAX_PAYLOAD_LENGTH` | `131072` (128 KB) | Maximum message payload size |
| `IDLE_TIMEOUT` | `60` | Bun idle timeout in seconds |
| `BACKPRESSURE_LIMIT` | `1048576` (1 MB) | Bun backpressure limit |
| `SEND_PINGS` | `true` | Enable WebSocket pings |
| `PUBLISH_TO_SELF` | `false` | Whether server receives its own publishes |
| `AUTH_TIMEOUT` | `5000` (5 s) | Time to authenticate before disconnect |
| `HEARTBEAT_INTERVAL` | `30000` (30 s) | Interval between heartbeat sweeps |
| `HEARTBEAT_TIMEOUT` | `90000` (90 s) | Disconnect after 3 missed heartbeats |
| `ENCRYPTED_BATCH_LIMIT` | `10` | Max concurrent encryption operations |

> [!TIP]
> `MAX_PAYLOAD_LENGTH`, `IDLE_TIMEOUT`, `BACKPRESSURE_LIMIT`, `SEND_PINGS`, and `PUBLISH_TO_SELF` are Bun-native WebSocket settings passed via `serverOptions` inside `IServerOptions`. The rest are application-level settings on `IWebSocketServerOptions` (the helper constructor options).

#### Full `IBunWebSocketConfig` Interface
```typescript
/** Bun WebSocket native configuration options */
interface IBunWebSocketConfig {
  perMessageDeflate?: boolean;
  maxPayloadLength?: number;          // Default: 128 KB (131072)
  idleTimeout?: number;               // Default: 60 s
  backpressureLimit?: number;         // Default: 1 MB (1048576)
  closeOnBackpressureLimit?: boolean;
  sendPings?: boolean;                // Default: true
  publishToSelf?: boolean;            // Default: false
}
```

These options are passed directly to Bun's native WebSocket handler. Set them via `serverOptions` inside the options bound to `WebSocketBindingKeys.SERVER_OPTIONS`.

#### Full `IServerOptions` Interface (Core Component)
```typescript
interface IServerOptions {
  identifier: string;                  // Default: 'WEBSOCKET_SERVER'
  path?: string;                       // Default: '/ws' (from WebSocketDefaults.PATH)
  defaultRooms?: string[];             // Default: ['ws-default', 'ws-notification']
  serverOptions?: IBunWebSocketConfig; // Bun native WebSocket config
  heartbeatInterval?: number;          // Default: 30000 (30 s)
  heartbeatTimeout?: number;           // Default: 90000 (90 s)
  requireEncryption?: boolean;         // Default: false
}
```

> [!NOTE]
> `IServerOptions` is the **core component's** options type. It is a subset of the helper's `IWebSocketServerOptions`, which additionally includes `server`, `redisConnection`, callback functions, `authTimeout`, and `encryptedBatchLimit`. The component fills in those extra fields from the DI container before constructing the helper.

## Binding Keys

| Binding Key | Constant | Type | Required | Default |
|------------|----------|------|----------|---------|
| `@app/websocket/server-options` | `WebSocketBindingKeys.SERVER_OPTIONS` | `Partial<IServerOptions>` | No | See [Configuration](#configuration) |
| `@app/websocket/redis-connection` | `WebSocketBindingKeys.REDIS_CONNECTION` | `DefaultRedisHelper` | **Yes** | `null` |
| `@app/websocket/authenticate-handler` | `WebSocketBindingKeys.AUTHENTICATE_HANDLER` | `TWebSocketAuthenticateFn` | **Yes** | `null` |
| `@app/websocket/validate-room-handler` | `WebSocketBindingKeys.VALIDATE_ROOM_HANDLER` | `TWebSocketValidateRoomFn` | No | `null` |
| `@app/websocket/client-connected-handler` | `WebSocketBindingKeys.CLIENT_CONNECTED_HANDLER` | `TWebSocketClientConnectedFn` | No | `null` |
| `@app/websocket/client-disconnected-handler` | `WebSocketBindingKeys.CLIENT_DISCONNECTED_HANDLER` | `TWebSocketClientDisconnectedFn` | No | `null` |
| `@app/websocket/message-handler` | `WebSocketBindingKeys.MESSAGE_HANDLER` | `TWebSocketMessageHandler` | No | `null` |
| `@app/websocket/outbound-transformer` | `WebSocketBindingKeys.OUTBOUND_TRANSFORMER` | `TWebSocketOutboundTransformer` | No | `null` |
| `@app/websocket/handshake-handler` | `WebSocketBindingKeys.HANDSHAKE_HANDLER` | `TWebSocketHandshakeFn` | No* | `null` |
| `@app/websocket/instance` | `WebSocketBindingKeys.WEBSOCKET_INSTANCE` | `WebSocketServerHelper` | -- | *Set by component* |

> [!NOTE]
> `HANDSHAKE_HANDLER` is required when `IServerOptions.requireEncryption` is `true`. It performs ECDH key exchange during authentication.

> [!NOTE]
> `WEBSOCKET_INSTANCE` is **not** set by you -- the component creates and binds it automatically after the server starts. Inject it in services/controllers to interact with WebSocket.

### Callback Type Signatures

| Binding Key | Callback Type | Required | Description |
|-------------|--------------|----------|-------------|
| `AUTHENTICATE_HANDLER` | `TWebSocketAuthenticateFn` | **Yes** | Returns <code v-pre>{ userId, metadata }</code> or `null`/`false` to reject |
| `VALIDATE_ROOM_HANDLER` | `TWebSocketValidateRoomFn` | No | Filters requested rooms, returns allowed rooms |
| `CLIENT_CONNECTED_HANDLER` | `TWebSocketClientConnectedFn` | No | Called after successful authentication |
| `CLIENT_DISCONNECTED_HANDLER` | `TWebSocketClientDisconnectedFn` | No | Called on disconnect (after cleanup) |
| `MESSAGE_HANDLER` | `TWebSocketMessageHandler` | No | Handles non-system messages from authenticated clients |
| `OUTBOUND_TRANSFORMER` | `TWebSocketOutboundTransformer` | No | Transforms outbound messages (e.g., per-client encryption) |
| `HANDSHAKE_HANDLER` | `TWebSocketHandshakeFn` | When `requireEncryption: true` | Returns <code v-pre>{ serverPublicKey, salt }</code> or `null`/`false` to reject |

#### `TWebSocketAuthenticateFn`
```typescript
type TWebSocketAuthenticateFn<
  AuthDataType extends Record<string, unknown> = Record<string, unknown>,
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> = (
  opts: AuthDataType,
) => ValueOrPromise<{ userId?: string; metadata?: MetadataType } | null | false>;
```

Receives the `data` field from the client's `authenticate` event. Return <code v-pre>{ userId, metadata }</code> on success, or `null`/`false` to reject (closes with code `4003`).

#### `TWebSocketValidateRoomFn`
```typescript
type TWebSocketValidateRoomFn = (opts: {
  clientId: string;
  userId?: string;
  rooms: string[];
}) => ValueOrPromise<string[]>;
```

Called when a client sends a `join` event. Receives the sanitized room list (internal `ws:` prefix rooms are already filtered out). Return the subset of rooms the client is allowed to join.

> [!WARNING]
> If no `validateRoomFn` is bound, **all join requests are rejected**. You must bind this handler if you want clients to join custom rooms.

#### `TWebSocketClientConnectedFn`
```typescript
type TWebSocketClientConnectedFn<
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> = (opts: {
  clientId: string;
  userId?: string;
  metadata?: MetadataType;
}) => ValueOrPromise<void>;
```

Called after a client has been fully authenticated, joined default rooms, and received the `connected` event. Errors thrown here are caught and logged -- they do not disconnect the client.

#### `TWebSocketClientDisconnectedFn`
```typescript
type TWebSocketClientDisconnectedFn = (opts: {
  clientId: string;
  userId?: string;
}) => ValueOrPromise<void>;
```

Called after internal cleanup (auth timer cleared, removed from user/room indexes, removed from clients map). Errors thrown here are caught and logged.

#### `TWebSocketMessageHandler`
```typescript
type TWebSocketMessageHandler = (opts: {
  clientId: string;
  userId?: string;
  message: IWebSocketMessage;
}) => ValueOrPromise<void>;
```

Called for any message from an authenticated client whose `event` is not a system event (`authenticate`, `connected`, `disconnect`, `join`, `leave`, `error`, `heartbeat`, `encrypted`). If no handler is bound, non-system messages are silently dropped.

#### `TWebSocketOutboundTransformer`
```typescript
type TWebSocketOutboundTransformer<
  DataType = unknown,
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> = (opts: {
  client: IWebSocketClient<MetadataType>;
  event: string;
  data: DataType;
}) => ValueOrPromise<TNullable<{ event: string; data: DataType }>>;
```

Intercepts every outbound message **to encrypted clients only** before `socket.send()`. Return `null` to send the original <code v-pre>{ event, data }</code> unchanged, or return a transformed <code v-pre>{ event, data }</code> (e.g., <code v-pre>{ event: 'encrypted', data: ciphertext }</code>).

> [!NOTE]
> The transformer is only called for clients where `client.encrypted === true`. Non-encrypted clients bypass this entirely (zero overhead).

#### `TWebSocketHandshakeFn`
```typescript
type TWebSocketHandshakeFn<
  AuthDataType extends Record<string, unknown> = Record<string, unknown>,
> = (opts: {
  clientId: string;
  userId?: string;
  data: AuthDataType;
}) => ValueOrPromise<{ serverPublicKey: string; salt: string } | null | false>;
```

Called during authentication when `requireEncryption` is `true`. Receives the same `data` payload as `authenticateFn`. Return <code v-pre>{ serverPublicKey, salt }</code> on success -- these are included in the `connected` event sent to the client. Return `null`/`false` to reject (closes with code `4004`).

## See Also

- [Usage & Examples](./usage) - Server-side usage, emitter, wire protocol, client tracking, and delivery strategy
- [API Reference](./api) - Architecture, WebSocketEmitter API, and internals
- [Error Reference](./errors) - Error conditions table and troubleshooting
- [WebSocketServerHelper](/references/helpers/websocket/) - Helper API documentation
- [Socket.IO Component](../socket-io/) - Node.js-compatible alternative with Socket.IO
- [Bun WebSocket Documentation](https://bun.sh/docs/api/websockets) - Official Bun WebSocket API reference
