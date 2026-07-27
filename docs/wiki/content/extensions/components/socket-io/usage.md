---
title: Socket.IO Component - Usage & Examples
description: Full setup steps, server-side usage, the client helper, and advanced patterns
difficulty: intermediate
---

# Usage & Examples

Task-oriented patterns for the Socket.IO component: full setup, sending messages from a service, using the standalone client helper, and reading the example app.

## Full setup

### 1. Install dependencies

```bash
# Core dependency (already included via @venizia/ignis)
# ioredis is required for the Redis adapter

# Bun runtime only - optional peer dependency
bun add @socket.io/bun-engine
```

### 2. Bind required and optional services

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
      // Implement your auth logic: JWT verification, session check, etc.
      return !!token;
    };

    this.bind<TSocketIOAuthenticateFn>({
      key: SocketIOBindingKeys.AUTHENTICATE_HANDLER,
    }).toValue(authenticateFn);

    // 3. Room validation handler (optional - joins rejected without this)
    const validateRoomFn: TSocketIOValidateRoomFn = ({ socket, rooms }) => {
      // Return the rooms that the client is allowed to join
      return rooms.filter(room => room.startsWith('public-'));
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

    // 5. Register the component - that's it!
    this.component(SocketIOComponent);
  }
}
```

### 3. Why `autoConnect: false`

The helper owns the connection timing, not you. `RedisSingleHelper` is created with `autoConnect: false` because the server helper calls `duplicateClient()` three times:

| Duplicate | Role |
|---|---|
| `redisPub` | Redis adapter - publishes room broadcasts |
| `redisSub` | Redis adapter - subscribes to room broadcasts |
| `redisEmitter` | Redis emitter - direct cross-instance send |

- **Duplicates inherit `lazyConnect`, not connection state.** During `configure()`, the helper checks each client's status. Any client still `wait`ing gets `connect()` called on it explicitly. The helper then waits for all three to reach `ready` before proceeding.
- **This avoids a race.** If the parent connects before the duplicates exist, the duplicates can end up in a state inconsistent with the parent's connection lifecycle.

### Redis connection alternatives

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

The internal `TRedisClient` type is `Redis | Cluster`, so both ioredis connection types work transparently.

> [!NOTE]
> Full defaults, the complete binding key table, and every system event/room constant are in the [Full Reference](./api#configuration-reference).

## Inject the helper in a service or controller

`SocketIOServerHelper` is bound to `SOCKET_IO_INSTANCE` inside a post-start hook. That hook runs after the server starts - well after the DI container already built every service and controller. Use a lazy getter that resolves the helper on first access. Never `@inject` it in a constructor.

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
      payload: { topic: 'room:update', data: { message: opts.message } },
    });
  }

  // Broadcast to all clients
  broadcastAnnouncement(opts: { message: string }) {
    this.io.send({
      payload: { topic: 'system:announcement', data: { message: opts.message } },
    });
  }
}
```

- **Never `@inject` `SOCKET_IO_INSTANCE` in a constructor.** It is not bound yet at that point.
- **`send()` reads via the Redis emitter.** It works even if the destination client is connected to a different server instance - see [`send()` in the Full Reference](./api#messaging-via-send).

## Use the client helper

`SocketIOClientHelper` wraps `socket.io-client` with authentication flow, lifecycle callbacks, and error-safe event subscription. Use it when your process needs to connect *to* a Socket.IO server, not run one - service-to-service communication, testing, or relay services.

### Client setup

```typescript
import { SocketIOClientHelper } from '@venizia/ignis-helpers/socket-io';

const client = new SocketIOClientHelper({
  identifier: 'notification-relay',
  host: 'http://localhost:3000',
  options: {
    path: '/io',
    extraHeaders: { authorization: 'Bearer <token>' },
  },

  // Lifecycle callbacks (all optional)
  onConnected: () => {
    console.log('Connected to server');
    client.authenticate();
  },
  onDisconnected: reason => console.log('Disconnected:', reason),
  onError: error => console.error('Connection error:', error),
  onAuthenticated: () => console.log('Authentication successful'),
  onUnauthenticated: message => console.warn('Authentication failed:', message),
});
```

- **The constructor calls `configure()` immediately.** It creates the `socket.io-client` `Socket` instance via `io(host, options)` and registers the internal event handlers. See the [full handler table](./api#client-configure-event-handlers) in the Full Reference.
- **The socket connects on its own unless you disable it.** Set `autoConnect: false` in `options` and call `client.connect()` yourself when you're ready.

#### `connect` vs `connection` event

Client and server fire different event names for the same moment:

| Side | Fires |
|---|---|
| Client (`socket.io-client`) | `connect` - no suffix |
| Server (`socket.io`) | `connection` - with the suffix |

This is a Socket.IO convention, not an IGNIS one. The client helper listens on `'connect'`. The server helper listens on `SocketIOConstants.EVENT_CONNECT`, which equals `'connection'`.

### Authentication flow

After connecting, the client must emit `authenticate` to start the handshake. The server validates credentials from the socket handshake (headers, query params, `auth` object) and responds with either `authenticated` or `unauthenticated`.

```typescript
client.authenticate();
```

`authenticate()` is a no-op with a warning log unless both conditions hold:

1. The socket is connected (`client.connected === true`).
2. The current state is `unauthorized` - calling `authenticate()` while `authenticating` or already `authenticated` does nothing.

#### Authentication failure messages

The server sends a different message depending on how `authenticateFn` failed. Both paths reset the client to `unauthorized`, emit `unauthenticated` with the message, and disconnect the socket after delivery (via `setImmediate`).

| Failure mode | Message |
|---|---|
| `authenticateFn` returned `false` | `"Invalid token to authenticate! Please login again!"` |
| `authenticateFn` threw an error | `"Failed to authenticate connection! Please login again!"` |

### Event subscription

Handlers are wrapped in a dual try-catch. It catches both synchronous throws and asynchronous rejections, so a broken handler never crashes the client.

```typescript
// Subscribe to a single event
client.subscribe({
  event: 'chat:message',
  handler: (data: { from: string; text: string }) => {
    console.log(`${data.from}: ${data.text}`);
  },
});

// ignoreDuplicate: false stacks a second handler for the same event
client.subscribe({
  event: 'chat:message',
  handler: data => { /* second handler */ },
  ignoreDuplicate: false,
});

// Subscribe to multiple events at once
client.subscribeMany({
  events: {
    'user:joined': data => console.log('User joined:', data),
    'user:left': data => console.log('User left:', data),
    'room:updated': data => console.log('Room updated:', data),
  },
});
```

The default (`ignoreDuplicate: true`) checks `socket.hasListeners(event)` first. If a listener already exists, `subscribe()` is a no-op that logs an info message. Set `ignoreDuplicate: false` to stack handlers instead.

### Unsubscribing

```typescript
// Remove all handlers for an event
client.unsubscribe({ event: 'chat:message' });

// Remove a specific handler
client.unsubscribe({ event: 'chat:message', handler: myHandler });

// Remove handlers for multiple events
client.unsubscribeMany({ events: ['chat:message', 'user:joined', 'room:updated'] });
```

### Emitting events

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

`emit()` throws if the socket is not connected or if `topic` is missing. The server helper's `send()` silently drops a message with a missing field - `emit()` never does that. It always throws instead.

### Room management

```typescript
// Request to join rooms (server validates via validateRoomFn)
client.joinRooms({ rooms: ['chat-room-1', 'notifications'] });

// Request to leave rooms
client.leaveRooms({ rooms: ['chat-room-1'] });
```

Both methods emit a Socket.IO event to the server: `join` or `leave`. The actual join or leave happens server-side. If the socket isn't connected, the call is a no-op with a warning log.

### Connection management

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
client.shutdown();
```

`shutdown()` does three things, in order:

1. Calls `removeAllListeners()` on the underlying socket to prevent memory leaks.
2. Disconnects if still connected.
3. Resets state to `unauthorized`.

## Run the complete example

A full working example lives at `examples/socket-io-test/`.

| Feature | Implementation |
|---|---|
| Application setup | `src/application.ts` - bindings, component registration, graceful shutdown |
| REST endpoints | `src/controllers/socket-test.controller.ts` - 9 endpoints for Socket.IO management |
| Event handling | `src/services/socket-event.service.ts` - chat, echo, room management |
| Automated test client | `client.ts` - 15+ test cases covering all features |

### REST API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/socket/info` | Server status + connected client count |
| `GET` | `/socket/clients` | List all connected client IDs |
| `GET` | `/socket/health` | Health check (is SocketIO ready?) |
| `POST` | `/socket/broadcast` | Broadcast <code v-pre>{{ topic, data }}</code> to all clients |
| `POST` | `/socket/room/{roomId}/send` | Send <code v-pre>{{ topic, data }}</code> to a room |
| `POST` | `/socket/client/{clientId}/send` | Send <code v-pre>{{ topic, data }}</code> to a specific client |
| `POST` | `/socket/client/{clientId}/join` | Join client to <code v-pre>{{ rooms: string[] }}</code> |
| `POST` | `/socket/client/{clientId}/leave` | Remove client from <code v-pre>{{ rooms: string[] }}</code> |
| `GET` | `/socket/client/{clientId}/rooms` | List rooms a client belongs to |

### Running the example

```bash
# Start the server
cd examples/socket-io-test
bun run server:dev

# In another terminal - run automated tests
bun client.ts
```

The automated client exercises:

- Authentication with valid and invalid tokens
- Ping/pong keepalive
- Room join/leave with validation
- Client-to-client messaging
- Room and global broadcasting
- The REST API
- Graceful disconnection

Read the example for these production-ready patterns:

- Binding multiple handlers in one `setupSocketIO()` method
- The lazy getter pattern for `SocketIOServerHelper`
- Custom event registration via `CLIENT_CONNECTED_HANDLER`
- Room validation that blocks unauthorized rooms
- A graceful shutdown sequence in `application.stop()`

## See also

- [Overview](./) - quick start, imports, common configuration tasks
- [Full Reference](./api) - architecture, configuration reference, method signatures, internals, types
- [Error Reference](./errors) - error conditions and troubleshooting
