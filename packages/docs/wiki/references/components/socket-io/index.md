# Socket.IO -- Setup & Configuration

> Real-time, bidirectional, event-based communication using Socket.IO -- with automatic runtime detection for both Node.js and Bun.

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` (core) |
| **Class** | `SocketIOComponent` |
| **Server Helper** | [`SocketIOServerHelper`](/references/helpers/socket-io/) |
| **Client Helper** | [`SocketIOClientHelper`](/references/helpers/socket-io/) |
| **Runtimes** | Node.js (`@hono/node-server`) and Bun (native) |
| **Scaling** | `@socket.io/redis-adapter` + `@socket.io/redis-emitter` |

#### Import Paths
```typescript
import {
  SocketIOComponent,
  SocketIOBindingKeys,
  SocketIOServerHelper,
  RedisHelper,
} from '@venizia/ignis';

import {
  SocketIOClientHelper,
  SocketIOConstants,
  SocketIOClientStates,
} from '@venizia/ignis-helpers/socket-io';

import type {
  IServerOptions,
  TSocketIOAuthenticateFn,
  TSocketIOValidateRoomFn,
  TSocketIOClientConnectedFn,
  ISocketIOClientOptions,
  IOptions,
  TSocketIOEventHandler,
  TSocketIOClientState,
} from '@venizia/ignis';
```

### Use Cases

- Live notifications and alerts
- Real-time chat and messaging
- Collaborative editing (docs, whiteboards)
- Live data streams (dashboards, monitoring)
- Multiplayer game state synchronization
- Service-to-service real-time communication (via `SocketIOClientHelper`)

## Server Helper Setup

### Step 1: Install Dependencies

```bash
# Core dependency (already included via @venizia/ignis)
# ioredis is required for the Redis adapter

# For Bun runtime only -- optional peer dependency
bun add @socket.io/bun-engine
```

### Step 2: Bind Required Services

In your application's `preConfigure()` method, bind the required services and register the component:

```typescript
import {
  BaseApplication,
  SocketIOComponent,
  SocketIOBindingKeys,
  RedisHelper,
  TSocketIOAuthenticateFn,
  TSocketIOValidateRoomFn,
  TSocketIOClientConnectedFn,
  ValueOrPromise,
} from '@venizia/ignis';

export class Application extends BaseApplication {
  private redisHelper: RedisHelper;

  preConfigure(): ValueOrPromise<void> {
    this.setupSocketIO();
    // ... other setup
  }

  setupSocketIO() {
    // 1. Redis connection (required for adapter + emitter)
    this.redisHelper = new RedisHelper({
      name: 'socket-io-redis',
      host: process.env.REDIS_HOST ?? 'localhost',
      port: +(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD,
      autoConnect: false,
    });

    this.bind<RedisHelper>({
      key: SocketIOBindingKeys.REDIS_CONNECTION,
    }).toValue(this.redisHelper);

    // 2. Authentication handler (required)
    const authenticateFn: TSocketIOAuthenticateFn = handshake => {
      const token = handshake.headers.authorization;
      // Implement your auth logic -- JWT verification, session check, etc.
      return !!token;
    };

    this.bind<TSocketIOAuthenticateFn>({
      key: SocketIOBindingKeys.AUTHENTICATE_HANDLER,
    }).toValue(authenticateFn);

    // 3. Room validation handler (optional -- joins rejected without this)
    const validateRoomFn: TSocketIOValidateRoomFn = ({ socket, rooms }) => {
      // Return the rooms that the client is allowed to join
      const allowedRooms = rooms.filter(room => room.startsWith('public-'));
      return allowedRooms;
    };

    this.bind<TSocketIOValidateRoomFn>({
      key: SocketIOBindingKeys.VALIDATE_ROOM_HANDLER,
    }).toValue(validateRoomFn);

    // 4. Client connected handler (optional)
    const clientConnectedFn: TSocketIOClientConnectedFn = ({ socket }) => {
      console.log('Client connected:', socket.id);
      // Register custom event handlers on the socket
    };

    this.bind<TSocketIOClientConnectedFn>({
      key: SocketIOBindingKeys.CLIENT_CONNECTED_HANDLER,
    }).toValue(clientConnectedFn);

    // 5. Register the component -- that's it!
    this.component(SocketIOComponent);
  }
}
```

#### `autoConnect: false` Rationale

The `RedisHelper` is created with `autoConnect: false` because the server helper internally calls `client.duplicate()` to create 3 independent Redis connections (pub, sub, emitter). The duplicated clients inherit the `lazyConnect` setting from the parent. During `configure()`, the helper detects clients in `wait` status and explicitly calls `client.connect()` on each, then awaits all 3 to reach `ready` status before proceeding. This avoids race conditions where the parent connects before the duplicates are created.

#### Redis Connection Alternatives

You can use either `RedisHelper` (single Redis instance) or `RedisClusterHelper` (Redis Cluster mode). Both extend `DefaultRedisHelper`, which is the type the component validates against:

```typescript
import { RedisClusterHelper } from '@venizia/ignis';

// For Redis Cluster deployments
const redisHelper = new RedisClusterHelper({
  name: 'socket-io-redis-cluster',
  nodes: [
    { host: 'redis-node-1', port: 6379 },
    { host: 'redis-node-2', port: 6380 },
    { host: 'redis-node-3', port: 6381 },
  ],
  password: process.env.REDIS_PASSWORD,
  autoConnect: false,
});

this.bind<RedisClusterHelper>({
  key: SocketIOBindingKeys.REDIS_CONNECTION,
}).toValue(redisHelper);
```

The internal `TRedisClient` type is `Redis | Cluster`, so both ioredis connection types are supported transparently.

## Configuration

### Default Server Options

The component applies these defaults if `SocketIOBindingKeys.SERVER_OPTIONS` is not bound or partially overridden:

| Option | Default | Description |
|--------|---------|-------------|
| `identifier` | `'SOCKET_IO_SERVER'` | Unique identifier for the helper instance |
| `path` | `'/io'` | URL path for Socket.IO handshake/polling |
| `cors.origin` | `'*'` | Allowed origins (restrict in production!) |
| `cors.methods` | `['GET', 'POST']` | Allowed HTTP methods for CORS preflight |
| `cors.preflightContinue` | `false` | Pass preflight to next handler |
| `cors.optionsSuccessStatus` | `204` | Status code for successful OPTIONS requests |
| `cors.credentials` | `true` | Allow cookies/auth headers |
| `perMessageDeflate.threshold` | `4096` | Minimum message size to compress (bytes) |
| `perMessageDeflate.concurrencyLimit` | `20` | Max concurrent compression operations |
| `perMessageDeflate.clientNoContextTakeover` | `true` | Client releases compression context after each message |
| `perMessageDeflate.serverNoContextTakeover` | `true` | Server releases compression context after each message |
| `perMessageDeflate.serverMaxWindowBits` | `10` | Server-side maximum window size (2^10 = 1KB) |

> [!WARNING]
> The default `cors.origin: '*'` is suitable for development only. In production, restrict this to your specific domains.

#### Full `DEFAULT_SERVER_OPTIONS`
```typescript
const DEFAULT_SERVER_OPTIONS: Partial<IServerOptions> = {
  identifier: 'SOCKET_IO_SERVER',
  path: '/io',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
    credentials: true,
  },
  perMessageDeflate: {
    threshold: 4096,
    zlibDeflateOptions: { chunkSize: 10 * 1024 },
    zlibInflateOptions: { windowBits: 12, memLevel: 8 },
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    serverMaxWindowBits: 10,
    concurrencyLimit: 20,
  },
};
```

### Custom Configuration

Bind custom server options before registering the component:

```typescript
import { SocketIOBindingKeys, IServerOptions } from '@venizia/ignis';

const customOptions: Partial<IServerOptions> = {
  identifier: 'my-app-socket',
  path: '/socket.io',
  cors: {
    origin: ['https://myapp.com', 'https://admin.myapp.com'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6, // 1MB
};

this.bind<Partial<IServerOptions>>({
  key: SocketIOBindingKeys.SERVER_OPTIONS,
}).toValue(customOptions);

this.component(SocketIOComponent);
```

## Binding Keys

All binding keys are available in `SocketIOBindingKeys`:

| Binding Key | Constant | Type | Required | Default |
|------------|----------|------|----------|---------|
| `@app/socket-io/server-options` | `SERVER_OPTIONS` | `Partial<IServerOptions>` | No | See defaults above |
| `@app/socket-io/redis-connection` | `REDIS_CONNECTION` | `RedisHelper` / `RedisClusterHelper` / `DefaultRedisHelper` | **Yes** | `null` |
| `@app/socket-io/authenticate-handler` | `AUTHENTICATE_HANDLER` | `TSocketIOAuthenticateFn` | **Yes** | `null` |
| `@app/socket-io/validate-room-handler` | `VALIDATE_ROOM_HANDLER` | `TSocketIOValidateRoomFn` | No | `null` |
| `@app/socket-io/client-connected-handler` | `CLIENT_CONNECTED_HANDLER` | `TSocketIOClientConnectedFn` | No | `null` |
| `@app/socket-io/instance` | `SOCKET_IO_INSTANCE` | `SocketIOServerHelper` | -- | *Set by component* |

> [!NOTE]
> `SOCKET_IO_INSTANCE` is **not** set by you -- the component creates and binds it automatically after the server starts. Inject it in services/controllers to interact with Socket.IO.

## Constants

Constants are exported from `@venizia/ignis-helpers/socket-io` and used internally by both the component and the helper.

### System Events

| Constant | Value | Description |
|----------|-------|-------------|
| `SocketIOConstants.EVENT_PING` | `'ping'` | Keep-alive ping emitted at `pingInterval` (default: 30s) |
| `SocketIOConstants.EVENT_CONNECT` | `'connection'` | New client connected (server-side event) |
| `SocketIOConstants.EVENT_DISCONNECT` | `'disconnect'` | Client disconnected |
| `SocketIOConstants.EVENT_JOIN` | `'join'` | Client requests to join room(s) |
| `SocketIOConstants.EVENT_LEAVE` | `'leave'` | Client requests to leave room(s) |
| `SocketIOConstants.EVENT_AUTHENTICATE` | `'authenticate'` | Client sends auth credentials |
| `SocketIOConstants.EVENT_AUTHENTICATED` | `'authenticated'` | Auth success response sent to client |
| `SocketIOConstants.EVENT_UNAUTHENTICATE` | `'unauthenticated'` | Auth failure response sent to client |

### Default Rooms

All authenticated clients are automatically joined to these rooms:

| Constant | Value | Description |
|----------|-------|-------------|
| `SocketIOConstants.ROOM_DEFAULT` | `'io-default'` | Default room all authenticated clients join |
| `SocketIOConstants.ROOM_NOTIFICATION` | `'io-notification'` | Notification broadcast room |

> [!TIP]
> You can override default rooms via the `defaultRooms` option on `SocketIOServerHelper`. The component uses the defaults above when not overridden.

### Internal Constants (Server Helper)

These constants are defined at module scope in the server helper and are not exported, but they govern default behavior:

| Constant | Value | Description |
|----------|-------|-------------|
| `CLIENT_AUTHENTICATE_TIMEOUT` | `10_000` (10s) | Time allowed for a client to authenticate before forced disconnect |
| `CLIENT_PING_INTERVAL` | `30_000` (30s) | Interval between server-to-client ping emissions |

Both can be overridden via the `authenticateTimeout` and `pingInterval` constructor options on `SocketIOServerHelper`.

### Client States

Each connected client tracks an authentication state that governs what actions are permitted:

| State | Constant | Description |
|-------|----------|-------------|
| `unauthorized` | `SocketIOClientStates.UNAUTHORIZED` | Initial state -- client must emit `authenticate` within the timeout (default: 10s) |
| `authenticating` | `SocketIOClientStates.AUTHENTICATING` | Auth in progress -- `authenticateFn` is executing |
| `authenticated` | `SocketIOClientStates.AUTHENTICATED` | Auth successful -- client can send/receive events and join rooms |

#### State Machine Diagram
```
                    +------------------+
 connect ---------->|  unauthorized    |
                    +--------+---------+
                             | emit('authenticate')
                    +--------v---------+
                    |  authenticating   |
                    +---+----------+---+
            success |              | failure
          +---------v--+   +-------v-----------+
          |authenticated|   |   unauthorized   |--> disconnect
          +-------------+   +------------------+
                                  ^
                            timeout (10s)
```

#### `SocketIOClientStates` Source
```typescript
export class SocketIOClientStates {
  static readonly UNAUTHORIZED = 'unauthorized';
  static readonly AUTHENTICATING = 'authenticating';
  static readonly AUTHENTICATED = 'authenticated';

  static readonly SCHEME_SET = new Set([
    this.UNAUTHORIZED,
    this.AUTHENTICATING,
    this.AUTHENTICATED,
  ]);

  static isValid(input: string): input is TConstValue<typeof SocketIOClientStates> {
    return this.SCHEME_SET.has(input);
  }
}
```

### Resolved Bindings

The component resolves all binding keys into a single `IResolvedBindings` object during the `binding()` phase:

#### `IResolvedBindings` Interface
```typescript
interface IResolvedBindings {
  redisConnection: DefaultRedisHelper;
  authenticateFn: TSocketIOAuthenticateFn;
  validateRoomFn?: TSocketIOValidateRoomFn;
  clientConnectedFn?: TSocketIOClientConnectedFn;
}
```

#### Callback Type Signatures
```typescript
// Called with the socket handshake -- return true to authenticate, false to reject
type TSocketIOAuthenticateFn = (args: IHandshake) => ValueOrPromise<boolean>;

// Called when client emits 'join' -- return the subset of rooms the client is allowed to join
type TSocketIOValidateRoomFn = (opts: {
  socket: IOSocket;
  rooms: string[];
}) => ValueOrPromise<string[]>;

// Called after successful authentication -- register custom event handlers here
type TSocketIOClientConnectedFn = (opts: { socket: IOSocket }) => ValueOrPromise<void>;
```

#### `IHandshake` Interface
```typescript
interface IHandshake {
  headers: IncomingHttpHeaders;
  time: string;
  address: string;
  xdomain: boolean;
  secure: boolean;
  issued: number;
  url: string;
  query: ParsedUrlQuery;
  auth: { [key: string]: any };
}
```

## See Also

- [Usage & Examples](./usage) -- Server-side usage, client helper, advanced patterns
- [API Reference](./api) -- Architecture, method signatures, internals, types
- [Error Reference](./errors) -- Error conditions and troubleshooting
- **Guides:**
  - [Components Overview](/guides/core-concepts/components) -- Component system basics
  - [Application](/guides/core-concepts/application/) -- Registering components
- **Components:**
  - [Components Index](../index) -- All built-in components
- **Helpers:**
  - [Socket.IO Helper](/references/helpers/socket-io/) -- Full `SocketIOServerHelper` + `SocketIOClientHelper` API reference
- **External Resources:**
  - [Socket.IO Documentation](https://socket.io/docs/) -- Official docs
  - [Socket.IO Redis Adapter](https://socket.io/docs/v4/redis-adapter/) -- Horizontal scaling guide
  - [@socket.io/bun-engine](https://github.com/socketio/bun-engine) -- Bun runtime support
- **Tutorials:**
  - [Real-Time Chat](/guides/tutorials/realtime-chat) -- Building a chat app with Socket.IO
- **Changelog:**
  - [2026-02-06: Socket.IO Integration Fix](/changelogs/2026-02-06-socket-io-integration-fix) -- Lifecycle timing fix + Bun runtime support
