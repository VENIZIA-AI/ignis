---
title: WebSocket Component
description: Wires WebSocketServerHelper into the running Bun server, with Redis Pub/Sub scaling and post-connection authentication
difficulty: intermediate
---

# WebSocket Component

`WebSocketComponent` registers a Bun-native WebSocket server on your application by creating and binding a [`WebSocketServerHelper`](/extensions/helpers/websocket/) once the HTTP server is listening.

> [!IMPORTANT]
> **Bun only.** `binding()` throws if the runtime is Node.js. For Node.js support, use the [Socket.IO Component](../socket-io/) instead.

## In one example

```typescript
import { BaseApplication } from '@venizia/ignis';
import { WebSocketComponent, WebSocketBindingKeys } from '@venizia/ignis/websocket';
import { RedisSingleHelper, TWebSocketAuthenticateFn, ValueOrPromise } from '@venizia/ignis-helpers';

export class Application extends BaseApplication {
  preConfigure(): ValueOrPromise<void> {
    // 1. Redis connection (required, used for cross-instance Pub/Sub)
    this.bind({ key: WebSocketBindingKeys.REDIS_CONNECTION }).toValue(
      new RedisSingleHelper({ name: 'websocket-redis', host: 'localhost', port: 6379, autoConnect: false }),
    );

    // 2. Authenticate handler (required, decides accept/reject per client)
    const authenticateFn: TWebSocketAuthenticateFn = async data => {
      const user = await verifyJWT(data.token as string);
      return user ? { userId: user.id } : null;
    };
    this.bind({ key: WebSocketBindingKeys.AUTHENTICATE_HANDLER }).toValue(authenticateFn);

    // 3. Register (binding() validates the two bindings above and defers the rest)
    this.component(WebSocketComponent);
  }
}
```

`WebSocketComponent` and `WebSocketBindingKeys` come from the `@venizia/ignis/websocket` subpath. They are **not** exported from the `@venizia/ignis` root barrel. Helper types (`TWebSocketAuthenticateFn`, `WebSocketServerHelper`, `WebSocketEmitter`, `WebSocketDefaults`, ...) come from `@venizia/ignis-helpers`.

## How it works

- **Two-phase startup solves a timing problem.** `binding()` runs during `initialize()`, before any Bun server exists. It validates bindings and registers a post-start hook. The actual `WebSocketServerHelper` is only constructed once `executePostStartHooks()` runs, after `Bun.serve()` has produced a live server instance.
- **Two bindings gate startup.** `REDIS_CONNECTION` and `AUTHENTICATE_HANDLER` are both required. `REDIS_CONNECTION` must be an `AbstractRedisHelper` instance. `binding()` throws synchronously if either is missing or the wrong type - before the post-start hook is even registered.
- **Runtime is checked first, fast.** `RuntimeModules.detect()` runs at the top of `binding()`. On Node.js it throws immediately, so a misconfigured app fails at startup, not on first connection.
- **The instance appears only after start.** The post-start hook binds the configured helper to `WebSocketBindingKeys.WEBSOCKET_INSTANCE`. It does not exist during DI construction. Inject it lazily from a service or controller, never via `@inject` in a constructor.
- **A custom `fetch` handler splits traffic.** After the post-start hook runs, `server.reload()` swaps in a new handler. It routes WebSocket upgrade requests - `GET <path>` with an `Upgrade: websocket` header - to Bun's native handler.
  - Everything else goes to the existing Hono server, unchanged.

## Common tasks

### Customize the server path, rooms, and heartbeat

Bind a partial options object to `SERVER_OPTIONS` before registering the component. Unset fields fall back to `WebSocketDefaults`.

```typescript
this.bind({ key: WebSocketBindingKeys.SERVER_OPTIONS }).toValue({
  path: '/realtime',
  defaultRooms: ['general', 'announcements'],
  heartbeatInterval: 20_000,
  heartbeatTimeout: 60_000,
});
```

### Add optional lifecycle callbacks

`VALIDATE_ROOM_HANDLER`, `CLIENT_CONNECTED_HANDLER`, `CLIENT_DISCONNECTED_HANDLER`, and `MESSAGE_HANDLER` are all optional bindings.

```typescript
this.bind({ key: WebSocketBindingKeys.VALIDATE_ROOM_HANDLER }).toValue(
  ({ rooms }: { rooms: string[] }) => rooms.filter(room => room.startsWith('public-')),
);
```

> [!WARNING]
> Without `VALIDATE_ROOM_HANDLER` bound, **every** client `join` request is rejected.

### Inject the running instance in a service

`WEBSOCKET_INSTANCE` is bound after the server starts, so resolve it lazily rather than through the constructor.

```typescript
private get ws(): WebSocketServerHelper {
  return this.application.get<WebSocketServerHelper>({
    key: WebSocketBindingKeys.WEBSOCKET_INSTANCE,
  });
}
```

### Send from a process with no WebSocket server

Background workers, cron jobs, and other microservices use the standalone `WebSocketEmitter` - it uses the same Redis connection with no local server required.

```typescript
import { WebSocketEmitter } from '@venizia/ignis-helpers';

const emitter = new WebSocketEmitter({ redisConnection: redisHelper });
await emitter.configure();
await emitter.toRoom({ room: 'dashboard-viewers', event: 'data:update', data: { cpu: 42 } });
```

### Require encrypted sessions

Set `requireEncryption: true` and bind a `HANDSHAKE_HANDLER`. It becomes required the moment encryption is turned on.

```typescript
this.bind({ key: WebSocketBindingKeys.SERVER_OPTIONS }).toValue({ requireEncryption: true });
this.bind({ key: WebSocketBindingKeys.HANDSHAKE_HANDLER }).toValue(handshakeFn);
```

## See also

- [Usage & Examples](./usage) - injecting the helper, `WebSocketEmitter`, wire protocol, client tracking, delivery strategy
- [Full Reference](./api) - lifecycle diagram, binding keys, configuration options, `WebSocketEmitter` API, internals
- [Error Reference](./errors) - error conditions and troubleshooting
- [WebSocketServerHelper](/extensions/helpers/websocket/) - the helper this component wires in
- [Socket.IO Component](../socket-io/) - Node.js-compatible alternative
- [Bun WebSocket Documentation](https://bun.sh/docs/api/websockets) - official Bun WebSocket API reference

**Files:**

- [`packages/core/src/components/websocket/component.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/websocket/component.ts) - `WebSocketComponent`
- [`packages/core/src/components/websocket/common/keys.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/websocket/common/keys.ts) - `WebSocketBindingKeys`
- [`packages/core/src/components/websocket/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/websocket/common/types.ts) - `IServerOptions`, `DEFAULT_SERVER_OPTIONS`
- [`packages/core/src/components/websocket/handlers/bun.handler.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/websocket/handlers/bun.handler.ts) - `createBunFetchHandler`
