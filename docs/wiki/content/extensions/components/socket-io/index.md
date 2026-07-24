---
title: Socket.IO Component
description: Wires SocketIOServerHelper into the app lifecycle for Node.js and Bun, with Redis-backed horizontal scaling and a mandatory authentication handshake
difficulty: intermediate
---

# Socket.IO Component

`SocketIOComponent` registers a [`SocketIOServerHelper`](/extensions/helpers/socket-io/) on your application once the server starts. It runs on both Node.js and Bun, and scales across instances through a Redis adapter. Every client must authenticate before it can send or receive anything.

> [!TIP]
> Bun-only and don't need Socket.IO's handshake protocol? The [WebSocket Component](../websocket/) is a lighter alternative.

## In one example

```typescript
import { BaseApplication } from '@venizia/ignis';
import { SocketIOComponent, SocketIOBindingKeys } from '@venizia/ignis/socket-io';
import { RedisSingleHelper, ValueOrPromise } from '@venizia/ignis-helpers';
import type { TSocketIOAuthenticateFn } from '@venizia/ignis-helpers/socket-io';

export class Application extends BaseApplication {
  preConfigure(): ValueOrPromise<void> {
    // 1. Redis connection (required - used for the adapter + emitter)
    this.bind({ key: SocketIOBindingKeys.REDIS_CONNECTION }).toValue(
      new RedisSingleHelper({ name: 'socket-io-redis', host: 'localhost', port: 6379, autoConnect: false }),
    );

    // 2. Authenticate handler (required - decides accept/reject per client)
    const authenticateFn: TSocketIOAuthenticateFn = handshake => !!handshake.headers.authorization;
    this.bind({ key: SocketIOBindingKeys.AUTHENTICATE_HANDLER }).toValue(authenticateFn);

    // 3. Register - binding() validates the two bindings above and defers the rest
    this.component(SocketIOComponent);
  }
}
```

`SocketIOComponent` and `SocketIOBindingKeys` come from the `@venizia/ignis/socket-io` subpath. They are **not** exported from the `@venizia/ignis` root barrel. Helper types (`TSocketIOAuthenticateFn`, `SocketIOServerHelper`, `SocketIOClientHelper`, `SocketIOConstants`, ...) come from `@venizia/ignis-helpers/socket-io`.

> [!WARNING]
> `autoConnect: false` is required on the Redis helper. The server helper duplicates the connection into 3 independent clients and connects them itself during `configure()`. Connect the parent first and it races against the duplicates. Full explanation in [Usage & Examples](./usage#full-setup).

## How it works

Socket.IO needs a running server, but components initialize before the server exists. Five mechanisms bridge that gap and keep every client on a security-by-default path:

| Mechanism | What happens |
|---|---|
| Post-start hook | `binding()` runs during `initialize()`, resolves bindings, and registers a hook. The hook builds `SocketIOServerHelper` and binds it to `SOCKET_IO_INSTANCE` only after `start()` runs. |
| Runtime detection | `RuntimeModules.detect()` picks Node.js (Socket.IO attaches to `node:http.Server` directly) or Bun (`@socket.io/bun-engine` is dynamically imported and wired into `server.reload()`). See the [runtime comparison](./api#runtime-specific-behavior). |
| Redis fan-out | The connection you bind is never consumed directly. The helper calls `duplicateClient()` three times: a pub/sub pair for the Redis adapter, and a third client for the Redis emitter. |
| Mandatory authentication | Every client starts `unauthorized`. It must emit `authenticate` within `authenticateTimeout` (default 10s) or it gets disconnected. Success joins the client to the default rooms and starts a keep-alive ping. |
| Opt-in rooms | No `VALIDATE_ROOM_HANDLER` bound means every `join` request is rejected. That's security-by-default, not a bug. |

## Common tasks

### Restrict CORS for production

Bind `SERVER_OPTIONS` before registering the component. The default (`cors.origin: '*'`) is for local development only.

```typescript
import type { ServerOptions } from 'socket.io';

this.bind<Partial<ServerOptions>>({ key: SocketIOBindingKeys.SERVER_OPTIONS }).toValue({
  cors: { origin: ['https://myapp.com'], credentials: true },
});
this.component(SocketIOComponent);
```

### Send a message from a service

`SOCKET_IO_INSTANCE` is bound by the component after the server starts, so resolve it lazily - never `@inject` it in a constructor. Full pattern in [Inject the helper in a service or controller](./usage#inject-the-helper-in-a-service-or-controller).

```typescript
this.io.send({ destination: userId, payload: { topic: 'notification', data } });
```

### Scale Redis beyond a single node

Swap `RedisSingleHelper` for `RedisClusterHelper` or `RedisSentinelHelper`. Both satisfy the `IRedisHelper` interface the component validates against. See [Redis connection alternatives](./usage#redis-connection-alternatives) for the full example.

```typescript
import { RedisClusterHelper } from '@venizia/ignis-helpers';

this.bind({ key: SocketIOBindingKeys.REDIS_CONNECTION }).toValue(
  new RedisClusterHelper({
    name: 'socket-io-redis-cluster',
    nodes: [{ host: 'redis-node-1', port: 6379 }],
    autoConnect: false,
  }),
);
```

### Look up a default, binding key, or event name

Every `DEFAULT_SERVER_OPTIONS` field, the binding key table, system events, default rooms, and the client state machine live in the [Full Reference](./api#configuration-reference).

## See also

- [Usage & Examples](./usage) - full setup steps, server-side usage, client helper, advanced patterns
- [Full Reference](./api) - architecture, configuration reference, method signatures, internals, types
- [Error Reference](./errors) - error conditions and troubleshooting
- [Socket.IO Helper](/extensions/helpers/socket-io/) - full `SocketIOServerHelper` + `SocketIOClientHelper` API reference
- [WebSocket Component](../websocket/) - Bun-only alternative
- [Real-Time Chat tutorial](/guides/tutorials/realtime-chat) - building a chat app with Socket.IO
- [Socket.IO Documentation](https://socket.io/docs/) - official docs
- [Socket.IO Redis Adapter](https://socket.io/docs/v4/redis-adapter/) - horizontal scaling guide
- [@socket.io/bun-engine](https://github.com/socketio/bun-engine) - Bun runtime support
- [2026-02-06: Socket.IO Integration Fix](/changelogs/2026-02-06-socket-io-integration-fix) - lifecycle timing fix + Bun runtime support

**Files:**

- [`packages/core/src/components/socket-io/component.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/socket-io/component.ts) - `SocketIOComponent`
- [`packages/core/src/components/socket-io/common/keys.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/socket-io/common/keys.ts) - `SocketIOBindingKeys`
- [`packages/core/src/components/socket-io/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/socket-io/common/types.ts) - `IServerOptions`, `DEFAULT_SERVER_OPTIONS`
