---
type: Architecture
title: gRPC request path
description: How one RPC travels from either port through Hono and ConnectRPC to a controller method.
resource: packages/core-server/src/base/controllers/grpc/adapter.ts
tags: [architecture, grpc]
---

`GrpcRequestAdapter.build` registers one Hono route per RPC. The route hands the request to ConnectRPC's universal
handler with the Hono context in ConnectRPC's context values.

- Application port: the router is built with `grpc: false` (`Bun.serve` sends no trailers). The answer goes through
  `context.newResponse`, so headers set by earlier middleware are kept.
- Native port: a second ConnectRPC router (gRPC protocol only) and the [native listener](/architecture/grpc-native-port.md).
- Order inside a call: interceptors, then `authenticate` and `authorize` (built by `buildRpcMiddlewares`), then the
  controller method with `{ request, context, rpc }`. A gate that returns a `Response` or skips `next()` ends the call.
- RPC routes carry `BodyLimits.stream()`: the application body limit and the request spy leave the body alone;
  ConnectRPC enforces `limits.messageSize` per message (default 5 MiB; ConnectRPC's own default is 4 GiB).
- No `acceptCompression` and no maximum timeout are passed to ConnectRPC: a compressed request is `unimplemented`.
- An RPC name the service does not declare, or a kind mismatch, throws at boot.

## Related

- [gRPC errors](/architecture/grpc-errors.md)
- [gRPC timeouts and shutdown](/architecture/grpc-timeouts-and-shutdown.md)
- [Controller system](/architecture/controller-system.md)
- Wiki: `docs/wiki/content/guides/core-concepts/grpc/`
