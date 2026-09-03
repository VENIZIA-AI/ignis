---
title: Socket.IO Component - Full Reference
description: Binding keys, configuration options, event payloads, method signatures, lifecycle diagrams, and internals
difficulty: intermediate
---

# Socket.IO Component Reference

Every binding key, configuration option, event payload, and internal mechanism of `SocketIOComponent`, `SocketIOServerHelper`, and `SocketIOClientHelper`. For the task-oriented walkthrough, see [Usage & Examples](./usage).

**Files:**

- [`packages/core-server/src/components/socket-io/component.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/socket-io/component.ts)
- [`packages/core-server/src/components/socket-io/common/keys.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/socket-io/common/keys.ts)
- [`packages/core-server/src/components/socket-io/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/socket-io/common/types.ts)
- [`packages/core-server/src/components/socket-io/handlers/bun.handler.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/socket-io/handlers/bun.handler.ts)
- [`packages/core-server/src/components/socket-io/handlers/node.handler.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/socket-io/handlers/node.handler.ts)
- [`packages/helpers/src/modules/socket/socket-io/server/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/socket-io/server/helper.ts)
- [`packages/helpers/src/modules/socket/socket-io/client/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/socket-io/client/helper.ts)
- [`packages/helpers/src/modules/socket/socket-io/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/socket-io/common/constants.ts)

## Find what you need

| You want to | Go to |
|---|---|
| See every default server option | [Default server options](#default-server-options) |
| Find a binding key, its type, or whether it's required | [Binding keys](#binding-keys) |
| Look up an event name or default room | [System events and rooms](#system-events-and-rooms) |
| Understand the client authentication states | [Client states](#client-states) |
| Compare Node.js vs Bun behavior | [Runtime-specific behavior](#runtime-specific-behavior) |
| Call a method on the server helper | [Server helper: public methods](#server-helper-public-methods) |
| Send a message that reaches another server instance | [Messaging via `send()`](#messaging-via-send) |
| Call a method on the client helper | [Client helper: public methods](#client-helper-public-methods) |
| Understand the post-start hook / boot lifecycle | [Lifecycle integration](#lifecycle-integration) |
| See why one Redis connection becomes three | [Redis 3-client architecture](#redis-3-client-architecture) |
| Read the full TypeScript type definitions | [Types reference](#types-reference) |
| Look up an exact error message | [Error Reference](./errors) |

## Quick reference

| Item | Value |
|---|---|
| Package | `@venizia/ignis` (core component) + `@venizia/ignis-helpers` (helper classes) |
| Component class | `SocketIOComponent` |
| Server helper | [`SocketIOServerHelper`](/extensions/helpers/socket-io/) |
| Client helper | [`SocketIOClientHelper`](/extensions/helpers/socket-io/) |
| Runtimes | Node.js (`@hono/node-server`) and Bun (native) |
| Scaling | `@socket.io/redis-adapter` + `@socket.io/redis-emitter` (`ioredis`) |

## Import paths

`SocketIOComponent` and `SocketIOBindingKeys` are exported only from the `@venizia/ignis/socket-io` subpath - never from the `@venizia/ignis` root barrel.

```typescript
// Core - subpath import only
import { SocketIOComponent, SocketIOBindingKeys } from '@venizia/ignis/socket-io';

// Helpers - subpath import
import { SocketIOServerHelper, SocketIOClientHelper, SocketIOConstants } from '@venizia/ignis-helpers/socket-io';
import type { TSocketIOAuthenticateFn, TSocketIOValidateRoomFn } from '@venizia/ignis-helpers/socket-io';
```

## Configuration reference

### Default server options

The component applies these defaults whenever `SocketIOBindingKeys.SERVER_OPTIONS` is unbound or only partially overridden.

| Option | Default | Description |
|---|---|---|
| `identifier` | `'SOCKET_IO_SERVER'` | Unique identifier for the helper instance |
| `path` | `'/io'` | URL path for the Socket.IO handshake and polling |
| `cors.origin` | `'*'` | Allowed origins - restrict this in production |
| `cors.methods` | `['GET', 'POST']` | Allowed HTTP methods for CORS preflight |
| `cors.preflightContinue` | `false` | Pass preflight to the next handler |
| `cors.optionsSuccessStatus` | `204` | Status code for a successful OPTIONS request |
| `cors.credentials` | `true` | Allow cookies and auth headers |
| `perMessageDeflate.threshold` | `4096` | Minimum message size to compress, in bytes |
| `perMessageDeflate.concurrencyLimit` | `20` | Max concurrent compression operations |
| `perMessageDeflate.clientNoContextTakeover` | `true` | Client releases its compression context after each message |
| `perMessageDeflate.serverNoContextTakeover` | `true` | Server releases its compression context after each message |
| `perMessageDeflate.serverMaxWindowBits` | `10` | Server-side max window size (2^10 = 1 KB) |

> [!WARNING]
> The default `cors.origin: '*'` is for development only. Restrict it to your domains in production.

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

### Custom configuration

Bind custom server options before registering the component:

```typescript
import { SocketIOBindingKeys } from '@venizia/ignis/socket-io';
import type { ServerOptions } from 'socket.io';

const customOptions: Partial<ServerOptions> = {
  path: '/socket.io',
  cors: { origin: ['https://myapp.com'], methods: ['GET', 'POST'], credentials: true },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6, // 1MB
};

this.bind<Partial<ServerOptions>>({ key: SocketIOBindingKeys.SERVER_OPTIONS }).toValue(customOptions);
this.component(SocketIOComponent);
```

> [!NOTE]
> `identifier` belongs to the component's `IServerOptions` interface, which extends Socket.IO's native `ServerOptions` - it's not a Socket.IO option itself. Set it by including it in the bound options object.

### Binding keys

| Binding key | Constant | Type | Required | Default |
|---|---|---|---|---|
| `@app/socket-io/server-options` | `SERVER_OPTIONS` | `Partial<ServerOptions>` | No | [Default server options](#default-server-options) |
| `@app/socket-io/redis-connection` | `REDIS_CONNECTION` | `IRedisHelper` (`RedisSingleHelper` / `RedisClusterHelper` / `RedisSentinelHelper`) | **Yes** | `null` |
| `@app/socket-io/authenticate-handler` | `AUTHENTICATE_HANDLER` | `TSocketIOAuthenticateFn` | **Yes** | `null` |
| `@app/socket-io/validate-room-handler` | `VALIDATE_ROOM_HANDLER` | `TSocketIOValidateRoomFn` | No | `null` |
| `@app/socket-io/client-connected-handler` | `CLIENT_CONNECTED_HANDLER` | `TSocketIOClientConnectedFn` | No | `null` |
| `@app/socket-io/instance` | `SOCKET_IO_INSTANCE` | `SocketIOServerHelper` | - | Set by the component |

> [!NOTE]
> `SOCKET_IO_INSTANCE` is never bound by application code. The component binds it automatically after the server starts. Inject it lazily - see [Inject the helper in a service or controller](./usage#inject-the-helper-in-a-service-or-controller).

### System events and rooms

Exported from `@venizia/ignis-helpers/socket-io` as `SocketIOConstants`. Used internally by both the component and the helper.

| Constant | Value | Description |
|---|---|---|
| `EVENT_PING` | `'ping'` | Keep-alive ping, emitted at `pingInterval` (default: 30s) |
| `EVENT_CONNECT` | `'connection'` | New client connected (server-side event name) |
| `EVENT_DISCONNECT` | `'disconnect'` | Client disconnected |
| `EVENT_JOIN` | `'join'` | Client requests to join room(s) |
| `EVENT_LEAVE` | `'leave'` | Client requests to leave room(s) |
| `EVENT_AUTHENTICATE` | `'authenticate'` | Client sends auth credentials |
| `EVENT_AUTHENTICATED` | `'authenticated'` | Auth success response sent to the client |
| `EVENT_UNAUTHENTICATE` | `'unauthenticated'` | Auth failure response sent to the client |
| `ROOM_DEFAULT` | `'io-default'` | Default room every authenticated client joins |
| `ROOM_NOTIFICATION` | `'io-notification'` | Notification broadcast room |

> [!TIP]
> Override the default rooms with the `defaultRooms` option on `SocketIOServerHelper` - the values above are only the fallback.

Two more constants govern default behavior. They're defined at module scope in the server helper, not exported, but overridable through constructor options:

| Constant | Value | Overridable via |
|---|---|---|
| `CLIENT_AUTHENTICATE_TIMEOUT` | `10_000` (10s) | `authenticateTimeout` |
| `CLIENT_PING_INTERVAL` | `30_000` (30s) | `pingInterval` |

### Client states

Each connected client tracks an authentication state that governs what it can do.

| State | Constant | Description |
|---|---|---|
| `unauthorized` | `SocketIOClientStates.UNAUTHORIZED` | Initial state - the client must emit `authenticate` within the timeout (default: 10s) |
| `authenticating` | `SocketIOClientStates.AUTHENTICATING` | Auth in progress - `authenticateFn` is running |
| `authenticated` | `SocketIOClientStates.AUTHENTICATED` | Auth succeeded - the client can send/receive events and join rooms |

```
connect ----------> unauthorized --(emit 'authenticate')--> authenticating
                        ^                                        |
                        |                              success    failure
                     timeout (10s)                       |          |
                        |                                v          v
                    disconnect  <---------------- authenticated  unauthorized -> disconnect
```

## Architecture

### Lifecycle integration

Socket.IO needs a running server, but components initialize before the server starts. The application's **post-start hook** system bridges that gap.

```
preConfigure()          <- register SocketIOComponent here
      |
initialize()             <- component.binding() runs: resolve bindings, register post-start hook
      |
setupMiddlewares()
      |
startBunModule() / startNodeModule()   <- server starts, instance created
      |
executePostStartHooks()  <- 'socket-io-initialize' hook runs:
      |                      new SocketIOServerHelper(...)
      |                      await socketIOHelper.configure()
      |                      bind SOCKET_IO_INSTANCE
      |                      (Bun only) server.reload({ fetch, websocket })
```

- Hooks run **sequentially**, in registration order, each timed with `performance.now()` for diagnostics.
- If a hook throws, the error propagates to `start()` and the server fails to start.
- The hook identifier is `'socket-io-initialize'` for both runtimes - only one runtime path executes per application.

```typescript
// Register a hook, during the binding phase
application.registerPostStartHook({
  identifier: string,
  hook: () => ValueOrPromise<void>,
});

// Get the server instance, available only after start
application.getServerInstance<T>(): T | undefined;
```

### Runtime-specific behavior

| Aspect | Node.js | Bun |
|---|---|---|
| Server type | `node:http.Server` | `Bun.Server` |
| IO server init | `new IOServer(httpServer, opts)` | `new IOServer()` then `io.bind(engine)` |
| Engine | Built in (`socket.io`) | `@socket.io/bun-engine` (optional peer dependency) |
| Request routing | Socket.IO attaches to the HTTP server automatically | `server.reload({ fetch, websocket })` wires the engine into Bun's request loop |
| WebSocket upgrade | Handled by `node:http.Server`'s upgrade event | Handled by Bun's `websocket` handler |
| Dynamic import | None needed | `await import('@socket.io/bun-engine')` at runtime |
| Fetch handler | Not needed - the HTTP server handles upgrades | A custom fetch wraps Hono's fetch and routes WS upgrades to the engine |
| CORS | Handled by Socket.IO's own CORS options | Handled by Bun engine options, via explicit field bridging |

### Bun runtime details

A custom fetch function intercepts WebSocket upgrade requests before they reach Hono:

1. Checks whether the request path starts with the Socket.IO path (`serverOptions.path`, default `'/io'`).
2. If it matches, delegates to `@socket.io/bun-engine` via `engine.handleRequest(req, server)`.
3. If it doesn't, delegates to Hono's normal `server.fetch(req, server)` handler.

Socket.IO and `@socket.io/bun-engine` define CORS slightly differently, so the component extracts each field explicitly instead of casting with `as any`. See [`createBunEngine()`](#post-start-hooks) in Internals for the full CORS bridging code.

### Node.js runtime details

Node mode is simpler - Socket.IO attaches to `node:http.Server` natively. The handler builds `SocketIOServerHelper` with `runtime: RuntimeModules.NODE` and passes the HTTP server instance directly. See [`createNodeSocketIOHelper()`](#post-start-hooks) in Internals.

## Server helper API reference

### Constructor

`new SocketIOServerHelper(opts: TSocketIOServerOptions)` - see [server types](#server-types) for the full discriminated union.

| Step | What happens |
|---|---|
| 1 | Sets `identifier`, `runtime`, `serverOptions`, and the callback functions |
| 2 | Applies defaults: `authenticateTimeout` = 10s, `pingInterval` = 30s, `defaultRooms` = `['io-default', 'io-notification']` |
| 3 | `setRuntime()` validates and stores the server or engine - see [runtime validation](#setruntime-runtime-validation) |
| 4 | `initRedisClients()` creates 3 duplicated Redis clients - see [Redis 3-client architecture](#redis-3-client-architecture) |

> [!IMPORTANT]
> Redis clients are duplicated from the parent connection via `redisConnection.duplicateClient()`. The helper owns 3 independent connections (pub, sub, emitter) that inherit config from the parent but keep separate state. The parent connection is never consumed.

### `configure()`

The only async method on the helper. It waits for all 3 Redis clients to reach `ready` before building the IO server.

1. Registers an `error` handler on each of the 3 Redis clients.
2. Connects any client still in `wait` status (lazy-connect mode).
3. Awaits all 3 clients reaching `ready`.
4. Builds the IO server - `new IOServer(httpServer, serverOptions)` on Node.js, or `new IOServer()` + `io.bind(bunEngine)` on Bun.
5. Wires the Redis adapter: `io.adapter(createAdapter(redisPub, redisSub))`.
6. Creates the Redis emitter: `emitter = new Emitter(redisEmitter)`.
7. Registers the `connection` handler, which calls `onClientConnect()` for every new socket.

> [!NOTE]
> If any Redis client fails to connect, the error propagates and the server does not start.

### Server helper: public methods

| Method | Signature | Behavior |
|---|---|---|
| `getIOServer()` | `(): IOServer` | Returns the underlying `socket.io` `Server` - for APIs the helper doesn't expose, like `io.of()` or `io.fetchSockets()` |
| `getEngine()` | `(): any` | Returns the `@socket.io/bun-engine` instance. Throws on Node.js runtime |
| `getClients()` | `(opts?: { id? }): ISocketIOClient \| Map<string, ISocketIOClient> \| undefined` | Without `id`, returns the full client map. With `id`, returns that client or `undefined` |
| `on()` | `(opts: { topic; handler }): void` | Registers a server-level event handler. Throws if `topic` is empty, `handler` is falsy, or the IO server isn't initialized |
| `ping()` | `(opts: { socket; doIgnoreAuth }): void` | Sends `{ time }` to one client. No-op if `socket` or the client entry is missing. Disconnects the client if `doIgnoreAuth` is `false` and it isn't authenticated |
| `disconnect()` | `(opts: { socket }): void` | Clears the client's ping interval and auth timeout, removes it from the client map, then calls `socket.disconnect()`. No-op if `socket` is falsy |
| `onClientConnect()` | `(opts: { socket }): void` | Runs on every new connection: skips duplicates, creates the client entry (state `UNAUTHORIZED`), starts the auth timeout, and registers the `disconnect` and `authenticate` handlers |
| `onClientAuthenticated()` | `(opts: { socket }): void` | Runs after successful auth: sets state `AUTHENTICATED`, sends the initial ping, joins default rooms, registers room handlers, starts the ping interval, and emits `authenticated` |

- **`ping()` powers the keep-alive interval.** `doIgnoreAuth: true` covers both the initial post-auth ping and the recurring interval.
- **`onClientConnect()` and `onClientAuthenticated()` are public** so tests and custom connection routing can call them directly.
- **`clientConnectedFn` runs through a safety wrapper.** A synchronous throw inside your callback is caught and logged - it never crashes the process.

### Messaging via `send()`

```typescript
send(opts: {
  destination?: string;    // Socket ID, room name, or omit for broadcast
  payload: { topic: string; data: any };
  doLog?: boolean;         // Log the emission (default: false)
  callback?: () => void;   // Executed via setImmediate after emit
})
```

`send()` delivers through the Redis emitter, so it works even when the destination client is connected to a different server instance.

| `destination` | Behavior |
|---|---|
| A socket ID or room name | `sender.to(destination).emit(topic, data)` |
| Omitted or empty | Broadcasts to all connected clients: `sender.emit(topic, data)` |

Every message is compressed via `emitter.compress(true)`. `callback` runs through `setImmediate()` - it confirms the emit call ran, not that a client received the message. Logging is opt-in (`doLog: true`) to avoid noise at high throughput.

`send()` returns silently, with no error and no log, when `payload`, `payload.topic`, or `payload.data` is falsy. That's deliberate: a fire-and-forget caller doesn't need to know a message was dropped for a missing field.

### Shutdown

```typescript
shutdown(): Promise<void>
```

1. Clears every tracked client's ping interval and auth timeout, then disconnects each socket.
2. Clears the client map.
3. Closes the IO server (`io.close()`, wrapped in a promise).
4. Quits all 3 Redis connections (`redisPub`, `redisSub`, `redisEmitter`).

## Client helper API reference

`SocketIOClientHelper` extends `BaseHelper` and wraps `socket.io-client` with lifecycle callbacks, error-safe event subscription, and authentication state tracking.

### Constructor

```typescript
constructor(opts: ISocketIOClientOptions)
```

See [client types](#client-types) for the full interface. `IOptions` extends `socket.io-client`'s `SocketOptions` with two required fields:

| Field | Purpose |
|---|---|
| `path` | Must match the server's `path` |
| `extraHeaders` | Commonly used for the `authorization` token |

Construction, in order:

1. Calls `super({ scope: opts.identifier })` to set up `BaseHelper` with scoped logging.
2. Stores `identifier`, `host`, `options`, and every lifecycle callback.
3. Calls `configure()` immediately to create the socket and register handlers.

### Client `configure()` event handlers

```typescript
configure(): void
```

Creates the `socket.io-client` `Socket` instance and registers every internal handler. If `configure()` already ran, it logs a message and returns early.

| Event | Internal behavior |
|---|---|
| `connect` | Logs the connection, invokes `onConnected` |
| `disconnect` | Logs the disconnection with a reason, resets state to `unauthorized`, invokes `onDisconnected` |
| `connect_error` | Logs the error, invokes `onError` |
| `authenticated` | Logs the auth data, sets state to `authenticated`, invokes `onAuthenticated` |
| `unauthenticated` | Logs a warning with the auth data, resets state to `unauthorized`, invokes `onUnauthenticated` with the message |
| `ping` | Logs a debug-level "ping received" |

Every lifecycle callback runs inside `Promise.resolve(...).catch(...)`, so a callback error never crashes the client.

### Client helper: public methods

| Method | Signature | Behavior |
|---|---|---|
| `getState()` | `(): TSocketIOClientState` | Returns `'unauthorized'`, `'authenticating'`, or `'authenticated'` |
| `getSocketClient()` | `(): Socket` | Returns the raw `socket.io-client` `Socket` - for APIs the helper doesn't expose, like `socket.id` |
| `authenticate()` | `(): void` | Emits `authenticate`. No-op with a warning log unless connected and in state `unauthorized` |
| `subscribe()` | `<T>(opts: { event; handler; ignoreDuplicate? }): void` | Subscribes with error-safe wrapping - see [below](#subscribe-error-safe-wrapping) |
| `subscribeMany()` | `(opts: { events; ignoreDuplicate? }): void` | Calls `subscribe()` for every entry in `events` |
| `unsubscribe()` | `(opts: { event; handler? }): void` | Removes one handler, or all handlers for the event if `handler` is omitted |
| `unsubscribeMany()` | `(opts: { events: string[] }): void` | Calls `unsubscribe()` for every event in the array |
| `connect()` | `(): void` | Manually connects. No-op with an info log if the client isn't initialized |
| `disconnect()` | `(): void` | Manually disconnects. No-op with an info log if the client isn't initialized |
| `emit()` | `<T>(opts: { topic; data; doLog?; callback? }): void` | Emits an event. Throws if not connected or `topic` is falsy - see [throw conditions](#emit-throw-conditions) |
| `joinRooms()` | `(opts: { rooms: string[] }): void` | Emits `join` with `{ rooms }`. No-op with a warning log if not connected |
| `leaveRooms()` | `(opts: { rooms: string[] }): void` | Emits `leave` with `{ rooms }`. No-op with a warning log if not connected |
| `shutdown()` | `(): void` | Removes all listeners, disconnects if connected, resets state to `unauthorized` |

#### `subscribe()` error-safe wrapping

Every handler is wrapped in a dual try-catch, so a broken handler never crashes the client:

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

The outer `try-catch` handles synchronous throws. The `.catch()` on `Promise.resolve()` handles async rejections.

#### `emit()` throw conditions

| Condition | statusCode | Message |
|---|---|---|
| Socket not connected | `400` | `"Invalid socket client state to emit"` |
| `topic` is falsy | `400` | `"Topic is required to emit"` |

## Internals

### `resolveBindings()`

Reads every binding key from the DI container and validates the required ones.

| Binding | Validation | Error on failure |
|---|---|---|
| `SERVER_OPTIONS` | Optional, merged with defaults via `Object.assign()` | - |
| `REDIS_CONNECTION` | Must pass `isRedisHelper()` | `"Invalid instance of redisConnection..."` |
| `AUTHENTICATE_HANDLER` | Must be a truthy function | `"[DANGER][SocketIOComponent] Invalid authenticateFn to setup io socket server!"` |
| `VALIDATE_ROOM_HANDLER` | Optional, resolved from the container, `null` coerced to `undefined` | - |
| `CLIENT_CONNECTED_HANDLER` | Optional, resolved from the container, `null` coerced to `undefined` | - |

### Post-start hooks

Both runtimes register the same hook identifier, `'socket-io-initialize'`, but wire the helper differently.

**Bun** (`registerBunHook()`):

1. Calls `createBunEngine({ serverOptions })`, which dynamically imports `@socket.io/bun-engine` and builds a `BunEngine` instance with CORS bridging.
2. Constructs `SocketIOServerHelper` with `runtime: RuntimeModules.BUN`.
3. Awaits `socketIOHelper.configure()`.
4. Binds the helper to `SOCKET_IO_INSTANCE`.
5. Calls `serverInstance.reload({ fetch, websocket })` to wire the engine into the running Bun server.

```typescript
async function createBunEngine(opts: {
  serverOptions: Partial<ServerOptions>;
}): Promise<{ engine: any; engineHandler: any }> {
  const { serverOptions } = opts;
  const { Server: BunEngine } = await import('@socket.io/bun-engine');

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

  return { engine, engineHandler: engine.handler() };
}
```

**Node.js** (`registerNodeHook()`):

1. Gets the HTTP server via `getServerInstance()`. Throws `"[SocketIOComponent] HTTP server not available for Node.js runtime!"` if it's missing.
2. Calls `createNodeSocketIOHelper()`, which constructs `SocketIOServerHelper` with `runtime: RuntimeModules.NODE` and the HTTP server, then awaits `configure()`.
3. Binds the helper to `SOCKET_IO_INSTANCE`.

### Redis 3-client architecture

```
RedisSingleHelper (parent - NOT consumed)
  |
  +-- duplicateClient() --> redisPub     (Redis adapter - publishes)
  |
  +-- duplicateClient() --> redisSub     (Redis adapter - subscribes)
  |
  +-- duplicateClient() --> redisEmitter (Redis emitter - message delivery)
```

Three clients, not one, for two reasons:

- **`@socket.io/redis-adapter` needs separate pub and sub clients.** A Redis connection in subscribe mode can't run other commands.
- **`@socket.io/redis-emitter` needs its own client.** It emits messages independently of the adapter, so a process with no local Socket.IO server can still broadcast.

The parent connection stays independent and unconsumed - reuse it for caching, sessions, or anything else.

```typescript
type TRedisClient = Redis | Cluster;
```

This alias covers both single-instance and `Cluster` connections from `ioredis`, so the helper is transparent to the Redis deployment topology.

### `setRuntime()` runtime validation

| Runtime | Required field | Error on missing |
|---|---|---|
| `RuntimeModules.NODE` | `opts.server` (`HTTPServer`) | `"[SocketIOServerHelper] Invalid HTTP server for Node.js runtime!"` |
| `RuntimeModules.BUN` | `opts.engine` (`BunEngine`) | `"[SocketIOServerHelper] Invalid @socket.io/bun-engine instance for Bun runtime!"` |
| Other | - | `"[SocketIOServerHelper] Unsupported runtime!"` |

### `initRedisClients()`

Creates the 3 duplicated clients from the parent connection. Throws `"Invalid redis connection to config socket.io adapter!"` if `redisConnection` is falsy.

### `initIOServer()`

Called during `configure()`, after the Redis connections are ready.

| Runtime | Initialization |
|---|---|
| `RuntimeModules.NODE` | `this.io = new IOServer(this.server, this.serverOptions)` |
| `RuntimeModules.BUN` | `this.io = new IOServer()` then `this.io.bind(this.bunEngine)` |
| Other | Throws `"Unsupported runtime: <runtime>"` |

Two more guards run inside each branch:

| Runtime | Missing field | Error |
|---|---|---|
| Node.js | `this.server` | `"[DANGER] Invalid HTTP server instance to init Socket.io server!"` |
| Bun | `this.bunEngine` | `"[DANGER] Invalid @socket.io/bun-engine instance to init Socket.io server!"` |

### Connection lifecycle

```
Client connects
  -> onClientConnect(): validate socket, create client (state UNAUTHORIZED),
     start authenticateTimeout (10s default), register 'disconnect' + 'authenticate' handlers

Client emits 'authenticate'
  -> validate client exists and state is UNAUTHORIZED, set state AUTHENTICATING
  -> call authenticateFn(handshake)
       success -> onClientAuthenticated(): state AUTHENTICATED, send initial ping,
                  join default rooms, register 'join'/'leave' handlers,
                  start ping interval, emit 'authenticated', call clientConnectedFn()
       failure -> emit 'unauthenticated', disconnect

Timeout (10s) -> disconnect if not yet AUTHENTICATED
```

#### Authentication failure paths

`registerAuthHandler()` resolves an auth failure through one of two paths. Both check `this.clients.has(id)` first, in case the client disconnected mid-authentication.

| Path | Trigger | Actions |
|---|---|---|
| Rejected | `authenticateFn` resolves `false` | Reset state to `UNAUTHORIZED`. Send `unauthenticated` with `"Invalid token to authenticate! Please login again!"`. Disconnect after send (`setImmediate`). No error logged - this is an expected outcome. |
| Threw | `authenticateFn` throws | Reset state to `UNAUTHORIZED`. Log the error. Send `unauthenticated` with `"Failed to authenticate connection! Please login again!"`. Disconnect after send (`setImmediate`). |

```typescript
interface ISocketIOClient {
  id: string;
  socket: IOSocket;
  state: TSocketIOClientState;              // 'unauthorized' | 'authenticating' | 'authenticated'
  interval?: NodeJS.Timeout;                 // Ping interval, set after auth
  authenticateTimeout?: NodeJS.Timeout;      // Auth deadline, undefined once cleared
}
```

### Room handlers

Registered after successful authentication.

| Handler | Behavior |
|---|---|
| `join` | Client sends `{ rooms }`. If `validateRoomFn` is bound, only the rooms it returns get joined. If it isn't bound, the join is rejected with a warning log. |
| `leave` | Client sends `{ rooms }`. Always allowed - no validation function needed. |

Both handlers parse the payload defensively: `const { rooms = [] } = payload || { rooms: [] }`. An empty array is silently ignored. A join error is caught and logged - it never disconnects the client.

> [!WARNING]
> Without a `validateRoomFn` bound, clients **cannot** join any custom room - they stay in the default rooms only. This is security-by-default.

### Graceful shutdown

Shut down Socket.IO before stopping the application:

```typescript
override async stop(): Promise<void> {
  // 1. Shut down Socket.IO (disconnects all clients, closes the IO server, quits Redis)
  const socketIOHelper = this.get<SocketIOServerHelper>({
    key: SocketIOBindingKeys.SOCKET_IO_INSTANCE,
    isOptional: true,
  });
  if (socketIOHelper) {
    await socketIOHelper.shutdown();
  }

  // 2. Disconnect the Redis helper
  if (this.redisHelper) {
    await this.redisHelper.disconnect();
  }

  // 3. Stop the HTTP/Bun server
  await super.stop();
}
```

`socketIOHelper.shutdown()` runs the 4 steps under [Shutdown](#shutdown) above. `clientHelper.shutdown()` does the client-side equivalent: remove listeners, disconnect if connected, reset state.

## Types reference

### Server types

```typescript
// Server constructor options - discriminated union on 'runtime'
type TSocketIOServerOptions = ISocketIOServerNodeOptions | ISocketIOServerBunOptions;

interface ISocketIOServerBaseOptions {
  identifier: string;
  serverOptions: Partial<ServerOptions>;
  redisConnection: IRedisHelper;
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

// Tracked client entry (server-side)
interface ISocketIOClient {
  id: string;
  socket: IOSocket;
  state: TSocketIOClientState;
  interval?: NodeJS.Timeout;
  authenticateTimeout?: NodeJS.Timeout;
}

type TRedisClient = Redis | Cluster;
```

### Client types

```typescript
// Client constructor options
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

// Socket connection options (extends socket.io-client's SocketOptions)
interface IOptions extends SocketOptions {
  path: string;
  extraHeaders: Record<string | symbol | number, any>;
}

type TSocketIOEventHandler<T = unknown> = (data: T) => ValueOrPromise<void>;

type TSocketIOClientState = TConstValue<typeof SocketIOClientStates>;
// Resolves to: 'unauthorized' | 'authenticating' | 'authenticated'
```

### Callback types

```typescript
// Handshake payload passed to the authenticate handler
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

type TSocketIOAuthenticateFn = (args: IHandshake) => ValueOrPromise<boolean>;

type TSocketIOValidateRoomFn = (opts: {
  socket: IOSocket;
  rooms: string[];
}) => ValueOrPromise<string[]>;

type TSocketIOClientConnectedFn = (opts: { socket: IOSocket }) => ValueOrPromise<void>;

// Extended ServerOptions with identifier
interface IServerOptions extends ServerOptions {
  identifier: string;
}

// Resolved binding values from the DI container
interface IResolvedBindings {
  redisConnection: IRedisHelper;
  authenticateFn: TSocketIOAuthenticateFn;
  validateRoomFn?: TSocketIOValidateRoomFn;
  clientConnectedFn?: TSocketIOClientConnectedFn;
}
```

## See also

- [Overview](./) - quick start, imports, common configuration tasks
- [Usage & Examples](./usage) - full setup steps, server-side usage, client helper, advanced patterns
- [Error Reference](./errors) - error conditions and troubleshooting
