---
type: Architecture
title: gRPC timeouts and shutdown
description: Idle timeout lifting, the Bun quiet-stream limit, and what stop() does on each port.
resource: packages/core-server/src/base/controllers/grpc/timeout.guard.ts
tags: [architecture, grpc]
---

- Idle timeout is `server.idleTimeout` (Bun default 10 s, maximum 255). A call whose gates passed has it lifted
  (`GrpcTimeoutGuard.lift`); `restore` gives it back before the response ends, because the value stays on a keep-alive
  socket and Bun applies it only before the end.
- A public RPC keeps it. On the native port it is the stream's `setTimeout`.
- Application port, issue #1522: `Bun.serve` behaves as if it checks idleness every few seconds (observed, not read in Bun). With `idleTimeout` 1 to 4 an actively
  sending public stream is cut at about 4 s; from 5 up, keep it more than 4 s above the longest quiet gap (a stream at
  exactly 4 s above was cut in some runs). `server.timeout(request, 0)` avoids it.
- `stop()`: post-stop hooks in registration order (the native listener's among them), then `Bun.serve` stop, which waits
  for requests in flight and aborts no `rpc.signal`, then datasources.
- Native stop: GOAWAY, wait `shutdownTimeout`, abort the shutdown signal (clients read `unavailable`), 1 s grace,
  destroy sessions and sockets.

## Related

- [gRPC native port](/architecture/grpc-native-port.md)
- [Application lifecycle](/architecture/application-lifecycle.md)
