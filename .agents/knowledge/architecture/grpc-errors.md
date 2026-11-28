---
type: Architecture
title: gRPC errors
description: Which thrown errors keep their code and message over RPC and which answer internal.
resource: packages/core-server/src/base/controllers/grpc/errors.ts
tags: [architecture, grpc]
---

`GrpcErrors.toAnswer` converts only `ApplicationError` (`isApplicationError`) and Hono `HTTPException` with a 4xx. It
runs the default `AppErrorMiddleware` to decide status and message, so an application's own `onError` is not used.

- A `ConnectError` passes as is. Everything else, 5xx included, answers `internal`.
- A raw database driver error is therefore `internal` over RPC, although REST answers 400 for a constraint violation.
- The code table is in `errors.ts`; a refusal before ConnectRPC saw the call uses the different HTTP table of
  `native/status.utility.ts`.

## Related

- [Error handling flow](/architecture/error-handling-flow.md)
- [gRPC request path](/architecture/grpc-request-path.md)
