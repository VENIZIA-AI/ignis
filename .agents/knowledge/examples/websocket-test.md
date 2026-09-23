---
type: Example
title: websocket-test
description: IGNIS's Bun-native WebSocket component with Redis-backed rooms behind a mandatory authentication handshake, no Socket.IO protocol involved.
resource: examples/websocket-test
tags: [examples, realtime]
---

`websocket-test` mirrors [`socket-io-test`](/examples/socket-io-test.md) but exercises
`WebSocketComponent` from `@venizia/ignis/websocket` - Bun's native WebSocket, not the Socket.IO
protocol. `src/application.ts` binds `REDIS_CONNECTION` and `AUTHENTICATE_HANDLER` before
registering the component; `src/controllers/chat.controller.ts` is the one REST route, `POST
/chat/messages`, that pushes into the room every authenticated client joins.

## What it demonstrates

- **Every message is a JSON envelope** - `{ "event": "...", "data": {...} }`. A client opens the
  connection, then sends an `authenticate` message carrying `{ token }`. A match joins it to
  `ws-default` and answers `connected`; a mismatch answers `error` and closes the connection with
  code `4003`.
- **`autoConnect: false` on the Redis helper** - the component duplicates that connection into two
  Redis clients (pub, sub) and connects them itself during `configure()`.
- **`WebSocketServerHelper` is resolved lazily** - `WEBSOCKET_INSTANCE` binds only after the server
  starts, the same lazy-getter pattern `socket-io-test` uses for `SocketIOServerHelper`.
- **A graceful shutdown hook** - `registerPostStopHook` fetches `WebSocketServerHelper` (`isOptional:
  true`), calls `shutdown()`, then disconnects the Redis helper.

## How to run it

```bash
bun install
docker compose up -d   # Redis
bun run start            # http://localhost:3000/api, explorer at /api/doc/explorer
bun test                  # smoke test: connects raw WebSocket clients; skipped, not failed, if Redis is down
docker compose down -v
```

## Notable / non-obvious

- Authentication is a message after connect, not an upgrade-time header check - a raw `WebSocket`
  client needs no custom headers to reach the handshake step.
- This example needs `docker compose up -d` first; it is not in the root Makefile's
  `EXAMPLES_SMOKE` list, so it runs locally, not in CI.

## Related
- [socket-io-test](/examples/socket-io-test.md)
- [helpers package](/packages/helpers.md)
- [Application lifecycle](/architecture/application-lifecycle.md)
