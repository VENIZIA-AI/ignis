---
type: Architecture
title: gRPC native port
description: The optional node:http2 listener that serves the gRPC protocol through the same application fetch.
resource: packages/core-server/src/base/controllers/grpc/native
tags: [architecture, grpc]
---

`GrpcComponent` builds one `GrpcListenerHelper` when `native.use` is true; `node:http2` is imported only in `start()`.
It is started by a post-start hook and stopped by a post-stop hook.

- It serves only mapped RPC paths (`/package.Service/Method`, POST). Two controllers with one service fail the boot.
- Each call goes through `app.fetch` with headers only and a `GrpcNativeCallStore` as env. Only the listener creates
  that instance, so an HTTP request cannot pass for a native one.
- The RPC route writes the answer and trailers on the node stream. Any other answer becomes a trailers-only refusal;
  the status maps by the gRPC HTTP table (`GrpcStatusUtility`), `grpc-message` is capped at 1024 encoded characters.
- Option defaults: host `127.0.0.1`, TLS off (h2c), `shutdownTimeout` 10 000 ms, 100 concurrent streams per
  connection. The constructor validates them.
- TLS is `h2` only. No mTLS, reflection or health service.
- Peer: `@connectrpc/connect-node` (optional), declared as the narrow `IConnectNodeModule`.

## Related

- [gRPC request path](/architecture/grpc-request-path.md)
- [gRPC timeouts and shutdown](/architecture/grpc-timeouts-and-shutdown.md)
