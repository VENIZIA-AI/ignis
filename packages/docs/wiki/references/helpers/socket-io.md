# Socket.IO Helpers

Structured Socket.IO server and client management for real-time bidirectional communication. Provides authentication, room management, Redis scaling, and lifecycle management out of the box.

## Quick Reference

| Helper | Package | Purpose |
|--------|---------|---------|
| [`SocketIOServerHelper`](#socketioserverhelper) | `@venizia/ignis-helpers` | Server-side Socket.IO wrapper with auth, rooms, Redis adapter |
| [`SocketIOClientHelper`](#socketioclienthelper) | `@venizia/ignis-helpers` | Client-side Socket.IO wrapper with structured event handling |

### Import Paths

```typescript
// Server helper
import { SocketIOServerHelper } from '@venizia/ignis-helpers';

// Client helper
import { SocketIOClientHelper } from '@venizia/ignis-helpers';

// Types and constants
import {
  TSocketIOServerOptions,
  ISocketIOServerBaseOptions,
  ISocketIOServerNodeOptions,
  ISocketIOServerBunOptions,
  ISocketIOClientOptions,
  IHandshake,
  ISocketIOClient,
  SocketIOConstants,
  SocketIOClientStates,
  TSocketIOEventHandler,
  TSocketIOAuthenticateFn,
  TSocketIOValidateRoomFn,
  TSocketIOClientConnectedFn,
} from '@venizia/ignis-helpers';
```

---

# SocketIOServerHelper

Wraps the Socket.IO `Server` instance with built-in authentication flow, client tracking, room management, Redis adapter/emitter, and dual-runtime support (Node.js + Bun).

## Constructor

```typescript
new SocketIOServerHelper(opts: TSocketIOServerOptions)
```

### Options (Discriminated Union)

`TSocketIOServerOptions` is a discriminated union on the `runtime` field:

```typescript
type TSocketIOServerOptions = ISocketIOServerNodeOptions | ISocketIOServerBunOptions;
```

**Base options** (shared by both runtimes):

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `identifier` | `string` | Yes | — | Unique name for this Socket.IO server instance |
| `serverOptions` | `Partial<ServerOptions>` | Yes | — | Socket.IO server configuration (path, cors, etc.) |
| `redisConnection` | `DefaultRedisHelper` | Yes | — | Redis helper for adapter + emitter. Creates 3 duplicate connections internally |
| `authenticateFn` | `TSocketIOAuthenticateFn` | Yes | — | Called when client emits `authenticate`. Return `true` to accept |
| `clientConnectedFn` | `TSocketIOClientConnectedFn` | No | — | Called after successful authentication |
| `validateRoomFn` | `TSocketIOValidateRoomFn` | No | — | Called when client requests to join rooms. Return allowed room names. Joins rejected if not provided |
| `authenticateTimeout` | `number` | No | `10000` (10s) | Milliseconds before unauthenticated clients are disconnected |
| `pingInterval` | `number` | No | `30000` (30s) | Milliseconds between keep-alive pings to authenticated clients |
| `defaultRooms` | `string[]` | No | `['io-default', 'io-notification']` | Rooms clients auto-join after authentication |

**Node.js-specific options** (`runtime: RuntimeModules.NODE`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `runtime` | `typeof RuntimeModules.NODE` | Yes | Must be `RuntimeModules.NODE` (`'node'`) |
| `server` | `node:http.Server` | Yes | The HTTP server instance to attach Socket.IO to |

**Bun-specific options** (`runtime: RuntimeModules.BUN`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `runtime` | `typeof RuntimeModules.BUN` | Yes | Must be `RuntimeModules.BUN` (`'bun'`) |
| `engine` | `any` | Yes | `@socket.io/bun-engine` Server instance |

### Constructor Examples

**Node.js:**

```typescript
import { RuntimeModules, SocketIOServerHelper } from '@venizia/ignis-helpers';

const helper = new SocketIOServerHelper({
  runtime: RuntimeModules.NODE,
  identifier: 'my-socket-server',
  server: httpServer,                    // node:http.Server
  serverOptions: { path: '/io', cors: { origin: '*' } },
  redisConnection: myRedisHelper,
  authenticateFn: async (handshake) => {
    const token = handshake.headers.authorization;
    return verifyJWT(token);
  },
  clientConnectedFn: ({ socket }) => {
    console.log('Client authenticated:', socket.id);
  },
});
```

**Bun:**

```typescript
import { RuntimeModules, SocketIOServerHelper } from '@venizia/ignis-helpers';

const { Server: BunEngine } = await import('@socket.io/bun-engine');
const engine = new BunEngine({ path: '/io', cors: { origin: '*' } });

const helper = new SocketIOServerHelper({
  runtime: RuntimeModules.BUN,
  identifier: 'my-socket-server',
  engine,                                // @socket.io/bun-engine instance
  serverOptions: { path: '/io', cors: { origin: '*' } },
  redisConnection: myRedisHelper,
  authenticateFn: async (handshake) => {
    const token = handshake.headers.authorization;
    return verifyJWT(token);
  },
});
```

---

## Methods

### `getIOServer(): IOServer`

Returns the raw Socket.IO `Server` instance for advanced operations.

```typescript
const io = helper.getIOServer();
io.of('/admin').on('connection', socket => { /* ... */ });
```

### `getClients(opts?): ISocketIOClient | Map<string, ISocketIOClient> | undefined`

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

### `on<HandlerArgsType, HandlerReturnType>(opts): void`

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

### `send(opts): void`

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

### `disconnect(opts): void`

Disconnect a client and clean up resources.

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts.socket` | `IOSocket` | The socket to disconnect |

```typescript
helper.disconnect({ socket: clientSocket });
// Clears ping interval, auth timeout, removes from tracking, calls socket.disconnect()
```

### `getEngine(): any`

Returns the `@socket.io/bun-engine` instance (Bun runtime only). **Throws** if called on a non-Bun runtime.

```typescript
const engine = helper.getEngine();
// Use for Bun-specific operations
// Throws an error if runtime is not Bun
```

### `shutdown(): Promise<void>`

Full graceful shutdown — disconnects all clients, closes server, quits Redis connections.

```typescript
await helper.shutdown();
```

**Shutdown sequence:**

```
shutdown()
  │
  ├── For each tracked client:
  │     ├── clearInterval(ping interval)
  │     ├── clearTimeout(authenticate timeout)
  │     └── socket.disconnect()
  │
  ├── clients.clear()
  │
  ├── io.close()
  │
  └── Quit Redis clients (parallel):
        ├── redisPub.quit()
        ├── redisSub.quit()
        └── redisEmitter.quit()
```

---

## Authentication Flow

The server implements a challenge-response authentication pattern using Socket.IO events:

```
Client                          Server (SocketIOServerHelper)
  │                                │
  │── connect ──────────────────►  │  onClientConnect()
  │                                │    ├── Create client entry (state: UNAUTHORIZED)
  │                                │    ├── Start authenticateTimeout (10s)
  │                                │    └── Register disconnect handler
  │                                │
  │── "authenticate" ───────────►  │  Event handler
  │                                │    ├── Set state: AUTHENTICATING
  │                                │    └── Call authenticateFn(handshake)
  │                                │
  │                                │  ── authenticateFn returns true ──
  │                                │    onClientAuthenticated()
  │                                │      ├── Set state: AUTHENTICATED
  │                                │      ├── Send initial ping
  │                                │      ├── Join default rooms
  │                                │      ├── Register join/leave handlers
  │                                │      ├── Start ping interval (configurable via `pingInterval`)
  │  ◄── "authenticated" ──────── │      ├── Emit "authenticated" with { id, time }
  │                                │      └── Call clientConnectedFn({ socket })
  │                                │
  │                                │  ── authenticateFn returns false ──
  │  ◄── "unauthenticated" ────── │    ├── Emit "unauthenticated" with error message
  │                                │    └── Disconnect client (via callback)
  │                                │
  │                                │  ── authenticateTimeout expires ──
  │                                │    └── Disconnect client (if still UNAUTHORIZED)
```

### `IHandshake` Object

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

### `ISocketIOClient` Tracked State

Each connected client is tracked with:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Socket ID |
| `socket` | `IOSocket` | Raw Socket.IO socket |
| `state` | `TSocketIOClientState` | Authentication state |
| `interval` | `NodeJS.Timeout?` | Ping interval (configurable via `pingInterval`) |
| `authenticateTimeout` | `NodeJS.Timeout` | Timeout to disconnect unauthenticated clients |

### Client States

```
  ┌──────────────┐     authenticate      ┌────────────────┐    auth success   ┌───────────────┐
  │  UNAUTHORIZED │ ──────────────────►   │ AUTHENTICATING  │ ────────────────► │ AUTHENTICATED  │
  └──────────────┘                        └────────────────┘                   └───────────────┘
        ▲                                        │                                    │
        │              auth failure               │                                    │
        └─────────────────────────────────────────┘                                    │
        ▲                                                                              │
        │                               disconnect                                     │
        └──────────────────────────────────────────────────────────────────────────────┘
```

| State | Value | Description |
|-------|-------|-------------|
| `SocketIOClientStates.UNAUTHORIZED` | `'unauthorized'` | Initial state, or after auth failure |
| `SocketIOClientStates.AUTHENTICATING` | `'authenticating'` | `authenticate` event received, awaiting `authenticateFn` |
| `SocketIOClientStates.AUTHENTICATED` | `'authenticated'` | Successfully authenticated, fully operational |

---

## Room Management

After authentication, clients can join and leave rooms:

### Built-in Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `join` | Client → Server | `{ rooms: string[] }` | Join one or more rooms |
| `leave` | Client → Server | `{ rooms: string[] }` | Leave one or more rooms |

These handlers are registered automatically in `onClientAuthenticated()`.

### Room Validation

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

### Default Rooms

Authenticated clients auto-join these rooms (configurable via `defaultRooms`):

| Room | Constant | Purpose |
|------|----------|---------|
| `io-default` | `SocketIOConstants.ROOM_DEFAULT` | General-purpose room for all clients |
| `io-notification` | `SocketIOConstants.ROOM_NOTIFICATION` | Notification delivery room |

### Programmatic Room Management

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

---

## Redis Integration

The helper creates **three** dedicated Redis connections (duplicated from your `redisConnection`):

| Connection | Purpose | Library |
|------------|---------|---------|
| `redisPub` | Publish adapter messages | `@socket.io/redis-adapter` |
| `redisSub` | Subscribe to adapter messages | `@socket.io/redis-adapter` |
| `redisEmitter` | Emit messages to other processes | `@socket.io/redis-emitter` |

### Why Three Connections?

```
Process A                     Redis                     Process B
┌─────────┐                ┌──────────┐               ┌─────────┐
│ IO Server│──redisPub────►│          │◄──redisPub────│ IO Server│
│          │◄──redisSub────│  Pub/Sub │──redisSub────►│          │
│          │               │          │               │          │
│ Emitter  │──redisEmitter►│ Streams  │◄──redisEmitter│ Emitter  │
└─────────┘                └──────────┘               └─────────┘
```

- **Adapter** (pub/sub pair): Synchronizes Socket.IO state across multiple server instances. When server A emits to a room, the adapter broadcasts via Redis so server B's clients in that room also receive the event.
- **Emitter**: Allows emitting events from non-Socket.IO processes (background workers, microservices) using the same Redis connection.

### Horizontal Scaling

With Redis adapter configured, you can run multiple server instances behind a load balancer:

```
Client A ──► Load Balancer ──► Server 1 (Socket.IO + Redis Adapter)
Client B ──►       │       ──► Server 2 (Socket.IO + Redis Adapter)
Client C ──►       │       ──► Server 3 (Socket.IO + Redis Adapter)
                   │
              All servers share state via Redis
```

Events emitted via `helper.send()` use the **emitter** (not direct socket), so they propagate across all instances automatically.

---

## Built-in Events Reference

| Event | Constant | Direction | When |
|-------|----------|-----------|------|
| `connection` | `SocketIOConstants.EVENT_CONNECT` | Client → Server | New WebSocket connection established |
| `disconnect` | `SocketIOConstants.EVENT_DISCONNECT` | Client → Server | Client disconnects (intentional or timeout) |
| `authenticate` | `SocketIOConstants.EVENT_AUTHENTICATE` | Client → Server | Client requests authentication |
| `authenticated` | `SocketIOConstants.EVENT_AUTHENTICATED` | Server → Client | Authentication succeeded |
| `unauthenticated` | `SocketIOConstants.EVENT_UNAUTHENTICATE` | Server → Client | Authentication failed |
| `ping` | `SocketIOConstants.EVENT_PING` | Server → Client | Server → Client keep-alive (interval configurable via `pingInterval`) |
| `join` | `SocketIOConstants.EVENT_JOIN` | Client → Server | Request to join rooms |
| `leave` | `SocketIOConstants.EVENT_LEAVE` | Client → Server | Request to leave rooms |

---

## `configure()` Internals

The `configure()` method sets up the IO server based on runtime:

```
configure()  [async]
  │
  ├── Register error handlers on redisPub, redisSub, redisEmitter
  │
  ├── Await all Redis connections ready
  │     └── Promise.all([waitForRedisReady(pub), waitForRedisReady(sub), waitForRedisReady(emitter)])
  │
  ├── Runtime check
  │     ├── NODE: new IOServer(httpServer, serverOptions)
  │     └── BUN:  new IOServer() + io.bind(bunEngine)
  │
  ├── Redis Adapter
  │     └── io.adapter(createAdapter(redisPub, redisSub))
  │
  ├── Redis Emitter
  │     └── new Emitter(redisEmitter)
  │
  └── Connection handler
        └── io.on('connection', socket => onClientConnect({ socket }))
```

---

# SocketIOClientHelper

Structured client-side Socket.IO connection management with lifecycle callbacks, event subscription, authentication, and room management.

## Constructor

```typescript
new SocketIOClientHelper(opts: ISocketIOClientOptions)
```

### Options

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `identifier` | `string` | Yes | Unique name for this client |
| `host` | `string` | Yes | Server URL (e.g., `http://localhost:3000`) |
| `options` | `IOptions` | Yes | Socket.IO client options (path, extraHeaders, etc.) |
| `onConnected` | `() => ValueOrPromise<void>` | No | Called when WebSocket connection is established |
| `onDisconnected` | `(reason: string) => ValueOrPromise<void>` | No | Called on disconnect with reason |
| `onError` | `(error: Error) => ValueOrPromise<void>` | No | Called on connection error |
| `onAuthenticated` | `() => ValueOrPromise<void>` | No | Called when server sends `authenticated` event |
| `onUnauthenticated` | `(message: string) => ValueOrPromise<void>` | No | Called when server sends `unauthenticated` event |

### `IOptions`

Extends `SocketOptions` from `socket.io-client`:

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | Socket.IO server path (e.g., `'/io'`) |
| `extraHeaders` | `Record<string, any>` | HTTP headers sent with the connection (e.g., `Authorization`) |
| *...inherited* | | All `socket.io-client` `SocketOptions` |

### Example

```typescript
import { SocketIOClientHelper } from '@venizia/ignis-helpers';

const client = new SocketIOClientHelper({
  identifier: 'my-client',
  host: 'http://localhost:3000',
  options: {
    path: '/io',
    extraHeaders: {
      Authorization: 'Bearer my-jwt-token',
    },
  },
  onConnected: () => {
    console.log('Connected!');
    client.authenticate();  // Trigger authentication flow
  },
  onAuthenticated: () => {
    console.log('Authenticated!');
    // Now safe to subscribe to events and emit messages
  },
  onDisconnected: (reason) => {
    console.log('Disconnected:', reason);
  },
});

// Connection is established in constructor via configure()
```

---

## Methods

### `connect(): void`

Explicitly connect to the server (if not already connected).

```typescript
client.connect();
```

### `disconnect(): void`

Disconnect from the server.

```typescript
client.disconnect();
```

### `authenticate(): void`

Send the `authenticate` event to the server. Only works when connected and in `UNAUTHORIZED` state.

```typescript
client.authenticate();
// Server will respond with 'authenticated' or 'unauthenticated' event
```

### `getState(): TSocketIOClientState`

Returns the current authentication state.

```typescript
const state = client.getState();
// 'unauthorized' | 'authenticating' | 'authenticated'
```

### `getSocketClient(): Socket`

Returns the raw `socket.io-client` `Socket` instance for advanced operations.

```typescript
const socket = client.getSocketClient();
socket.on('custom-event', (data) => { /* ... */ });
```

### `subscribe<T>(opts): void`

Subscribe to a single event with duplicate protection.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `opts.event` | `string` | — | Event name |
| `opts.handler` | `TSocketIOEventHandler<T>` | — | Event handler (errors are caught internally) |
| `opts.ignoreDuplicate` | `boolean` | `true` | Skip if handler already exists for this event |

```typescript
client.subscribe<{ message: string }>({
  event: 'notification',
  handler: (data) => {
    console.log('Got notification:', data.message);
  },
});
```

### `subscribeMany(opts): void`

Subscribe to multiple events at once.

```typescript
client.subscribeMany({
  events: {
    'chat:message': (data) => console.log('Chat:', data),
    'room:update': (data) => console.log('Room:', data),
    'system:alert': (data) => console.log('Alert:', data),
  },
});
```

### `unsubscribe(opts): void`

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

### `unsubscribeMany(opts): void`

Remove all handlers for multiple events.

```typescript
client.unsubscribeMany({ events: ['chat:message', 'room:update'] });
```

### `emit<T>(opts): void`

Emit an event to the server.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `opts.topic` | `string` | Yes | Event name |
| `opts.data` | `T` | Yes | Event payload |
| `opts.doLog` | `boolean` | No | Log the emission |
| `opts.cb` | `() => void` | No | Callback after emit |

```typescript
client.emit({
  topic: 'chat:message',
  data: { room: 'general', message: 'Hello everyone!' },
});
```

> [!NOTE]
> Throws if the client is not connected. Check `getSocketClient().connected` first if unsure.

### `joinRooms(opts): void`

Request to join rooms (emits the `join` event to server).

```typescript
client.joinRooms({ rooms: ['room-a', 'room-b'] });
```

### `leaveRooms(opts): void`

Request to leave rooms (emits the `leave` event to server).

```typescript
client.leaveRooms({ rooms: ['room-a'] });
```

### `shutdown(): void`

Full cleanup — removes all listeners, disconnects, resets state.

```typescript
client.shutdown();
```

---

## Client Lifecycle

```
  ┌──────────┐
  │ new       │  constructor → configure()
  │ Client()  │    ├── io(host, options)
  └─────┬─────┘    ├── Register: connect, disconnect, connect_error
        │          ├── Register: authenticated, unauthenticated, ping
        │          └── Connection established (if server is reachable)
        │
  ┌─────▼─────────┐
  │  Connected     │  onConnected callback fires
  │  (UNAUTHORIZED)│
  └─────┬─────────┘
        │
        │ authenticate()
        │
  ┌─────▼──────────┐
  │ AUTHENTICATING  │  Waiting for server response
  └─────┬──────────┘
        │
   ┌────┴────┐
   │         │
   ▼         ▼
┌────────┐ ┌──────────────┐
│ AUTH'D │ │ UNAUTH'D     │  onUnauthenticated callback
│        │ │ → disconnect │
└───┬────┘ └──────────────┘
    │
    │ onAuthenticated callback
    │
    ▼
  Ready to emit/subscribe
    │
    │ disconnect() or server disconnect
    │
  ┌─▼───────────┐
  │ Disconnected │  onDisconnected callback
  │ (UNAUTHORIZED)│  State reset
  └──────────────┘
```

---

## Constants Reference

### `SocketIOConstants`

| Constant | Value | Description |
|----------|-------|-------------|
| `EVENT_PING` | `'ping'` | Server → Client keep-alive (interval configurable via `pingInterval`) |
| `EVENT_CONNECT` | `'connection'` | Server-side connection event |
| `EVENT_DISCONNECT` | `'disconnect'` | Disconnection event |
| `EVENT_JOIN` | `'join'` | Room join request |
| `EVENT_LEAVE` | `'leave'` | Room leave request |
| `EVENT_AUTHENTICATE` | `'authenticate'` | Client → Server auth request |
| `EVENT_AUTHENTICATED` | `'authenticated'` | Server → Client auth success |
| `EVENT_UNAUTHENTICATE` | `'unauthenticated'` | Server → Client auth failure |
| `ROOM_DEFAULT` | `'io-default'` | Default room for all authenticated clients |
| `ROOM_NOTIFICATION` | `'io-notification'` | Default notification room |

### `SocketIOClientStates`

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

---

## Type Definitions

### `TSocketIOServerOptions`

```typescript
interface ISocketIOServerBaseOptions {
  identifier: string;
  serverOptions: Partial<ServerOptions>;
  redisConnection: DefaultRedisHelper;
  authenticateFn: TSocketIOAuthenticateFn;
  clientConnectedFn?: TSocketIOClientConnectedFn;
  validateRoomFn?: TSocketIOValidateRoomFn;
  authenticateTimeout?: number;
  pingInterval?: number;
  defaultRooms?: string[];
}

interface ISocketIOServerNodeOptions extends ISocketIOServerBaseOptions {
  runtime: typeof RuntimeModules.NODE;  // 'node'
  server: HTTPServer;
}

interface ISocketIOServerBunOptions extends ISocketIOServerBaseOptions {
  runtime: typeof RuntimeModules.BUN;   // 'bun'
  engine: any;  // @socket.io/bun-engine Server instance
}

type TSocketIOServerOptions = ISocketIOServerNodeOptions | ISocketIOServerBunOptions;
```

### `ISocketIOClient`

```typescript
interface ISocketIOClient {
  id: string;
  socket: IOSocket;
  state: TSocketIOClientState;           // 'unauthorized' | 'authenticating' | 'authenticated'
  interval?: NodeJS.Timeout;             // Ping interval (set after auth)
  authenticateTimeout: NodeJS.Timeout;   // Auto-disconnect timer
}
```

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

### `ISocketIOClientOptions`

```typescript
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

### `TSocketIOEventHandler`

```typescript
type TSocketIOEventHandler<T = unknown> = (data: T) => ValueOrPromise<void>;
```

---

## RuntimeModules

Used for runtime detection and discriminated union typing:

```typescript
class RuntimeModules {
  static readonly NODE = 'node';
  static readonly BUN = 'bun';

  static detect(): TRuntimeModule;   // Returns 'bun' or 'node'
  static isBun(): boolean;
  static isNode(): boolean;
}

type TRuntimeModule = 'node' | 'bun';  // TConstValue<typeof RuntimeModules>
```

---

## See Also

- **Related Concepts:**
  - [Services](/guides/core-concepts/services) — Using helpers in service layer

- **Other Helpers:**
  - [Helpers Index](./index) — All available helpers
  - [Redis Helper](./redis) — `RedisHelper` used for Socket.IO adapter

- **References:**
  - [Socket.IO Component](/references/components/socket-io) — Component setup and lifecycle integration

- **External Resources:**
  - [Socket.IO Documentation](https://socket.io/docs/) — Official Socket.IO docs
  - [Socket.IO Redis Adapter](https://socket.io/docs/v4/redis-adapter/) — Scaling guide
  - [Socket.IO Client API](https://socket.io/docs/v4/client-api/) — Client reference
  - [@socket.io/bun-engine](https://github.com/socketio/bun-engine) — Bun runtime support

- **Tutorials:**
  - [Real-Time Chat Application](/guides/tutorials/realtime-chat) — Full Socket.IO tutorial

- **Changelog:**
  - [2026-02-06: Socket.IO Integration Fix](/changelogs/2026-02-06-socket-io-integration-fix) — Lifecycle timing fix + Bun runtime support
