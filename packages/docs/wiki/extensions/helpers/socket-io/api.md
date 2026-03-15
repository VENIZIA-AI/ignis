# Socket.IO -- API Reference

> Full method signatures, type definitions, and constants for `SocketIOServerHelper` and `SocketIOClientHelper`.

## Architecture

```
SocketIOServerHelper (extends BaseHelper)
  |
  |-- configure()
  |     |-- waitForRedisReady() x3 (pub, sub, emitter)
  |     |-- initIOServer() (Node.js HTTPServer or Bun engine)
  |     |-- io.adapter(createAdapter(redisPub, redisSub))
  |     |-- new Emitter(redisEmitter)
  |     +-- io.on('connection', onClientConnect)
  |
  |-- onClientConnect({ socket })
  |     |-- Create ISocketIOClient (state: UNAUTHORIZED)
  |     |-- Start authenticateTimeout timer
  |     |-- Register 'disconnect' handler
  |     +-- Register 'authenticate' handler
  |           |-- authenticateFn(handshake)
  |           +-- onClientAuthenticated({ socket })
  |                 |-- State -> AUTHENTICATED
  |                 |-- Join defaultRooms
  |                 |-- Register room handlers (join/leave)
  |                 |-- Start ping interval
  |                 |-- Emit 'authenticated' to client
  |                 +-- Invoke clientConnectedFn
  |
  |-- send({ destination?, payload, doLog?, cb? })
  |     +-- emitter.compress(true).to(destination).emit(topic, data)
  |
  +-- shutdown()
        |-- Disconnect all clients
        |-- io.close()
        +-- Quit Redis clients (pub, sub, emitter)


SocketIOClientHelper (extends BaseHelper)
  |
  |-- constructor -> configure()
  |     |-- io(host, options)
  |     |-- Register 'connect' handler
  |     |-- Register 'disconnect' handler
  |     |-- Register 'connect_error' handler
  |     |-- Register 'authenticated' handler
  |     |-- Register 'unauthenticated' handler
  |     +-- Register 'ping' handler
  |
  |-- authenticate()
  |     +-- client.emit('authenticate')
  |
  |-- subscribe({ event, handler, ignoreDuplicate? })
  |-- emit({ topic, data, doLog?, cb? })
  |-- joinRooms({ rooms }) -> client.emit('join', { rooms })
  |-- leaveRooms({ rooms }) -> client.emit('leave', { rooms })
  |
  +-- shutdown()
        |-- client.removeAllListeners()
        |-- client.disconnect()
        +-- state -> UNAUTHORIZED
```

## Server API

### `SocketIOServerHelper`

Extends `BaseHelper`. Manages a Socket.IO server with Redis adapter, authentication, room management, and heartbeat pings.

#### `constructor(opts: TSocketIOServerOptions)`

Creates the server helper. Validates the runtime-specific server/engine and initializes three Redis client connections by duplicating the provided `redisConnection`.

Does **not** start the IO server -- call `configure()` to complete initialization.

#### `configure(): Promise<void>`

Initializes the Socket.IO server and sets up Redis infrastructure:

1. Ensures all three Redis clients (pub, sub, emitter) are connected and ready
2. Creates the `IOServer` based on runtime (`new IOServer(httpServer, serverOptions)` for Node.js, or `new IOServer()` with `io.bind(engine)` for Bun)
3. Attaches the Redis adapter via `@socket.io/redis-adapter`
4. Creates a Redis emitter via `@socket.io/redis-emitter`
5. Registers the `'connection'` event handler

Must be called before `on()`, `send()`, or any server operations.

#### `getIOServer(): IOServer`

Returns the underlying `socket.io` `Server` instance for direct access.

```typescript
const io = socketServer.getIOServer();
io.of('/admin').on('connection', (socket) => { /* ... */ });
```

#### `getEngine(): any`

Returns the Bun engine instance. Throws if the runtime is not `'bun'`.

```typescript
// Error: '[getEngine] Engine is only available for Bun runtime!'
```

#### `getClients(opts?: { id?: string }): ISocketIOClient | Map<string, ISocketIOClient> | undefined`

Returns client information.

```typescript
// Get all clients
const allClients = socketServer.getClients() as Map<string, ISocketIOClient>;

// Get a specific client by socket ID
const client = socketServer.getClients({ id: 'socket-id' }) as ISocketIOClient | undefined;
```

#### `on<HandlerArgsType, HandlerReturnType>(opts: { topic: string; handler: (...args: HandlerArgsType) => ValueOrPromise<HandlerReturnType> }): void`

Registers an event handler on the IO server instance.

```typescript
socketServer.on({
  topic: 'custom-event',
  handler: (data: { userId: string }) => {
    console.log('Received:', data);
  },
});
```

**Throws:**
- `'[on] Invalid topic to start binding handler'` -- if `topic` is empty/falsy
- `'[on] Invalid event handler | topic: {topic}'` -- if `handler` is missing
- `'[on] IOServer is not initialized yet!'` -- if called before `configure()`

#### `onClientConnect(opts: { socket: IOSocket }): void`

Handles a new socket connection. Called automatically by the `'connection'` event. Can also be called manually.

1. Creates an `ISocketIOClient` entry with state `UNAUTHORIZED`
2. Starts the `authenticateTimeout` timer
3. Registers `'disconnect'` and `'authenticate'` handlers on the socket

Returns early (no-op) if `socket` is falsy or the client ID already exists.

#### `onClientAuthenticated(opts: { socket: IOSocket }): void`

Called after successful authentication. Can also be called manually to programmatically authenticate a client.

1. Sets client state to `AUTHENTICATED`
2. Sends an initial ping
3. Joins all `defaultRooms`
4. Registers room handlers (`join`, `leave`)
5. Starts the periodic ping interval
6. Emits `'authenticated'` event to the client with `{ id, time }`
7. Invokes `clientConnectedFn` callback (errors caught and logged)

#### `ping(opts: { socket: IOSocket; doIgnoreAuth: boolean }): void`

Sends a `'ping'` event to the client with `{ time: ISO string }`.

- If `doIgnoreAuth` is `false` and the client is not in `AUTHENTICATED` state, the client is disconnected
- If the socket or client is not found, returns silently

#### `disconnect(opts: { socket: IOSocket }): void`

Disconnects a client and cleans up internal state:

1. Clears the ping `interval` timer
2. Clears the `authenticateTimeout` timer
3. Removes the client from the `clients` map
4. Calls `socket.disconnect()`

#### `send(opts: { destination?: string; payload: { topic: string; data: any }; doLog?: boolean; cb?: () => void }): void`

Emits a message via the Redis emitter with compression enabled.

| Parameter | Type | Description |
|-----------|------|-------------|
| `destination` | `string \| undefined` | Socket ID or room name. If omitted, broadcasts to all |
| `payload.topic` | `string` | Event name |
| `payload.data` | `any` | Event payload |
| `doLog` | `boolean` | If `true`, logs the message details. Default: `false` |
| `cb` | `() => void` | Callback invoked asynchronously via `setImmediate` after emission |

Returns early (no-op) if `payload`, `topic`, or `data` is falsy.

#### `shutdown(): Promise<void>`

Gracefully shuts down the server:

1. Disconnects all tracked clients (clears their intervals and timeouts)
2. Clears the `clients` map
3. Closes the IO server
4. Quits all three Redis connections (pub, sub, emitter)

## Client API

### `SocketIOClientHelper`

Extends `BaseHelper`. Manages a Socket.IO client connection with authentication, event subscriptions, and room operations.

#### `constructor(opts: ISocketIOClientOptions)`

Creates and immediately configures the client. The constructor calls `configure()` internally, which establishes the connection and registers lifecycle event handlers.

#### `configure(): void`

Initializes the `socket.io-client` connection and registers internal event handlers. Called automatically by the constructor. If called again when a client already exists, returns early (no-op).

Registered handlers:
- `'connect'` -- invokes `onConnected` callback
- `'disconnect'` -- resets state to `UNAUTHORIZED`, invokes `onDisconnected` callback
- `'connect_error'` -- invokes `onError` callback
- `'authenticated'` -- sets state to `AUTHENTICATED`, invokes `onAuthenticated` callback
- `'unauthenticated'` -- resets state to `UNAUTHORIZED`, invokes `onUnauthenticated` callback
- `'ping'` -- logs debug message

#### `getState(): TSocketIOClientState`

Returns the current authentication state: `'unauthorized'`, `'authenticating'`, or `'authenticated'`.

```typescript
const state = client.getState();
if (state === 'authenticated') {
  client.emit({ topic: 'message', data: { text: 'hello' } });
}
```

#### `getSocketClient(): Socket`

Returns the underlying `socket.io-client` `Socket` instance for direct access.

```typescript
const rawSocket = client.getSocketClient();
rawSocket.io.opts.reconnection = false;
```

#### `authenticate(): void`

Initiates the authentication handshake by emitting the `'authenticate'` event to the server.

- Does nothing if the client is not connected
- Does nothing if the current state is not `'unauthorized'`
- Sets state to `AUTHENTICATING` before emitting

```typescript
// Typically called inside the onConnected callback
const client = new SocketIOClientHelper({
  // ...
  onConnected: () => {
    client.authenticate();
  },
});
```

#### `subscribe<T>(opts: { event: string; handler: TSocketIOEventHandler<T>; ignoreDuplicate?: boolean }): void`

Registers an event handler on the client socket. The handler is automatically wrapped with error handling (catches both sync throws and async rejections).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `event` | `string` | -- | Event name to listen for |
| `handler` | `TSocketIOEventHandler<T>` | -- | Callback receiving the event data |
| `ignoreDuplicate` | `boolean` | `true` | If `true` and a handler already exists for this event, skips registration |

#### `subscribeMany(opts: { events: Record<string, TSocketIOEventHandler>; ignoreDuplicate?: boolean }): void`

Batch-registers multiple event handlers. Calls `subscribe()` for each entry.

```typescript
client.subscribeMany({
  events: {
    'event-a': (data) => { /* ... */ },
    'event-b': (data) => { /* ... */ },
  },
  ignoreDuplicate: false,
});
```

#### `unsubscribe(opts: { event: string; handler?: TSocketIOEventHandler }): void`

Removes event handlers from the client socket.

- If `handler` is provided, removes only that specific handler
- If `handler` is omitted, removes **all** handlers for the event
- If no listeners exist for the event, returns early (no-op)

#### `unsubscribeMany(opts: { events: string[] }): void`

Batch-unsubscribes from multiple events. Removes all handlers for each event.

```typescript
client.unsubscribeMany({ events: ['event-a', 'event-b'] });
```

#### `connect(): void`

Manually connects the client socket. Useful after a manual `disconnect()`.

Returns early if the client instance does not exist.

#### `disconnect(): void`

Manually disconnects the client socket without cleaning up listeners or resetting state.

Returns early if the client instance does not exist.

> [!TIP]
> Use `shutdown()` instead of `disconnect()` for a full cleanup that also removes listeners and resets the authentication state.

#### `emit<T>(opts: { topic: string; data: T; doLog?: boolean; cb?: () => void }): void`

Emits an event to the server.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `topic` | `string` | -- | Event name |
| `data` | `T` | -- | Event payload |
| `doLog` | `boolean` | `false` | If `true`, logs the emission details |
| `cb` | `() => void` | `undefined` | Callback invoked asynchronously via `setImmediate` |

**Throws:**
- `'Invalid socket client state to emit'` (status 400) -- if the client is not connected
- `'Topic is required to emit'` (status 400) -- if `topic` is empty/falsy

#### `joinRooms(opts: { rooms: string[] }): void`

Requests to join rooms by emitting a `'join'` event to the server with `{ rooms }`. The server validates the request through its `validateRoomFn`.

Logs a warning and returns early if the client is not connected.

#### `leaveRooms(opts: { rooms: string[] }): void`

Requests to leave rooms by emitting a `'leave'` event to the server with `{ rooms }`.

Logs a warning and returns early if the client is not connected.

#### `shutdown(): void`

Fully shuts down the client:

1. Removes all event listeners (`removeAllListeners()`)
2. Disconnects if currently connected
3. Resets state to `UNAUTHORIZED`

## Types Reference

### `IHandshake`

Represents the client handshake data available during authentication.

```typescript
interface IHandshake {
  headers: IncomingHttpHeaders;   // HTTP headers from the initial request
  time: string;                   // Connection time as ISO string
  address: string;                // Client IP address
  xdomain: boolean;              // Whether the connection is cross-domain
  secure: boolean;                // Whether the connection uses TLS
  issued: number;                 // Timestamp when the handshake was issued
  url: string;                    // Request URL
  query: ParsedUrlQuery;          // Parsed query string parameters
  auth: { [key: string]: any };  // Authentication payload sent by the client
}
```

### `ISocketIOClient`

Internal representation of a connected client tracked by the server.

```typescript
interface ISocketIOClient {
  id: string;                          // Socket ID
  socket: IOSocket;                    // The socket.io Socket instance
  state: TSocketIOClientState;         // 'unauthorized' | 'authenticating' | 'authenticated'
  interval?: NodeJS.Timeout;          // Ping interval timer (set after authentication)
  authenticateTimeout: NodeJS.Timeout; // Auth timeout timer (cleared after authentication)
}
```

### `TSocketIOClientState`

```typescript
type TSocketIOClientState = 'unauthorized' | 'authenticating' | 'authenticated';
```

### `TSocketIOAuthenticateFn`

Server-side authentication callback. Receives the handshake data and returns a boolean indicating whether to accept or reject the connection.

```typescript
type TSocketIOAuthenticateFn = (args: IHandshake) => ValueOrPromise<boolean>;
```

### `TSocketIOValidateRoomFn`

Server-side room validation callback. Receives the socket and requested rooms, returns the subset of rooms the client is allowed to join.

```typescript
type TSocketIOValidateRoomFn = (opts: {
  socket: IOSocket;
  rooms: string[];
}) => ValueOrPromise<string[]>;
```

### `TSocketIOClientConnectedFn`

Server-side callback invoked after a client is fully authenticated and has joined default rooms.

```typescript
type TSocketIOClientConnectedFn = (opts: {
  socket: IOSocket;
}) => ValueOrPromise<void>;
```

### `TSocketIOEventHandler<T>`

Client-side event handler type.

```typescript
type TSocketIOEventHandler<T = unknown> = (data: T) => ValueOrPromise<void>;
```

### `IOptions`

Client connection options. Extends `SocketOptions` from `socket.io-client`.

```typescript
interface IOptions extends SocketOptions {
  path: string;
  extraHeaders: Record<string | symbol | number, any>;
}
```

### `TSocketIOServerOptions`

Discriminated union for server constructor options:

```typescript
type TSocketIOServerOptions = ISocketIOServerNodeOptions | ISocketIOServerBunOptions;

interface ISocketIOServerNodeOptions extends ISocketIOServerBaseOptions {
  runtime: 'node';
  server: HTTPServer;
}

interface ISocketIOServerBunOptions extends ISocketIOServerBaseOptions {
  runtime: 'bun';
  engine: any;
}
```

## Constants

### `SocketIOConstants`

| Constant | Value | Description |
|----------|-------|-------------|
| `EVENT_PING` | `'ping'` | Heartbeat event emitted by the server at `pingInterval` |
| `EVENT_CONNECT` | `'connection'` | Server-side connection event |
| `EVENT_DISCONNECT` | `'disconnect'` | Disconnect event (both server and client) |
| `EVENT_JOIN` | `'join'` | Room join request event |
| `EVENT_LEAVE` | `'leave'` | Room leave request event |
| `EVENT_AUTHENTICATE` | `'authenticate'` | Client-to-server authentication request |
| `EVENT_AUTHENTICATED` | `'authenticated'` | Server-to-client authentication success |
| `EVENT_UNAUTHENTICATE` | `'unauthenticated'` | Server-to-client authentication failure |
| `ROOM_DEFAULT` | `'io-default'` | Default room name |
| `ROOM_NOTIFICATION` | `'io-notification'` | Default notification room name |

### `SocketIOClientStates`

| Constant | Value | Description |
|----------|-------|-------------|
| `UNAUTHORIZED` | `'unauthorized'` | Initial state; not yet authenticated |
| `AUTHENTICATING` | `'authenticating'` | Authentication in progress |
| `AUTHENTICATED` | `'authenticated'` | Successfully authenticated |

#### `SocketIOClientStates.isValid(input: string): boolean`

Static method that checks whether a string is a valid client state value.

```typescript
SocketIOClientStates.isValid('authenticated'); // true
SocketIOClientStates.isValid('invalid');       // false
```

### Internal Defaults

| Constant | Value | Description |
|----------|-------|-------------|
| `CLIENT_AUTHENTICATE_TIMEOUT` | `10000` (10 s) | Default timeout before disconnecting unauthenticated clients |
| `CLIENT_PING_INTERVAL` | `30000` (30 s) | Default interval between heartbeat pings |

## See Also

- [Setup & Usage](./) -- Getting started, constructor options, and examples
- [WebSocket Helper](../websocket/) -- Bun-native WebSocket alternative
