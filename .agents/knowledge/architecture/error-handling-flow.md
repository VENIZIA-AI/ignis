---
type: Architecture
title: Error handling flow
description: How an error travels from a throw site to an HTTP response, and what the production sanitization boundary suppresses.
resource: packages/kernel/src/base/middlewares/app-error
tags: [architecture, errors, middleware, security, isomorphic]
---

Every error in IGNIS ends at one place: the Hono `onError` handler that
`registerDefaultMiddlewares()` installs before any user configuration runs. Nothing else needs to
catch-and-shape for HTTP. On a Bun server that call is the first statement of `initialize()`; in a
browser Worker, `WorkerApplication.listen()` makes it just before `initialize()`.

The handler is browser-pure and lives in the kernel, so a controller throwing an `ApplicationError`
renders the identical envelope on both hosts.
`packages/core-worker/src/__tests__/error-shape-parity.test.ts` asserts it: same status, same content
type, same key paths, same values, with `requestId` the one field allowed to differ. It also covers
the 422 branch and an unrouted path. Both hosts get the stack from ONE method -
`RestApplication.registerDefaultMiddlewares()` registers `requestId()`, this error handler and
`notFoundHandler` - so neither can drift. Without the third, an unrouted path would return Hono's
`text/plain` default in the browser and JSON on the server.

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

## Where the handler lives: one class, two options

`BaseAppErrorMiddleware` (`packages/kernel/src/base/middlewares/app-error`) carries the whole
classification, logging and response-building path. It reads no node builtin and no `process`, so a
Worker runs it unchanged. The two reads that need a host are constructor OPTIONS:

| Option | Absent | `@venizia/ignis` passes |
|---|---|---|
| `environment` | this host has NO ambient environment - a browser. `isProduction` fails closed and logs at debug, not error | `() => process.env.NODE_ENV` |
| `formatError` | a small pure renderer over `name`, `message`, `code`, `extra` and a capped `stack` | `ErrorPrettier.format`, which reaches `node:util` |

The option's PRESENCE is what claims the host has an ambient environment, so one option carries what
used to take two hooks. Present but returning `undefined` means a host that should have one is
misconfigured, and keeps its error line.

They were `protected` hooks once, and three subclasses existed to answer them and nothing else. A
class seam is also unreachable from application code, so `examples/browser-bff` had to fake the
environment with a Hono middleware assigning `context.env`; it sets `config.error.environment`
instead. `AppErrorMiddleware` survives as a name that supplies the two server options - it overrides
nothing.

The constructor calls `super({ scope: new.target.name })` rather than a literal, so that subclass
keeps logging under `AppErrorMiddleware` - the scope it has always used.

Both defaults must never throw, cycles included. A throw inside the last-resort handler turns a
handled failure into an unhandled one. So the kernel renderer collapses a cycle to `[Circular]` and a
BigInt to its decimal text. Anything else `JSON.stringify` refuses becomes `[unrenderable]`.

## Classification

Every error is logged once the status is known, so the line carries it:
`REQUEST ERROR | 404 | GET /orders/9`. The log is where the detail lives, never the response.

On a server the error goes through `formatError()`, which core points at `ErrorPrettier.format`
(helpers, `logger/formatting`), NOT logged raw: a
`pg`/`drizzle` failure carries the full query, its params and a stack that each embed the same SQL,
so inspecting the raw object floods the log with the same statement several times over.
`ErrorPrettier.summarize` keeps `name`, the full `message`, `code`, `messageCode`, the root's
`normalized.args`, the `pg` diagnostics (`hint`/`detail`/`table`/`constraint`), root stack frames, the
error's own `extra` and a flattened `cause` chain, dropping the rest. `ErrorPrettier.format` renders
that as a `- field: value` bullet list ordered what-happened first: `message`, then `args`, the
`cause` chain, then `name`/`code`, the diagnostics, `extra`, and `stack` last.

`args` sits directly under `message` because nothing resolves `%{placeholder}` server-side - i18n does
it downstream - so without that line the log names no field. Root only: a cause's args belong to a
message the block does not print. Redacted on render like `extra`; an empty map prints no line.

`code` and `messageCode` stay separate. `code` is the error's own (a driver's `23505`, a gRPC `14`)
and feeds the `name:` line; `messageCode` is `normalized.code` and feeds the `code:` line, so a call
site that logs an `ApplicationError` without passing `messageCode` by hand still keeps its
identifier. `MessageCode.DEFAULT` never surfaces - `resolve` stamps it on every codeless error.

`format` follows `APP_ENV_LOGGER_FORMAT`: `text` renders the block, `json` renders ONE line so a log
monitor keeps the error as one record, with `stack` as an array of frames. `maxStackFrames` is a
budget rather than the old on/off `includeStack`: `BaseAppErrorMiddleware` gives an intentional error
5 frames and an unexpected one 10, both settable through its constructor as
`intentionalStackFrames` and `unexpectedStackFrames`. Frames resolving into `modules/error/app-error`
are dropped - `getError` tops every `ApplicationError` stack and names no call site, and once
installed it is also the first dependency frame, so the keep-the-first rule would preserve exactly
the wrong one.

Two rules keep the block short. Only the FIRST dependency frame is kept - it is often the throw site
(drizzle, jose) while the rest is HTTP plumbing - and the omitted count is printed, never silently
dropped. A `ZodError`'s message, which is its issue array as pretty JSON, is compressed to one
`path: reason` line per issue, capped at 10 with the remainder counted off.

`formatLogMessage` routes ANY `Error` bound to a `%s` placeholder through this, so every
`logger.error('... %s', error)` call site in the framework and in consuming apps gets it without
changing the call.

The middleware passes `includeStack: true` on every branch, so an intentional error still gets its
throw site. It gets the smaller budget instead, because the caller chain behind it is HTTP-framework
plumbing. `extra` is redacted, being the one field that can carry a secret-named key.

Everything from `summarize` down is the SERVER renderer. The kernel default that a Worker uses is
deliberately smaller: no `cause` chain, no `pg` diagnostics, no `APP_ENV_LOGGER_FORMAT` switch. It
changes the log only, never a byte of the response body.

The log level defaults to `error`, but a throw site can lower it by passing `logLevel` to `getError`
(an expected `404`/`409` logs at `warn` or `info`, `emerg` for a true emergency); a malformed value
falls back to `error`. Then it is routed:

- **ZodError** -> 422, formatted by `formatZodError`.
- **DB client error** -> 400. `isDatabaseClientError` accepts only SQLSTATE classes caused by the
  request: `22` (data exception), `23` (integrity constraint violation) and `44` (WITH CHECK OPTION
  violation - a row written through an updatable view fails that view's CHECK). Everything else -
  class `42` syntax/undefined-column, class `53` resources - stays a 500, being the server's bug,
  not the client's. A missing or non-string code (a gRPC numeric code, say) is treated as
  non-client and must never crash this last-resort handler.
- **Transient DB conflict** -> 409. `isRetryableDatabaseError` matches SQLSTATE `40001`
  (serialization failure) and `40P01` (deadlock); the response gets a fixed safe message and a
  retryable message code, since the client can retry the request unchanged.
- **Intentional domain error** (anything with `statusCode`) -> its own status and message, untouched.
- **Anything else** -> 500.

## The production boundary

```typescript
const env = [context.env?.NODE_ENV, this.environment?.()].find(Boolean);

if (!env) {
  // ... logs INVALID ENV IDENTIFIER
  return true;
}

return !EnvironmentNames.DEVELOPMENT_ENVS.has(env.toLowerCase());
```

This is **fail-closed**: a missing or unrecognized `NODE_ENV` is treated as production. Only
`local`, `debug`, `development`, `dev` and `sit` are in `DEVELOPMENT_ENVS` (`dev` is an alias of
`development`; both are listed because deployments write the abbreviation). `alpha`, `beta`,
`staging`, `uat` and anything unknown get the sanitized behaviour. An unset env is also logged as an
`INVALID ENV IDENTIFIER` error, so the misconfiguration is visible rather than merely safe.

The set comes from `EnvironmentNames` in helpers, not from `Environment`. `EnvironmentNames` is pure
by construction - no `process`, no filesystem - and `Environment` extends it with the `NODE_ENV`
reads. That split is what lets the kernel middleware read the set without pulling in a node global.

A browser Worker has no ambient environment, so the `environment` option is absent unless the
application sets `config.error.environment`, and the handler sanitizes unless the Hono env binding
supplies `NODE_ENV`. That is the one legitimate
divergence between the two hosts, and it is confined to `details.stack` and `details.cause`. The
parity test passes `NODE_ENV: 'production'` on the env binding for exactly this reason.

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
  extra,                                  // the thrown value's own `extra`; absent when it has none
  details: { url, path, stack, cause },   // stack/cause non-production only
}
```

`normalized` is what a client renders: `translate(normalized.code, normalized.args)`. It is the ONLY
source: the flat `messageCode` and the `extra.messageArgs` mirror duplicated it and were REMOVED. A
client still reading either must move to `normalized`.

Only the INTENTIONAL branch reports the message the throw site wrote. The other four REPLACE the
message; `normalized` is built from the replacement, never from the original, so it cannot become a
second way to leak what `message` just scrubbed. An `ApplicationError` arrives already normalized
and that object is authoritative - a `transform` may have written a `text` deliberately different
from `message`.

`extra` is NOT gated that way. The handler copies it off the RAW thrown value whenever that value
has an `extra` property, whatever branch classification chose. Usually that means only intentional
errors carry one, since a raw driver error has no `extra` - but `classify` tests the DB branches
BEFORE `statusCode`, so an `ApplicationError` raised as `getError({ extra, cause: driverError })`
whose cause bears a client or retryable SQLSTATE lands on a DB branch and still reports its `extra`
next to the replaced message. Keep out of `extra` anything the message must not say.

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
- [kernel](/packages/kernel.md)
- [core-worker](/packages/core-worker.md)
- [Debugging](/process/debugging.md)
