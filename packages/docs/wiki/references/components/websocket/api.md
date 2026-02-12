# WebSocket -- API Reference

> Architecture deep dive, WebSocketEmitter API, and component internals.

## Architecture

#### Component Lifecycle Diagram
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

#### Application Lifecycle Flow
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

The component creates a custom `fetch` handler via `createBunFetchHandler()` that routes requests:

1. **WebSocket upgrade requests** (`GET /ws` with `Upgrade: websocket` header) are handled by `server.upgrade()` which assigns a `clientId` (via `crypto.randomUUID()`) and passes to Bun's WebSocket handler.
2. **All other requests** are delegated to the Hono server for normal HTTP routing.
3. **Failed upgrades** return a `500 WebSocket upgrade failed` response.

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
upgrade()  fetch(req, server)
  |
  +---> success: return undefined (Bun handles it)
  +---> failure: return Response(500)
```

## WebSocket Emitter API

### Overview

`WebSocketEmitter` is a standalone, lightweight Redis-only publisher designed for processes that do not run a `WebSocketServerHelper`. It extends `BaseHelper` and uses a single Redis pub client to publish `IRedisSocketMessage` envelopes.

### `IWebSocketEmitterOptions`

```typescript
interface IWebSocketEmitterOptions {
  identifier?: string;           // Default: 'WebSocketEmitter' (used as logger scope)
  redisConnection: DefaultRedisHelper;  // Required -- same Redis as the server(s)
}
```

### Constructor

```typescript
const emitter = new WebSocketEmitter({
  identifier: 'my-worker',      // Optional
  redisConnection: redisHelper,  // Required
});
```

The constructor:
1. Calls `super({ scope })` with `identifier` (or `'WebSocketEmitter'` if not provided)
2. Validates `redisConnection` is truthy (throws `"Invalid redis connection!"` if not)
3. Calls `redisConnection.getClient().duplicate()` to create an isolated pub client

### `EMITTER_SERVER_ID`

```typescript
const EMITTER_SERVER_ID = 'emitter';
```

All messages published by `WebSocketEmitter` use this fixed `serverId`. Since no `WebSocketServerHelper` instance will have a `serverId` of `'emitter'` (they use `crypto.randomUUID()`), all server instances will process emitter messages -- none will self-dedup.

### Methods

#### `configure()`

```typescript
async configure(): Promise<void>
```

Prepares the emitter for use:
1. Registers a Redis `error` event handler (logs errors)
2. Calls `redisPub.connect()` if the client status is `'wait'` (i.e., lazy-connect mode)
3. Waits for the Redis client to reach `'ready'` status (30-second timeout)

Must be called before any `toClient()`, `toUser()`, `toRoom()`, or `broadcast()` calls.

#### `toClient()`

```typescript
async toClient(opts: {
  clientId: string;
  event: string;
  data: unknown;
}): Promise<void>
```

Publishes to `ws:client:{clientId}`. The target server that holds this client will deliver the message via `sendToClient()`.

#### `toUser()`

```typescript
async toUser(opts: {
  userId: string;
  event: string;
  data: unknown;
}): Promise<void>
```

Publishes to `ws:user:{userId}`. All servers with sessions for this user will call `sendToUser()` locally, reaching every session across all instances.

#### `toRoom()`

```typescript
async toRoom(opts: {
  room: string;
  event: string;
  data: unknown;
  exclude?: string[];
}): Promise<void>
```

Publishes to `ws:room:{room}`. All servers with members in this room will call `sendToRoom()` locally. The optional `exclude` array is forwarded -- servers will skip those client IDs during delivery.

#### `broadcast()`

```typescript
async broadcast(opts: {
  event: string;
  data: unknown;
}): Promise<void>
```

Publishes to `ws:broadcast`. All servers will call `broadcast()` locally, reaching every authenticated client.

#### `shutdown()`

```typescript
async shutdown(): Promise<void>
```

Gracefully shuts down the emitter by calling `redisPub.quit()`. Always call this when the emitter is no longer needed to release the Redis connection.

## Internals

### `resolveBindings()`

Reads all binding keys from the DI container and validates required ones:

| Binding | Validation | Error on Failure |
|---------|-----------|------------------|
| `SERVER_OPTIONS` | Optional, merged with `DEFAULT_SERVER_OPTIONS` via `Object.assign()` | -- |
| `REDIS_CONNECTION` | Must be `instanceof DefaultRedisHelper` | `"Invalid instance of redisConnection"` |
| `AUTHENTICATE_HANDLER` | Must be truthy (non-null) | `"Invalid authenticateFn to setup WebSocket server!"` |
| `VALIDATE_ROOM_HANDLER` | Optional, coerced `null` to `undefined` | -- |
| `CLIENT_CONNECTED_HANDLER` | Optional, coerced `null` to `undefined` | -- |
| `CLIENT_DISCONNECTED_HANDLER` | Optional, coerced `null` to `undefined` | -- |
| `MESSAGE_HANDLER` | Optional, coerced `null` to `undefined` | -- |
| `OUTBOUND_TRANSFORMER` | Optional, coerced `null` to `undefined` | -- |
| `HANDSHAKE_HANDLER` | Optional, coerced `null` to `undefined` (required if `requireEncryption`) | -- |

### `registerBunHook()`

Registers a post-start hook that executes the following steps:

1. **Get Bun server instance** via `getServerInstance<TBunServerInstance>()`
2. **Get Hono server** via `getServer()`
3. **Create WebSocketServerHelper** with all resolved bindings and server options
4. **Await `wsHelper.configure()`** which connects Redis clients and sets up subscriptions
5. **Bind the helper** to `WEBSOCKET_INSTANCE` in the DI container
6. **Create custom `fetch` handler** via `createBunFetchHandler({ wsPath, honoServer })`
7. **Wire WebSocket into running server** via `serverInstance.reload({ fetch, websocket })`

#### Post-Start Hook Code Flow
```typescript
// Simplified post-start hook logic
async () => {
  // Step 1 & 2: Get server instances
  const serverInstance = this.application.getServerInstance<TBunServerInstance>();
  const honoServer = this.application.getServer();

  if (!serverInstance) {
    throw getError({
      message: '[WebSocketComponent] Bun server instance not available!',
    });
  }

  // Step 3: Create helper
  const wsHelper = new WebSocketServerHelper({
    identifier: serverOptions.identifier,
    path: serverOptions.path,
    defaultRooms: serverOptions.defaultRooms,
    serverOptions: serverOptions.serverOptions,
    heartbeatInterval: serverOptions.heartbeatInterval,
    heartbeatTimeout: serverOptions.heartbeatTimeout,
    server: serverInstance,
    redisConnection: resolved.redisConnection,
    authenticateFn: resolved.authenticateFn,
    validateRoomFn: resolved.validateRoomFn,
    clientConnectedFn: resolved.clientConnectedFn,
    clientDisconnectedFn: resolved.clientDisconnectedFn,
    messageHandler: resolved.messageHandler,
    outboundTransformer: resolved.outboundTransformer,
    handshakeFn: resolved.handshakeFn,
    requireEncryption: serverOptions.requireEncryption,
  });

  // Step 4: Configure (Redis + subscriptions + heartbeat timer)
  await wsHelper.configure();

  // Step 5: Bind to container
  this.application.bind({ key: WebSocketBindingKeys.WEBSOCKET_INSTANCE })
    .toValue(wsHelper);

  // Step 6 & 7: Create fetch handler and reload server
  serverInstance.reload({
    fetch: createBunFetchHandler({ wsPath, honoServer }),
    websocket: wsHelper.getBunWebSocketHandler(),
  });
}
```

### `createBunFetchHandler()`

The fetch handler is a standalone function (not a method on the component) that returns an async function:

```typescript
function createBunFetchHandler(opts: {
  wsPath: string;
  honoServer: OpenAPIHono;
}): (req: Request, server: TBunServerInstance) => Promise<Response | undefined>
```

The handler logic:
1. Parse `new URL(req.url)` to get the pathname
2. Check if `pathname === wsPath && headers.upgrade === 'websocket'`
3. If **not** a WebSocket upgrade, delegate to `honoServer.fetch(req, server)` -- note the second argument is the raw `server` instance, not wrapped in an object
4. If a WebSocket upgrade, call `server.upgrade(req, { data: { clientId: crypto.randomUUID() } })`
5. If upgrade succeeds, return `undefined` (Bun handles the connection)
6. If upgrade fails, return `new Response('WebSocket upgrade failed', { status: 500 })`

### Runtime Check

The component checks the runtime during `binding()`:

```typescript
const runtime = RuntimeModules.detect();
if (runtime === RuntimeModules.NODE) {
  throw getError({
    statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
    message: '[WebSocketComponent] Node.js runtime is not supported yet. Please use Bun runtime.',
  });
}
```

This check runs at component initialization time (before any hooks are registered), failing fast if the runtime is incompatible.

### Bun WebSocket Handler

The helper's `getBunWebSocketHandler()` returns an `IBunWebSocketHandler` -- a Bun-native WebSocket handler object with four lifecycle callbacks plus config spread:

```typescript
interface IBunWebSocketHandler extends IBunWebSocketConfig {
  open: (socket: IWebSocket) => void;      // New connection -- creates client entry, starts auth timer
  message: (socket: IWebSocket, message: string | Buffer) => void; // Incoming message -- routes to handler
  close: (socket: IWebSocket, code: number, reason: string) => void; // Disconnect -- cleanup
  drain: (socket: IWebSocket) => void;     // Backpressure cleared -- resets backpressured flag
}
```

The `open` handler (`onClientConnect`):
1. Checks if clientId already exists (returns early if duplicate)
2. Creates an `IWebSocketClient` entry in state `UNAUTHORIZED`
3. Subscribes the socket to its own `clientId` topic (Bun native pub/sub -- enables direct messaging before auth)
4. Starts an auth timeout timer (`authTimeout`, default 5 s)

The `message` handler (`onClientMessage`):
1. Updates `lastActivity` on the client
2. Parses JSON -- sends `error` event `"Invalid message format"` if parse fails
3. Validates `event` field exists -- silently drops if missing (with error log)
4. Routes by event:
   - `heartbeat`: returns immediately (no-op, `lastActivity` already updated)
   - `authenticate`: delegates to `handleAuthenticate()`
   - Any other event from unauthenticated client: sends `error` event `"Not authenticated"`
   - `join`: delegates to `handleJoin()`
   - `leave`: delegates to `handleLeave()`
   - Custom events: delegates to `messageHandler` callback (if bound), otherwise silently dropped

The `close` handler (`onClientDisconnect`):
1. Clears auth timer if pending
2. Removes client from `users` index (deletes user entry if last session)
3. Removes client from all `rooms` entries (deletes room entry if empty)
4. Deletes from `clients` map
5. Invokes `clientDisconnectedFn` callback (errors caught and logged)

The `drain` handler:
1. Sets `client.backpressured = false`
2. Logs a debug message

### `deliverToSocket()` Backpressure Handling

The `deliverToSocket()` method handles three return values from Bun's `socket.send()`:

| Return Value | Meaning | Action |
|-------------|---------|--------|
| `> 0` (positive) | Message sent successfully (byte count) | No action |
| `0` | Message dropped (socket already closed) | Logs warning: `"Message dropped (socket closed)"` |
| `-1` | Backpressure (Bun's send buffer is full) | Sets `client.backpressured = true`, logs warning. The message is still queued by Bun. When the buffer drains, the `drain` handler fires and resets `backpressured` to `false` |

Any exception thrown by `socket.send()` is caught and logged as an error.

### `send()` Destination Resolution

The `send()` method is the primary public API for sending messages. It resolves the `destination` parameter using the following logic:

```
send({ destination, payload: { topic, data } })
  |
  +-- destination is undefined/null?
  |     Yes -> broadcast locally + publishToRedis(BROADCAST)
  |
  +-- destination matches a local clientId?
  |     Yes -> sendToClient locally + publishToRedis(CLIENT)
  |
  +-- destination matches a local room name?
  |     Yes -> sendToRoom locally + publishToRedis(ROOM)
  |
  +-- destination is unknown locally?
        Yes -> publishToRedis(ROOM, target: destination)
              (assumes it might be a room on another instance)
```

> [!IMPORTANT]
> **No USER type in `send()`.** The `send()` method does not support `userId` as a destination. To send to all sessions of a user, use `sendToUser()` for local-only delivery or `WebSocketEmitter.toUser()` for cross-instance delivery via Redis.

> [!NOTE]
> When the destination is unknown locally, `send()` publishes it as a `ROOM` type to Redis. This is intentional -- if it is a client ID on another server, that server will not find it in its rooms map either, but the `onRedisMessage` handler routes `CLIENT` and `ROOM` messages differently. For reliable cross-instance client targeting, prefer using `WebSocketEmitter.toClient()` which explicitly uses the `CLIENT` message type.

### Room Join Validation

Room names go through two validation stages:

1. **Server-side sanitization** (always applied):
   - Must be a non-empty string (truthy, `typeof r === 'string'`)
   - Must be <= 256 characters
   - Must not start with `ws:` prefix (reserved for internal channels)

2. **Application-level validation** (via `validateRoomFn`):
   - Only called if the function is bound
   - Receives the sanitized room list
   - Returns the subset of rooms the client is allowed to join
   - If no `validateRoomFn` is bound, **all join requests are rejected** with a warning log

### Room Leave Validation

The `handleLeave()` method validates that the client has actually joined the requested rooms before leaving:

```typescript
const validRooms = rooms.filter(r => client.rooms.has(r));
```

This prevents clients from unsubscribing from internal topics or rooms they never joined. If no valid rooms remain after filtering, the leave is silently ignored.

### Graceful Shutdown

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

#### Shutdown Sequence Diagram
```
wsHelper.shutdown()
  |-- Clear heartbeat timer
  |     +-- clearInterval(heartbeatTimer)
  |
  |-- Close all sockets
  |     +-- For each client: socket.close(1001, 'Server shutting down')
  |         (errors caught per-client -- already-disconnected clients are logged)
  |
  |-- Trigger disconnect callbacks
  |     +-- For each client: onClientDisconnect({ clientId })
  |         |-- Clear auth timer
  |         |-- Remove from users map
  |         |-- Remove from rooms map
  |         |-- Remove from clients map
  |         +-- Invoke clientDisconnectedFn callback
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

The shutdown sequence ensures:
- Active connections are gracefully closed with code `1001` ("Going Away")
- All disconnect callbacks are invoked (so application-level cleanup runs)
- All internal state is cleared (client/user/room maps)
- Redis pub/sub clients are properly disconnected
- No memory leaks from lingering timers or connections

### WebSocketEmitter Shutdown

```
emitter.shutdown()
  +-- redisPub.quit()
```

The emitter shutdown is simpler since it only has one Redis client and no local state to clean up.

## See Also

- [Setup & Configuration](./) - Quick reference, imports, setup steps, configuration, and binding keys
- [Usage & Examples](./usage) - Server-side usage, emitter, wire protocol, client tracking, and delivery strategy
- [Error Reference](./errors) - Error conditions table and troubleshooting
- [WebSocketServerHelper](/references/helpers/websocket/) - Helper API documentation
- [Socket.IO Component](../socket-io/) - Node.js-compatible alternative with Socket.IO
- [Bun WebSocket Documentation](https://bun.sh/docs/api/websockets) - Official Bun WebSocket API reference
