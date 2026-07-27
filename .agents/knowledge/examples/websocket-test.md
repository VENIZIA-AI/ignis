---
type: Example
title: websocket-test
description: An example wiring the raw WebSocket component with Redis, upgrade-time authentication, and room/message handler hooks over Bun's native WebSocket support.
resource: examples/websocket-test
tags: [examples, realtime]
---

`websocket-test` (`@nx/websocket-test`) mirrors `socket-io-test` but exercises `WebSocketComponent` from `@venizia/ignis/websocket` - plain WebSocket, not Socket.IO's protocol - with Bun's native ping support enabled via `serverOptions: { sendPings: true }`.

## What it demonstrates

- `setupWebSocket()` binds a `RedisSingleHelper` for scaling, plus five function hooks: `TWebSocketAuthenticateFn` (runs at upgrade time, before the connection is accepted; falls back to an anonymous `userId` if no `authorization` header is present), `TWebSocketValidateRoomFn`, `TWebSocketClientConnectedFn`, `TWebSocketClientDisconnectedFn`, and `TWebSocketMessageHandler` (routes each inbound message to `WebSocketEventService.handleMessage`).
- `override async stop()` fetches `WebSocketServerHelper` (`isOptional: true`), calls `shutdown()`, then disconnects Redis - the same graceful-shutdown shape as `socket-io-test`.
- A plain `client.html` file for manual browser-based testing, instead of a scripted Node/Bun client.

## How to run it

```bash
bun install
bun run server:dev      # NODE_ENV=development bun .
# open client.html in a browser to connect manually
```

## Notable / non-obvious

- Authentication happens strictly at the upgrade request (`TWebSocketAuthenticateFn` receives the raw `request`, not a socket), which is why it can reject a connection before any WebSocket frame is ever exchanged - a stronger guarantee than Socket.IO's handshake-based authenticate hook in the sibling example.
- The `SERVER_OPTIONS` binding (`sendPings: true`) is the one place in the examples that reaches into Bun-specific native WebSocket server tuning rather than a cross-runtime abstraction.

## Related
- [socket-io-test](/examples/socket-io-test.md)
- [helpers package](/packages/helpers.md)
- [Application lifecycle](/architecture/application-lifecycle.md)
