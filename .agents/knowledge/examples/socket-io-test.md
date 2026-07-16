---
type: Example
title: socket-io-test
description: An example wiring the Socket.IO component with Redis-backed adapter, authentication, and room validation hooks, plus a scripted client covering every event.
resource: examples/socket-io-test
tags: [examples, realtime]
---

`socket-io-test` (`@nx/socket-io-test`) demonstrates the `SocketIOComponent` from `@venizia/ignis/socket-io`, run over Bun's native engine (`@socket.io/bun-engine`) with a Redis connection for cross-instance scaling.

## What it demonstrates

- `setupSocketIO()` binds a `RedisSingleHelper` to `SocketIOBindingKeys.REDIS_CONNECTION`, plus function hooks: `TSocketIOAuthenticateFn` (reads the handshake's `authorization` header, allows anonymous connections for testing), `TSocketIOValidateRoomFn` (allows all rooms), and `TSocketIOClientConnectedFn` (resolves `SocketEventService` from the container and calls `registerClientHandlers`).
- `override async stop()` fetches the `SocketIOServerHelper` instance (`isOptional: true`) and calls `shutdown()`, then disconnects the Redis helper - a graceful-shutdown pattern not shown in the REST-only examples.
- `HealthCheckComponent` and `ApiReferenceComponent` alongside the realtime wiring.

## How to run it

```bash
bun install
bun run server:dev        # NODE_ENV=development bun ., via application.init() -> boot() -> start()
bun client.ts              # scripted socket.io-client simulation, SERVER_URL env override
```

The client (`client.ts`) simulates ten cases end-to-end: connect/authenticate, echo, join/leave room (both via socket event and REST), direct message, room broadcast, global broadcast, list connected clients (socket event and REST), list a client's rooms (REST), and health check.

## Notable / non-obvious

- Unlike most other examples, `index.ts` here calls `application.init()` then explicitly chains `.boot().then(...).catch(...)` before `.start()`, rather than a single `await application.start()` - worth noting when comparing lifecycle entry points across examples.
- REST and Socket.IO surfaces overlap deliberately: joining/leaving a room and listing clients/rooms are each reachable through both a socket event and a REST endpoint under `/api/socket`, so the client script can cross-check one transport against the other.

## Related
- [websocket-test](/examples/websocket-test.md)
- [Application lifecycle](/architecture/application-lifecycle.md)
- [helpers package](/packages/helpers.md)
