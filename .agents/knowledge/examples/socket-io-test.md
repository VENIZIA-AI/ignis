---
type: Example
title: socket-io-test
description: The Socket.IO component with Redis-backed rooms behind a mandatory authentication handshake, running on Bun via @socket.io/bun-engine.
resource: examples/socket-io-test
tags: [examples, realtime]
---

`socket-io-test` demonstrates `SocketIOComponent` from `@venizia/ignis/socket-io`, run over Bun's
native engine (`@socket.io/bun-engine`) with a Redis connection so state fans out across instances.
`src/application.ts` binds `REDIS_CONNECTION` and `AUTHENTICATE_HANDLER` before registering the
component; `src/controllers/chat.controller.ts` is the one REST route, `POST /chat/messages`, that
pushes into the room every authenticated client joins.

## What it demonstrates

- **`autoConnect: false` on the Redis helper** - the component duplicates that connection into three
  Redis clients (pub, sub, emitter) and connects them itself during `configure()`; connecting first
  in `application.ts` would race the duplicates.
- **The handshake, not a header alone, authenticates a client** - a Socket.IO client sends its token
  as `Authorization: Bearer <token>` at connect time, then emits `authenticate`. A match joins it to
  `io-default` and `io-notification`; a mismatch emits `unauthenticated` and disconnects the socket.
- **`SocketIOServerHelper` is resolved lazily** - `SOCKET_IO_INSTANCE` binds only after the server
  starts, so `ChatController` reads it through a getter the first time a request needs it, never in
  the constructor.
- **A graceful shutdown hook** - `registerPostStopHook` fetches `SocketIOServerHelper` (`isOptional:
  true`), calls `shutdown()`, then disconnects the Redis helper.

## How to run it

```bash
bun install
docker compose up -d   # Redis
bun run start            # http://localhost:3000/api, explorer at /api/doc/explorer
bun test                  # smoke test: connects real Socket.IO clients; skipped, not failed, if Redis is down
docker compose down -v
```

## Notable / non-obvious

- A rejected client receives `unauthenticated` on its own socket, then the disconnect
  (`reason: 'io server disconnect'`). Until 2026-09-23 the notice went through the Redis emitter
  and always lost the race to the disconnect; the smoke test now asserts the notice arrives.
- This example needs `docker compose up -d` first; it is not in the root Makefile's
  `EXAMPLES_SMOKE` list, so it runs locally, not in CI.

## Related
- [websocket-test](/examples/websocket-test.md)
- [Application lifecycle](/architecture/application-lifecycle.md)
- [helpers package](/packages/helpers.md)
