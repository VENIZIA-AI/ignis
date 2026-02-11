# WebSocket Component

Bun-native real-time, bidirectional communication using pure WebSocket -- with Redis Pub/Sub for horizontal scaling, application-level heartbeat, and post-connection authentication.

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` (core) |
| **Class** | `WebSocketComponent` |
| **Helper** | [`WebSocketServerHelper`](/references/helpers/websocket) |
| **Runtimes** | Bun only (throws on Node.js) |
| **Scaling** | Redis Pub/Sub (ioredis) |

### Binding Keys

| Binding Key | Constant | Type | Required | Default |
|------------|----------|------|----------|---------|
| `@app/websocket/server-options` | `WebSocketBindingKeys.SERVER_OPTIONS` | `Partial<IServerOptions>` | No | See [Default Options](#default-server-options) |
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

### Use Cases

- Live notifications and alerts
- Real-time chat and messaging
- Collaborative editing (docs, whiteboards)
- Live data streams (dashboards, monitoring)
- Multiplayer game state synchronization
- IoT device communication

---

## Architecture Overview

```
                         WebSocketComponent
                        +----------------------------------------------+
                        |                                              |
                        |  binding()                                   |
                        |    |-- RuntimeModules.detect()               |
                        |    |     +-- NODE -> throw error             |
                        |    |     +-- BUN  -> continue                |
                        |    |                                         |
                        |    |-- resolveBindings()                     |
                        |    |     |-- SERVER_OPTIONS                  |
                        |    |     |-- REDIS_CONNECTION                |
                        |    |     |-- AUTHENTICATE_HANDLER            |
                        |    |     |-- VALIDATE_ROOM_HANDLER           |
                        |    |     |-- CLIENT_CONNECTED_HANDLER        |
                        |    |     |-- CLIENT_DISCONNECTED_HANDLER     |
                        |    |     |-- MESSAGE_HANDLER                 |
                        |    |     |-- OUTBOUND_TRANSFORMER            |
                        |    |     +-- HANDSHAKE_HANDLER               |
                        |    |                                         |
                        |    +-- registerBunHook(resolved)             |
                        |                                              |
                        |  (Post-start hook executes after server)     |
                        |    |-- Creates WebSocketServerHelper         |
                        |    |-- await wsHelper.configure()            |
                        |    |-- Binds to WEBSOCKET_INSTANCE           |
                        |    |-- Creates fetch handler (WS + Hono)     |
                        |    +-- server.reload({ fetch, websocket })   |
                        +----------------------------------------------+
```

### Lifecycle Integration

The component uses the **post-start hook** system to solve a fundamental timing problem: WebSocket needs a running Bun server instance, but components are initialized *before* the server starts.

```
Application Lifecycle
=====================

  +------------------+
  |  preConfigure()  | <-- Register WebSocketComponent here
  +--------+---------+
           |
  +--------v---------+
  |  initialize()    | <-- Component.binding() runs here
  |                  |   Runtime check, resolve bindings, register post-start hook
  +--------+---------+
           |
  +--------v---------+
  | setupMiddlewares  |
  +--------+---------+
           |
  +--------v-----------------------+
  | startBunModule()               | <-- Bun server starts, instance created
  +--------+-----------------------+
           |
  +--------v--------------------------+
  | executePostStartHooks()           | <-- WebSocketServerHelper created HERE
  |   +-- websocket-initialize        |   Server instance is now available
  |       |-- new WebSocketServerHelper
  |       |-- wsHelper.configure()
  |       |-- bind WEBSOCKET_INSTANCE
  |       +-- server.reload({ fetch, websocket })
  +-----------------------------------+
```

### Fetch Handler

The component creates a custom `fetch` handler that routes requests:

1. **WebSocket upgrade requests** (`GET /ws` with `Upgrade: websocket` header) are handled by `server.upgrade()` which assigns a `clientId` and passes to Bun's WebSocket handler.
2. **All other requests** are delegated to the Hono server for normal HTTP routing.

```
Incoming Request
       |
       v
  Is WebSocket upgrade?
  (pathname === wsPath &&
   headers.upgrade === 'websocket')
       |
  +----+----+
  |         |
  Yes       No
  |         |
  v         v
server.   honoServer.
upgrade()  fetch(req)
```

---

## Setup Guide

### Step 1: Install Dependencies

```bash
# Core dependency (already included via @venizia/ignis)
# ioredis is required for Redis Pub/Sub
bun add ioredis
```

> [!IMPORTANT]
> **Bun only.** The WebSocket component will throw an error if the runtime is Node.js. For Node.js support, use the [Socket.IO Component](./socket-io) instead.

### Step 2: Bind Required Services

In your application's `preConfigure()` method, bind the required services and register the component:

```typescript
import {
  BaseApplication,
  WebSocketComponent,
  WebSocketBindingKeys,
  RedisHelper,
  TWebSocketAuthenticateFn,
  TWebSocketValidateRoomFn,
  TWebSocketClientConnectedFn,
  TWebSocketClientDisconnectedFn,
  TWebSocketMessageHandler,
  TWebSocketOutboundTransformer,
  TWebSocketHandshakeFn,
  ValueOrPromise,
} from '@venizia/ignis';

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

    // 8. Handshake handler (optional — required when requireEncryption is true)
    const handshakeFn: TWebSocketHandshakeFn = async ({ clientId, data }) => {
      const clientPubKey = data.publicKey as string;
      if (!clientPubKey) return null; // Reject — no public key provided
      const aesKey = await deriveSharedSecret(clientPubKey);
      storeClientKey(clientId, aesKey);
      return { serverPublicKey: serverPublicKeyB64 };
    };

    this.bind<TWebSocketHandshakeFn>({
      key: WebSocketBindingKeys.HANDSHAKE_HANDLER,
    }).toValue(handshakeFn);

    // 9. Server options — enable requireEncryption
    this.bind<Partial<IServerOptions>>({
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

### Step 3: Use in Services/Controllers

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

  // Send to all sessions of a user
  notifyUser(opts: { userId: string; message: string }) {
    const clients = this.ws.getClientsByUser({ userId: opts.userId });
    for (const client of clients) {
      this.ws.sendToClient({
        clientId: client.id,
        event: 'notification',
        data: { message: opts.message },
      });
    }
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

---

## Default Server Options

The component applies these defaults if `WebSocketBindingKeys.SERVER_OPTIONS` is not bound or partially overridden:

```typescript
const DEFAULT_SERVER_OPTIONS: IServerOptions = {
  identifier: 'WEBSOCKET_SERVER',
  path: '/ws',
};
```

| Option | Default | Description |
|--------|---------|-------------|
| `identifier` | `'WEBSOCKET_SERVER'` | Unique identifier for the helper instance |
| `path` | `'/ws'` | URL path for WebSocket upgrade requests |
| `defaultRooms` | `undefined` | Falls back to helper default: `['ws-default', 'ws-notification']` |
| `serverOptions` | `undefined` | Falls back to helper defaults (`sendPings: true`, `idleTimeout: 60`) |
| `heartbeatInterval` | `undefined` | Falls back to `30000` (30s) |
| `heartbeatTimeout` | `undefined` | Falls back to `90000` (90s) |
| `requireEncryption` | `undefined` | Falls back to `false` — when `true`, clients must complete ECDH handshake during auth |

### `IServerOptions`

```typescript
interface IServerOptions {
  identifier: string;
  path?: string;
  defaultRooms?: string[];
  serverOptions?: IBunWebSocketConfig;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
  requireEncryption?: boolean;
}
```

### Custom Server Options

Override defaults by binding custom options:

```typescript
this.bind<Partial<IServerOptions>>({
  key: WebSocketBindingKeys.SERVER_OPTIONS,
}).toValue({
  identifier: 'my-app-websocket',
  path: '/realtime',
  defaultRooms: ['app-default', 'app-notifications', 'app-alerts'],
  serverOptions: {
    maxPayloadLength: 256 * 1024,  // 256KB
    idleTimeout: 120,              // 2 minutes
    perMessageDeflate: true,
  },
  heartbeatInterval: 15_000,       // 15 seconds
  heartbeatTimeout: 45_000,        // 45 seconds
});
```

---

## Component Internals

### `resolveBindings()`

Reads all binding keys from the DI container and validates required ones:

| Binding | Validation | Error on Failure |
|---------|-----------|------------------|
| `SERVER_OPTIONS` | Optional, merged with defaults | -- |
| `REDIS_CONNECTION` | Must be `instanceof DefaultRedisHelper` | `"Invalid instance of redisConnection"` |
| `AUTHENTICATE_HANDLER` | Must be a function (non-null) | `"Invalid authenticateFn"` |
| `VALIDATE_ROOM_HANDLER` | Optional | -- |
| `CLIENT_CONNECTED_HANDLER` | Optional | -- |
| `CLIENT_DISCONNECTED_HANDLER` | Optional | -- |
| `MESSAGE_HANDLER` | Optional | -- |
| `OUTBOUND_TRANSFORMER` | Optional | -- |
| `HANDSHAKE_HANDLER` | Optional (required if `requireEncryption`) | -- |

### `registerBunHook()`

Registers a post-start hook that:

1. Gets the Bun server instance via `getServerInstance<TBunServerInstance>()`
2. Gets the Hono server via `getServer()`
3. Creates `WebSocketServerHelper` with all resolved bindings and server options
4. Awaits `wsHelper.configure()` which waits for Redis connections and sets up subscriptions
5. Binds the helper to `WEBSOCKET_INSTANCE`
6. Creates a custom `fetch` handler that routes WebSocket upgrades vs HTTP requests
7. Calls `serverInstance.reload({ fetch, websocket })` to wire WebSocket into the running Bun server

### Runtime Check

The component checks the runtime during `binding()`:

```typescript
const runtime = RuntimeModules.detect();
if (runtime === RuntimeModules.NODE) {
  throw getError({
    message: '[WebSocketComponent] Node.js runtime is not supported yet. Please use Bun runtime.',
  });
}
```

This check runs at component initialization time (before any hooks are registered), failing fast if the runtime is incompatible.

---

## Graceful Shutdown

Always shut down the WebSocket server before stopping the application:

```typescript
override async stop(): Promise<void> {
  // 1. Shut down WebSocket (disconnects all clients, quits Redis)
  const wsHelper = this.get<WebSocketServerHelper>({
    key: WebSocketBindingKeys.WEBSOCKET_INSTANCE,
    isOptional: true,
  });

  if (wsHelper) {
    await wsHelper.shutdown();
  }

  // 2. Disconnect Redis helper
  if (this.redisHelper) {
    await this.redisHelper.disconnect();
  }

  // 3. Stop the Bun server
  await super.stop();
}
```

### Shutdown Sequence

```
wsHelper.shutdown()
  |-- Clear heartbeat timer
  |     +-- clearInterval(heartbeatTimer)
  |
  |-- Disconnect all tracked clients
  |     +-- For each client: socket.close(1001, 'Server shutting down')
  |
  |-- Clear tracking maps
  |     |-- clients.clear()
  |     |-- users.clear()
  |     +-- rooms.clear()
  |
  +-- Redis cleanup (parallel)
        |-- redisPub.quit()
        +-- redisSub.quit()
```

---

## Troubleshooting

### "WebSocket not initialized"

**Cause**: You are trying to use `WebSocketServerHelper` before the server has started (e.g., during DI construction).

**Fix**: Use the lazy getter pattern shown in [Step 3](#step-3-use-in-servicescontrollers). Never `@inject` `WEBSOCKET_INSTANCE` directly in a constructor -- it does not exist yet at construction time.

### "Invalid instance of redisConnection"

**Cause**: The value bound to `REDIS_CONNECTION` is not an instance of `DefaultRedisHelper` (or its subclass `RedisHelper`).

**Fix**: Use `RedisHelper` (recommended) or `DefaultRedisHelper`:

```typescript
// Correct
this.bind({ key: WebSocketBindingKeys.REDIS_CONNECTION })
  .toValue(new RedisHelper({ name: 'websocket', host, port, password }));

// Wrong -- raw ioredis client
this.bind({ key: WebSocketBindingKeys.REDIS_CONNECTION })
  .toValue(new Redis(6379));  // This is NOT a DefaultRedisHelper!
```

### "Invalid authenticateFn to setup WebSocket server!"

**Cause**: No authentication function was bound to `AUTHENTICATE_HANDLER`, or it was bound as `null`.

**Fix**: Bind a valid authentication function before registering the component:

```typescript
this.bind<TWebSocketAuthenticateFn>({
  key: WebSocketBindingKeys.AUTHENTICATE_HANDLER,
}).toValue(async (data) => {
  const token = data.token as string;
  const user = await verifyJWT(token);
  return user ? { userId: user.id } : null;
});
```

### "Node.js runtime is not supported yet"

**Cause**: Running the application on Node.js. The WebSocket component only supports Bun.

**Fix**: Either switch to Bun runtime, or use the [Socket.IO Component](./socket-io) which supports both Node.js and Bun.

### "Bun server instance not available!"

**Cause**: The post-start hook executed but could not obtain the Bun server instance. This typically means the server failed to start.

**Fix**: Check server startup logs for errors. Ensure `start()` completes successfully before post-start hooks run.

### WebSocket connects but messages are not received

**Cause**: Clients must send `{ event: 'authenticate', data: { token: '...' } }` after connecting. Unauthenticated clients are disconnected after the timeout (default: 5 seconds) and cannot receive messages other than `error` events.

**Fix**: Ensure your client authenticates immediately after connection:

```javascript
const ws = new WebSocket('wss://example.com/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({
    event: 'authenticate',
    data: { token: 'your-jwt-token' },
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.event === 'connected') {
    console.log('Authenticated! Client ID:', msg.data.id);
    // Now ready to send/receive events
  }
};
```

### Client disconnected with code 4002

**Cause**: The client did not send any messages (including heartbeat) within the `heartbeatTimeout` period (default: 90 seconds).

**Fix**: Implement a heartbeat on the client side:

```javascript
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event: 'heartbeat' }));
  }
}, 30000);
```

---

## See Also

- **Related Concepts:**
  - [Components Overview](/guides/core-concepts/components) -- Component system basics
  - [Application](/guides/core-concepts/application/) -- Registering components

- **Other Components:**
  - [Components Index](./index) -- All built-in components
  - [Socket.IO Component](./socket-io) -- Alternative with Node.js support

- **References:**
  - [WebSocket Helper](/references/helpers/websocket) -- Full `WebSocketServerHelper` + `WebSocketEmitter` API reference
  - [Crypto Helper](/references/helpers/crypto) -- ECDH key exchange for per-client encryption

- **External Resources:**
  - [Bun WebSocket API](https://bun.sh/docs/api/websockets) -- Official Bun WebSocket documentation
  - [WebSocket Protocol (RFC 6455)](https://datatracker.ietf.org/doc/html/rfc6455) -- WebSocket specification
