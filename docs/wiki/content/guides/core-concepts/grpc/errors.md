---
title: gRPC errors and status codes
description: How a thrown error becomes a gRPC status code in IGNIS
---

# gRPC errors and status codes

An RPC fails the way a REST route does: throw `getError({ statusCode, message })` or Hono's `HTTPException`. A 4xx reaches the client as a gRPC code with your message. A [database error](#database-errors) the request caused does too.

```typescript
import { getError, HTTP } from '@venizia/ignis-helpers';

throw getError({
  statusCode: HTTP.ResultCodes.RS_4.NotFound,
  message: 'No such note',
});
```

## HTTP status to gRPC code for thrown errors

| `statusCode` | gRPC code |
|---|---|
| 400, 422 | `invalid_argument` |
| 401 | `unauthenticated` |
| 403 | `permission_denied` |
| 404 | `not_found` |
| 409 | `aborted` |
| 429 | `resource_exhausted` |
| other 4xx | `failed_precondition` |
| 5xx, and any other error | `internal`, text hidden |

The message and status come from the default error handler, so an RPC client may read what a REST client may. An error handler you override is **not** used for an RPC.

## Errors that answer internal

These answer `internal`, whatever status they carry:

- an error of another library, such as a raw `ZodError`. [Database errors](#database-errors) are the exception
- a 5xx from `getError`
- an authentication or authorization middleware that returns without calling `next()`

```typescript
const parsed = DraftSchema.safeParse(opts.request);

if (!parsed.success) {
  throw getError({ statusCode: HTTP.ResultCodes.RS_4.BadRequest, message: 'Title is required' });
}
```

## Database errors

A PostgreSQL error that a REST route answers with 400 or 409 reaches an RPC client with the same message and a gRPC code. The driver error may be wrapped in `cause`, as a query builder does.

| SQLSTATE | gRPC code |
|---|---|
| `23505` unique violation | `already_exists` |
| `23503` foreign key violation | `failed_precondition` |
| `23000`, `23001`, `23P01`, `44000` and other constraint violations | `failed_precondition` |
| `23502` not null, `23514` check, class `22` data errors | `invalid_argument` |
| `40001`, `40P01` serialization failure, deadlock | `aborted` |

Outside the development environments the message names the kind of error only: no detail, table or constraint. Any other database error, and a SQLite error, answers `internal`.

## What the log shows

Every failed RPC is logged once, an unexpected error such as a `TypeError` or a lost database connection included. A `ConnectError` is your own answer and is not logged. A 401, 403 or 404 of `getError` or `HTTPException` is logged at `warn`, any other error at `error`; a `logLevel` you set on `getError` wins. A call of the native port is logged as `grpc://<host the caller sent>/<path>`: the host is the caller's text, so do not rely on it.

## Choose a gRPC code yourself

Throw a `ConnectError`. It is sent as is.

```typescript
import { Code, ConnectError } from '@connectrpc/connect';

throw new ConnectError('Try again later', Code.Unavailable);
```

## Read the error on the client

```typescript
import { Code, ConnectError } from '@connectrpc/connect';

try {
  await client.sayHello({ name: 'Ada' });
} catch (error) {
  const failure = ConnectError.from(error);

  if (failure.code === Code.Unauthenticated) {
    // sign in again; failure.rawMessage holds the server's text
  }
}
```

## Errors the framework and ConnectRPC answer

| Situation | Answer |
|---|---|
| Message over `limits.messageSize` | `resource_exhausted` |
| Malformed message | `invalid_argument` |
| Compressed request message | `unimplemented` |
| Deadline passed, handler honoured `rpc.signal` | `deadline_exceeded` |
| Client cancelled | `canceled` |
| Server stopping, call aborted | `unavailable` |
| Request over `server.maxRequestBodySize` (application port) | HTTP 413 |
| gRPC content type on the application port | HTTP 415 |
| Bidi on the application port | HTTP 505 |
| Unknown method on the native port | `unimplemented` |

## When a middleware answers before the RPC

A global middleware (rate limit, firewall) may answer before the RPC runs. Native clients get the code below with the answer's `message` (at most 1,024 bytes once percent-encoded) and its headers, such as `retry-after`. Connect and gRPC-Web clients apply the same table to the HTTP status.

| HTTP status | Code |
|---|---|
| 400 | `internal` |
| 401 | `unauthenticated` |
| 403 | `permission_denied` |
| 404 | `unimplemented` |
| 429, 502, 503, 504 | `unavailable` |
| other | `unknown` |

An authentication or authorization middleware that returns a `Response` also ends the call: a 4xx gives the code of the thrown-error table above, anything else `internal`, and the response body and headers are not sent.
