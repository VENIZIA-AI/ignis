# Socket.IO -- Usage & Examples

> Full setup steps, server-side usage patterns, client helper, and advanced examples.

## Full Setup

### 1. Install Dependencies

```bash
# Core dependency (already included via @venizia/ignis)
# ioredis is required for the Redis adapter

# For Bun runtime only -- optional peer dependency
bun add @socket.io/bun-engine
```

### 2. Bind Required + Optional Services

```typescript
import { BaseApplication } from '@venizia/ignis';
import { SocketIOComponent, SocketIOBindingKeys } from '@venizia/ignis/socket-io';
import { RedisSingleHelper, ValueOrPromise } from '@venizia/ignis-helpers';
import type {
  TSocketIOAuthenticateFn,
  TSocketIOValidateRoomFn,
  TSocketIOClientConnectedFn,
} from '@venizia/ignis-helpers/socket-io';

export class Application extends BaseApplication {
  private redisHelper: RedisSingleHelper;

  preConfigure(): ValueOrPromise<void> {
    this.setupSocketIO();
    // ... other setup
  }

  setupSocketIO() {
    // 1. Redis connection (required for adapter + emitter)
    this.redisHelper = new RedisSingleHelper({
      name: 'socket-io-redis',
      host: process.env.REDIS_HOST ?? 'localhost',
      port: +(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD,
      autoConnect: false,
    });

    this.bind<RedisSingleHelper>({
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

### 3. Why `autoConnect: false`

- **The helper owns connection, not you.** `RedisSingleHelper` is created with `autoConnect: false` because the server helper internally calls `client.duplicate()` to create 3 independent Redis connections (pub, sub, emitter).
- **Duplicates inherit `lazyConnect`, not connection state.** During `configure()`, the helper detects clients in `wait` status and explicitly calls `client.connect()` on each, then awaits all 3 to reach `ready` status before proceeding.
- **This avoids a race.** If the parent connects before the duplicates exist, the duplicates can end up in an inconsistent state relative to the parent's connection lifecycle.

### Redis Connection Alternatives

`RedisSingleHelper` (single instance), `RedisClusterHelper` (cluster mode), and `RedisSentinelHelper` (Sentinel HA) all extend `AbstractRedisHelper` and satisfy the `IRedisHelper` interface the component validates against.

```typescript
import { RedisClusterHelper } from '@venizia/ignis-helpers';

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

> [!NOTE]
> Full defaults, the complete binding key table, and every system event/room constant are in the [API Reference](./api#configuration-reference).

## Server-Side Usage

### Inject and Use in Services/Controllers

- **`SOCKET_IO_INSTANCE` does not exist at construction time.** The component binds `SocketIOServerHelper` from a post-start hook, which runs after the server starts -- well after every service/controller has already been constructed by the DI container.
- **Use a lazy getter, not `@inject`.** Resolve the helper from the application container on first access, and cache it. `@inject`-ing `SOCKET_IO_INSTANCE` directly in a constructor will resolve to nothing.

```typescript
import {
  BaseService,
  inject,
  CoreBindings,
  BaseApplication,
} from '@venizia/ignis';
import { SocketIOBindingKeys } from '@venizia/ignis/socket-io';
import { SocketIOServerHelper } from '@venizia/ignis-helpers/socket-io';

export class NotificationService extends BaseService {
  private _io: SocketIOServerHelper | null = null;

  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    private application: BaseApplication,
  ) {
    super({ scope: NotificationService.name });
  }

  private get io(): SocketIOServerHelper {
    if (!this._io) {
      this._io = this.application.get<SocketIOServerHelper>({
        key: SocketIOBindingKeys.SOCKET_IO_INSTANCE,
        isOptional: true,
      }) ?? null;
    }

    if (!this._io) {
      throw new Error('SocketIO not initialized');
    }

    return this._io;
  }

  // Send to a specific client
  notifyUser(opts: { userId: string; message: string }) {
    this.io.send({
      destination: opts.userId,
      payload: {
        topic: 'notification',
        data: { message: opts.message, time: new Date().toISOString() },
      },
    });
  }

  // Send to a room
  notifyRoom(opts: { room: string; message: string }) {
    this.io.send({
      destination: opts.room,
      payload: {
        topic: 'room:update',
        data: { message: opts.message },
      },
    });
  }

  // Broadcast to all clients
  broadcastAnnouncement(opts: { message: string }) {
    this.io.send({
      payload: {
        topic: 'system:announcement',
        data: { message: opts.message },
      },
    });
  }
}
```

## Client Helper

`SocketIOClientHelper` provides a managed Socket.IO client for connecting to Socket.IO servers -- useful for service-to-service communication, testing, or building relay services. It extends `BaseHelper` for scoped logging and wraps `socket.io-client` with authentication flow, lifecycle callbacks, and error-safe event subscription.

### Client Setup

```typescript
import { SocketIOClientHelper } from '@venizia/ignis-helpers/socket-io';

const client = new SocketIOClientHelper({
  identifier: 'notification-relay',
  host: 'http://localhost:3000',
  options: {
    path: '/io',
    extraHeaders: {
      authorization: 'Bearer <token>',
    },
  },

  // Lifecycle callbacks (all optional)
  onConnected: () => {
    console.log('Connected to server');
    client.authenticate();
  },
  onDisconnected: (reason) => {
    console.log('Disconnected:', reason);
  },
  onError: (error) => {
    console.error('Connection error:', error);
  },
  onAuthenticated: () => {
    console.log('Authentication successful');
  },
  onUnauthenticated: (message) => {
    console.warn('Authentication failed:', message);
  },
});
```

- **The constructor calls `configure()` immediately.** `configure()` creates the `socket.io-client` `Socket` instance via `io(host, options)` and registers all internal event handlers (`connect`, `disconnect`, `connect_error`, `authenticated`, `unauthenticated`, `ping`).
- **The socket does not connect on its own accord unless `autoConnect` allows it.** Call `client.connect()` explicitly when `autoConnect: false` is set in `options`; otherwise the socket connects automatically.

#### `connect` vs `connection` Event

- **Client and server use different event names.** `socket.io-client` fires `connect` (no suffix) when the connection is established; server-side `socket.io` fires `connection` (with the suffix). This is a Socket.IO convention, not IGNIS-specific.
- **The two helpers mirror this.** The client helper registers on `'connect'`; the server helper registers on `SocketIOConstants.EVENT_CONNECT`, which equals `'connection'`.

### Authentication Flow

After connecting, the client must emit `authenticate` to start the auth handshake. The server validates credentials from the socket handshake (headers, query params, `auth` object) and responds with either `authenticated` or `unauthenticated`.

```typescript
// Manual authentication after connection
client.authenticate();
```

`authenticate()` has two guard conditions -- both make the call a no-op with a warning log:

1. The socket must be connected (`client.connected === true`)
2. The current state must be `unauthorized` -- calling `authenticate()` while `authenticating` or already `authenticated` does nothing

#### Authentication Failure Details

The server sends two distinct error messages depending on how `authenticateFn` fails:

| Failure Mode | Message | Cause |
|-------------|---------|-------|
| `authenticateFn` returned `false` | `"Invalid token to authenticate! Please login again!"` | Credentials were checked but deemed invalid |
| `authenticateFn` threw an error | `"Failed to authenticate connection! Please login again!"` | An unexpected error occurred during validation |

Both failure paths set the client state back to `unauthorized`, emit the `unauthenticated` event to the client with the message, and disconnect the socket after the message is delivered (via a `setImmediate` callback).

### Event Subscription

Subscribe to custom events with automatic error safety. Handlers are wrapped in a dual try-catch that catches both synchronous throws and asynchronous rejections:

```typescript
// Subscribe to a single event
client.subscribe({
  event: 'chat:message',
  handler: (data: { from: string; text: string }) => {
    console.log(`${data.from}: ${data.text}`);
  },
});

// Subscribe with duplicate detection disabled
client.subscribe({
  event: 'chat:message',
  handler: (data) => { /* second handler */ },
  ignoreDuplicate: false, // default: true -- set to false to allow multiple handlers
});

// Subscribe to multiple events at once
client.subscribeMany({
  events: {
    'user:joined': (data) => console.log('User joined:', data),
    'user:left': (data) => console.log('User left:', data),
    'room:updated': (data) => console.log('Room updated:', data),
  },
});
```

#### Deduplication Behavior

- **The default (`ignoreDuplicate: true`) checks `socket.hasListeners(event)` first.** If listeners already exist for the event, `subscribe()` is a no-op and logs an info message.
- **Set `ignoreDuplicate: false` to stack handlers.** This allows multiple handlers to run for the same event.

### Unsubscribing

```typescript
// Remove all handlers for an event
client.unsubscribe({ event: 'chat:message' });

// Remove a specific handler
client.unsubscribe({ event: 'chat:message', handler: myHandler });

// Remove handlers for multiple events
client.unsubscribeMany({ events: ['chat:message', 'user:joined', 'room:updated'] });
```

### Emitting Events

```typescript
client.emit({
  topic: 'chat:send',
  data: { text: 'Hello world' },
  doLog: true,       // optional: log the emission
  callback: () => {  // optional: invoked via setImmediate after emit
    console.log('Message sent');
  },
});
```

`emit()` throws if the socket is not connected or if no `topic` is provided. Unlike `send()` on the server helper, this method does **not** silently swallow missing-argument errors.

### Room Management

```typescript
// Request to join rooms (server validates via validateRoomFn)
client.joinRooms({ rooms: ['chat-room-1', 'notifications'] });

// Request to leave rooms
client.leaveRooms({ rooms: ['chat-room-1'] });
```

Both methods emit Socket.IO events (`join` / `leave`) to the server -- the actual join/leave happens server-side. If the socket is not connected, the call is a no-op with a warning log.

### Connection Management

```typescript
// Manually connect (useful when autoConnect: false in options)
client.connect();

// Disconnect from server
client.disconnect();

// Check current state
const state = client.getState(); // 'unauthorized' | 'authenticating' | 'authenticated'

// Get raw socket.io-client Socket instance
const rawSocket = client.getSocketClient();
```

### Shutdown

```typescript
// Clean shutdown: removes all listeners, disconnects, resets state
client.shutdown();
```

`shutdown()` does three things, in order:

1. Calls `removeAllListeners()` on the underlying socket to prevent memory leaks
2. Disconnects if still connected
3. Resets state to `unauthorized`

## Advanced Usage

### Complete Example

A full working example is available at `examples/socket-io-test/`. It demonstrates:

| Feature | Implementation |
|---------|---------------|
| Application setup | `src/application.ts` -- bindings, component registration, graceful shutdown |
| REST endpoints | `src/controllers/socket-test.controller.ts` -- 9 endpoints for Socket.IO management |
| Event handling | `src/services/socket-event.service.ts` -- chat, echo, room management |
| Automated test client | `client.ts` -- 15+ test cases covering all features |

#### REST API Endpoints

The example provides a REST API for managing Socket.IO:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/socket/info` | Server status + connected client count |
| `GET` | `/socket/clients` | List all connected client IDs |
| `GET` | `/socket/health` | Health check (is SocketIO ready?) |
| `POST` | `/socket/broadcast` | Broadcast <code v-pre>{{ topic, data }}</code> to all clients |
| `POST` | `/socket/room/{roomId}/send` | Send <code v-pre>{{ topic, data }}</code> to a room |
| `POST` | `/socket/client/{clientId}/send` | Send <code v-pre>{{ topic, data }}</code> to a specific client |
| `POST` | `/socket/client/{clientId}/join` | Join client to <code v-pre>{{ rooms: string[] }}</code> |
| `POST` | `/socket/client/{clientId}/leave` | Remove client from <code v-pre>{{ rooms: string[] }}</code> |
| `GET` | `/socket/client/{clientId}/rooms` | List rooms a client belongs to |

#### Running the Example

```bash
# Start the server
cd examples/socket-io-test
bun run server:dev

# In another terminal -- run automated tests
bun client.ts
```

The automated client tests the following features:

- Authentication (valid and invalid tokens)
- Ping/pong keepalive
- Room join/leave with validation
- Client-to-client messaging
- Room broadcasting
- Global broadcasting
- REST API for Socket.IO management
- Graceful disconnection

Review the example code to understand production-ready patterns for:

- Binding multiple handlers in a single `setupSocketIO()` method
- Lazy getter pattern for accessing `SocketIOServerHelper` in services
- Custom event registration via `CLIENT_CONNECTED_HANDLER`
- Room validation logic preventing unauthorized room access
- Graceful shutdown sequence in `application.stop()`

## See Also

- [Setup & Configuration](./) -- Quick reference, import paths, use cases
- [API Reference](./api) -- Architecture, configuration reference, method signatures, internals, types
- [Error Reference](./errors) -- Error conditions and troubleshooting
