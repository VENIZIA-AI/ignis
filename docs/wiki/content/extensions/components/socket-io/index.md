# Socket.IO -- Setup & Configuration

> Real-time, bidirectional, event-based communication using Socket.IO -- with automatic runtime detection for Node.js and Bun, horizontal scaling via Redis, and a built-in authentication handshake.

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` (core) |
| **Class** | `SocketIOComponent` |
| **Server Helper** | [`SocketIOServerHelper`](/extensions/helpers/socket-io/) |
| **Client Helper** | [`SocketIOClientHelper`](/extensions/helpers/socket-io/) |
| **Runtimes** | Node.js (`@hono/node-server`) and Bun (native) |
| **Scaling** | `@socket.io/redis-adapter` + `@socket.io/redis-emitter` |

> [!IMPORTANT]
> `SocketIOComponent` and `SocketIOBindingKeys` are **not** exported from the `@venizia/ignis` barrel -- import from the `@venizia/ignis/socket-io` subpath.

```typescript
// From core -- subpath import (NOT from '@venizia/ignis')
import { SocketIOComponent, SocketIOBindingKeys } from '@venizia/ignis/socket-io';

// From helpers -- subpath import
import { SocketIOServerHelper, SocketIOClientHelper, SocketIOConstants } from '@venizia/ignis-helpers/socket-io';
import type { TSocketIOAuthenticateFn, TSocketIOValidateRoomFn } from '@venizia/ignis-helpers/socket-io';
```

**Use cases:**

- Live notifications and alerts
- Real-time chat and collaborative editing
- Live dashboards and monitoring streams
- Multiplayer game state synchronization
- Service-to-service real-time messaging (via `SocketIOClientHelper`)

## Setup

Three pieces are bound in `preConfigure()`, before the component itself is registered:

| Step | Binding key | Required |
|------|-------------|----------|
| 1. Redis connection | `SocketIOBindingKeys.REDIS_CONNECTION` | Yes |
| 2. Authenticate handler | `SocketIOBindingKeys.AUTHENTICATE_HANDLER` | Yes |
| 3. Room / connected handlers | `VALIDATE_ROOM_HANDLER`, `CLIENT_CONNECTED_HANDLER` | No |

```typescript
import { BaseApplication } from '@venizia/ignis';
import { SocketIOComponent, SocketIOBindingKeys } from '@venizia/ignis/socket-io';
import { RedisSingleHelper, ValueOrPromise } from '@venizia/ignis-helpers';
import type { TSocketIOAuthenticateFn } from '@venizia/ignis-helpers/socket-io';

export class Application extends BaseApplication {
  preConfigure(): ValueOrPromise<void> {
    // 1. Redis connection -- required for the adapter + emitter
    const redisHelper = new RedisSingleHelper({
      name: 'socket-io-redis',
      host: process.env.REDIS_HOST ?? 'localhost',
      port: +(process.env.REDIS_PORT ?? 6379),
      autoConnect: false,
    });
    this.bind({ key: SocketIOBindingKeys.REDIS_CONNECTION }).toValue(redisHelper);

    // 2. Authentication handler -- required
    const authenticateFn: TSocketIOAuthenticateFn = handshake => !!handshake.headers.authorization;
    this.bind({ key: SocketIOBindingKeys.AUTHENTICATE_HANDLER }).toValue(authenticateFn);

    // 3. Register the component
    this.component(SocketIOComponent);
  }
}
```

> [!WARNING]
> `autoConnect: false` is required on the Redis helper -- the server helper duplicates the connection into 3 independent clients and connects them itself during `configure()`. Connecting the parent first races against the duplicates. Full step-by-step setup (Bun peer dependency, room validation, cluster/sentinel Redis, the `autoConnect` rationale) is in [Usage & Examples](./usage#full-setup).

## How It Works

- **Post-start hook, not immediate init.** Socket.IO needs a running server, but components initialize *before* the server starts. `binding()` resolves all bindings and registers a post-start hook; the hook builds `SocketIOServerHelper` and binds it to `SOCKET_IO_INSTANCE` only after `start()` brings the server up.
- **Runtime detection picks the wiring.** `RuntimeModules.detect()` selects Node.js (Socket.IO attaches to `node:http.Server` directly) or Bun (`@socket.io/bun-engine` is dynamically imported and wired into `server.reload()`). See the [runtime matrix](./api#runtime-specific-behavior) for the full comparison.
- **One Redis connection becomes three.** The connection you bind is never consumed directly -- the helper calls `duplicateClient()` three times: a pub/sub pair for the Redis adapter (cross-instance room broadcast) and a third client for the Redis emitter (cross-instance direct send).
- **Authentication is mandatory.** Every client starts `unauthorized` and must emit `authenticate` within `authenticateTimeout` (default 10s) or it is disconnected. Success joins the client to the default rooms and starts a keep-alive ping.
- **Room joins are opt-in by default.** Without a bound `VALIDATE_ROOM_HANDLER`, every `join` request is silently rejected -- security-by-default, not a bug.

## Common Tasks

**Restrict CORS for production.** Bind `SERVER_OPTIONS` before registering the component -- the default (`cors.origin: '*'`) is for local development only.

```typescript
import type { ServerOptions } from 'socket.io';

this.bind<Partial<ServerOptions>>({ key: SocketIOBindingKeys.SERVER_OPTIONS }).toValue({
  cors: { origin: ['https://myapp.com'], credentials: true },
});
this.component(SocketIOComponent);
```

**Send a message from a service.** `SOCKET_IO_INSTANCE` is bound by the component after the server starts, so resolve it lazily -- never `@inject` it in a constructor. Full pattern in [Usage & Examples](./usage).

```typescript
this.io.send({ destination: userId, payload: { topic: 'notification', data } });
```

**Scale Redis beyond a single node.** Swap `RedisSingleHelper` for `RedisClusterHelper` or `RedisSentinelHelper` -- both satisfy the `IRedisHelper` interface the component validates against. See [Redis Connection Alternatives](./usage#redis-connection-alternatives).

**Look up every default, binding key, and constant.** Full `DEFAULT_SERVER_OPTIONS`, the binding key table, system events, default rooms, and the client state machine are in the [API Reference](./api#configuration-reference).

## See Also

- [Usage & Examples](./usage) -- Full setup steps, server-side usage, client helper, advanced patterns
- [API Reference](./api) -- Architecture, configuration reference, method signatures, internals, types
- [Error Reference](./errors) -- Error conditions and troubleshooting
- **Guides:**
  - [Components Overview](/guides/core-concepts/components) -- Component system basics
  - [Application](/guides/core-concepts/application/) -- Registering components
- **Components:**
  - [Components Index](../index) -- All built-in components
- **Helpers:**
  - [Socket.IO Helper](/extensions/helpers/socket-io/) -- Full `SocketIOServerHelper` + `SocketIOClientHelper` API reference
- **External Resources:**
  - [Socket.IO Documentation](https://socket.io/docs/) -- Official docs
  - [Socket.IO Redis Adapter](https://socket.io/docs/v4/redis-adapter/) -- Horizontal scaling guide
  - [@socket.io/bun-engine](https://github.com/socketio/bun-engine) -- Bun runtime support
- **Tutorials:**
  - [Real-Time Chat](/guides/tutorials/realtime-chat) -- Building a chat app with Socket.IO
- **Changelog:**
  - [2026-02-06: Socket.IO Integration Fix](/changelogs/2026-02-06-socket-io-integration-fix) -- Lifecycle timing fix + Bun runtime support

**Files:**

- [`packages/core/src/components/socket-io/component.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/socket-io/component.ts) -- `SocketIOComponent`
- [`packages/core/src/components/socket-io/common/keys.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/socket-io/common/keys.ts) -- `SocketIOBindingKeys`
- [`packages/core/src/components/socket-io/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/socket-io/common/types.ts) -- `IServerOptions`, `DEFAULT_SERVER_OPTIONS`
