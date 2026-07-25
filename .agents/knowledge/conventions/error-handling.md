---
type: Convention
title: Error handling
description: Use getError and ApplicationError, never raw new Error, and check errors by shape.
resource: packages/inversion/src/modules/error
tags: [conventions, errors]
---

Never throw a raw `new Error(...)`. Use `getError(opts: TError)` (or `ApplicationError.getError`).
It builds an `ApplicationError`: a `message`, a `statusCode` (defaults to `400`), a `normalized`
message, and an optional `extra` payload.

The layer LIVES in `packages/inversion/src/modules/error/` and is re-exported by helpers, so a
browser application - which depends on inversion for DI and cannot depend on helpers - raises the
same errors the server does. Backend code imports from `@venizia/ignis-helpers` as always.

```typescript
throw getError({
  message: `[${cls.name}] Constructor parameter ${index} has no @inject`,
});
```

## Catalogue a domain failure, raise the rest free-form

The form above is right for a failure nobody translates: an invariant, a misconfiguration, a seed
guard. A **domain** failure - one a client localizes and branches on - is declared once as a
`TErrorDefinition` in `packages/inversion/src/modules/error/types.ts`, then raised by reference:

```typescript
export const UserErrors = {
  CREATE_DUPLICATE_EMAIL: {
    message: {
      text: 'An account with %{email} already exists.',
      code: 'server.core.user.create.duplicate_email',
    },
    statusCode: HTTP.ResultCodes.RS_4.Conflict,
    category: ErrorScopes.VALIDATION,
  },
} as const satisfies Record<string, TErrorDefinition>;

declare module '@venizia/ignis-helpers' {
  interface IErrorKeyRegistry extends TRegisterErrors<typeof UserErrors> {}
}

throw getError({ error: UserErrors.CREATE_DUPLICATE_EMAIL, messageArgs: { email } });
```

A definition nests `message: { text, code, args? }` - the SAME shape the free-form input and
`normalized` use. That is why spreading one (`getError({ ...UserErrors.X })`) resolves identically
to passing it as `error`, instead of silently degrading the way the old `key` shape did.

Retyping the code and status at each throw is how two call sites end up raising
`user.create.duplicate_email` and `user.duplicate_email` for the same failure, with nothing to catch
the drift.

`message.code` MUST be a literal string, NOT `MessageCode.build(...)` - see
[gotchas](/conventions/gotchas.md). This is the one place a raw literal code is correct.

## Every ApplicationError carries `normalized`

`normalized = { text, code, args }` is always built, every field always populated, and it is the ONLY
home for the code and the interpolation args. A client renders any error with one lookup:
`translate(error.normalized.code, error.normalized.args)`. Pass `transform` to build it yourself
from a snapshot (`{ message: TErrorNormalized, statusCode, extra }`) - `message` there is the default
being replaced, so a transform can amend one field and spread the rest:

```typescript
transform: snapshot => ({ ...snapshot.message, text: renderVi(snapshot.message) });
```

The server never substitutes `%{name}`: it ships the template plus `args` and the CLIENT translates.
That is why the input carries `args` rather than a pre-formatted string.

`messageCode` and `messageArgs` are INPUTS only. There is no flat `error.messageCode` field and
`extra` never mirrors `messageArgs` - both duplicated `normalized` and were removed. Read
`normalized.code` / `normalized.args`.

## Unknown keys ride into `extra`

The input carries an index signature, so any key `getError` does not model lands in `extra` - that
is how a throw site attaches context the framework knows nothing about (mq-pay sends
`transaction`/`attempt` this way, and a client reads them).

```typescript
throw getError({ message: 'Cannot delete', details: { categoryId, count: 3 } }); // -> extra.details
throw getError({ message: 'Boot failed', cause: originalError });                // -> Error.cause
```

The trade, and it is deliberate: an index signature disables excess-property checking, so a
MISSPELLING goes the same way. `getError({ message, statuscode: 503 })` compiles, `statusCode` stays
`400`, and `503` sits in `extra.statuscode`. The framework cannot tell context from typo.

Spreading a definition is now safe: `getError({ ...Errors.X })` resolves identically to
`getError({ error: Errors.X })`, because a definition's `message` object IS the free-form input
shape. Under the old `key` shape it degraded to `core.system_error` while status and text still
arrived, so it looked fine - that footgun is gone. Pinned in `bana-probe.test.ts`.

`error` is the catalogued form's discriminant and is REFUSED on the free-form branch (`error?: never`).
`getError({ message, error: caughtError })` reads like "wrap this" but `error` is a consumed key, so
the failure would vanish - the compiler now rejects it. Wrap with `cause`.

## The framework has its own catalog - use it, do not re-invent codes

Every CLIENT-FACING 4xx the framework raises is catalogued, so a client always gets a real code
instead of `core.system_error`:

| Catalog | Codes | Where |
|---|---|---|
| `AuthenticationErrors` | `core.authentication.*` | `components/auth/authenticate/common/errors.ts` |
| `AuthorizationErrors` | `core.authorization.*` | `components/auth/authorize/common/errors.ts` |
| `StaticAssetErrors` | `core.static_asset.*` | `components/static-asset/common/errors.ts` |
| `RepositoryErrors` | `core.repository.*` | `base/repositories/common/errors.ts` |
| `RequestErrors` | `core.request.*` | `base/middlewares/common/errors.ts` |

```typescript
throw getError({ error: AuthenticationErrors.TOKEN_INVALID, cause: joseError });
```

Each registers with `IErrorKeyRegistry`, so a consumer typing `messageCode` gets these as
autocomplete. `framework-catalog.test.ts` pins every code: they are a PUBLIC contract a client
branches on, so a rename must fail the build, not a customer's frontend.

An INTERNAL failure - a boot misconfiguration, a DI invariant, a programming error - stays codeless
on purpose. It surfaces as a 500 with a generic message, and a code there would be an identifier
nobody can act on.

## Log an expected failure below `error`

The error handler (`AppErrorMiddleware`) logs every thrown error, and defaults to the `error` level.
A failure that is the client's fault - a `404`, a `409` the caller retries - does not belong in the
error log next to a real `500`. Pass `logLevel` to place it where it belongs:

```typescript
throw getError({ message: 'Order not found', statusCode: 404, logLevel: 'warn' });
```

`logLevel` is one of `error | emerg | warn | info | debug` (`TErrorLogLevel`). The handler reads it
off the thrown error and logs at that level; an absent or malformed value falls back to `error`, so
nothing changes for the many call sites that never set it. It does NOT reach the client response -
it only steers the server log.

`TErrorLogLevel` is declared in `inversion` (which cannot import helpers' `TLogLevel`, being
browser-safe); a compile-time guard in helpers - `log-level-drift.test.ts` - fails the build if the
two unions ever diverge.

## instanceof across packages is unreliable

There is only ONE `ApplicationError` now, and `instanceof` STILL does not work across a package
boundary. `inversion` ships a dual CJS+ESM build (see
[dual-build & error identity](/architecture/error-handling-flow.md)), so one source file yields two
constructor functions: a CJS consumer and an ESM consumer hold different classes for the same class.
Consolidating the source did not merge the identities.

Use `isApplicationError()` instead, which recognizes the error by shape, not by class identity:

```typescript
export const isApplicationError = (error: unknown): error is ApplicationError => {
  return error instanceof Error && typeof (error as AnyType).statusCode === 'number';
};
```

Code that must distinguish "an error the framework already shaped" from "a raw failure to
sanitize" - search connectors do exactly this before deciding whether to wrap something as a 503 -
has to use `isApplicationError()`. Skipping it lets a real `404` arrive at the caller mislabeled as
a bogus `503`.

## Never leak internals in production responses

A production error response must carry zero internal detail: no database schema, no raw driver
error text, no connection string, no stack trace. Whatever detail is useful for debugging belongs
in the server log via the scoped logger, not in the `extra` field returned to a client. Sanitize at
the boundary that turns an error into an HTTP response, not deeper in the call stack.

## Related

- [Coding style](/conventions/coding-style.md)
- [Error handling flow](/architecture/error-handling-flow.md)
- [Gotchas](/conventions/gotchas.md)
