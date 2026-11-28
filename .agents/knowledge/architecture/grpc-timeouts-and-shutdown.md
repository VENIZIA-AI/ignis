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
  for requests in flight up to the hard limit below, then datasources.
- Application port stop: the `grpc.http.stop` hook, registered before the native one, starts an unref'd timer of
  `native.shutdownTimeout` (default 10 000 ms, also with the native port off) that aborts the signal of the Connect
  router: reads of a streamed request and streamed answers reject, and clients read `unavailable`.
- Hard limit (`ServerApplication.closeServer`): `instance.stop()` is raced against `native.shutdownTimeout` (read from
  the component options binding, else 10 000 ms) plus 1 s, counted from the `server.stop.clock` post-stop hook that
  `registerComponents` registers ahead of every component's. Past it, `instance.stop(true)` runs in a root frame.
  It cuts REST requests and WebSocket connections too, with or without the gRPC component.
- An `abort` listener on `rpc.signal` that throws is an `uncaughtException` in Bun: `abort()` does not throw, so there
  is no place to catch it. It ends the process unless handled; winston registers an exception handler only for an
  exception transport.
- Native stop: GOAWAY, wait `shutdownTimeout`, abort the shutdown signal (clients read `unavailable`), 1 s grace,
  destroy sessions and sockets.

## Related

- [gRPC native port](/architecture/grpc-native-port.md)
- [Application lifecycle](/architecture/application-lifecycle.md)
