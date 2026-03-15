# Socket.IO

Runtime-agnostic Socket.IO server and client helpers with built-in authentication flow, room management, Redis adapter for horizontal scaling, and automatic heartbeat keep-alive.

## Quick Reference

| Class | Extends | Role |
|-------|---------|------|
| `SocketIOServerHelper` | `BaseHelper` | Manages a Socket.IO server with authentication, rooms, ping intervals, and Redis-backed messaging |
| `SocketIOClientHelper` | `BaseHelper` | Manages a Socket.IO client connection with authentication, event subscriptions, and room operations |

#### Import Paths

```typescript
import {
  SocketIOServerHelper,
  SocketIOClientHelper,
  SocketIOConstants,
  SocketIOClientStates,
} from '@venizia/ignis-helpers';

import type {
  TSocketIOServerOptions,
  ISocketIOServerBaseOptions,
  ISocketIOServerNodeOptions,
  ISocketIOServerBunOptions,
  ISocketIOClientOptions,
  IOptions,
  ISocketIOClient,
  IHandshake,
  TSocketIOAuthenticateFn,
  TSocketIOValidateRoomFn,
  TSocketIOClientConnectedFn,
  TSocketIOEventHandler,
  TSocketIOClientState,
} from '@venizia/ignis-helpers';
```

## Creating an Instance

### Server

`SocketIOServerHelper` requires a Redis connection for the pub/sub adapter, an HTTP server (Node.js) or Bun engine instance, and an authentication function.

```typescript
import { SocketIOServerHelper } from '@venizia/ignis-helpers';
import { DefaultRedisHelper } from '@venizia/ignis-helpers';
import { createServer } from 'node:http';

const httpServer = createServer();

const redisHelper = new DefaultRedisHelper({
  name: 'socket-redis',
  host: 'localhost',
  port: 6379,
});

const socketServer = new SocketIOServerHelper({
  identifier: 'my-socket-server',
  runtime: 'node',
  server: httpServer,
  redisConnection: redisHelper,
  serverOptions: {
    cors: { origin: '*' },
    path: '/socket.io',
  },
  authenticateFn: async (handshake) => {
    const token = handshake.auth?.token;
    return !!token; // Return true to accept, false to reject
  },
  validateRoomFn: async ({ socket, rooms }) => {
    // Return only the rooms the client is allowed to join
    return rooms.filter(r => r.startsWith('public-'));
  },
  clientConnectedFn: async ({ socket }) => {
    console.log('Client authenticated:', socket.id);
  },
  defaultRooms: ['io-default', 'io-notification'],
  authenticateTimeout: 10000,
  pingInterval: 30000,
});
```

#### `TSocketIOServerOptions`

A discriminated union based on the `runtime` field:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `identifier` | `string` | -- | Unique identifier for this server instance (used as logger scope) |
| `runtime` | `'node' \| 'bun'` | -- | Runtime environment. Determines which server field is required |
| `server` | `HTTPServer` | -- | Node.js HTTP server instance. **Required when `runtime` is `'node'`** |
| `engine` | `any` | -- | `@socket.io/bun-engine` Server instance. **Required when `runtime` is `'bun'`** |
| `serverOptions` | `Partial<ServerOptions>` | `{}` | Socket.IO `ServerOptions` (cors, path, transports, etc.) |
| `redisConnection` | `DefaultRedisHelper` | -- | **Required.** Redis helper used to create pub, sub, and emitter clients |
| `authenticateFn` | `TSocketIOAuthenticateFn` | -- | **Required.** Called with the client's handshake data. Return `true` to accept, `false` to reject |
| `validateRoomFn` | `TSocketIOValidateRoomFn` | `undefined` | Called when a client requests to join rooms. Return the allowed subset |
| `clientConnectedFn` | `TSocketIOClientConnectedFn` | `undefined` | Called after a client is fully authenticated and has joined default rooms |
| `defaultRooms` | `string[]` | `['io-default', 'io-notification']` | Rooms that every authenticated client joins automatically |
| `authenticateTimeout` | `number` | `10000` (10 s) | Milliseconds before an unauthenticated client is disconnected |
| `pingInterval` | `number` | `30000` (30 s) | Interval in milliseconds between heartbeat pings to authenticated clients |

> [!WARNING]
> If no `validateRoomFn` is provided, **all room join requests are rejected** with a warning log. You must provide this callback if you want clients to join custom rooms beyond the `defaultRooms`.

### Client

`SocketIOClientHelper` connects to a Socket.IO server. Configuration is done entirely via the constructor -- `configure()` is called automatically.

```typescript
import { SocketIOClientHelper } from '@venizia/ignis-helpers';

const socketClient = new SocketIOClientHelper({
  identifier: 'my-client',
  host: 'http://localhost:3000',
  options: {
    path: '/socket.io',
    extraHeaders: {
      Authorization: 'Bearer my-jwt-token',
    },
  },
  onConnected: () => {
    console.log('Connected to server');
    socketClient.authenticate();
  },
  onDisconnected: (reason) => {
    console.log('Disconnected:', reason);
  },
  onError: (error) => {
    console.error('Connection error:', error);
  },
  onAuthenticated: () => {
    console.log('Successfully authenticated');
  },
  onUnauthenticated: (message) => {
    console.warn('Authentication failed:', message);
  },
});
```

#### `ISocketIOClientOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `identifier` | `string` | -- | Unique identifier for this client (used as logger scope) |
| `host` | `string` | -- | Server URL to connect to (e.g., `'http://localhost:3000'`) |
| `options` | `IOptions` | -- | Socket.IO client options (extends `SocketOptions` with `path` and `extraHeaders`) |
| `onConnected` | `() => ValueOrPromise<void>` | `undefined` | Called when the transport connection is established |
| `onDisconnected` | `(reason: string) => ValueOrPromise<void>` | `undefined` | Called when disconnected. The client state resets to `'unauthorized'` |
| `onError` | `(error: Error) => ValueOrPromise<void>` | `undefined` | Called on connection errors |
| `onAuthenticated` | `() => ValueOrPromise<void>` | `undefined` | Called when the server sends an `authenticated` event |
| `onUnauthenticated` | `(message: string) => ValueOrPromise<void>` | `undefined` | Called when the server rejects authentication |

#### `IOptions`

Extends `SocketOptions` from `socket.io-client`:

| Option | Type | Description |
|--------|------|-------------|
| `path` | `string` | Socket.IO server path (e.g., `'/socket.io'`) |
| `extraHeaders` | `Record<string \| symbol \| number, any>` | Additional headers sent with the connection request |

## Usage

### Server Setup

After constructing the server helper, call `configure()` to initialize the Socket.IO server, set up the Redis adapter, and start listening for connections.

```typescript
const socketServer = new SocketIOServerHelper({
  identifier: 'my-server',
  runtime: 'node',
  server: httpServer,
  redisConnection: redisHelper,
  serverOptions: { cors: { origin: '*' } },
  authenticateFn: async (handshake) => {
    return verifyToken(handshake.auth?.token);
  },
});

await socketServer.configure();
// Server is now ready and listening for connections

httpServer.listen(3000, () => {
  console.log('HTTP + Socket.IO server running on port 3000');
});
```

#### Bun Runtime

For Bun, pass the `@socket.io/bun-engine` instance instead of an HTTP server:

```typescript
import { SocketIOServerHelper } from '@venizia/ignis-helpers';

const socketServer = new SocketIOServerHelper({
  identifier: 'my-bun-server',
  runtime: 'bun',
  engine: bunEngineInstance,
  redisConnection: redisHelper,
  serverOptions: {},
  authenticateFn: async (handshake) => {
    return verifyToken(handshake.auth?.token);
  },
});

await socketServer.configure();
```

### Client Connection

The client connects automatically on construction. Call `authenticate()` after the connection is established to trigger the server-side authentication flow.

```typescript
const client = new SocketIOClientHelper({
  identifier: 'app-client',
  host: 'http://localhost:3000',
  options: {
    path: '/socket.io',
    extraHeaders: { Authorization: 'Bearer my-token' },
  },
  onConnected: () => {
    // Connection established -- initiate authentication
    client.authenticate();
  },
  onAuthenticated: () => {
    // Now safe to subscribe and emit
    client.joinRooms({ rooms: ['chat-room-1'] });
  },
});
```

### Emitting Events

#### From the Server

Use `send()` to emit events through the Redis emitter. Messages can target a specific socket ID, a room, or broadcast to all clients.

```typescript
// Send to a specific client
socketServer.send({
  destination: 'client-socket-id',
  payload: {
    topic: 'notification',
    data: { message: 'Hello!' },
  },
});

// Broadcast to all connected clients (no destination)
socketServer.send({
  payload: {
    topic: 'announcement',
    data: { message: 'Server update in 5 minutes' },
  },
});

// Send with logging and callback
socketServer.send({
  destination: 'some-room',
  payload: {
    topic: 'room-event',
    data: { action: 'update' },
  },
  doLog: true,
  cb: () => {
    console.log('Message queued');
  },
});
```

#### From the Client

Use `emit()` to send events to the server.

```typescript
client.emit({
  topic: 'chat-message',
  data: { text: 'Hello, world!' },
});

// With logging enabled
client.emit({
  topic: 'user-action',
  data: { action: 'click', target: 'button-1' },
  doLog: true,
});

// With callback
client.emit({
  topic: 'upload-complete',
  data: { fileId: '123' },
  cb: () => {
    console.log('Emit completed');
  },
});
```

### Listening for Events

#### Server-Side Event Binding

Use `on()` to register event handlers on the IO server instance.

```typescript
socketServer.on({
  topic: 'custom-event',
  handler: (data) => {
    console.log('Received:', data);
  },
});
```

#### Client-Side Event Subscription

Use `subscribe()` for single events and `subscribeMany()` for batch registration.

```typescript
// Single event
client.subscribe({
  event: 'notification',
  handler: (data) => {
    console.log('Notification:', data);
  },
});

// Prevent duplicate handlers (default behavior)
client.subscribe({
  event: 'notification',
  handler: (data) => { /* ... */ },
  ignoreDuplicate: true, // Default: true -- skips if handler already exists
});

// Allow multiple handlers for same event
client.subscribe({
  event: 'chat-message',
  handler: handler1,
  ignoreDuplicate: false,
});

// Batch subscribe
client.subscribeMany({
  events: {
    'user-joined': (data) => console.log('Joined:', data),
    'user-left': (data) => console.log('Left:', data),
    'typing': (data) => console.log('Typing:', data),
  },
});

// Unsubscribe from a specific event (removes all handlers)
client.unsubscribe({ event: 'notification' });

// Unsubscribe from multiple events
client.unsubscribeMany({ events: ['user-joined', 'user-left'] });
```

### Rooms

#### Client-Side Room Operations

```typescript
// Join rooms (validated by server's validateRoomFn)
client.joinRooms({ rooms: ['chat-room-1', 'notifications'] });

// Leave rooms
client.leaveRooms({ rooms: ['chat-room-1'] });
```

#### Server-Side Room Behavior

Authenticated clients automatically join the `defaultRooms` (by default, `'io-default'` and `'io-notification'`). Custom room join requests are validated through `validateRoomFn` before the client is allowed to join.

```typescript
const socketServer = new SocketIOServerHelper({
  // ...
  defaultRooms: ['general', 'announcements'],
  validateRoomFn: async ({ socket, rooms }) => {
    // Only allow rooms the user has permission for
    const userPermissions = await getUserPermissions(socket.id);
    return rooms.filter(room => userPermissions.includes(room));
  },
});
```

### Authentication Flow

The server enforces a post-connection authentication protocol:

```
Client connects
  |
  v
Server creates client entry (state: UNAUTHORIZED)
  |-- Starts authenticateTimeout timer (default: 10s)
  |-- Registers disconnect handler
  |
Client emits 'authenticate' event
  |
  v
Server calls authenticateFn(handshake)
  |
  +-- Returns true:
  |     |-- State -> AUTHENTICATED
  |     |-- Clear auth timeout
  |     |-- Join default rooms
  |     |-- Start ping interval
  |     |-- Emit 'authenticated' to client
  |     +-- Invoke clientConnectedFn
  |
  +-- Returns false:
  |     |-- State -> UNAUTHORIZED
  |     |-- Emit 'unauthenticated' to client
  |     +-- Disconnect
  |
  +-- Timeout (no auth within authenticateTimeout):
        +-- Disconnect
```

### Redis Adapter

The server uses `@socket.io/redis-adapter` and `@socket.io/redis-emitter` for horizontal scaling. Three Redis connections are created by duplicating the provided `redisConnection` client:

- **redisPub** -- Publishes adapter messages
- **redisSub** -- Subscribes to adapter messages
- **redisEmitter** -- Powers `send()` for cross-instance message delivery

All three connections are initialized and awaited during `configure()`. If the parent client uses `lazyConnect`, the duplicated clients will connect automatically.

```typescript
// Messages sent via send() use the Redis emitter,
// so they reach clients on ANY server instance
socketServer.send({
  destination: 'some-room',
  payload: {
    topic: 'update',
    data: { value: 42 },
  },
});
```

### Graceful Shutdown

#### Server

```typescript
await socketServer.shutdown();
// 1. Disconnects all clients (clears intervals and timeouts)
// 2. Closes the IO server
// 3. Quits all three Redis connections (pub, sub, emitter)
```

#### Client

```typescript
client.shutdown();
// 1. Removes all event listeners
// 2. Disconnects if connected
// 3. Resets state to 'unauthorized'
```

## Troubleshooting

### `[SocketIOServerHelper] Invalid HTTP server for Node.js runtime!`

**Cause:** The `server` option is missing or falsy when `runtime` is `'node'`.

**Fix:** Pass a valid `http.Server` instance.

### `[SocketIOServerHelper] Invalid @socket.io/bun-engine instance for Bun runtime!`

**Cause:** The `engine` option is missing or falsy when `runtime` is `'bun'`.

**Fix:** Pass a valid `@socket.io/bun-engine` Server instance.

### `[SocketIOServerHelper] Unsupported runtime!`

**Cause:** The `runtime` value is neither `'node'` nor `'bun'`.

**Fix:** Use `RuntimeModules.NODE` or `RuntimeModules.BUN`.

### `Invalid redis connection to config socket.io adapter!`

**Cause:** The `redisConnection` option is missing, `null`, or `undefined`.

**Fix:** Pass a valid `DefaultRedisHelper` instance.

### `[on] Invalid topic to start binding handler`

**Cause:** An empty or falsy `topic` was passed to `on()`.

**Fix:** Provide a non-empty string topic.

### `[on] IOServer is not initialized yet!`

**Cause:** `on()` was called before `configure()` completed.

**Fix:** Await `configure()` before registering event handlers.

### `Invalid socket client state to emit`

**Cause (client):** `emit()` was called when the client is not connected.

**Fix:** Check that the client is connected before emitting, or emit inside the `onConnected` callback.

### `Topic is required to emit`

**Cause (client):** `emit()` was called with an empty or falsy `topic`.

**Fix:** Provide a non-empty string topic.

## See Also

- [API Reference](./api) -- Full method signatures, types, and constants
- [WebSocket Helper](../websocket/) -- Bun-native WebSocket alternative
