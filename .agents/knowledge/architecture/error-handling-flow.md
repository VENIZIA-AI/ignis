---
type: Architecture
title: Error handling flow
description: How an error travels from a throw site to an HTTP response, and what the production sanitization boundary suppresses.
resource: packages/core/src/base/middlewares/app-error
tags: [architecture, errors, middleware, security]
---

Every error in IGNIS ends at one place: the Hono `onError` handler installed by
`registerDefaultMiddlewares()` at the very top of `initialize()`, before any user configuration runs.
Nothing else needs to catch-and-shape for HTTP.

## Throwing: always `getError`

Never `new Error`. `getError({ message, statusCode?, messageCode?, ...extra })` returns an
`ApplicationError` carrying the fields the handler reads - `statusCode` (default 400), `messageCode`
(resolved through `MessageCode`), and `extra`, which collects anything beyond the known keys.

## Identity: use `isApplicationError`, not `instanceof`

**`instanceof ApplicationError` is unreliable across package boundaries.** An error raised by the DI
container carries `inversion`'s copy of the class, and inversion ships a dual CJS + ESM build, so even
that one class has two runtime identities - a CJS consumer and an ESM consumer hold different
constructors for the same source. `isApplicationError` therefore tests by **shape**:

```typescript
export const isApplicationError = (error: unknown): error is ApplicationError => {
  return error instanceof Error && typeof (error as AnyType).statusCode === 'number';
};
```

Code that must tell "an error the framework already shaped" from "a raw failure" - the search
connectors do exactly this before wrapping anything else as a 503 - has to use it, or a real 404
reaches the caller as a bogus 503. The error middleware uses the same test inline, via
`'statusCode' in error`.

## Classification in `appErrorHandler`

Every error is logged in full first, with the request ID, method, path and URL - the log is where the
detail lives, never the response. Then it is routed:

- **ZodError** -> 422, formatted by `formatZodError`.
- **DB client error** -> 400. `isDatabaseClientError` accepts only SQLSTATE classes caused by the
  request: `22` (data exception) and `23` (integrity violation). Everything else - class `42`
  syntax/undefined-column, class `53` resources - stays a 500, being the server's bug, not the
  client's. A missing or non-string code (a gRPC numeric code, say) is treated as non-client and
  must never crash this last-resort handler.
- **Transient DB conflict** -> 409. `isRetryableDatabaseError` matches SQLSTATE `40001`
  (serialization failure) and `40P01` (deadlock); the response gets a fixed safe message and a
  retryable message code, since the client can retry the request unchanged.
- **Intentional domain error** (anything with `statusCode`) -> its own status and message, untouched.
- **Anything else** -> 500.

## The production boundary

```typescript
const env = [context.env?.NODE_ENV, process.env.NODE_ENV].find(Boolean);
const isProduction = !env || !Environment.DEVELOPMENT_ENVS.has(env.toLowerCase());
```

This is **fail-closed**: a missing or unrecognized `NODE_ENV` is treated as production. Only
`local`, `debug`, `development`, `dev` and `sit` are in `DEVELOPMENT_ENVS` (`dev` is an alias of
`development`; both are listed because deployments write the abbreviation). `alpha`, `beta`,
`staging`, `uat` and anything unknown get the sanitized behaviour. An unset env is also logged as an
`INVALID ENV IDENTIFIER` error, so the misconfiguration is visible rather than merely safe.

Production suppresses:

- **Raw messages of unexpected errors.** When `isProduction && !('statusCode' in error)`, the message
  is replaced with `'Internal Server Error'`. An uncaught throw, a non-client DB error or a connection
  failure may carry SQL text, schema names or connection strings.
- **DB driver context.** In non-production `isDatabaseClientError` appends `Detail:`, `Table:` and
  `Constraint:` lines to aid debugging. In production only the generic base message survives -
  `detail` echoes row values (`Key (email)=(a@b.com) already exists`) and `table`/`constraint` reveal
  schema internals.
- **`stack` and `cause`.** Both are set on `details` only when `!isProduction`.

Note the asymmetry that makes this safe: an error you raised with `getError` keeps its message in
production, because you chose that message deliberately. An error you did not raise never does.

## The response shape

```typescript
{
  message, messageCode, statusCode, requestId,
  extra,                                  // from ApplicationError.extra
  details: { url, path, stack, cause },   // stack/cause non-production only
}
```

`configs.error.rootKey`, when set, nests this under that key. `requestId` is the join key between the
response a client saw and the fully detailed server log line.

## Related

- [Error handling conventions](/conventions/error-handling.md)
- [Application lifecycle](/architecture/application-lifecycle.md)
- [Controller system](/architecture/controller-system.md)
- [Debugging](/process/debugging.md)
