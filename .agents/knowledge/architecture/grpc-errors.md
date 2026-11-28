---
type: Architecture
title: gRPC errors
description: Which thrown errors keep their code and message over RPC and which answer internal.
resource: packages/core-server/src/base/controllers/grpc/errors.ts
tags: [architecture, grpc]
---

`GrpcErrors.toAnswer` passes every error that is not a `ConnectError` to the default `AppErrorMiddleware`, once,
which logs it and decides status and message; an application's own `onError` is not used. A 4xx answer reaches the client for an
`ApplicationError` (`isApplicationError`), a Hono `HTTPException`, and an answer whose `normalized.code` is a
`DatabaseErrorCodes` value or `CoreErrorCodes.DATABASE_CONFLICT`. The log level is the handler's own rule (see
[Error handling flow](/architecture/error-handling-flow.md)).

- A `ConnectError` passes as is, whatever its `cause`. Everything else, 5xx included, answers `internal`.
- A database 400 maps by `normalized.code`: unique violation `already_exists`, foreign key and generic constraint
  `failed_precondition`, the rest `invalid_argument`; a retryable 409 is `aborted`. SQLite errors stay `internal`.
- For a native call `AppErrorMiddleware` logs `grpc://<host header, cleaned and bounded><path>` instead of
  the listener's constant origin. The origin of the request itself stays constant.
- The code table is in `errors.ts`; a refusal before ConnectRPC saw the call uses the different HTTP table of
  `native/status.utility.ts`.

## Related

- [Error handling flow](/architecture/error-handling-flow.md)
- [gRPC request path](/architecture/grpc-request-path.md)
