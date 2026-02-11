# Creating an Instance

## SocketIOServerHelper

Wraps the Socket.IO `Server` instance with built-in authentication flow, client tracking, room management, Redis adapter/emitter, and dual-runtime support (Node.js + Bun).

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
| `identifier` | `string` | Yes | -- | Unique name for this Socket.IO server instance |
| `serverOptions` | `Partial<ServerOptions>` | Yes | -- | Socket.IO server configuration (path, cors, etc.) |
| `redisConnection` | `DefaultRedisHelper` | Yes | -- | Redis helper for adapter + emitter. Creates 3 duplicate connections internally |
| `authenticateFn` | `TSocketIOAuthenticateFn` | Yes | -- | Called when client emits `authenticate`. Return `true` to accept |
| `clientConnectedFn` | `TSocketIOClientConnectedFn` | No | -- | Called after successful authentication |
| `validateRoomFn` | `TSocketIOValidateRoomFn` | No | -- | Called when client requests to join rooms. Return allowed room names. Joins rejected if not provided |
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


## SocketIOClientHelper

Structured client-side Socket.IO connection management with lifecycle callbacks, event subscription, authentication, and room management.

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
| `onError` | `(error: Error) => ValueOrPromise<void>` | No | Called on connection error (`connect_error` event) |
| `onAuthenticated` | `() => ValueOrPromise<void>` | No | Called when server sends `authenticated` event |
| `onUnauthenticated` | `(message: string) => ValueOrPromise<void>` | No | Called when server sends `unauthenticated` event |

### `IOptions`

Extends `SocketOptions` from `socket.io-client`:

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | Socket.IO server path (e.g., `'/io'`) |
| `extraHeaders` | `Record<string \| symbol \| number, any>` | HTTP headers sent with the connection (e.g., `Authorization`) |
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

::: details Full type definitions

### `TSocketIOServerOptions`

```typescript
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

### `TSocketIOClientState`

```typescript
type TSocketIOClientState = TConstValue<typeof SocketIOClientStates>;
// Resolves to: 'unauthorized' | 'authenticating' | 'authenticated'
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

### `IOptions`

```typescript
interface IOptions extends SocketOptions {
  path: string;
  extraHeaders: Record<string | symbol | number, any>;
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

### `RuntimeModules`

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

:::
