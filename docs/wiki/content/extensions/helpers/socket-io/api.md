---
title: Socket.IO - Full Reference
description: Complete reference for SocketIOServerHelper and SocketIOClientHelper - every option, method signature, type, constant, and error case
difficulty: intermediate
---

# Socket.IO - Full Reference

Exhaustive reference for `SocketIOServerHelper` and `SocketIOClientHelper`. For a readable introduction and the common tasks, start with the [Socket.IO overview](/extensions/helpers/socket-io/).

**Files:**

- [`packages/helpers/src/modules/socket/socket-io/server/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/socket-io/server/helper.ts) - `SocketIOServerHelper`
- [`packages/helpers/src/modules/socket/socket-io/client/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/socket-io/client/helper.ts) - `SocketIOClientHelper`
- [`packages/helpers/src/modules/socket/socket-io/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/socket-io/common/types.ts) - option and callback types
- [`packages/helpers/src/modules/socket/socket-io/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/socket-io/common/constants.ts) - `SocketIOConstants`, `SocketIOClientStates`
- [`packages/helpers/src/modules/socket/socket-io/index.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/socket-io/index.ts) - barrel export (`@venizia/ignis-helpers/socket-io`)

## Architecture

```
SocketIOServerHelper (extends BaseHelper)
  |
  |-- constructor(opts)
  |     |-- setRuntime(opts)                  # validates `server` (Node) or `engine` (Bun)
  |     +-- initRedisClients(opts.redisConnection)
  |           |-- redisPub = duplicateClient()
  |           |-- redisSub = duplicateClient()
  |           +-- redisEmitter = duplicateClient()
  |
  |-- configure()  [async]
  |     |-- ensureRedisClientsConnecting([redisPub, redisSub, redisEmitter])
  |     |-- await Promise.all(waitForRedisReady x3)   # 30s timeout per client
  |     |-- initIOServer()                     # new IOServer(server, serverOptions) | new IOServer() + io.bind(engine)
  |     |-- io.adapter(createAdapter(redisPub, redisSub))
  |     |-- emitter = new Emitter(redisEmitter)
  |     +-- io.on('connection', socket => onClientConnect({ socket }))
  |
  |-- onClientConnect({ socket })
  |     |-- Create ISocketIOClient entry (state: UNAUTHORIZED)
  |     |-- Start authenticateTimeout timer
  |     |-- Register 'disconnect' handler
  |     +-- registerAuthHandler({ socket, handshake, clientId })
  |           +-- socket.on('authenticate', ...)
  |                 |-- state -> AUTHENTICATING
  |                 |-- authenticateFn(handshake)
  |                 |-- true  -> onClientAuthenticated({ socket })
  |                 +-- false or throw -> emit 'unauthenticated', disconnect
  |
  |-- onClientAuthenticated({ socket })
  |     |-- state -> AUTHENTICATED, clear authenticateTimeout
  |     |-- ping({ socket, doIgnoreAuth: true })       # immediate first ping
  |     |-- Join all defaultRooms
  |     |-- registerRoomHandlers({ socket, clientId })  # 'join' / 'leave'
  |     |-- interval = setInterval(ping, pingInterval)
  |     |-- send 'authenticated' to socket.id
  |     +-- invokeHook(clientConnectedFn)
  |
  |-- send({ destination?, payload, doLog?, callback? })
  |     +-- emitter.compress(true).to(destination)?.emit(topic, data)
  |
  +-- shutdown()  [async]
        |-- Disconnect all tracked clients (clears their timers)
        |-- close()                            # io.close()
        +-- Promise.all([redisPub.quit(), redisSub.quit(), redisEmitter.quit()])


SocketIOClientHelper (extends BaseHelper)
  |
  |-- constructor -> configure()
  |     |-- client = io(host, options)
  |     |-- Register 'connect'          -> onConnected
  |     |-- Register 'disconnect'       -> state UNAUTHORIZED, onDisconnected
  |     |-- Register 'connect_error'    -> onError
  |     |-- Register 'authenticated'    -> state AUTHENTICATED, onAuthenticated
  |     |-- Register 'unauthenticated'  -> state UNAUTHORIZED, onUnauthenticated
  |     +-- Register 'ping'             -> debug log
  |
  |-- authenticate()  -> state AUTHENTICATING, client.emit('authenticate')
  |-- subscribe({ event, handler, ignoreDuplicate? })   # wraps handler, tracked in wrappedHandlers
  |-- emit({ topic, data, doLog?, callback? })
  |-- joinRooms({ rooms })  -> client.emit('join', { rooms })
  |-- leaveRooms({ rooms }) -> client.emit('leave', { rooms })
  |
  +-- shutdown()
        |-- client.removeAllListeners()
        |-- disconnect() if connected
        +-- state -> UNAUTHORIZED
```

## Server API

### `SocketIOServerHelper`

Extends `BaseHelper`. Manages a `socket.io` server with a Redis adapter, authentication, room management, and heartbeat pings.

#### `constructor(opts: TSocketIOServerOptions)`

Validates the runtime-specific `server` (Node) or `engine` (Bun) field and duplicates the provided `redisConnection` into three independent clients (`redisPub`, `redisSub`, `redisEmitter`). Does **not** start the IO server - call `configure()` to complete initialization.

**Throws:**

- `'[SocketIOServerHelper] Invalid HTTP server for Node.js runtime!'` - `runtime: 'node'` and `server` is falsy
- `'[SocketIOServerHelper] Invalid @socket.io/bun-engine instance for Bun runtime!'` - `runtime: 'bun'` and `engine` is falsy
- `'[SocketIOServerHelper] Unsupported runtime!'` - `runtime` is neither `'node'` nor `'bun'`
- `'Invalid redis connection to config socket.io adapter!'` - `redisConnection` is falsy

#### `configure(): Promise<void>`

1. Registers `error` listeners on all three duplicated Redis clients (logged, not thrown)
2. Kicks off `connect()` on any client still in `'wait'` status (duplicated clients inherit `lazyConnect` from the parent and do not dial on their own)
3. `await Promise.all([waitForRedisReady(redisPub), waitForRedisReady(redisSub), waitForRedisReady(redisEmitter)])`
4. Creates the `IOServer` - `new IOServer(server, serverOptions)` for Node.js, or `new IOServer()` followed by `io.bind(engine)` for Bun
5. Attaches the Redis adapter via `@socket.io/redis-adapter`
6. Creates the Redis emitter via `@socket.io/redis-emitter`
7. Registers the `'connection'` handler

Must be called before `on()`, `send()`, or any server operation.

> [!NOTE]
> `waitForRedisReady` rejects after **30 seconds** if a client never reaches `ready` (or immediately on that client's `error` event), so a broken Redis connection fails `configure()` instead of hanging boot indefinitely.

#### `getIOServer(): IOServer`

Returns the underlying `socket.io` `Server` instance for direct access.

```typescript
const io = socketServer.getIOServer();
io.of('/admin').on('connection', socket => {
  /* ... */
});
```

#### `getEngine(): any`

Returns the Bun engine instance.

**Throws:** `'[getEngine] Engine is only available for Bun runtime!'` - `runtime` is not `'bun'`

#### `getClients(opts?: { id?: string }): ISocketIOClient | Map<string, ISocketIOClient> | undefined`

Without `id`, returns the full `Map<string, ISocketIOClient>`. With `{ id }`, returns that client's entry or `undefined`.

```typescript
const allClients = socketServer.getClients() as Map<string, ISocketIOClient>;
const client = socketServer.getClients({ id: 'socket-id' }) as ISocketIOClient | undefined;
```

#### `on<HandlerArgsType extends unknown[] = unknown[], HandlerReturnType = void>(opts: { topic: string; handler: (...args: HandlerArgsType) => ValueOrPromise<HandlerReturnType> }): void`

Registers an event handler directly on the IO server instance (`io.on(topic, handler)`).

```typescript
socketServer.on({
  topic: 'custom-event',
  handler: (data: { userId: string }) => console.log('received:', data),
});
```

**Throws:**

- `'[on] Invalid topic to start binding handler'` - `topic` is empty/falsy
- `'[on] Invalid event handler | topic: {topic}'` - `handler` is missing
- `'[on] IOServer is not initialized yet!'` - called before `configure()` completes

#### `onClientConnect(opts: { socket: IOSocket }): void`

Handles a new socket connection. Invoked automatically by the `'connection'` event; can also be called manually.

1. Creates an `ISocketIOClient` entry with state `UNAUTHORIZED`
2. Starts the `authenticateTimeout` timer
3. Registers `'disconnect'` and `'authenticate'` handlers on the socket

No-op if `socket` is falsy or the client ID already exists in the registry.

#### `onClientAuthenticated(opts: { socket: IOSocket }): void`

Runs after successful authentication. Can also be called manually to authenticate a client programmatically.

1. Sets state to `AUTHENTICATED`
2. Clears and unsets the `authenticateTimeout` timer
3. Sends an immediate ping (`doIgnoreAuth: true`)
4. Joins all `defaultRooms`
5. Registers room handlers (`'join'`, `'leave'`)
6. Starts the periodic ping `interval`
7. Emits `'authenticated'` to the client with `{ id, time }`
8. Invokes `clientConnectedFn` - errors are caught and logged, never surfaced to the caller

If the client entry no longer exists (disconnected mid-flow), logs and calls `disconnect({ socket })` instead.

#### `ping(opts: { socket: IOSocket; doIgnoreAuth: boolean }): void`

Emits `'ping'` to the client with `{ time: ISO string }`.

- If `doIgnoreAuth` is `false` and the client is not `AUTHENTICATED`, the client is disconnected instead of pinged
- No-op if the socket or the tracked client is not found

#### `disconnect(opts: { socket: IOSocket }): void`

1. Clears the ping `interval` timer
2. Clears the `authenticateTimeout` timer
3. Removes the client from the registry
4. Calls `socket.disconnect()`

No-op if `socket` is falsy.

#### `send(opts: { destination?: string; payload: { topic: string; data: any }; doLog?: boolean; callback?: () => void }): void`

Emits through the Redis emitter with compression enabled (`emitter.compress(true)`), reaching clients on **any** server instance.

| Parameter | Type | Description |
|-----------|------|-------------|
| `destination` | `string \| undefined` | Socket ID or room name. Omit to broadcast to all clients |
| `payload.topic` | `string` | Event name |
| `payload.data` | `any` | Event payload |
| `doLog` | `boolean` | Logs the message details. Default: `false` |
| `callback` | `() => void` | Invoked via `setImmediate` after the emit call returns |

No-op if `payload`, `payload.topic`, or `payload.data` is falsy. Logs an error and returns if called before `configure()` (the Redis emitter does not exist yet).

```typescript
socketServer.send({
  destination: 'some-room',
  payload: { topic: 'update', data: { value: 42 } },
  callback: () => console.log('queued'),
});
```

#### `shutdown(): Promise<void>`

1. Disconnects every tracked client, clearing its `interval` and `authenticateTimeout`
2. Clears the `clients` map
3. Closes the IO server (no-op if `configure()` never ran)
4. `await Promise.all([redisPub.quit(), redisSub.quit(), redisEmitter.quit()])` - runs even if closing the IO server rejects, so the three Redis sockets never leak

## Client API

### `SocketIOClientHelper`

Extends `BaseHelper`. Manages a `socket.io-client` connection with authentication, event subscriptions, and room operations.

#### `constructor(opts: ISocketIOClientOptions)`

Stores the callbacks and calls `configure()` internally - the client starts connecting immediately.

#### `configure(): void`

Creates the `socket.io-client` connection (`io(host, options)`) and registers the internal lifecycle handlers below. Called automatically by the constructor; a second call is a no-op if a client instance already exists.

| Event | Behavior |
|-------|----------|
| `'connect'` | Invokes `onConnected` |
| `'disconnect'` | State -> `UNAUTHORIZED`, invokes `onDisconnected(reason)` |
| `'connect_error'` | Invokes `onError(error)` |
| `'authenticated'` | State -> `AUTHENTICATED`, invokes `onAuthenticated` |
| `'unauthenticated'` | State -> `UNAUTHORIZED`, invokes `onUnauthenticated(message)` |
| `'ping'` | Logs a debug message only |

Every callback invocation is wrapped so a rejected promise is caught and logged, never thrown.

#### `getState(): TSocketIOClientState`

Returns `'unauthorized'`, `'authenticating'`, or `'authenticated'`.

```typescript
if (client.getState() === 'authenticated') {
  client.emit({ topic: 'message', data: { text: 'hello' } });
}
```

#### `getSocketClient(): Socket`

Returns the underlying `socket.io-client` `Socket` instance.

```typescript
const rawSocket = client.getSocketClient();
rawSocket.io.opts.reconnection = false;
```

#### `authenticate(): void`

Emits `'authenticate'` to the server to start the handshake.

- No-op if the client is not connected
- No-op if the current state is not `'unauthorized'`
- Sets state to `AUTHENTICATING` before emitting

```typescript
const client = new SocketIOClientHelper({
  // ...
  onConnected: () => client.authenticate(),
});
```

#### `subscribe<T>(opts: { event: string; handler: TSocketIOEventHandler<T>; ignoreDuplicate?: boolean }): void`

Registers a handler on the client socket. The handler is wrapped with error handling that catches both sync throws and async rejections, and the wrapper is tracked in an internal `wrappedHandlers` map so `unsubscribe()` can find and remove it.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `event` | `string` | - | Event name to listen for |
| `handler` | `TSocketIOEventHandler<T>` | - | Callback receiving the event data |
| `ignoreDuplicate` | `boolean` | `true` | Skip registration if a handler already exists for this event |

#### `subscribeMany(opts: { events: Record<string, TSocketIOEventHandler>; ignoreDuplicate?: boolean }): void`

Calls `subscribe()` for each entry in `events`.

```typescript
client.subscribeMany({
  events: {
    'user-joined': data => console.log('joined:', data),
    'user-left': data => console.log('left:', data),
  },
});
```

#### `unsubscribe(opts: { event: string; handler?: TSocketIOEventHandler }): void`

- With `handler`, removes only that specific handler (looked up in `wrappedHandlers`; no-op if it was not registered through this helper)
- Without `handler`, removes **all** handlers for the event
- No-op if the event has no listeners

#### `unsubscribeMany(opts: { events: string[] }): void`

Calls `unsubscribe()` for each event, removing all handlers for each.

#### `connect(): void`

Manually reconnects the client socket. No-op if the client instance does not exist (i.e. `configure()` never ran).

#### `disconnect(): void`

Manually disconnects the client socket without removing listeners or resetting state. No-op if the client instance does not exist.

> [!TIP]
> Use `shutdown()` for a full cleanup that also removes listeners and resets the authentication state.

#### `emit<T>(opts: { topic: string; data: T; doLog?: boolean; callback?: () => void }): void`

Emits an event to the server.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `topic` | `string` | - | Event name |
| `data` | `T` | - | Event payload |
| `doLog` | `boolean` | `false` | Logs the emission details |
| `callback` | `() => void` | `undefined` | Invoked via `setImmediate` after the emit call |

**Throws:**

- `'Invalid socket client state to emit'` (status 400) - the client is not connected
- `'Topic is required to emit'` (status 400) - `topic` is empty/falsy

#### `joinRooms(opts: { rooms: string[] }): void`

Emits `'join'` with `{ rooms }`; the server validates the request through its `validateRoomFn`. Logs a warning and no-ops if the client is not connected.

#### `leaveRooms(opts: { rooms: string[] }): void`

Emits `'leave'` with `{ rooms }`. Logs a warning and no-ops if the client is not connected.

> [!NOTE]
> Unlike `joinRooms()`, leave requests are **not** validated server-side - the client can request to leave any room name, including ones it never joined (`socket.leave()` on a room the socket isn't in is a no-op).

#### `shutdown(): void`

1. Removes all event listeners (`removeAllListeners()`)
2. Disconnects if currently connected
3. Resets state to `UNAUTHORIZED`

## Authentication Protocol

```
Client connects (transport only)
  |
  v
Server creates client entry (state: UNAUTHORIZED)
  |-- Starts authenticateTimeout timer (default: 10s)
  |-- Registers 'disconnect' handler
  |
Client emits 'authenticate'
  |
  v
State -> AUTHENTICATING
Server calls authenticateFn(handshake)
  |
  +-- Resolves true:
  |     |-- State -> AUTHENTICATED, authenticateTimeout cleared
  |     |-- Immediate ping, join defaultRooms, start ping interval
  |     |-- Emit 'authenticated' { id, time } to client
  |     +-- Invoke clientConnectedFn (errors caught and logged)
  |
  +-- Resolves false:
  |     |-- State -> UNAUTHORIZED
  |     |-- Emit 'unauthenticated' { message: 'Invalid token to authenticate! Please login again!', time }
  |     +-- Disconnect (via the emit callback)
  |
  +-- Throws / rejects:
  |     |-- State -> UNAUTHORIZED
  |     |-- Emit 'unauthenticated' { message: 'Failed to authenticate connection! Please login again!', time }
  |     +-- Disconnect (via the emit callback), logged with doLog: true
  |
  +-- authenticateTimeout elapses first:
        +-- Disconnect - including a client whose authenticateFn is still pending;
            its eventual resolution finds the client already removed and is a no-op
```

A client that re-emits `'authenticate'` while already `AUTHENTICATING` or `AUTHENTICATED` is ignored (logged as a warning, `authenticateFn` is not called again).

## Redis Adapter

The server uses `@socket.io/redis-adapter` and `@socket.io/redis-emitter` for horizontal scaling. Three Redis connections are created by duplicating the provided `redisConnection`:

| Client | Purpose |
|--------|---------|
| `redisPub` | Publishes adapter messages (room membership, cross-instance socket.io internals) |
| `redisSub` | Subscribes to adapter messages |
| `redisEmitter` | Powers `send()` for cross-instance message delivery |

- **Initialized during `configure()`.** All three clients are created and awaited before the IO server starts.
- **Lazy connect handled explicitly.** If the parent `redisConnection` uses `lazyConnect` (`autoConnect: false`), the duplicated clients are kicked into `connect()` explicitly, since duplicated clients inherit `lazyConnect` but never dial on their own.

## Types Reference

### `IHandshake`

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

### `ISocketIOClient`

```typescript
interface ISocketIOClient {
  id: string;
  socket: IOSocket;
  state: TSocketIOClientState;
  interval?: NodeJS.Timeout;           // Ping interval timer, set after authentication
  authenticateTimeout?: NodeJS.Timeout; // Cleared (set to undefined) after authentication
}
```

### `TSocketIOClientState`

```typescript
type TSocketIOClientState = 'unauthorized' | 'authenticating' | 'authenticated';
```

### `TSocketIOAuthenticateFn`

```typescript
type TSocketIOAuthenticateFn = (args: IHandshake) => ValueOrPromise<boolean>;
```

### `TSocketIOValidateRoomFn`

```typescript
type TSocketIOValidateRoomFn = (opts: { socket: IOSocket; rooms: string[] }) => ValueOrPromise<string[]>;
```

### `TSocketIOClientConnectedFn`

```typescript
type TSocketIOClientConnectedFn = (opts: { socket: IOSocket }) => ValueOrPromise<void>;
```

### `TSocketIOEventHandler<T>`

```typescript
type TSocketIOEventHandler<T = unknown> = (data: T) => ValueOrPromise<void>;
```

### `IOptions`

Client connection options. Extends `SocketOptions` from `socket.io-client`; `path` and `extraHeaders` are required by the type.

```typescript
interface IOptions extends SocketOptions {
  path: string;
  extraHeaders: Record<string | symbol | number, any>;
}
```

### `ISocketIOClientOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `identifier` | `string` | - | Unique identifier for this client (used as logger scope) |
| `host` | `string` | - | Server URL to connect to (e.g. `'http://localhost:3000'`) |
| `options` | `IOptions` | - | Socket.IO client options |
| `onConnected` | `() => ValueOrPromise<void>` | `undefined` | Called when the transport connection is established |
| `onDisconnected` | `(reason: string) => ValueOrPromise<void>` | `undefined` | Called on disconnect; state resets to `'unauthorized'` first |
| `onError` | `(error: Error) => ValueOrPromise<void>` | `undefined` | Called on `'connect_error'` |
| `onAuthenticated` | `() => ValueOrPromise<void>` | `undefined` | Called when the server confirms authentication |
| `onUnauthenticated` | `(message: string) => ValueOrPromise<void>` | `undefined` | Called when the server rejects authentication |

### `TSocketIOServerOptions`

Discriminated union on `runtime`.

```typescript
type TSocketIOServerOptions = ISocketIOServerNodeOptions | ISocketIOServerBunOptions;

interface ISocketIOServerBaseOptions {
  identifier: string;
  serverOptions: Partial<ServerOptions>;   // socket.io ServerOptions - required by the type, pass {} if unused
  redisConnection: IRedisHelper;
  defaultRooms?: string[];                 // Default: ['io-default', 'io-notification']
  authenticateTimeout?: number;            // Default: 10000 (10s)
  pingInterval?: number;                   // Default: 30000 (30s)

  authenticateFn: TSocketIOAuthenticateFn;
  validateRoomFn?: TSocketIOValidateRoomFn;
  clientConnectedFn?: TSocketIOClientConnectedFn;
}

interface ISocketIOServerNodeOptions extends ISocketIOServerBaseOptions {
  runtime: 'node';
  server: HTTPServer; // node:http Server
}

interface ISocketIOServerBunOptions extends ISocketIOServerBaseOptions {
  runtime: 'bun';
  engine: any; // @socket.io/bun-engine Server instance - typed `any` since it's an optional peer dep
}
```

> [!WARNING]
> If no `validateRoomFn` is provided, **all** custom room join requests are rejected with a warning log. Clients still get `defaultRooms` automatically.

## Constants

### `SocketIOConstants`

| Constant | Value | Description |
|----------|-------|-------------|
| `EVENT_PING` | `'ping'` | Heartbeat event emitted by the server at `pingInterval` |
| `EVENT_CONNECT` | `'connection'` | Server-side connection event |
| `EVENT_DISCONNECT` | `'disconnect'` | Disconnect event (server and client) |
| `EVENT_JOIN` | `'join'` | Room join request event |
| `EVENT_LEAVE` | `'leave'` | Room leave request event |
| `EVENT_AUTHENTICATE` | `'authenticate'` | Client -> server authentication request |
| `EVENT_AUTHENTICATED` | `'authenticated'` | Server -> client authentication success |
| `EVENT_UNAUTHENTICATE` | `'unauthenticated'` | Server -> client authentication failure |
| `ROOM_DEFAULT` | `'io-default'` | Default room name |
| `ROOM_NOTIFICATION` | `'io-notification'` | Default notification room name |

### `SocketIOClientStates`

| Constant | Value | Description |
|----------|-------|-------------|
| `UNAUTHORIZED` | `'unauthorized'` | Initial state; not yet authenticated |
| `AUTHENTICATING` | `'authenticating'` | Authentication in progress |
| `AUTHENTICATED` | `'authenticated'` | Successfully authenticated |

`SocketIOClientStates.isValid(input: string): input is TConstValue<typeof SocketIOClientStates>` - checks membership against the backing `SCHEME_SET`.

```typescript
SocketIOClientStates.isValid('authenticated'); // true
SocketIOClientStates.isValid('invalid');       // false
```

### Internal defaults

| Constant | Value | Description |
|----------|-------|-------------|
| `CLIENT_AUTHENTICATE_TIMEOUT` | `10_000` (10s) | Default `authenticateTimeout` |
| `CLIENT_PING_INTERVAL` | `30_000` (30s) | Default `pingInterval` |

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `[SocketIOServerHelper] Invalid HTTP server for Node.js runtime!` | `server` missing/falsy with `runtime: 'node'` | Pass a valid `http.Server` instance |
| `[SocketIOServerHelper] Invalid @socket.io/bun-engine instance for Bun runtime!` | `engine` missing/falsy with `runtime: 'bun'` | Pass a valid `@socket.io/bun-engine` `Server` instance |
| `[SocketIOServerHelper] Unsupported runtime!` | `runtime` is neither `'node'` nor `'bun'` | Use `RuntimeModules.NODE`, `RuntimeModules.BUN`, or `RuntimeModules.detect()` |
| `Invalid redis connection to config socket.io adapter!` | `redisConnection` missing, `null`, or `undefined` | Pass a valid `IRedisHelper` (e.g. `RedisSingleHelper`, `RedisClusterHelper`) |
| `[on] Invalid topic to start binding handler` | Empty/falsy `topic` passed to `on()` | Provide a non-empty string topic |
| `[on] IOServer is not initialized yet!` | `on()` called before `configure()` completed | `await configure()` before registering handlers |
| `Invalid socket client state to emit` (client) | `emit()` called while not connected | Check `getState()` / connection status, or emit inside `onConnected` |
| `Topic is required to emit` (client) | `emit()` called with an empty/falsy `topic` | Provide a non-empty string topic |

## See also

- [Socket.IO overview](/extensions/helpers/socket-io/) - getting started, constructor options, and common tasks
- [Socket.IO Component](/extensions/components/socket-io/) - DI-managed lifecycle wrapper around this helper
- [WebSocket Helper](../websocket/) - Bun-native alternative with no `socket.io` dependency
- [Redis Helper](/extensions/helpers/redis/reference) - `duplicateClient()` and the topology classes used as `redisConnection`
