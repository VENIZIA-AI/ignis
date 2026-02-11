# Usage

## SocketIOServerHelper

### Server Setup

#### `configure(): Promise<void>`

Initializes the IO server, Redis adapter/emitter, and connection handler. Must be called after construction before the server can accept connections.

```typescript
await helper.configure();
```

> [!IMPORTANT]
> The constructor does NOT call `configure()` automatically. You must call it explicitly and await it before the server is operational.

::: details configure() internals
```
configure()  [async]
  |
  +-- Register error handlers on redisPub, redisSub, redisEmitter
  |
  +-- Connect any Redis clients in 'wait' status (lazyConnect)
  |
  +-- Await all Redis connections ready
  |     \-- Promise.all([waitForRedisReady(pub), waitForRedisReady(sub), waitForRedisReady(emitter)])
  |
  +-- Runtime check
  |     +-- NODE: new IOServer(httpServer, serverOptions)
  |     \-- BUN:  new IOServer() + io.bind(bunEngine)
  |
  +-- Redis Adapter
  |     \-- io.adapter(createAdapter(redisPub, redisSub))
  |
  +-- Redis Emitter
  |     \-- new Emitter(redisEmitter)
  |
  \-- Connection handler
        \-- io.on('connection', socket => onClientConnect({ socket }))
```
:::

#### `getIOServer(): IOServer`

Returns the raw Socket.IO `Server` instance for advanced operations.

```typescript
const io = helper.getIOServer();
io.of('/admin').on('connection', socket => { /* ... */ });
```

#### `getEngine(): any`

Returns the `@socket.io/bun-engine` instance (Bun runtime only). **Throws** if called on a non-Bun runtime.

```typescript
const engine = helper.getEngine();
// Use for Bun-specific operations
// Throws an error if runtime is not Bun
```

#### `shutdown(): Promise<void>`

Full graceful shutdown -- disconnects all clients, closes server, quits Redis connections.

```typescript
await helper.shutdown();
```

::: details Shutdown sequence
```
shutdown()
  |
  +-- For each tracked client:
  |     +-- clearInterval(ping interval)
  |     +-- clearTimeout(authenticate timeout)
  |     \-- socket.disconnect()
  |
  +-- clients.clear()
  |
  +-- io.close()
  |
  \-- Quit Redis clients (parallel):
        +-- redisPub.quit()
        +-- redisSub.quit()
        \-- redisEmitter.quit()
```
:::


### Event Handling

#### `on<HandlerArgsType, HandlerReturnType>(opts): void`

Register a listener on the IO Server (not individual sockets).

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts.topic` | `string` | Event name |
| `opts.handler` | `(...args) => ValueOrPromise<T>` | Event handler |

```typescript
helper.on({
  topic: 'connection',
  handler: (socket) => {
    console.log('New connection:', socket.id);
  },
});
```

#### `getClients(opts?): ISocketIOClient | Map<string, ISocketIOClient> | undefined`

Returns tracked clients.

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts.id` | `string` (optional) | Specific client ID. If omitted, returns all clients |

```typescript
// Get all clients
const allClients = helper.getClients() as Map<string, ISocketIOClient>;
console.log('Connected:', allClients.size);

// Get specific client
const client = helper.getClients({ id: socketId }) as ISocketIOClient | undefined;
if (client) {
  console.log('State:', client.state); // 'authenticated' | 'authenticating' | 'unauthorized'
}
```

#### `ping(opts): void`

Send a keep-alive ping to a specific client. Automatically called on an interval after authentication, but can also be invoked manually.

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts.socket` | `IOSocket` | The socket to ping |
| `opts.doIgnoreAuth` | `boolean` | If `false`, disconnects the client when not in `AUTHENTICATED` state |

```typescript
helper.ping({ socket: clientSocket, doIgnoreAuth: true });
// Emits SocketIOConstants.EVENT_PING with { time: ISO timestamp }
```

#### `disconnect(opts): void`

Disconnect a client and clean up resources.

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts.socket` | `IOSocket` | The socket to disconnect |

```typescript
helper.disconnect({ socket: clientSocket });
// Clears ping interval, auth timeout, removes from tracking, calls socket.disconnect()
```


### Broadcasting

#### `send(opts): void`

Send a message via the Redis emitter (works across processes/instances).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `opts.destination` | `string` | No | Socket ID or room name. If omitted, broadcasts to all |
| `opts.payload.topic` | `string` | Yes | Event name |
| `opts.payload.data` | `any` | Yes | Event payload |
| `opts.doLog` | `boolean` | No | Log the emission (default: `false`) |
| `opts.cb` | `() => void` | No | Callback executed via `setImmediate` after emit |

```typescript
// Send to specific client
helper.send({
  destination: socketId,
  payload: { topic: 'notification', data: { message: 'Hello!' } },
});

// Send to room
helper.send({
  destination: 'io-notification',
  payload: { topic: 'alert', data: { level: 'warning', text: 'CPU high' } },
});

// Broadcast to all
helper.send({
  payload: { topic: 'system:announcement', data: { text: 'Maintenance in 5 min' } },
});
```


### Authentication Flow

The server implements a challenge-response authentication pattern using Socket.IO events:

::: details Authentication sequence diagram
```
Client                          Server (SocketIOServerHelper)
  |                                |
  |-- connect ----------------->  |  onClientConnect()
  |                                |    +-- Create client entry (state: UNAUTHORIZED)
  |                                |    +-- Start authenticateTimeout (10s)
  |                                |    \-- Register disconnect handler
  |                                |
  |-- "authenticate" ---------->  |  Event handler
  |                                |    +-- Set state: AUTHENTICATING
  |                                |    \-- Call authenticateFn(handshake)
  |                                |
  |                                |  -- authenticateFn returns true --
  |                                |    onClientAuthenticated()
  |                                |      +-- Set state: AUTHENTICATED
  |                                |      +-- Send initial ping
  |                                |      +-- Join default rooms
  |                                |      +-- Register join/leave handlers
  |                                |      +-- Start ping interval (configurable via `pingInterval`)
  |  <-- "authenticated" ---------|      +-- Emit "authenticated" with { id, time }
  |                                |      \-- Call clientConnectedFn({ socket })
  |                                |
  |                                |  -- authenticateFn returns false --
  |  <-- "unauthenticated" ------|    +-- Emit "unauthenticated" with error message
  |                                |    \-- Disconnect client (via callback)
  |                                |
  |                                |  -- authenticateTimeout expires --
  |                                |    \-- Disconnect client (if still UNAUTHORIZED)
```
:::

#### `IHandshake` Object

The `authenticateFn` receives the Socket.IO handshake data:

| Field | Type | Description |
|-------|------|-------------|
| `headers` | `IncomingHttpHeaders` | HTTP headers from the connection request |
| `time` | `string` | Handshake timestamp |
| `address` | `string` | Client IP address |
| `xdomain` | `boolean` | Whether the request is cross-domain |
| `secure` | `boolean` | Whether the connection is secure (HTTPS/WSS) |
| `issued` | `number` | When the handshake was issued (Unix timestamp) |
| `url` | `string` | Request URL |
| `query` | `ParsedUrlQuery` | URL query parameters |
| `auth` | `Record<string, any>` | Auth data from the client's `auth` option |

#### `ISocketIOClient` Tracked State

Each connected client is tracked with:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Socket ID |
| `socket` | `IOSocket` | Raw Socket.IO socket |
| `state` | `TSocketIOClientState` | Authentication state |
| `interval` | `NodeJS.Timeout?` | Ping interval (configurable via `pingInterval`) |
| `authenticateTimeout` | `NodeJS.Timeout` | Timeout to disconnect unauthenticated clients |

#### Client States

```
  +--------------+     authenticate      +----------------+    auth success   +---------------+
  |  UNAUTHORIZED | ------------------>   | AUTHENTICATING  | ----------------> | AUTHENTICATED  |
  +--------------+                        +----------------+                   +---------------+
        ^                                        |                                    |
        |              auth failure               |                                    |
        +<----------------------------------------+                                    |
        ^                                                                              |
        |                               disconnect                                     |
        +<-----------------------------------------------------------------------------+
```

| State | Value | Description |
|-------|-------|-------------|
| `SocketIOClientStates.UNAUTHORIZED` | `'unauthorized'` | Initial state, or after auth failure |
| `SocketIOClientStates.AUTHENTICATING` | `'authenticating'` | `authenticate` event received, awaiting `authenticateFn` |
| `SocketIOClientStates.AUTHENTICATED` | `'authenticated'` | Successfully authenticated, fully operational |


### Rooms

#### Built-in Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `join` | Client -> Server | `{ rooms: string[] }` | Join one or more rooms |
| `leave` | Client -> Server | `{ rooms: string[] }` | Leave one or more rooms |

These handlers are registered automatically in `onClientAuthenticated()`.

#### Room Validation

Client room join requests are validated using the `validateRoomFn` callback. If no `validateRoomFn` is configured, **all join requests are rejected** for security.

```typescript
const helper = new SocketIOServerHelper({
  // ...
  validateRoomFn: ({ socket, rooms }) => {
    // Only allow rooms prefixed with 'public-' or the user's own room
    const userId = socket.handshake.auth.userId;
    return rooms.filter(room =>
      room.startsWith('public-') || room === `user-${userId}`
    );
  },
});
```

The function receives the socket and requested rooms, and must return the subset of rooms the client is allowed to join.

#### Default Rooms

Authenticated clients auto-join these rooms (configurable via `defaultRooms`):

| Room | Constant | Purpose |
|------|----------|---------|
| `io-default` | `SocketIOConstants.ROOM_DEFAULT` | General-purpose room for all clients |
| `io-notification` | `SocketIOConstants.ROOM_NOTIFICATION` | Notification delivery room |

#### Programmatic Room Management

From your service code, you can manage rooms via the tracked client's socket:

```typescript
const client = helper.getClients({ id: socketId }) as ISocketIOClient | undefined;

if (client) {
  // Join rooms
  client.socket.join(['room-a', 'room-b']);

  // Leave a room
  client.socket.leave('room-a');

  // Get current rooms
  const rooms = Array.from(client.socket.rooms);
  // rooms = [socketId, 'room-b', 'io-default', 'io-notification']
  // Note: first room is always the socket's own ID
}
```


### Redis Integration

The helper creates **three** dedicated Redis connections (duplicated from your `redisConnection`):

| Connection | Purpose | Library |
|------------|---------|---------|
| `redisPub` | Publish adapter messages | `@socket.io/redis-adapter` |
| `redisSub` | Subscribe to adapter messages | `@socket.io/redis-adapter` |
| `redisEmitter` | Emit messages to other processes | `@socket.io/redis-emitter` |

::: details Why three connections?
```
Process A                     Redis                     Process B
+---------+                +----------+               +---------+
| IO Server|--redisPub---->|          |<--redisPub----| IO Server|
|          |<--redisSub----|  Pub/Sub |--redisSub---->|          |
|          |               |          |               |          |
| Emitter  |--redisEmitter>| Streams  |<--redisEmitter| Emitter  |
+---------+                +----------+               +---------+
```

- **Adapter** (pub/sub pair): Synchronizes Socket.IO state across multiple server instances. When server A emits to a room, the adapter broadcasts via Redis so server B's clients in that room also receive the event.
- **Emitter**: Allows emitting events from non-Socket.IO processes (background workers, microservices) using the same Redis connection.
:::

#### Horizontal Scaling

With Redis adapter configured, you can run multiple server instances behind a load balancer:

```
Client A --> Load Balancer --> Server 1 (Socket.IO + Redis Adapter)
Client B -->       |       --> Server 2 (Socket.IO + Redis Adapter)
Client C -->       |       --> Server 3 (Socket.IO + Redis Adapter)
                   |
              All servers share state via Redis
```

Events emitted via `helper.send()` use the **emitter** (not direct socket), so they propagate across all instances automatically.


### Built-in Events Reference

| Event | Constant | Direction | When |
|-------|----------|-----------|------|
| `connection` | `SocketIOConstants.EVENT_CONNECT` | Server-side | Fired on server when a new client connects |
| `disconnect` | `SocketIOConstants.EVENT_DISCONNECT` | Bidirectional | Client disconnects (intentional or timeout) |
| `authenticate` | `SocketIOConstants.EVENT_AUTHENTICATE` | Client -> Server | Client requests authentication |
| `authenticated` | `SocketIOConstants.EVENT_AUTHENTICATED` | Server -> Client | Authentication succeeded |
| `unauthenticated` | `SocketIOConstants.EVENT_UNAUTHENTICATE` | Server -> Client | Authentication failed |
| `ping` | `SocketIOConstants.EVENT_PING` | Server -> Client | Keep-alive (interval configurable via `pingInterval`) |
| `join` | `SocketIOConstants.EVENT_JOIN` | Client -> Server | Request to join rooms |
| `leave` | `SocketIOConstants.EVENT_LEAVE` | Client -> Server | Request to leave rooms |


### Constants Reference

#### `SocketIOConstants`

| Constant | Value | Description |
|----------|-------|-------------|
| `EVENT_PING` | `'ping'` | Server -> Client keep-alive (interval configurable via `pingInterval`) |
| `EVENT_CONNECT` | `'connection'` | Server-side connection event |
| `EVENT_DISCONNECT` | `'disconnect'` | Disconnection event |
| `EVENT_JOIN` | `'join'` | Room join request |
| `EVENT_LEAVE` | `'leave'` | Room leave request |
| `EVENT_AUTHENTICATE` | `'authenticate'` | Client -> Server auth request |
| `EVENT_AUTHENTICATED` | `'authenticated'` | Server -> Client auth success |
| `EVENT_UNAUTHENTICATE` | `'unauthenticated'` | Server -> Client auth failure |
| `ROOM_DEFAULT` | `'io-default'` | Default room for all authenticated clients |
| `ROOM_NOTIFICATION` | `'io-notification'` | Default notification room |

#### `SocketIOClientStates`

| Constant | Value |
|----------|-------|
| `UNAUTHORIZED` | `'unauthorized'` |
| `AUTHENTICATING` | `'authenticating'` |
| `AUTHENTICATED` | `'authenticated'` |

Utility methods:

```typescript
SocketIOClientStates.isValid('authenticated'); // true
SocketIOClientStates.isValid('invalid');        // false
SocketIOClientStates.SCHEME_SET;               // Set { 'unauthorized', 'authenticating', 'authenticated' }
```


## SocketIOClientHelper

### Connection Management

#### `connect(): void`

Explicitly connect to the server (if not already connected).

```typescript
client.connect();
```

#### `disconnect(): void`

Disconnect from the server.

```typescript
client.disconnect();
```

#### `authenticate(): void`

Send the `authenticate` event to the server. Only works when connected and in `UNAUTHORIZED` state.

```typescript
client.authenticate();
// Server will respond with 'authenticated' or 'unauthenticated' event
```

#### `getState(): TSocketIOClientState`

Returns the current authentication state.

```typescript
const state = client.getState();
// 'unauthorized' | 'authenticating' | 'authenticated'
```

#### `getSocketClient(): Socket`

Returns the raw `socket.io-client` `Socket` instance for advanced operations.

```typescript
const socket = client.getSocketClient();
socket.on('custom-event', (data) => { /* ... */ });
```

#### `shutdown(): void`

Full cleanup -- removes all listeners, disconnects, resets state.

```typescript
client.shutdown();
```


### Event Subscription

#### `subscribe<T>(opts): void`

Subscribe to a single event with duplicate protection.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `opts.event` | `string` | -- | Event name |
| `opts.handler` | `TSocketIOEventHandler<T>` | -- | Event handler (errors are caught internally) |
| `opts.ignoreDuplicate` | `boolean` | `true` | Skip if handler already exists for this event |

```typescript
client.subscribe<{ message: string }>({
  event: 'notification',
  handler: (data) => {
    console.log('Got notification:', data.message);
  },
});
```

#### `subscribeMany(opts): void`

Subscribe to multiple events at once.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `opts.events` | `Record<string, TSocketIOEventHandler>` | -- | Map of event names to handlers |
| `opts.ignoreDuplicate` | `boolean` | `true` | Skip events that already have handlers (forwarded to `subscribe()`) |

```typescript
client.subscribeMany({
  events: {
    'chat:message': (data) => console.log('Chat:', data),
    'room:update': (data) => console.log('Room:', data),
    'system:alert': (data) => console.log('Alert:', data),
  },
});
```

#### `unsubscribe(opts): void`

Remove event listener(s).

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts.event` | `string` | Event name |
| `opts.handler` | `TSocketIOEventHandler` (optional) | Specific handler to remove. If omitted, removes all handlers |

```typescript
// Remove specific handler
client.unsubscribe({ event: 'notification', handler: myHandler });

// Remove all handlers for event
client.unsubscribe({ event: 'notification' });
```

#### `unsubscribeMany(opts): void`

Remove all handlers for multiple events.

```typescript
client.unsubscribeMany({ events: ['chat:message', 'room:update'] });
```


### Emitting and Rooms

#### `emit<T>(opts): void`

Emit an event to the server.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `opts.topic` | `string` | Yes | Event name |
| `opts.data` | `T` | Yes | Event payload |
| `opts.doLog` | `boolean` | No | Log the emission (default: `false`) |
| `opts.cb` | `() => void` | No | Callback executed via `setImmediate` after emit |

```typescript
client.emit({
  topic: 'chat:message',
  data: { room: 'general', message: 'Hello everyone!' },
});
```

> [!NOTE]
> Throws if the client is not connected. Check `getSocketClient().connected` first if unsure.

#### `joinRooms(opts): void`

Request to join rooms (emits the `join` event to server).

```typescript
client.joinRooms({ rooms: ['room-a', 'room-b'] });
```

#### `leaveRooms(opts): void`

Request to leave rooms (emits the `leave` event to server).

```typescript
client.leaveRooms({ rooms: ['room-a'] });
```


### Client Lifecycle

::: details Client lifecycle diagram
```
  +----------+
  | new       |  constructor -> configure()
  | Client()  |    +-- io(host, options)
  +-----+-----+    +-- Register: connect, disconnect, connect_error
        |          +-- Register: authenticated, unauthenticated, ping
        |          \-- Connection established (if server is reachable)
        |
  +-----v---------+
  |  Connected     |  onConnected callback fires
  |  (UNAUTHORIZED)|
  +-----+---------+
        |
        | authenticate()
        |
  +-----v----------+
  | AUTHENTICATING  |  Waiting for server response
  +-----+----------+
        |
   +----+----+
   |         |
   v         v
+--------+ +--------------+
| AUTH'D | | UNAUTH'D     |  onUnauthenticated callback
|        | | -> disconnect |
+---+----+ +--------------+
    |
    | onAuthenticated callback
    |
    v
  Ready to emit/subscribe
    |
    | disconnect() or server disconnect
    |
  +-v-------------+
  | Disconnected  |  onDisconnected callback
  | (UNAUTHORIZED)|  State reset
  +--------------+
```
:::
