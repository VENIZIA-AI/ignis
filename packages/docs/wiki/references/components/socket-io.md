# Socket.IO Component

Real-time, bidirectional, event-based communication using Socket.IO — with automatic runtime detection for both **Node.js** and **Bun**.

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` (core) |
| **Class** | `SocketIOComponent` |
| **Helper** | [`SocketIOServerHelper`](/references/helpers/socket-io) |
| **Runtimes** | Node.js (`@hono/node-server`) and Bun (native) |
| **Scaling** | `@socket.io/redis-adapter` + `@socket.io/redis-emitter` |

### Binding Keys

| Binding Key | Constant | Type | Required | Default |
|------------|----------|------|----------|---------|
| `@app/socket-io/server-options` | `SocketIOBindingKeys.SERVER_OPTIONS` | `Partial<IServerOptions>` | No | See [Default Options](#default-server-options) |
| `@app/socket-io/redis-connection` | `SocketIOBindingKeys.REDIS_CONNECTION` | `RedisHelper` / `DefaultRedisHelper` | **Yes** | `null` |
| `@app/socket-io/authenticate-handler` | `SocketIOBindingKeys.AUTHENTICATE_HANDLER` | `(args: IHandshake) => ValueOrPromise<boolean>` | **Yes** | `null` |
| `@app/socket-io/client-connected-handler` | `SocketIOBindingKeys.CLIENT_CONNECTED_HANDLER` | `(opts: { socket: IOSocket }) => ValueOrPromise<void>` | No | `null` |
| `@app/socket-io/instance` | `SocketIOBindingKeys.SOCKET_IO_INSTANCE` | `SocketIOServerHelper` | — | *Set by component* |

> [!NOTE]
> `SOCKET_IO_INSTANCE` is **not** set by you — the component creates and binds it automatically after the server starts. Inject it in services/controllers to interact with Socket.IO.

### Use Cases

- Live notifications and alerts
- Real-time chat and messaging
- Collaborative editing (docs, whiteboards)
- Live data streams (dashboards, monitoring)
- Multiplayer game state synchronization

---

## Architecture Overview

```
                         SocketIOComponent
                        ┌──────────────────────────────────────────┐
                        │                                          │
                        │  binding()                               │
                        │    ├── resolveBindings()                 │
                        │    │     ├── SERVER_OPTIONS               │
                        │    │     ├── REDIS_CONNECTION             │
                        │    │     ├── AUTHENTICATE_HANDLER         │
                        │    │     └── CLIENT_CONNECTED_HANDLER     │
                        │    │                                      │
                        │    └── RuntimeModules.detect()            │
                        │          ├── BUN  → registerBunHook()     │
                        │          └── NODE → registerNodeHook()    │
                        │                                          │
                        │  (Post-start hooks execute after server) │
                        │    ├── Creates SocketIOServerHelper       │
                        │    ├── Binds to SOCKET_IO_INSTANCE        │
                        │    └── Wires into server (runtime-specific)│
                        └──────────────────────────────────────────┘
```

### Lifecycle Integration

The component uses the **post-start hook** system to solve a fundamental timing problem: Socket.IO needs a running server instance, but components are initialized *before* the server starts.

```
Application Lifecycle
═════════════════════

  ┌─────────────────┐
  │  preConfigure()  │ ← Register SocketIOComponent here
  └────────┬────────┘
           │
  ┌────────▼────────┐
  │  initialize()    │ ← Component.binding() runs here
  │                  │   Resolves bindings, registers post-start hook
  └────────┬────────┘
           │
  ┌────────▼────────┐
  │ setupMiddlewares │
  └────────┬────────┘
           │
  ┌────────▼──────────────┐
  │ startBunModule()  OR  │ ← Server starts, instance created
  │ startNodeModule()     │
  └────────┬──────────────┘
           │
  ┌────────▼──────────────────┐
  │ executePostStartHooks()   │ ← SocketIOServerHelper created HERE
  │   └── socket-io-initialize│   Server instance is now available
  └───────────────────────────┘
```

### Runtime-Specific Behavior

| Aspect | Node.js | Bun |
|--------|---------|-----|
| **Server Type** | `node:http.Server` | `Bun.Server` |
| **IO Server Init** | `new IOServer(httpServer, opts)` | `new IOServer()` + `io.bind(engine)` |
| **Engine** | Built-in (`socket.io`) | `@socket.io/bun-engine` (optional peer dep) |
| **Request Routing** | Socket.IO attaches to HTTP server automatically | `server.reload({ fetch, websocket })` wires engine into Bun's request loop |
| **WebSocket Upgrade** | Handled by `node:http.Server` upgrade event | Handled by Bun's `websocket` handler |
| **Dynamic Import** | None needed | `await import('@socket.io/bun-engine')` at runtime |

---

## Setup Guide

### Step 1: Install Dependencies

```bash
# Core dependency (already included via @venizia/ignis)
# ioredis is required for the Redis adapter

# For Bun runtime only — optional peer dependency
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
  ISocketIOServerBaseOptions,
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
    const authenticateFn: ISocketIOServerBaseOptions['authenticateFn'] = handshake => {
      const token = handshake.headers.authorization;
      // Implement your auth logic — JWT verification, session check, etc.
      return !!token;
    };

    this.bind<ISocketIOServerBaseOptions['authenticateFn']>({
      key: SocketIOBindingKeys.AUTHENTICATE_HANDLER,
    }).toValue(authenticateFn);

    // 3. Client connected handler (optional)
    const clientConnectedFn: ISocketIOServerBaseOptions['clientConnectedFn'] = ({ socket }) => {
      console.log('Client connected:', socket.id);
      // Register custom event handlers on the socket
    };

    this.bind<ISocketIOServerBaseOptions['clientConnectedFn']>({
      key: SocketIOBindingKeys.CLIENT_CONNECTED_HANDLER,
    }).toValue(clientConnectedFn);

    // 4. Register the component — that's it!
    this.component(SocketIOComponent);
  }
}
```

### Step 3: Use in Services/Controllers

Inject `SocketIOServerHelper` to interact with Socket.IO:

```typescript
import {
  BaseService,
  inject,
  SocketIOBindingKeys,
  SocketIOServerHelper,
  CoreBindings,
  BaseApplication,
} from '@venizia/ignis';

export class NotificationService extends BaseService {
  // Lazy getter pattern — helper is bound AFTER server starts
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

> [!IMPORTANT]
> **Lazy getter pattern**: Since `SocketIOServerHelper` is bound via a post-start hook, it's not available during DI construction. Use a lazy getter that resolves from the application container on first access.

---

## Default Server Options

The component applies these defaults if `SocketIOBindingKeys.SERVER_OPTIONS` is not bound or partially overridden:

```typescript
const DEFAULT_SERVER_OPTIONS = {
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

| Option | Default | Description |
|--------|---------|-------------|
| `identifier` | `'SOCKET_IO_SERVER'` | Unique identifier for the helper instance |
| `path` | `'/io'` | URL path for Socket.IO handshake/polling |
| `cors.origin` | `'*'` | Allowed origins (restrict in production!) |
| `cors.credentials` | `true` | Allow cookies/auth headers |
| `perMessageDeflate` | Enabled | WebSocket compression settings |

### Custom Server Options

Override defaults by binding custom options:

```typescript
this.bind<Partial<IServerOptions>>({
  key: SocketIOBindingKeys.SERVER_OPTIONS,
}).toValue({
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
});
```

---

## Component Internals

### `resolveBindings()`

Reads all binding keys from the DI container and validates required ones:

| Binding | Validation | Error on Failure |
|---------|-----------|------------------|
| `SERVER_OPTIONS` | Optional, merged with defaults | — |
| `REDIS_CONNECTION` | Must be `instanceof DefaultRedisHelper` | `"Invalid instance of redisConnection"` |
| `AUTHENTICATE_HANDLER` | Must be a function (non-null) | `"Invalid authenticateFn"` |
| `CLIENT_CONNECTED_HANDLER` | Optional, checked via `isBound()` | — |

### `registerBunHook()`

Registers a post-start hook that:

1. Dynamically imports `@socket.io/bun-engine`
2. Creates a `BunEngine` instance with CORS config bridging
3. Creates `SocketIOServerHelper` with `runtime: RuntimeModules.BUN`
4. Binds the helper to `SOCKET_IO_INSTANCE`
5. Calls `serverInstance.reload()` to wire the engine's `fetch` and `websocket` handlers into the running Bun server

**CORS type bridging**: Socket.IO and `@socket.io/bun-engine` have slightly different CORS type definitions. The component extracts individual fields explicitly to avoid type mismatches without using `as any`.

### `registerNodeHook()`

Registers a post-start hook that:

1. Gets the HTTP server instance via `getServerInstance()`
2. Creates `SocketIOServerHelper` with `runtime: RuntimeModules.NODE`
3. Binds the helper to `SOCKET_IO_INSTANCE`

Node mode is simpler because Socket.IO natively attaches to `node:http.Server`.

---

## Post-Start Hook System

The component relies on `AbstractApplication`'s post-start hook system:

### API

```typescript
// Register a hook (during binding phase)
application.registerPostStartHook({
  identifier: string,     // Unique name for logging
  hook: () => ValueOrPromise<void>,  // Async function to execute
});

// Get the server instance (available after start)
application.getServerInstance<T>(): T | undefined;
```

### How Hooks Execute

```
executePostStartHooks()
  ├── Hook 1: "socket-io-initialize"
  │     ├── performance.now() → start
  │     ├── await hook()
  │     └── log: "Executed hook | identifier: socket-io-initialize | took: 12.5 (ms)"
  ├── Hook 2: "another-hook"
  │     └── ...
  └── (hooks run sequentially in registration order)
```

- Hooks run **sequentially** (not parallel) to guarantee ordering
- Each hook is timed with `performance.now()` for diagnostics
- If a hook throws, it propagates to `start()` and the server fails to start

---

## Graceful Shutdown

Always shut down the Socket.IO server before stopping the application:

```typescript
override async stop(): Promise<void> {
  // 1. Shut down Socket.IO (disconnects all clients, closes IO server, quits Redis)
  const socketIOHelper = this.get<SocketIOServerHelper>({
    key: SocketIOBindingKeys.SOCKET_IO_INSTANCE,
    isOptional: true,
  });

  if (socketIOHelper) {
    await socketIOHelper.shutdown();
  }

  // 2. Disconnect Redis helper
  if (this.redisHelper) {
    await this.redisHelper.disconnect();
  }

  // 3. Stop the HTTP/Bun server
  await super.stop();
}
```

### Shutdown Sequence

```
socketIOHelper.shutdown()
  ├── Disconnect all tracked clients
  │     ├── clearInterval(ping)
  │     ├── clearTimeout(authenticateTimeout)
  │     └── socket.disconnect()
  ├── clients.clear()
  ├── io.close() — closes the Socket.IO server
  └── Redis cleanup
        ├── redisPub.quit()
        ├── redisSub.quit()
        └── redisEmitter.quit()
```

---

## Complete Example

A full working example is available at `examples/socket-io-test/`. It demonstrates:

| Feature | Implementation |
|---------|---------------|
| Application setup | `src/application.ts` — bindings, component registration, graceful shutdown |
| REST endpoints | `src/controllers/socket-test.controller.ts` — 9 endpoints for Socket.IO management |
| Event handling | `src/services/socket-event.service.ts` — chat, echo, room management |
| Automated test client | `client.ts` — 15+ test cases covering all features |

### REST API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/socket/info` | Server status + connected client count |
| `GET` | `/socket/clients` | List all connected client IDs |
| `GET` | `/socket/health` | Health check (is SocketIO ready?) |
| `POST` | `/socket/broadcast` | Broadcast `{ topic, data }` to all clients |
| `POST` | `/socket/room/{roomId}/send` | Send `{ topic, data }` to a room |
| `POST` | `/socket/client/{clientId}/send` | Send `{ topic, data }` to a specific client |
| `POST` | `/socket/client/{clientId}/join` | Join client to `{ rooms: string[] }` |
| `POST` | `/socket/client/{clientId}/leave` | Remove client from `{ rooms: string[] }` |
| `GET` | `/socket/client/{clientId}/rooms` | List rooms a client belongs to |

### Running the Example

```bash
# Start the server
cd examples/socket-io-test
bun run server:dev

# In another terminal — run automated tests
bun client.ts
```

---

## Troubleshooting

### "SocketIO not initialized"

**Cause**: You're trying to use `SocketIOServerHelper` before the server has started (e.g., during DI construction).

**Fix**: Use the lazy getter pattern shown in [Step 3](#step-3-use-in-servicescontrollers). Never `@inject` `SOCKET_IO_INSTANCE` directly in a constructor — it doesn't exist yet at construction time.

### "Invalid instance of redisConnection"

**Cause**: The value bound to `REDIS_CONNECTION` is not an instance of `DefaultRedisHelper` (or its subclass `RedisHelper`).

**Fix**: Use `RedisHelper` (recommended) or `DefaultRedisHelper`:

```typescript
// Correct
this.bind({ key: SocketIOBindingKeys.REDIS_CONNECTION })
  .toValue(new RedisHelper({ name: 'socket-io', host, port, password }));

// Wrong — raw ioredis client
this.bind({ key: SocketIOBindingKeys.REDIS_CONNECTION })
  .toValue(new Redis(6379));  // This is NOT a DefaultRedisHelper!
```

### "Cannot find module '@socket.io/bun-engine'"

**Cause**: Running on Bun runtime without the optional peer dependency installed.

**Fix**: `bun add @socket.io/bun-engine`

### Socket.IO connects but events aren't received

**Cause**: Clients must emit `authenticate` after connecting. Unauthenticated clients are disconnected after the timeout (default: 10 seconds).

**Fix**: Ensure your client emits the authenticate event:

```typescript
socket.on('connect', () => {
  socket.emit('authenticate');
});

socket.on('authenticated', (data) => {
  // Now ready to send/receive events
});
```

---

## See Also

- **Related Concepts:**
  - [Components Overview](/guides/core-concepts/components) — Component system basics
  - [Application](/guides/core-concepts/application/) — Registering components

- **Other Components:**
  - [Components Index](./index) — All built-in components

- **References:**
  - [Socket.IO Helper](/references/helpers/socket-io) — Full `SocketIOServerHelper` + `SocketIOClientHelper` API reference

- **External Resources:**
  - [Socket.IO Documentation](https://socket.io/docs/) — Official docs
  - [Socket.IO Redis Adapter](https://socket.io/docs/v4/redis-adapter/) — Horizontal scaling guide
  - [@socket.io/bun-engine](https://github.com/socketio/bun-engine) — Bun runtime support

- **Tutorials:**
  - [Real-Time Chat](/guides/tutorials/realtime-chat) — Building a chat app with Socket.IO

- **Changelog:**
  - [2026-02-06: Socket.IO Integration Fix](/changelogs/2026-02-06-socket-io-integration-fix) — Lifecycle timing fix + Bun runtime support
