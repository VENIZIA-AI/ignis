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

Never `new Error`. `getError(opts)` returns an `ApplicationError` carrying the fields the handler
reads - `statusCode` (default 400), `normalized` (always built), and `extra`.

`message` takes either shape:

```typescript
getError({ message: 'Boot failed', messageCode: 'a.b', messageArgs: { n: 1 } }); // flat
getError({ message: { text: 'Boot failed', code: 'a.b', args: { n: 1 } } });     // nested
getError({ error: UserErrors.CREATE_DUPLICATE_EMAIL, messageArgs: { email } });  // catalogued
```

All three resolve into the one `normalized { text, code, args }`. `messageCode`/`messageArgs` are
INPUTS only: neither survives as a field of its own - there is no `error.messageCode`, and `extra`
never mirrors `messageArgs`. Precedence, most specific first: `message.code` > the definition's
`message.code` > `messageCode`; and `message.args` > `messageArgs` > the definition's `message.args`.

`extra` takes both routes: pass it explicitly, or let any key the input does not model ride the
index signature into it. The trade is that a mistyped key goes the same way - the framework cannot
tell context from typo.

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

## Classification in `AppErrorMiddleware`

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
  message, statusCode, requestId,
  normalized,                             // { text, code, args } - EVERY branch, including 422
  extra,                                  // from ApplicationError.extra; absent when empty
  details: { url, path, stack, cause },   // stack/cause non-production only
}
```

`normalized` is what a client renders: `translate(normalized.code, normalized.args)`. It is the ONLY
source: the flat `messageCode` and the `extra.messageArgs` mirror duplicated it and were REMOVED. A
client still reading either must move to `normalized`.

Only the INTENTIONAL branch can carry `extra`, and only the intentional branch reports the message
the throw site wrote. The other four REPLACE the message; `normalized` is built from the
replacement, never from the original, so it cannot become a second way to leak what `message` just
scrubbed. An `ApplicationError` arrives already normalized and that object is authoritative - a
`transform` may have written a `text` deliberately different from `message`.

`configs.error.rootKey`, when set, nests this under that key. `requestId` is the join key between the
response a client saw and the fully detailed server log line.

## The return trip: `fromError`

`fromError({ error })` inverts the payload above - `TResponsedError` (inversion, plain TS) names the
shape, and the result is a live `ApplicationError`, so a client's `catch` treats a server failure
and a locally thrown one alike. It is OPTIONAL: reading `error.normalized.code` off the parsed body
needs no framework help and stays the shortest path.

`normalized` round-trips verbatim; `message` fills `normalized.text` only when `normalized` is
absent; `requestId` rides the constructor's unknown-key sweep into `extra` (passed via conditional
spread - a present-but-undefined key would leave `extra` as `{ requestId: undefined }` rather than
absent); `details` is dropped, since `url`/`path` the client knows and `stack` is the server's.

Every `TResponsedError` field is optional deliberately - a client parses what a gateway or an older
server actually sent. A non-IGNIS body still yields an `ApplicationError` degraded to
`MessageCode.DEFAULT` / status 400, so no call site branches on a parse failure.

The wire shape is also described by `ErrorSchema`/`TErrorResponse` in **helpers**, for OpenAPI. That
one cannot serve a browser: it depends on `@hono/zod-openapi`. `TResponsedError` exists because inversion
must stay browser-safe, not as a duplicate to be consolidated away.

## Related

- [Error handling conventions](/conventions/error-handling.md)
- [Application lifecycle](/architecture/application-lifecycle.md)
- [Controller system](/architecture/controller-system.md)
- [Debugging](/process/debugging.md)
