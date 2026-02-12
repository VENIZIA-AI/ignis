# Socket.IO -- API Reference

> Architecture deep dive, method signatures, internals, and type definitions.

## Architecture

The component integrates Socket.IO into the Ignis application lifecycle with runtime-specific initialization (Node.js vs Bun).

#### Architecture Diagram
```
                         SocketIOComponent
                        +----------------------------------------------+
                        |                                              |
                        |  binding()                                   |
                        |    |-- resolveBindings()                     |
                        |    |     |-- SERVER_OPTIONS                  |
                        |    |     |-- REDIS_CONNECTION                |
                        |    |     |-- AUTHENTICATE_HANDLER            |
                        |    |     |-- VALIDATE_ROOM_HANDLER           |
                        |    |     +-- CLIENT_CONNECTED_HANDLER        |
                        |    |                                         |
                        |    +-- RuntimeModules.detect()               |
                        |          |-- BUN  -> registerBunHook()       |
                        |          +-- NODE -> registerNodeHook()      |
                        |                                              |
                        |  (Post-start hooks execute after server)     |
                        |    |-- Creates SocketIOServerHelper          |
                        |    |-- await socketIOHelper.configure()      |
                        |    |-- Binds to SOCKET_IO_INSTANCE           |
                        |    +-- Wires into server (runtime-specific)  |
                        +----------------------------------------------+
```

### Lifecycle Integration

The component uses the **post-start hook** system to solve a fundamental timing problem: Socket.IO needs a running server instance, but components are initialized *before* the server starts.

#### Application Lifecycle Diagram
```
Application Lifecycle
=====================

  +------------------+
  |  preConfigure()  | <-- Register SocketIOComponent here
  +--------+---------+
           |
  +--------v---------+
  |  initialize()    | <-- Component.binding() runs here
  |                  |   Resolves bindings, registers post-start hook
  +--------+---------+
           |
  +--------v---------+
  | setupMiddlewares  |
  +--------+---------+
           |
  +--------v-----------------------+
  | startBunModule()  OR          | <-- Server starts, instance created
  | startNodeModule()             |
  +--------+-----------------------+
           |
  +--------v--------------------------+
  | executePostStartHooks()           | <-- SocketIOServerHelper created HERE
  |   +-- socket-io-initialize        |   Server instance is now available
  +-----------------------------------+
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
| **Fetch Handler** | Not needed -- HTTP server handles upgrades | Custom fetch wraps Hono fetch, routes WS upgrades to engine |
| **CORS** | Handled by `socket.io` CORS options | Handled by Bun engine options (requires explicit field bridging) |
| **Server Access** | Direct -- Socket.IO attaches to HTTP server | `server.reload({ fetch, websocket })` to hot-swap handlers |

### Runtime Differences -- Deep Dive

#### Bun Runtime

The Bun handler creates a custom fetch function that intercepts WebSocket upgrade requests:

1. Checks if the request path matches the Socket.IO path (`serverOptions.path`, default `'/io'`)
2. If yes, delegates to `@socket.io/bun-engine` via `engine.handleRequest(req, server)` for WebSocket protocol handling
3. If no, delegates to Hono's normal `server.fetch(req, server)` handler

#### Bun Fetch Handler Source
```typescript
function createBunFetchHandler(opts: {
  engine: any;
  enginePath: string;
  honoServer: OpenAPIHono;
}): (req: Request, server: TBunServerInstance) => Response | Promise<Response> {
  const { engine, enginePath, honoServer } = opts;

  return (req: Request, server: TBunServerInstance): Response | Promise<Response> => {
    const url = new URL(req.url);

    if (!url.pathname.startsWith(enginePath)) {
      return honoServer.fetch(req, server);
    }

    return engine.handleRequest(req, server) ?? new Response(null, { status: 404 });
  };
}
```

**CORS type bridging**: Socket.IO and `@socket.io/bun-engine` have slightly different CORS type definitions. The component extracts individual CORS fields explicitly to avoid type mismatches without using `as any`:

#### Bun Engine CORS Bridging
```typescript
const corsConfig = typeof serverOptions.cors === 'object' ? serverOptions.cors : undefined;
const engine = new BunEngine({
  path: serverOptions.path ?? '/socket.io/',
  ...(corsConfig && {
    cors: {
      origin: corsConfig.origin as string | RegExp | (string | RegExp)[] | undefined,
      methods: corsConfig.methods,
      credentials: corsConfig.credentials,
      allowedHeaders: corsConfig.allowedHeaders,
      exposedHeaders: corsConfig.exposedHeaders,
      maxAge: corsConfig.maxAge,
    },
  }),
});
```

#### Node.js Runtime

Node mode is simpler because Socket.IO natively attaches to `node:http.Server`. The handler creates a `SocketIOServerHelper` with `runtime: RuntimeModules.NODE` and passes the HTTP server instance directly:

#### Node.js Handler Source
```typescript
async function createNodeSocketIOHelper(opts: {
  serverOptions: Partial<IServerOptions>;
  httpServer: TNodeServerInstance;
  resolvedBindings: IResolvedBindings;
}): Promise<SocketIOServerHelper> {
  const { serverOptions, httpServer, resolvedBindings } = opts;
  const { redisConnection, authenticateFn, validateRoomFn, clientConnectedFn } = resolvedBindings;

  const socketIOHelper = new SocketIOServerHelper({
    runtime: RuntimeModules.NODE,
    identifier: serverOptions.identifier!,
    server: httpServer,
    serverOptions,
    redisConnection,
    authenticateFn,
    validateRoomFn,
    clientConnectedFn,
  });
  await socketIOHelper.configure();

  return socketIOHelper;
}
```

## Server Helper API Reference

### `SocketIOServerHelper` Constructor

The helper uses a **discriminated union** for its constructor options, keyed on `runtime`:

#### `TSocketIOServerOptions` Type
```typescript
interface ISocketIOServerBaseOptions {
  identifier: string;
  serverOptions: Partial<ServerOptions>;
  redisConnection: DefaultRedisHelper;
  defaultRooms?: string[];               // Default: ['io-default', 'io-notification']
  authenticateTimeout?: number;           // Default: 10_000 (10 seconds)
  pingInterval?: number;                  // Default: 30_000 (30 seconds)

  authenticateFn: TSocketIOAuthenticateFn;
  validateRoomFn?: TSocketIOValidateRoomFn;
  clientConnectedFn?: TSocketIOClientConnectedFn;
}

interface ISocketIOServerNodeOptions extends ISocketIOServerBaseOptions {
  runtime: typeof RuntimeModules.NODE;
  server: HTTPServer;                     // node:http.Server instance
}

interface ISocketIOServerBunOptions extends ISocketIOServerBaseOptions {
  runtime: typeof RuntimeModules.BUN;
  engine: any;                            // @socket.io/bun-engine Server instance
}

type TSocketIOServerOptions = ISocketIOServerNodeOptions | ISocketIOServerBunOptions;
```

During construction:

1. Sets `identifier`, `runtime`, `serverOptions`, callback functions
2. Sets defaults: `authenticateTimeout` = 10s, `pingInterval` = 30s, `defaultRooms` = `['io-default', 'io-notification']`
3. Calls `setRuntime()` -- validates and stores the server or engine
4. Calls `initRedisClients()` -- creates 3 duplicated Redis clients from the connection

> [!IMPORTANT]
> Redis clients are **duplicated** from the parent connection (`client.duplicate()`). This means the helper uses 3 independent connections (pub, sub, emitter) that inherit config from the parent but maintain separate state. The parent `RedisHelper` connection is not consumed.

### `configure()` -- Server Initialization

The `configure()` method is the main initialization entry point, called after construction:

```
configure()
  |-- Register error handlers on all 3 Redis clients
  |-- Connect any clients in 'wait' status (lazyConnect mode)
  |-- await Promise.all([redisPub.ready, redisSub.ready, redisEmitter.ready])
  |-- initIOServer()
  |     |-- NODE: new IOServer(httpServer, serverOptions)
  |     +-- BUN:  new IOServer() -> io.bind(bunEngine)
  |-- io.adapter(createAdapter(redisPub, redisSub))
  |-- emitter = new Emitter(redisEmitter)
  +-- io.on('connection', onClientConnect)
```

> [!NOTE]
> The `configure()` method is **async** because it waits for all 3 Redis connections to be ready before proceeding. If any Redis client fails to connect, the error propagates and the server will not start.

### Public Methods

#### `getIOServer()`

```typescript
getIOServer(): IOServer
```

Returns the underlying `socket.io` `Server` instance. Use this for direct access to Socket.IO APIs not exposed by the helper (e.g., `io.of('/namespace')`, `io.fetchSockets()`).

#### `getEngine()`

```typescript
getEngine(): any
```

Returns the `@socket.io/bun-engine` instance. **Throws** if the runtime is Node.js (`"Engine is only available for Bun runtime!"`).

#### `getClients()`

```typescript
// Overloaded:
getClients(): Map<string, ISocketIOClient>
getClients(opts: { id: string }): ISocketIOClient | undefined
```

When called without arguments, returns the full client map. When called with `{ id }`, returns the specific client entry or `undefined` if not found.

#### `on()`

```typescript
on<HandlerArgsType extends unknown[] = unknown[], HandlerReturnType = void>(opts: {
  topic: string;
  handler: (...args: HandlerArgsType) => ValueOrPromise<HandlerReturnType>;
}): void
```

Registers a server-level event handler on the IO server. **Throws** if `topic` is empty, `handler` is falsy, or the IO server is not initialized.

#### `ping()`

```typescript
ping(opts: { socket: IOSocket; doIgnoreAuth: boolean }): void
```

Sends a `ping` event to a specific client with `{ time: <ISO string> }`. Behavior:

- If `socket` is undefined, logs and returns
- If client is not found in the client map, logs and returns
- If `doIgnoreAuth` is `false` and the client is not `authenticated`, disconnects the client
- If `doIgnoreAuth` is `true`, sends the ping regardless of auth state

Used internally for the keep-alive interval after authentication. The `doIgnoreAuth: true` flag is used for the initial post-auth ping and the recurring interval.

#### `disconnect()`

```typescript
disconnect(opts: { socket: IOSocket }): void
```

Disconnects a specific client and cleans up resources:

1. Clears the ping interval (if set)
2. Clears the authentication timeout
3. Removes the client from the `clients` map
4. Calls `socket.disconnect()` on the underlying Socket.IO socket

If the socket is `undefined` or not tracked in the client map, the method still calls `socket.disconnect()` for safety.

#### `onClientConnect()`

```typescript
onClientConnect(opts: { socket: IOSocket }): void
```

Handles a new socket connection. Called by the `connection` event handler on the IO server. This method is public so it can be invoked externally for testing or custom connection routing.

Behavior:
1. Validates the socket exists (returns if `null`/`undefined`)
2. Checks for duplicate connections by socket ID (returns if already tracked)
3. Creates an `ISocketIOClient` entry with state `UNAUTHORIZED`
4. Starts the authentication timeout (`authenticateTimeout` ms)
5. Registers `disconnect` handler on the socket
6. Registers `authenticate` handler via `registerAuthHandler()`

#### `onClientAuthenticated()`

```typescript
onClientAuthenticated(opts: { socket: IOSocket }): void
```

Called after successful authentication. This method is public so it can be invoked externally for testing or custom auth flows.

Behavior:
1. Validates the socket and client entry exist
2. Sets client state to `AUTHENTICATED`
3. Sends an initial ping
4. Joins default rooms (`io-default`, `io-notification`)
5. Registers room handlers (`join`, `leave`)
6. Starts the ping interval
7. Emits `authenticated` event to the client with `{ id, time }`
8. Invokes the `clientConnectedFn` callback (if configured)

### Messaging via `send()`

The `send()` method uses the Redis emitter for message delivery, enabling cross-instance broadcasting:

```typescript
send(opts: {
  destination?: string;    // Socket ID, room name, or omit for broadcast
  payload: {
    topic: string;         // Event name
    data: any;             // Event payload
  };
  doLog?: boolean;         // Log the emission (default: false)
  cb?: () => void;         // Callback executed via setImmediate after emit
})
```

Key behaviors:

- All messages are **compressed** via `emitter.compress(true)`
- If `destination` is provided and non-empty, sends via `sender.to(destination).emit(topic, data)`
- If `destination` is omitted/empty, broadcasts to **all** connected clients via `sender.emit(topic, data)`
- Callback (`cb`) is executed asynchronously via `setImmediate()`, not after delivery confirmation
- Logging is opt-in (`doLog: true`) to avoid noise in high-throughput scenarios

#### `send()` Silent Failure Behavior

The `send()` method silently returns (no error, no log) in these cases:
- `payload` is falsy
- `payload.topic` is falsy
- `payload.data` is falsy

This is a deliberate design choice for fire-and-forget messaging patterns where callers do not need to know if a message was dropped due to missing fields.

> [!TIP]
> The emitter uses the Redis emitter client, so messages are delivered across all server instances in a horizontally-scaled deployment. This works even if the recipient is connected to a different server instance.

### Shutdown

```typescript
shutdown(): Promise<void>
```

Gracefully shuts down the server:

1. Iterates all tracked clients and clears their intervals/timeouts
2. Disconnects each client socket
3. Clears the client map
4. Closes the IO server (async, wrapped in a Promise)
5. Quits all 3 Redis connections (`redisPub`, `redisSub`, `redisEmitter`)

## Client Helper API Reference

`SocketIOClientHelper` extends `BaseHelper` and provides a managed Socket.IO client. It wraps the `socket.io-client` library with lifecycle callbacks, error-safe event subscription, and authentication state tracking.

### Constructor

```typescript
constructor(opts: ISocketIOClientOptions)
```

#### `ISocketIOClientOptions` Interface

```typescript
interface ISocketIOClientOptions {
  identifier: string;
  host: string;
  options: IOptions;

  // Lifecycle callbacks (all optional)
  onConnected?: () => ValueOrPromise<void>;
  onDisconnected?: (reason: string) => ValueOrPromise<void>;
  onError?: (error: Error) => ValueOrPromise<void>;
  onAuthenticated?: () => ValueOrPromise<void>;
  onUnauthenticated?: (message: string) => ValueOrPromise<void>;
}
```

#### `IOptions` Interface

```typescript
interface IOptions extends SocketOptions {
  path: string;
  extraHeaders: Record<string | symbol | number, any>;
}
```

`IOptions` extends `SocketOptions` from `socket.io-client` with two required fields:
- `path` -- the Socket.IO endpoint path (must match the server's `path` option, e.g., `'/io'`)
- `extraHeaders` -- headers sent with every request, commonly used for `authorization` tokens

#### Constructor Behavior

1. Calls `super({ scope: opts.identifier })` to initialize `BaseHelper` with scoped logging
2. Stores the `identifier`, `host`, `options`, and all lifecycle callbacks
3. Immediately calls `configure()` to create the socket and register internal handlers

### `configure()`

```typescript
configure(): void
```

Creates the `socket.io-client` `Socket` instance and registers all internal event handlers. If the client is already established (i.e., `configure()` was already called), logs a message and returns early.

Registered handlers:

| Event | Internal Behavior |
|-------|-------------------|
| `connect` | Logs connection, invokes `onConnected` callback |
| `disconnect` | Logs disconnection with reason, resets state to `unauthorized`, invokes `onDisconnected` callback |
| `connect_error` | Logs the error, invokes `onError` callback |
| `authenticated` | Logs auth data, sets state to `authenticated`, invokes `onAuthenticated` callback |
| `unauthenticated` | Logs warning with auth data, resets state to `unauthorized`, invokes `onUnauthenticated` callback with the message |
| `ping` | Logs debug-level ping received |

All lifecycle callbacks are wrapped in `Promise.resolve(...).catch(...)` to prevent callback errors from crashing the client.

### `getState()`

```typescript
getState(): TSocketIOClientState
```

Returns the current authentication state: `'unauthorized'`, `'authenticating'`, or `'authenticated'`.

#### `TSocketIOClientState` Type

```typescript
type TSocketIOClientState = TConstValue<typeof SocketIOClientStates>;
// Resolves to: 'unauthorized' | 'authenticating' | 'authenticated'
```

### `getSocketClient()`

```typescript
getSocketClient(): Socket
```

Returns the raw `socket.io-client` `Socket` instance. Use this for direct access to Socket.IO client APIs not exposed by the helper (e.g., `socket.io`, `socket.connected`, `socket.id`).

### `authenticate()`

```typescript
authenticate(): void
```

Initiates the authentication handshake by emitting the `authenticate` event to the server. The server will validate credentials from the socket handshake (headers, query, `auth` object) and respond with `authenticated` or `unauthenticated`.

Guard conditions (no-op with warning log):
- Socket is not connected (`!this.client?.connected`)
- Current state is not `unauthorized` (prevents double-auth or re-auth while authenticating)

On call:
1. Sets state to `authenticating`
2. Emits `SocketIOConstants.EVENT_AUTHENTICATE` (value: `'authenticate'`)

### `subscribe()`

```typescript
subscribe<T = unknown>(opts: {
  event: string;
  handler: TSocketIOEventHandler<T>;
  ignoreDuplicate?: boolean;  // default: true
}): void
```

Subscribes to a Socket.IO event with automatic error safety.

Guard conditions (no-op with warning log):
- `handler` is falsy
- `ignoreDuplicate` is `true` (default) and the event already has listeners

#### Handler Wrapping Pattern

Handlers are wrapped in a **dual try-catch** that catches both synchronous throws and asynchronous rejections:

```typescript
const wrappedHandler = (data: T) => {
  try {
    Promise.resolve(handler(data)).catch(error => {
      logger.error('Handler error | event: %s | error: %s', event, error);
    });
  } catch (error) {
    logger.error('Handler error | event: %s | error: %s', event, error);
  }
};
```

The outer `try-catch` handles synchronous throws from the handler. The `.catch()` on `Promise.resolve()` handles async rejections. This ensures handler errors never crash the client.

#### `TSocketIOEventHandler<T>` Type

```typescript
type TSocketIOEventHandler<T = unknown> = (data: T) => ValueOrPromise<void>;
```

Handlers can be synchronous (`void`) or asynchronous (`Promise<void>`). Both are handled correctly by the wrapping pattern.

### `subscribeMany()`

```typescript
subscribeMany(opts: {
  events: Record<string, TSocketIOEventHandler>;
  ignoreDuplicate?: boolean;
}): void
```

Batch subscribes to multiple events. Iterates over the `events` record and calls `subscribe()` for each entry.

### `unsubscribe()`

```typescript
unsubscribe(opts: { event: string; handler?: TSocketIOEventHandler }): void
```

Removes event listeners. If `handler` is provided, removes only that specific handler via `socket.off(event, handler)`. If `handler` is omitted, removes **all** handlers for the event via `socket.off(event)`.

No-op if the socket has no listeners for the event.

### `unsubscribeMany()`

```typescript
unsubscribeMany(opts: { events: string[] }): void
```

Removes all handlers for each event in the array. Calls `unsubscribe({ event })` for each entry.

### `connect()`

```typescript
connect(): void
```

Manually connects the socket. No-op with an info log if the client is not initialized. Useful when `autoConnect: false` is set in the options.

### `disconnect()`

```typescript
disconnect(): void
```

Manually disconnects the socket. No-op with an info log if the client is not initialized.

### `emit()`

```typescript
emit<T = unknown>(opts: {
  topic: string;
  data: T;
  doLog?: boolean;   // default: false
  cb?: () => void;
}): void
```

Emits an event to the server.

**Throws** (via `getError()`) if:
- The socket is not connected (`statusCode: 400`, message: `"Invalid socket client state to emit"`)
- The `topic` is falsy (`statusCode: 400`, message: `"Topic is required to emit"`)

If `cb` is provided, it is executed via `setImmediate()` (asynchronously, not after server acknowledgment). If `doLog` is `true`, logs the topic and data.

### `joinRooms()`

```typescript
joinRooms(opts: { rooms: string[] }): void
```

Emits a `join` event to the server with `{ rooms }`. The server will validate via `validateRoomFn` and perform the actual join.

No-op with warning log if the socket is not connected.

### `leaveRooms()`

```typescript
leaveRooms(opts: { rooms: string[] }): void
```

Emits a `leave` event to the server with `{ rooms }`. The server performs the actual leave without validation.

No-op with warning log if the socket is not connected.

### `shutdown()`

```typescript
shutdown(): void
```

Clean shutdown of the client:

1. Calls `removeAllListeners()` on the underlying socket to prevent memory leaks
2. Disconnects if still connected
3. Resets state to `unauthorized`

## Internals

### `resolveBindings()`

Reads all binding keys from the DI container and validates required ones:

| Binding | Validation | Error on Failure |
|---------|-----------|------------------|
| `SERVER_OPTIONS` | Optional, merged with defaults via `Object.assign()` | -- |
| `REDIS_CONNECTION` | Must be `instanceof DefaultRedisHelper` | `"Invalid instance of redisConnection | Please init connection with RedisHelper for single redis connection or RedisClusterHelper for redis cluster mode!"` |
| `AUTHENTICATE_HANDLER` | Must be a function (non-null) | `"Invalid authenticateFn to setup io socket server!"` |
| `VALIDATE_ROOM_HANDLER` | Optional, resolved from container, `null` coerced to `undefined` | -- |
| `CLIENT_CONNECTED_HANDLER` | Optional, resolved from container, `null` coerced to `undefined` | -- |

### `registerBunHook()`

Registers a post-start hook that:

1. Calls `createBunEngine({ serverOptions })` which dynamically imports `@socket.io/bun-engine` and creates a `BunEngine` instance with CORS config bridging
2. Creates `SocketIOServerHelper` with `runtime: RuntimeModules.BUN`
3. Awaits `socketIOHelper.configure()` which waits for all Redis connections to be ready before initializing the adapter and emitter
4. Binds the helper to `SOCKET_IO_INSTANCE`
5. Gets the Bun server instance and Hono server, then calls `serverInstance.reload()` to wire the engine's `fetch` and `websocket` handlers into the running Bun server

### `createBunEngine()` Function

```typescript
async function createBunEngine(opts: {
  serverOptions: Partial<ServerOptions>;
}): Promise<{ engine: any; engineHandler: any }>
```

Dynamically imports `@socket.io/bun-engine`, creates a `BunEngine` with CORS bridging, and returns both the `engine` and the `engineHandler` (from `engine.handler()`). The `engineHandler` provides the `websocket` handler that Bun's server needs.

### `createBunFetchHandler()` Function

```typescript
function createBunFetchHandler(opts: {
  engine: any;
  enginePath: string;
  honoServer: OpenAPIHono;
}): (req: Request, server: TBunServerInstance) => Response | Promise<Response>
```

Returns a fetch handler function that routes requests:
- If `url.pathname` starts with `enginePath`, delegates to `engine.handleRequest(req, server)` (returns 404 Response if `handleRequest` returns nullish)
- Otherwise, delegates to `honoServer.fetch(req, server)` for normal Hono routing

### `registerNodeHook()`

Registers a post-start hook that:

1. Gets the HTTP server instance via `getServerInstance()`
2. Validates the server instance exists (throws `"HTTP server not available for Node.js runtime!"` if not)
3. Calls `createNodeSocketIOHelper()` which creates `SocketIOServerHelper` with `runtime: RuntimeModules.NODE` and the HTTP server, then awaits `configure()`
4. Binds the helper to `SOCKET_IO_INSTANCE`

Node mode is simpler because Socket.IO natively attaches to `node:http.Server`.

### Redis 3-Client Architecture

The server helper creates 3 independent Redis connections from a single `DefaultRedisHelper`:

```
RedisHelper (parent -- NOT consumed)
  |
  +-- client.duplicate() --> redisPub    (for Redis adapter -- publishes)
  |
  +-- client.duplicate() --> redisSub    (for Redis adapter -- subscribes)
  |
  +-- client.duplicate() --> redisEmitter (for @socket.io/redis-emitter -- message delivery)
```

**Why 3 clients?**
- `@socket.io/redis-adapter` requires separate pub and sub clients because a Redis connection in subscribe mode cannot execute other commands
- `@socket.io/redis-emitter` uses its own client to emit messages independently of the adapter, enabling cross-instance broadcasting even from contexts without a direct Socket.IO reference
- The parent `RedisHelper` connection remains independent and is not consumed -- it can be used for other purposes (e.g., caching, sessions)

**`TRedisClient` type:**
```typescript
type TRedisClient = Redis | Cluster;
```

This supports both single-instance `Redis` and `Cluster` connections from ioredis, making the helper transparent to the Redis deployment topology.

### `setRuntime()` -- Runtime Validation

The private `setRuntime()` method validates the constructor options based on the `runtime` discriminant:

| Runtime | Required Field | Error on Missing |
|---------|---------------|------------------|
| `RuntimeModules.NODE` | `opts.server` (HTTPServer) | `"Invalid HTTP server for Node.js runtime!"` |
| `RuntimeModules.BUN` | `opts.engine` (BunEngine) | `"Invalid @socket.io/bun-engine instance for Bun runtime!"` |
| Other | -- | `"Unsupported runtime!"` |

### `initRedisClients()` -- Redis Initialization

```typescript
private initRedisClients(redisConnection: TSocketIOServerOptions['redisConnection']): void
```

**Throws** if `redisConnection` is falsy: `"Invalid redis connection to config socket.io adapter!"`

Creates 3 duplicated clients from the parent connection's underlying ioredis client.

### `initIOServer()` -- IO Server Initialization

Called during `configure()` after Redis connections are ready:

| Runtime | Initialization |
|---------|---------------|
| `RuntimeModules.NODE` | `this.io = new IOServer(this.server, this.serverOptions)` |
| `RuntimeModules.BUN` | `this.io = new IOServer()` then `this.io.bind(this.bunEngine)` |
| Other | Throws `"Unsupported runtime: <runtime>"` |

Additional validation errors:
- Node.js without `this.server`: `"[DANGER] Invalid HTTP server instance to init Socket.io server!"`
- Bun without `this.bunEngine`: `"[DANGER] Invalid @socket.io/bun-engine instance to init Socket.io server!"`

### Connection Lifecycle

When a client connects, the server manages a strict authentication flow:

```
Client connects
  |
  +-- onClientConnect({ socket })
  |     +-- Validate socket exists and not duplicate
  |     +-- Create ISocketIOClient entry (state: UNAUTHORIZED)
  |     +-- Start authenticateTimeout (10s default)
  |     +-- Register 'disconnect' handler
  |     +-- Register 'authenticate' handler
  |
  +-- Client emits 'authenticate'
  |     +-- Validate client exists and state is UNAUTHORIZED
  |     +-- Set state to AUTHENTICATING
  |     +-- Call authenticateFn(handshake)
  |           +-- Success -> onClientAuthenticated()
  |           |     +-- Set state to AUTHENTICATED
  |           |     +-- Send initial ping
  |           |     +-- Join default rooms (io-default, io-notification)
  |           |     +-- Register 'join' and 'leave' room handlers
  |           |     +-- Start ping interval (30s default)
  |           |     +-- Emit 'authenticated' with { id, time }
  |           |     +-- Call clientConnectedFn({ socket }) if provided
  |           +-- Failure -> emit 'unauthenticated' -> disconnect
  |
  +-- Timeout (10s) -> disconnect if not AUTHENTICATED
```

#### Authentication Failure -- Two Code Paths

The `registerAuthHandler()` method handles authentication results through two distinct code paths:

**Path 1: `authenticateFn` returns `false`** (`.then()` handler):
- Sets client state back to `UNAUTHORIZED`
- Sends `unauthenticated` event with message: `"Invalid token to authenticate! Please login again!"`
- Disconnects after send via `setImmediate` callback
- No error logging (this is an expected outcome)

**Path 2: `authenticateFn` throws an error** (`.catch()` handler):
- Sets client state back to `UNAUTHORIZED`
- Logs the error at error level
- Sends `unauthenticated` event with message: `"Failed to authenticate connection! Please login again!"`
- Sets `doLog: true` on the send call (unlike Path 1)
- Disconnects after send via `setImmediate` callback

Both paths also handle the edge case where the client disconnected *during* authentication -- they check `this.clients.has(id)` before proceeding.

#### `ISocketIOClient` Interface
```typescript
interface ISocketIOClient {
  id: string;
  socket: IOSocket;
  state: TSocketIOClientState;              // 'unauthorized' | 'authenticating' | 'authenticated'
  interval?: NodeJS.Timeout;                 // Ping interval (set after auth)
  authenticateTimeout: NodeJS.Timeout;       // Auth deadline (cleared on success)
}
```

### Room Handlers

Room join/leave handlers are registered after successful authentication:

- **`join`**: Client emits `{ rooms: string[] }`. If `validateRoomFn` is configured, only the rooms it returns are joined. If `validateRoomFn` is **not** configured, join is silently rejected with a warning log.
- **`leave`**: Client emits `{ rooms: string[] }`. Leave is always allowed -- no validation function needed.

Both handlers parse the payload defensively: `const { rooms = [] } = payload || { rooms: [] }`. Empty `rooms` arrays are silently ignored.

Join handler validation errors are caught and logged but do not disconnect the client.

> [!WARNING]
> Without a `validateRoomFn` bound, clients **cannot** join any custom rooms. They will only be in the default rooms (`io-default`, `io-notification`). This is a security-by-default design.

## Types Reference

### Server Types

```typescript
// Server constructor options -- discriminated union on 'runtime'
type TSocketIOServerOptions = ISocketIOServerNodeOptions | ISocketIOServerBunOptions;

// Base options shared by both runtimes
interface ISocketIOServerBaseOptions {
  identifier: string;
  serverOptions: Partial<ServerOptions>;
  redisConnection: DefaultRedisHelper;
  defaultRooms?: string[];
  authenticateTimeout?: number;
  pingInterval?: number;
  authenticateFn: TSocketIOAuthenticateFn;
  validateRoomFn?: TSocketIOValidateRoomFn;
  clientConnectedFn?: TSocketIOClientConnectedFn;
}

// Node.js runtime variant
interface ISocketIOServerNodeOptions extends ISocketIOServerBaseOptions {
  runtime: typeof RuntimeModules.NODE;
  server: HTTPServer;
}

// Bun runtime variant
interface ISocketIOServerBunOptions extends ISocketIOServerBaseOptions {
  runtime: typeof RuntimeModules.BUN;
  engine: any;
}

// Tracked client entry (server-side)
interface ISocketIOClient {
  id: string;
  socket: IOSocket;
  state: TSocketIOClientState;
  interval?: NodeJS.Timeout;
  authenticateTimeout: NodeJS.Timeout;
}

// Redis client type alias
type TRedisClient = Redis | Cluster;
```

### Client Types

```typescript
// Client constructor options
interface ISocketIOClientOptions {
  identifier: string;
  host: string;
  options: IOptions;
  onConnected?: () => ValueOrPromise<void>;
  onDisconnected?: (reason: string) => ValueOrPromise<void>;
  onError?: (error: Error) => ValueOrPromise<void>;
  onAuthenticated?: () => ValueOrPromise<void>;
  onUnauthenticated?: (message: string) => ValueOrPromise<void>;
}

// Socket connection options (extends socket.io-client's SocketOptions)
interface IOptions extends SocketOptions {
  path: string;
  extraHeaders: Record<string | symbol | number, any>;
}

// Event handler type (supports sync and async)
type TSocketIOEventHandler<T = unknown> = (data: T) => ValueOrPromise<void>;

// Client state type
type TSocketIOClientState = TConstValue<typeof SocketIOClientStates>;
// Resolves to: 'unauthorized' | 'authenticating' | 'authenticated'
```

### Callback Types

```typescript
// Server authentication handler
type TSocketIOAuthenticateFn = (args: IHandshake) => ValueOrPromise<boolean>;

// Server room validation handler
type TSocketIOValidateRoomFn = (opts: {
  socket: IOSocket;
  rooms: string[];
}) => ValueOrPromise<string[]>;

// Server client connected handler
type TSocketIOClientConnectedFn = (opts: { socket: IOSocket }) => ValueOrPromise<void>;
```

### Component Types

```typescript
// Extended ServerOptions with identifier
interface IServerOptions extends ServerOptions {
  identifier: string;
}

// Resolved binding values from DI container
interface IResolvedBindings {
  redisConnection: DefaultRedisHelper;
  authenticateFn: TSocketIOAuthenticateFn;
  validateRoomFn?: TSocketIOValidateRoomFn;
  clientConnectedFn?: TSocketIOClientConnectedFn;
}
```

## Post-Start Hook System

The Socket.IO component uses post-start hooks to solve a timing problem: Socket.IO needs a running server, but components initialize before the server starts.

The component relies on `AbstractApplication`'s post-start hook system:

#### API

```typescript
// Register a hook (during binding phase)
application.registerPostStartHook({
  identifier: string,                        // Unique name for logging
  hook: () => ValueOrPromise<void>,          // Async function to execute
});

// Get the server instance (available after start)
application.getServerInstance<T>(): T | undefined;
```

#### Hook Execution Flow

```
Application.start()
  |
  +-- Bun.serve() / serve()   <-- Server created
  |
  +-- executePostStartHooks()  <-- Hooks run here
        |
        +-- SocketIOComponent hook:
              1. Get server instance via getServerInstance()
              2. Create SocketIOServerHelper with runtime-specific options
              3. Call helper.configure() to initialize Socket.IO server
              4. Bind the helper instance for injection
```

#### Detailed Hook Timing
```
executePostStartHooks()
  |-- Hook 1: "socket-io-initialize"
  |     |-- performance.now() -> start
  |     |-- await hook()
  |     +-- log: "Executed hook | identifier: socket-io-initialize | took: 12.5 (ms)"
  |-- Hook 2: "another-hook"
  |     +-- ...
  +-- (hooks run sequentially in registration order)
```

- Hooks run **sequentially** (not parallel) to guarantee ordering
- Each hook is timed with `performance.now()` for diagnostics
- If a hook throws, it propagates to `start()` and the server fails to start

#### What Happens Inside the Hook

For **Bun runtime**, the hook:

1. Calls `createBunEngine({ serverOptions })` which dynamically imports `@socket.io/bun-engine` and creates a `BunEngine` instance with CORS config bridging
2. Creates `SocketIOServerHelper` with `runtime: RuntimeModules.BUN` and the engine
3. Awaits `socketIOHelper.configure()` which connects Redis pub/sub/emitter clients, initializes the `IOServer`, and sets up the Redis adapter
4. Binds the helper to `SOCKET_IO_INSTANCE`
5. Gets the Bun server instance and Hono server
6. Calls `serverInstance.reload({ fetch, websocket })` to wire the engine's fetch and websocket handlers into the running Bun server, where `fetch` is the result of `createBunFetchHandler()` and `websocket` is from `engineHandler.websocket`

For **Node.js runtime**, the hook:

1. Gets the HTTP server instance via `getServerInstance()`
2. Validates the server instance exists (throws if not)
3. Calls `createNodeSocketIOHelper()` which creates `SocketIOServerHelper` with `runtime: RuntimeModules.NODE` and the HTTP server, then awaits `configure()`
4. Binds the helper to `SOCKET_IO_INSTANCE`

> [!NOTE]
> The hook identifier is `'socket-io-initialize'` for both runtimes. Only one runtime path executes per application.

### Graceful Shutdown

Always shut down the Socket.IO server before stopping the application:

#### Shutdown Implementation
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

#### Shutdown Flow
```
socketIOHelper.shutdown()
  |-- Disconnect all tracked clients
  |     |-- clearInterval(ping)
  |     |-- clearTimeout(authenticateTimeout)
  |     +-- socket.disconnect()
  |-- clients.clear()
  |-- io.close() -- closes the Socket.IO server (async)
  +-- Redis cleanup
        |-- redisPub.quit()
        |-- redisSub.quit()
        +-- redisEmitter.quit()
```

Client helper shutdown:
```
clientHelper.shutdown()
  |-- removeAllListeners() -- prevents memory leaks
  |-- disconnect() -- if still connected
  +-- state = UNAUTHORIZED
```

## See Also

- [Setup & Configuration](./) -- Quick reference, installation, bindings, constants
- [Usage & Examples](./usage) -- Server-side usage, client helper, advanced patterns
- [Error Reference](./errors) -- Error conditions and troubleshooting
