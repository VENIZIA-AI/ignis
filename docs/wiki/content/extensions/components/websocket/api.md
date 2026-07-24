---
title: WebSocket Component - Full Reference
description: Binding keys, configuration options, WebSocketEmitter API, lifecycle diagrams, and internals
difficulty: intermediate
---

# WebSocket Component Reference

Every binding key, configuration option, callback signature, and internal mechanism of `WebSocketComponent`. For the task-oriented walkthrough, see [Usage & Examples](./usage).

**Files:**

- [`packages/core/src/components/websocket/component.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/websocket/component.ts)
- [`packages/core/src/components/websocket/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/websocket/common/types.ts)
- [`packages/core/src/components/websocket/handlers/bun.handler.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/websocket/handlers/bun.handler.ts)
- [`packages/helpers/src/modules/socket/websocket/server/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/websocket/server/helper.ts)
- [`packages/helpers/src/modules/socket/websocket/emitter/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/socket/websocket/emitter/helper.ts)

## Quick reference

| Item | Value |
|------|-------|
| Package | `@venizia/ignis` (core component) + `@venizia/ignis-helpers` (helper classes) |
| Component class | `WebSocketComponent` |
| Server helper | [`WebSocketServerHelper`](/extensions/helpers/websocket/) |
| Emitter helper | `WebSocketEmitter` (standalone Redis publisher) |
| Runtimes | Bun only - throws on Node.js |
| Scaling | Redis Pub/Sub (`ioredis` - single or Cluster) |

## Import paths

`WebSocketComponent` and `WebSocketBindingKeys` are exported only from the `@venizia/ignis/websocket` subpath - never from the `@venizia/ignis` root barrel. `IServerOptions` (the core component's options subset) is not exported from either entry point.

```typescript
// Core - subpath import only
import { WebSocketComponent, WebSocketBindingKeys } from '@venizia/ignis/websocket';

// Helpers - types, classes, constants from the main entry
import {
  WebSocketServerHelper,
  WebSocketEmitter,
  WebSocketDefaults,
  WebSocketEvents,
  WebSocketChannels,
  WebSocketClientStates,
  WebSocketMessageTypes,
} from '@venizia/ignis-helpers';

import type {
  IWebSocketServerOptions,
  IWebSocketEmitterOptions,
  IWebSocketClient,
  IWebSocketMessage,
  IRedisSocketMessage,
  IBunWebSocketConfig,
  TWebSocketAuthenticateFn,
  TWebSocketValidateRoomFn,
  TWebSocketClientConnectedFn,
  TWebSocketClientDisconnectedFn,
  TWebSocketMessageHandler,
  TWebSocketOutboundTransformer,
  TWebSocketHandshakeFn,
} from '@venizia/ignis-helpers';
```

## Configuration

`WebSocketComponent`'s own `IServerOptions` interface is a **subset** of the helper's `IWebSocketServerOptions`. Before constructing the helper, the component fills in `server` and `redisConnection` from the running application, plus every callback function resolved from the DI container. It does not forward `authTimeout` or `encryptedBatchLimit` - see the note below.

```typescript
interface IServerOptions {
  identifier: string;                  // Default: 'WEBSOCKET_SERVER'
  path?: string;                       // Default: '/ws'
  defaultRooms?: string[];             // Default: ['ws-default', 'ws-notification']
  serverOptions?: IBunWebSocketConfig; // Bun native WebSocket config
  heartbeatInterval?: number;          // Default: 30000 (30s)
  heartbeatTimeout?: number;           // Default: 90000 (90s)
  requireEncryption?: boolean;         // Default: false
}
```

> [!NOTE]
> `DEFAULT_SERVER_OPTIONS` in the core component only sets `identifier` and `path`. `defaultRooms`, `heartbeatInterval`, `heartbeatTimeout`, and `serverOptions` fall back to `WebSocketDefaults` inside the helper constructor, not the component.

> [!NOTE]
> `authTimeout` and `encryptedBatchLimit` belong to the helper's `IWebSocketServerOptions`, not the component's `IServerOptions`. There is no binding key for them - the component always passes the helper defaults (`5000` ms, `10`). Customize them only by constructing `WebSocketServerHelper` yourself outside the component.

Bind a partial object to `SERVER_OPTIONS` before registering the component to override any field:

```typescript
this.bind({ key: WebSocketBindingKeys.SERVER_OPTIONS }).toValue({
  identifier: 'my-app-websocket',
  path: '/realtime',
  defaultRooms: ['general', 'announcements'],
  heartbeatInterval: 20000,
  heartbeatTimeout: 60000,
  requireEncryption: true,
  serverOptions: { maxPayloadLength: 2097152, backpressureLimit: 2097152 },
});
```

### `WebSocketDefaults` constants

| Constant | Value | Description |
|----------|-------|-------------|
| `PATH` | `'/ws'` | Default WebSocket endpoint path |
| `ROOM` | `'ws-default'` | Default room name |
| `NOTIFICATION_ROOM` | `'ws-notification'` | Default notification room name |
| `BROADCAST_TOPIC` | `'ws:internal:broadcast'` | Internal Bun pub/sub broadcast topic |
| `MAX_PAYLOAD_LENGTH` | `131072` (128 KB) | Maximum message payload size |
| `IDLE_TIMEOUT` | `60` | Bun idle timeout, seconds |
| `BACKPRESSURE_LIMIT` | `1048576` (1 MB) | Bun backpressure limit |
| `SEND_PINGS` | `true` | Enable WebSocket pings |
| `PUBLISH_TO_SELF` | `false` | Whether the server receives its own publishes |
| `AUTH_TIMEOUT` | `5000` (5 s) | Time to authenticate before disconnect |
| `HEARTBEAT_INTERVAL` | `30000` (30 s) | Interval between heartbeat sweeps |
| `HEARTBEAT_TIMEOUT` | `90000` (90 s) | Disconnect after 3 missed heartbeats |
| `ENCRYPTED_BATCH_LIMIT` | `10` | Max concurrent encryption operations |

`MAX_PAYLOAD_LENGTH`, `IDLE_TIMEOUT`, `BACKPRESSURE_LIMIT`, `SEND_PINGS`, and `PUBLISH_TO_SELF` are Bun-native settings passed via `serverOptions`. The rest are application-level settings read directly off `IWebSocketServerOptions`.

### `IBunWebSocketConfig`

```typescript
interface IBunWebSocketConfig {
  perMessageDeflate?: boolean;
  maxPayloadLength?: number;          // Default: 128 KB (131072)
  idleTimeout?: number;               // Default: 60s
  backpressureLimit?: number;         // Default: 1 MB (1048576)
  closeOnBackpressureLimit?: boolean;
  sendPings?: boolean;                // Default: true
  publishToSelf?: boolean;            // Default: false
}
```

Passed straight through to Bun's native WebSocket handler via `serverOptions` inside `SERVER_OPTIONS`.

## Binding keys

| Binding Key | Constant | Type | Required | Default |
|------------|----------|------|----------|---------|
| `@app/websocket/server-options` | `WebSocketBindingKeys.SERVER_OPTIONS` | `Partial<IServerOptions>` | No | See [Configuration](#configuration) |
| `@app/websocket/redis-connection` | `WebSocketBindingKeys.REDIS_CONNECTION` | `AbstractRedisHelper` | **Yes** | `null` |
| `@app/websocket/authenticate-handler` | `WebSocketBindingKeys.AUTHENTICATE_HANDLER` | `TWebSocketAuthenticateFn` | **Yes** | `null` |
| `@app/websocket/validate-room-handler` | `WebSocketBindingKeys.VALIDATE_ROOM_HANDLER` | `TWebSocketValidateRoomFn` | No | `null` |
| `@app/websocket/client-connected-handler` | `WebSocketBindingKeys.CLIENT_CONNECTED_HANDLER` | `TWebSocketClientConnectedFn` | No | `null` |
| `@app/websocket/client-disconnected-handler` | `WebSocketBindingKeys.CLIENT_DISCONNECTED_HANDLER` | `TWebSocketClientDisconnectedFn` | No | `null` |
| `@app/websocket/message-handler` | `WebSocketBindingKeys.MESSAGE_HANDLER` | `TWebSocketMessageHandler` | No | `null` |
| `@app/websocket/outbound-transformer` | `WebSocketBindingKeys.OUTBOUND_TRANSFORMER` | `TWebSocketOutboundTransformer` | No | `null` |
| `@app/websocket/handshake-handler` | `WebSocketBindingKeys.HANDSHAKE_HANDLER` | `TWebSocketHandshakeFn` | No* | `null` |
| `@app/websocket/instance` | `WebSocketBindingKeys.WEBSOCKET_INSTANCE` | `WebSocketServerHelper` | -- | Set by the component |

- `HANDSHAKE_HANDLER` becomes required when `IServerOptions.requireEncryption` is `true` - it performs the ECDH key exchange during authentication.
- `WEBSOCKET_INSTANCE` is never bound by application code - the component binds it automatically inside the post-start hook, after the server starts. Inject it lazily; see [Usage & Examples](./usage).

### Callback signatures

| Binding Key | Callback Type | Required | Description |
|-------------|--------------|----------|--------------|
| `AUTHENTICATE_HANDLER` | `TWebSocketAuthenticateFn` | **Yes** | Returns <code v-pre>{ userId, metadata }</code> or `null`/`false` to reject |
| `VALIDATE_ROOM_HANDLER` | `TWebSocketValidateRoomFn` | No | Filters requested rooms, returns allowed rooms |
| `CLIENT_CONNECTED_HANDLER` | `TWebSocketClientConnectedFn` | No | Called after successful authentication |
| `CLIENT_DISCONNECTED_HANDLER` | `TWebSocketClientDisconnectedFn` | No | Called on disconnect, after cleanup |
| `MESSAGE_HANDLER` | `TWebSocketMessageHandler` | No | Handles non-system messages from authenticated clients |
| `OUTBOUND_TRANSFORMER` | `TWebSocketOutboundTransformer` | No | Transforms outbound messages (for example per-client encryption) |
| `HANDSHAKE_HANDLER` | `TWebSocketHandshakeFn` | When `requireEncryption: true` | Returns <code v-pre>{ serverPublicKey, salt }</code> or `null`/`false` to reject |

```typescript
type TWebSocketAuthenticateFn<
  AuthDataType extends Record<string, unknown> = Record<string, unknown>,
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> = (opts: AuthDataType) => ValueOrPromise<{ userId?: string; metadata?: MetadataType } | null | false>;

type TWebSocketValidateRoomFn = (opts: {
  clientId: string;
  userId?: string;
  rooms: string[];
}) => ValueOrPromise<string[]>;

type TWebSocketClientConnectedFn<MetadataType extends Record<string, unknown> = Record<string, unknown>> = (
  opts: { clientId: string; userId?: string; metadata?: MetadataType },
) => ValueOrPromise<void>;

type TWebSocketClientDisconnectedFn = (opts: { clientId: string; userId?: string }) => ValueOrPromise<void>;

type TWebSocketMessageHandler = (opts: {
  clientId: string;
  userId?: string;
  message: IWebSocketMessage;
}) => ValueOrPromise<void>;

type TWebSocketOutboundTransformer<
  DataType = unknown,
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> = (opts: {
  client: IWebSocketClient<MetadataType>;
  event: string;
  data: DataType;
}) => ValueOrPromise<TNullable<{ event: string; data: DataType }>>;

type TWebSocketHandshakeFn<AuthDataType extends Record<string, unknown> = Record<string, unknown>> = (
  opts: { clientId: string; userId?: string; data: AuthDataType },
) => ValueOrPromise<{ serverPublicKey: string; salt: string } | null | false>;
```

- **`VALIDATE_ROOM_HANDLER` receives sanitized rooms.** Internal `ws:`-prefixed rooms are already filtered out before this callback runs. Without it bound, **all** join requests are rejected.
- **`CLIENT_CONNECTED_HANDLER` / `CLIENT_DISCONNECTED_HANDLER` errors are caught and logged**, never thrown - a broken hook cannot disconnect a client or crash the server.
- **`MESSAGE_HANDLER` only sees non-system events.** `authenticate`, `connected`, `disconnect`, `join`, `leave`, `error`, `heartbeat`, and `encrypted` are all handled internally. Unbound, non-system messages are silently dropped.
- **`OUTBOUND_TRANSFORMER` only runs for encrypted clients** (`client.encrypted === true`). Non-encrypted clients bypass it entirely - zero overhead until encryption is enabled.

## Architecture

### Lifecycle integration

The component uses the application's **post-start hook** system to solve a timing problem. WebSocket needs a running Bun server instance, but components initialize before the server starts.

```
preConfigure()          <- register WebSocketComponent here
      |
initialize()             <- component.binding() runs: runtime check, resolve bindings, register post-start hook
      |
setupMiddlewares()
      |
startBunModule()          <- Bun server starts, instance created
      |
executePostStartHooks()   <- websocket-initialize hook runs:
      |                       new WebSocketServerHelper(...)
      |                       await wsHelper.configure()
      |                       bind WEBSOCKET_INSTANCE
      |                       server.reload({ fetch, websocket })
```

### Fetch handler

`createBunFetchHandler()` builds the `fetch` function passed to `server.reload()`. It routes every incoming request:

```
Incoming Request
  Is a WebSocket upgrade? (pathname === wsPath && headers.upgrade === 'websocket')
    Yes -> server.upgrade(req, { data: { clientId: crypto.randomUUID() } })
             success -> return undefined (Bun handles the connection)
             failure -> return Response('WebSocket upgrade failed', { status: 500 })
    No  -> honoServer.fetch(req, server)   // note: second arg is the raw server, not wrapped
```

```typescript
function createBunFetchHandler(opts: {
  wsPath: string;
  honoServer: OpenAPIHono;
}): (req: Request, server: TBunServerInstance) => Promise<Response | undefined>
```

## `WebSocketEmitter` API

Standalone, lightweight Redis-only publisher for processes that do not run a `WebSocketServerHelper`. Extends `BaseHelper`. Uses a single Redis pub client.

```typescript
interface IWebSocketEmitterOptions {
  identifier?: string;            // Default: 'WebSocketEmitter' (logger scope)
  redisConnection: IRedisHelper;  // Required - same Redis as the server(s)
}
```

- **Constructor:**
  - Calls `super({ scope })`.
  - Throws `"Invalid redis connection!"` if `redisConnection` is falsy.
  - Calls `redisConnection.duplicateClient()` to create an isolated pub client.
- **`EMITTER_SERVER_ID = 'emitter'`.** Every message the emitter publishes carries this fixed `serverId`. No `WebSocketServerHelper` ever has this ID - they use `crypto.randomUUID()` - so no server self-dedups an emitter message.

| Method | Signature | Behavior |
|--------|-----------|----------|
| `configure()` | `(): Promise<void>` | Registers a Redis `error` handler, connects if lazy (`status === 'wait'`), waits for `'ready'` (30s timeout). Call before any send method. |
| `toClient()` | `(opts: { clientId; event; data }): Promise<void>` | Publishes to `ws:client:{clientId}` |
| `toUser()` | `(opts: { userId; event; data }): Promise<void>` | Publishes to `ws:user:{userId}` |
| `toRoom()` | `(opts: { room; event; data; exclude? }): Promise<void>` | Publishes to `ws:room:{room}`, forwarding `exclude` |
| `broadcast()` | `(opts: { event; data }): Promise<void>` | Publishes to `ws:broadcast` |
| `shutdown()` | `(): Promise<void>` | Calls `redisPub.quit()` - always call when the emitter is no longer needed |

## Internals

### `resolveBindings()`

Reads all binding keys and validates the required ones, throwing before the post-start hook is even registered:

| Binding | Validation | Error on failure |
|---------|-----------|------------------|
| `SERVER_OPTIONS` | Optional, merged with `DEFAULT_SERVER_OPTIONS` via `Object.assign()` | -- |
| `REDIS_CONNECTION` | Must be `instanceof AbstractRedisHelper` | `"Invalid instance of redisConnection ..."` |
| `AUTHENTICATE_HANDLER` | Must be truthy | `"Invalid authenticateFn to setup WebSocket server!"` |
| `VALIDATE_ROOM_HANDLER` / `CLIENT_CONNECTED_HANDLER` / `CLIENT_DISCONNECTED_HANDLER` / `MESSAGE_HANDLER` / `OUTBOUND_TRANSFORMER` / `HANDSHAKE_HANDLER` | Optional, `null` coerced to `undefined` | -- |

### `registerBunHook()`

Registers the `websocket-initialize` post-start hook:

1. Gets the Bun server instance via `getServerInstance()` and the Hono server via `getServer()`. Throws `"[WebSocketComponent] Bun server instance not available!"` if the Bun instance is missing.
2. Constructs `WebSocketServerHelper` with all resolved bindings plus the running server instance.
3. Awaits `wsHelper.configure()` - connects Redis clients, sets up subscriptions, starts the heartbeat timer.
4. Binds the helper to `WEBSOCKET_INSTANCE`.
5. Calls `serverInstance.reload({ fetch: createBunFetchHandler(...), websocket: wsHelper.getBunWebSocketHandler() })`.

### Runtime check

Runs at the top of `binding()`, before anything else:

```typescript
const runtime = RuntimeModules.detect();
if (runtime === RuntimeModules.NODE) {
  throw getError({ message: '[WebSocketComponent] Node.js runtime is not supported yet. Please use Bun runtime.' });
}
```

### Bun WebSocket handler

`WebSocketServerHelper.getBunWebSocketHandler()` returns an `IBunWebSocketHandler` - four lifecycle callbacks plus the config spread from `serverOptions`:

| Callback | Responsibility |
|----------|---------------|
| `open` | Creates the `IWebSocketClient` entry in state `UNAUTHORIZED`, subscribes the socket to its own `clientId` topic, starts the auth timer (skips if `clientId` already exists) |
| `message` | Updates `lastActivity`, then routes the parsed event - see the table below |
| `close` | Clears the auth timer, removes the client from `users`/`rooms`/`clients`, invokes `clientDisconnectedFn` (errors caught and logged) |
| `drain` | Resets `client.backpressured = false` |

The `message` callback routes each event like this:

| Event | Handling |
|-------|----------|
| Not valid JSON | Sends an `error` event back to the client |
| `heartbeat` | No-op - `lastActivity` was already updated |
| `authenticate` | Runs the authentication flow |
| Any other event, client not yet authenticated | Sends `error: "Not authenticated"` |
| `join` / `leave` | Runs the room join/leave flow |
| Any other event, client authenticated | Forwarded to `messageHandler` |

### `deliverToSocket()` backpressure handling

| `socket.send()` return | Meaning | Action |
|------------------------|---------|--------|
| `> 0` | Sent successfully (byte count) | None |
| `0` | Dropped (socket already closed) | Logs `"Message dropped (socket closed)"` |
| `-1` | Backpressure (Bun's send buffer full) | Sets `client.backpressured = true`, logs a warning. Bun still queues the message; `drain` fires and resets the flag once the buffer clears |

Any exception thrown by `socket.send()` is caught and logged.

### `send()` destination resolution

```
send({ destination, payload: { topic, data } })
  destination undefined/null?      -> broadcast locally + publishToRedis(BROADCAST)
  destination is a local clientId? -> sendToClient locally + publishToRedis(CLIENT)
  destination is a local room?     -> sendToRoom locally + publishToRedis(ROOM)
  destination unknown locally?     -> publishToRedis(ROOM, target: destination)  // may be a room on another instance
```

> [!IMPORTANT]
> `send()` has no `USER` type. To reach every session of a user, use `sendToUser()` (local) or `WebSocketEmitter.toUser()` (cross-instance).

### Room join / leave validation

- **Server-side sanitization always applies:**

  | Rule | Requirement |
  |------|-------------|
  | Type | Non-empty string |
  | Length | At most 256 characters |
  | Prefix | Must not start with the reserved `ws:` prefix |

- **`validateRoomFn` gates joins.** Only sanitized rooms reach it. It returns the subset the client may actually join. If unbound, every join is rejected with a warning log.
- **Leave is filtered against joined rooms.** `handleLeave()` computes `rooms.filter(r => client.rooms.has(r))` before leaving. A client can never unsubscribe from a room it never joined - or an internal topic it was auto-subscribed to. If nothing remains after filtering, the leave is silently ignored.

### Graceful shutdown

`WebSocketServerHelper` has a real `shutdown()` method, but `WebSocketComponent` never calls it automatically. Components have no `stop()` lifecycle, and the component does not register a post-stop hook for you.

To disconnect clients cleanly when your application stops, register your own hook with `registerPostStopHook()` - the same mechanism IGNIS's secrets provider uses internally:

```typescript
export class Application extends BaseApplication {
  preConfigure(): ValueOrPromise<void> {
    // ... bind REDIS_CONNECTION, AUTHENTICATE_HANDLER, register WebSocketComponent ...

    this.registerPostStopHook({
      identifier: 'websocket-shutdown',
      hook: async () => {
        const wsHelper = this.get<WebSocketServerHelper>({
          key: WebSocketBindingKeys.WEBSOCKET_INSTANCE,
          isOptional: true,
        });
        if (wsHelper) {
          await wsHelper.shutdown();
        }
      },
    });
  }
}
```

`wsHelper.shutdown()`:

1. Clears the heartbeat timer.
2. Closes every socket with `close(1001, 'Server shutting down')` (errors caught per-client - already-disconnected clients are logged, not thrown).
3. Runs `onClientDisconnect()` for every client, so `clientDisconnectedFn` still fires for each.
4. Clears the `clients`, `users`, and `rooms` maps.
5. Quits both Redis clients (`redisPub.quit()` + `redisSub.quit()`) in parallel.

`emitter.shutdown()` is simpler - it only owns one Redis client and no local state: `redisPub.quit()`.

## See also

- [Overview](./) - quick start, imports, common configuration tasks
- [Usage & Examples](./usage) - injecting the helper, `WebSocketEmitter`, wire protocol, client tracking, delivery strategy
- [Error Reference](./errors) - error conditions and troubleshooting
- [WebSocketServerHelper](/extensions/helpers/websocket/) - helper API documentation
- [Socket.IO Component](../socket-io/) - Node.js-compatible alternative
- [Bun WebSocket Documentation](https://bun.sh/docs/api/websockets) - official Bun WebSocket API reference
