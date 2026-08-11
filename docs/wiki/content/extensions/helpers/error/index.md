---
title: Error
description: ApplicationError, the getError factory, and a catalog pattern for machine-readable error codes
difficulty: beginner
---

# Error

`getError()` builds an `ApplicationError` carrying an HTTP status and a machine-readable code - the house rule is `getError`, never `new Error`.

## In one example

```typescript
import { getError, HTTP } from '@venizia/ignis-helpers';

throw getError({
  message: 'User not found',
  statusCode: HTTP.ResultCodes.RS_4.NotFound,
  messageCode: 'core.user.not_found',
});
```

The framework's `AppErrorMiddleware` catches `ApplicationError` instances and formats them into a consistent JSON response.

## Find what you need

| You want to | Go to |
|---|---|
| Throw a one-off error with a status code | [Throw a free-form error](#throw-a-free-form-error) |
| Re-throw an error you already caught and shaped | [Recognize an already-shaped error in a catch block](#recognize-an-already-shaped-error-in-a-catch-block) |
| Declare a reusable, i18n-ready error once | [Catalog a reusable error](#catalog-a-reusable-error) |
| Get autocomplete on `messageCode` | [Register catalog keys for messageCode autocomplete](#register-catalog-keys-for-messagecode-autocomplete) |
| Build a message code outside a catalog | [Build a code outside a catalog](#build-a-code-outside-a-catalog) |
| See the exact JSON shape a client receives | [Read the error response shape](#read-the-error-response-shape) |
| Read or rehydrate a server error in a browser app | [Consume the error response from a browser client](#consume-the-error-response-from-a-browser-client) |
| Look up what a specific input produces | [Every shape and its output](#every-shape-and-its-output) |
| Confirm you're checking errors the safe way | [How it works](#how-it-works) - `isApplicationError()`, never `instanceof` |

## How it works

- **Three equivalent entry points.** `getError(opts)`, `new ApplicationError(opts)`, and the static `ApplicationError.getError(opts)` all build the same object from the same input. Use the class form only when a direct reference reads better.
- **Two input shapes.** Free-form covers one-off failures - most throw sites. Catalogued raises a failure declared once at module scope, so its code, status, and default text can't drift across the call sites that raise it.

  | Shape | Input |
  |---|---|
  | Free-form | `{ message, statusCode?, messageCode? }` |
  | Catalogued | `{ error: TErrorDefinition }` |

- **One message shape everywhere.** `message` is either the historical string (with sibling `messageCode?`/`messageArgs?`), or an object mirroring `normalized`: `{ text, code?, args? }`. Both resolve to the same `normalized`:

  ```typescript
  getError({ message: 'Only %{n} left', messageCode: 'stock.low', messageArgs: { n: 2 } }); // flat
  getError({ message: { text: 'Only %{n} left', code: 'stock.low', args: { n: 2 } } });     // nested
  getError({ error: StockErrors.LOW, messageArgs: { n: 2 } });                              // catalogued
  ```

  On the catalogued form, `message` is a **partial** override. `{ message: { args } }` amends just the args and keeps the definition's `text`/`code`.

- **Precedence resolves most-specific-first.** See the [full precedence table](#every-shape-and-its-output) below - a definition's own `message.code` beats a flat `messageCode`.
- **`messageCode` always resolves to something.** `MessageCode.resolve()` lower-cases it and falls back to `MessageCode.DEFAULT` (`'core.system_error'`) when none is given or empty. `error.normalized.code` is never `undefined`.
- **`normalized` is the single source - there's no flat duplicate.** It's `{ text, code, args }`. `text` defaults to `message`; `code` and `args` resolve per the precedence table.
- **`args` is always populated, so no consumer needs a null check.** One lookup renders any error: `translate(error.normalized.code, error.normalized.args)`.
- **`messageCode` and `messageArgs` are INPUTS only.** There's no `error.messageCode` field, and `extra` never mirrors `messageArgs`. Pass `transform` to build `normalized` yourself in place of the default.
- **Any key the input doesn't declare rides into `extra`.** Attach whatever context your clients need: `getError({ message, transaction: {...} })` lands at `error.extra.transaction`. Passing `extra` explicitly works too - the two merge, and the explicit one wins on a clash.
- **`extra` carries caller context only.** It's `undefined` when there is nothing to carry.
- **`cause` reaches the native `Error.cause`, not `extra`.** Wrap a lower-level failure with `getError({ message, cause: originalError })`, and every tool that reads `.cause` sees it.
- **`error` is refused on the free-form branch (`error?: never`).** This makes `getError({ message, error: caughtError })` fail to compile, so the mistake is caught before runtime - use `cause` instead.

> [!IMPORTANT]
> **Use `isApplicationError()`, never `instanceof ApplicationError`.** There is one `ApplicationError` class, defined in `@venizia/ignis-inversion`. `helpers` re-exports it, so a browser app can raise and read the same errors the server does. But `instanceof` still fails across a package boundary: inversion ships dual CJS+ESM builds, so one source class has two runtime constructors. `isApplicationError()` tests shape, not identity, so it works everywhere.

**Options shared by both forms**

| Option          | Type                                  | Description                                                                                                     |
| --------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `message`       | `string \| { text, code?, args? }`     | Required on the free-form branch; a **partial** override on the catalogued branch (definition supplies what's omitted) |
| `messageCode`   | `string`                               | Free-form only, sibling to a string `message`. Lowest precedence - `message.code` and the definition's `message.code` both win over it |
| `statusCode`    | `number`                               | Defaults to `400`, or the definition's `statusCode` for the catalogued form                                     |
| `messageArgs`   | `Record<string, unknown>`              | Interpolation values. Reaches `normalized.args` - never `extra`. Lowest precedence, same rule as `messageCode`  |
| `cause`         | `unknown`                              | The wrapped failure - reaches `Error.cause`. Use this to wrap a caught error; `error` is refused on the free-form branch for exactly this case |
| `extra`         | `Record<string, unknown>`              | Explicit context, merged with any swept keys - and it wins on a clash                                           |
| `transform`     | `TErrorNormalizeTransformFn`           | Builds `normalized` in place of the default. Receives `{ message: TErrorNormalized, statusCode, extra? }` - `message` is the default normalized being replaced, so `s => ({ ...s.message, text: 'x' })` amends one field |
| `logLevel`      | `error \| emerg \| warn \| info \| debug` | The level the error handler logs this at. Defaults to `error`; lower it for an expected failure (`getError({ message, statusCode: 404, logLevel: 'warn' })`), or raise it to `emerg`. Steers the server log only - never the response |
| _anything else_ | `unknown`                              | Rides into `extra` under its own name. `getError({ message, transaction })` lands at `error.extra.transaction`  |

> [!TIP]
> Spreading a definition now resolves identically to passing it as `error`: `getError({ ...CategoryErrors.CREATE_DUPLICATE_NAME })` and `getError({ error: CategoryErrors.CREATE_DUPLICATE_NAME })` build the same `ApplicationError`. A definition's `message` is `{ text, code, args? }` - the same shape the free-form input accepts - so the spread degrades to nothing. Prefer `{ error: DEF }` anyway. It reads as "raise this catalogued error", not "raise these loose fields."

## Every shape and its output

Every row below is the real output, and the catalogued rows all use this definition:

```typescript
const DEF = {
  message: {
    text: 'A category named "%{name}" already exists.',
    code: 'server.commerce.category.duplicate',
    args: { name: '?' },
  },
  statusCode: 409,
} as const satisfies TErrorDefinition;
```

**Free-form, flat** - the historical shape, unchanged:

| Input | `message` | `statusCode` | `normalized` |
|-------|-----------|--------------|--------------|
| `{ message: 'Broke' }` | `Broke` | `400` | `{ text: 'Broke', code: 'core.system_error', args: {} }` |
| `{ message: 'Broke', messageCode: 'a.b' }` | `Broke` | `400` | `{ text: 'Broke', code: 'a.b', args: {} }` |
| `{ message: 'Only %{n} left', messageArgs: { n: 2 } }` | `Only %{n} left` | `400` | `{ text: 'Only %{n} left', code: 'core.system_error', args: { n: 2 } }` |
| `{ message, messageCode: 'stock.low', messageArgs: { n: 2 }, statusCode: 409 }` | `Only %{n} left` | `409` | `{ text: 'Only %{n} left', code: 'stock.low', args: { n: 2 } }` |

**Free-form, object** - `text` is the only required field. Each row is identical to its flat twin above:

| Input | `normalized` |
|-------|--------------|
| `{ message: { text: 'Broke' } }` | `{ text: 'Broke', code: 'core.system_error', args: {} }` |
| `{ message: { text: 'Broke', code: 'a.b' } }` | `{ text: 'Broke', code: 'a.b', args: {} }` |
| `{ message: { text: 'Only %{n} left', code: 'stock.low', args: { n: 2 } } }` | `{ text: 'Only %{n} left', code: 'stock.low', args: { n: 2 } }` |

**Catalogued** - omit a field and the definition supplies it:

| Input | `message` | `statusCode` | `normalized.code` | `normalized.args` |
|-------|-----------|--------------|-------------------|-------------------|
| `{ error: DEF }` | the definition's text | `409` | `server.commerce.category.duplicate` | `{ name: '?' }` |
| `{ error: DEF, messageArgs: { name: 'Vé' } }` | the definition's text | `409` | `server.commerce.category.duplicate` | `{ name: 'Vé' }` |
| `{ error: DEF, message: { args: { name: 'Vé' } } }` | the definition's text | `409` | `server.commerce.category.duplicate` | `{ name: 'Vé' }` |
| `{ error: DEF, message: { text: 'Custom' } }` | `Custom` | `409` | `server.commerce.category.duplicate` | `{ name: '?' }` |
| `{ error: DEF, message: { code: 'override.code' } }` | the definition's text | `409` | `override.code` | `{ name: '?' }` |
| `{ error: DEF, message: 'Custom' }` | `Custom` | `409` | `server.commerce.category.duplicate` | `{ name: '?' }` |
| `{ error: DEF, statusCode: 410 }` | the definition's text | `410` | `server.commerce.category.duplicate` | `{ name: '?' }` |
| `{ ...DEF }` (spread) | the definition's text | `409` | `server.commerce.category.duplicate` | `{ name: '?' }` |

**Context and cause:**

| Input | Output |
|-------|--------|
| `{ message, extra: { categoryId: 42 } }` | `extra: { categoryId: 42 }` |
| `{ message, userId: 7, transaction: { id: 12 } }` | `extra: { userId: 7, transaction: { id: 12 } }` - swept |
| `{ message, userId: 7, extra: { userId: 9 } }` | `extra: { userId: 9 }` - explicit wins |
| `{ message, cause: err }` | `Error.cause = err`; `extra` stays `undefined` |
| `{ message, error: caughtError }` | **does not compile** - use `cause` |

**Transform** - `message` in the snapshot IS the default being replaced:

```typescript
getError({
  message: { text: 'Only %{n} left', code: 'stock.low', args: { n: 2 } },
  transform: snapshot => ({ ...snapshot.message, text: 'Chỉ còn 2 vé.' }),
});
// error.message           -> 'Only %{n} left'   (the raw text stays)
// error.normalized.text   -> 'Chỉ còn 2 vé.'
// error.normalized.code   -> 'stock.low'
// error.normalized.args   -> { n: 2 }
```

**Precedence,** most specific first - note a definition's `message.code` beats a flat `messageCode`:

| Resolves | Order |
|----------|-------|
| `normalized.code` | `message.code` -> the definition's `message.code` -> `messageCode` -> `MessageCode.DEFAULT` |
| `normalized.args` | `message.args` -> `messageArgs` -> the definition's `message.args` -> `{}` |
| `normalized.text` | `message.text` (or a string `message`) -> the definition's `message.text` -> `''` |
| `statusCode` | `statusCode` -> the definition's `statusCode` -> `400` |

## Common tasks

### Throw a free-form error

The most common shape - a `message` and a status.

```typescript
throw getError({
  statusCode: HTTP.ResultCodes.RS_4.Conflict,
  message: 'Username already exists',
});
```

### Recognize an already-shaped error in a catch block

```typescript
import { isApplicationError } from '@venizia/ignis-helpers';

try {
  await someOperation();
} catch (error) {
  if (isApplicationError(error)) {
    throw error; // already shaped - surface as-is
  }
  throw getError({
    message: 'Operation failed',
    statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
  });
}
```

### Catalog a reusable error

Declare it once; every call site raises it by reference instead of retyping the code and status.

```typescript
import { ErrorScopes, getError, HTTP } from '@venizia/ignis-helpers';
import type { TErrorDefinition } from '@venizia/ignis-helpers';

const CategoryErrors = {
  CREATE_DUPLICATE_NAME: {
    message: {
      text: 'A category named "%{name}" already exists.',
      code: 'server.commerce.category.create.duplicate_name',
    },
    statusCode: HTTP.ResultCodes.RS_4.Conflict,
    category: ErrorScopes.VALIDATION,
  },
} as const satisfies Record<string, TErrorDefinition>;

throw getError({ error: CategoryErrors.CREATE_DUPLICATE_NAME, messageArgs: { name: 'Vé' } });
// Equivalent, using the catalogued form's partial override instead:
throw getError({ error: CategoryErrors.CREATE_DUPLICATE_NAME, message: { args: { name: 'Vé' } } });
```

`ErrorScopes` groups a failure by intent - `AUTH`, `VALIDATION`, `BUSINESS`, `SYSTEM`, `INTEGRATION`. `statusCode` can't do this job: a `409` is a business conflict in one place and a validation clash in another.

> [!WARNING]
> `category` is catalog **metadata only** - it does not reach the error response. `getError` reads `message.text`, `message.code` and `statusCode` off a definition and ignores the rest. Use it to group and filter catalogs (ops dashboards, translator exports). Don't expect a client to receive it.

### Register catalog keys for `messageCode` autocomplete

Augment the module the file already imports from. `IErrorKeyRegistry` is declared in `@venizia/ignis-inversion` and re-exported by `helpers`. Merging follows the re-export, so either name populates the same registry.

```typescript
import type { TRegisterErrors } from '@venizia/ignis-helpers';

declare module '@venizia/ignis-helpers' {
  interface IErrorKeyRegistry extends TRegisterErrors<typeof CategoryErrors> {}
}
```

> [!WARNING]
> TypeScript only treats `declare module` as an **augmentation** when the file imports that module. Name a module the file never imports and it silently becomes an inert ambient declaration - no error, no keys registered, autocomplete quietly empty.

Declare `message.code` as a literal string, not through `MessageCode.build()` - `build()` returns `string`, which would widen the registry to `Record<string, true>` and destroy the autocomplete.

### Build a code outside a catalog

`MessageCode.build()` validates at import time instead of shipping a malformed code into production.

```typescript
import { MessageCode } from '@venizia/ignis-helpers';

const NOT_FOUND = MessageCode.build({ parts: ['core', 'user', 'not_found'] });
// 'core.user.not_found' - throws if a segment isn't lower snake_case, or fewer than 2 parts
```

### Read the error response shape

`AppErrorMiddleware` (from `@venizia/ignis`) routes every thrown value into one of five shapes. All five carry `message`, `statusCode`, `normalized` and `details`. Only an intentional error can carry `extra`. The code lives at `normalized.code` - there is no flat `messageCode` on the response.

| What was thrown                           | Status  | `normalized.code`                                        | `message`                                                             | `extra`                                               |
| ----------------------------------------- | ------- | ------------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------- |
| `ZodError` (validation)                   | 422     | the first issue's `params.code`, else its raw Zod code | that issue's message; per-field list in `details.cause`               | never                                                 |
| DB client error (SQLSTATE class 22/23/44) | 400     | `core.system_error`                                    | a fixed, safe summary - never the driver's text                       | never                                                 |
| Transient DB conflict (40001/40P01)       | 409     | `database.conflict`                                    | a fixed retry message                                                 | never                                                 |
| `getError(...)` - intentional             | its own | its own                                                | its own                                                               | when the throw site attached `extra` or unknown keys  |
| Anything else                             | 500     | `core.system_error`                                    | `Internal Server Error` in production; the raw message in development | never                                                 |

Only the intentional branch reports what the throw site wrote. The other four **replace** the message - a driver error can carry SQL, schema, and constraint names. `normalized` is built from that replacement, so it can never leak what `message` just scrubbed.

`rootKey` (e.g. `new AppErrorMiddleware({ logger, rootKey: 'error' }).value()`) nests any of these under that key.

The handler is fail-closed on environment. It exposes `stack` and `cause` in `details` only for `Environment.DEVELOPMENT_ENVS`: `local`, `debug`, `development`, `dev`, `sit`. Everything else - including `alpha`, `staging`, a typo, or an unset `NODE_ENV` - gets the sanitized shape:

```json
{
  "message": "Only %{available} left of %{variantId}.",
  "statusCode": 409,
  "normalized": {
    "text": "Only %{available} left of %{variantId}.",
    "code": "server.core.stock_reservation.reserve.unavailable",
    "args": { "variantId": "V1", "available": 2 }
  },
  "extra": {
    "details": { "locationId": "L9" }
  },
  "requestId": "abc-123-def",
  "details": { "url": "http://localhost:3000/reservations", "path": "/reservations" }
}
```

`extra` is absent entirely when the throw site attached no context of its own.

> [!IMPORTANT]
> **`messageCode` and `extra.messageArgs` are GONE from the response.** They duplicated `normalized.code` and `normalized.args`. Read `normalized` - it is the only source. A client still reading either must migrate: `translate(error.messageCode, error.extra?.messageArgs)` becomes `translate(error.normalized.code, error.normalized.args)`.
>
> Note the two `details`. The inner one is context the throw site attached - it went through `extra`. The outer one is the middleware's own request info. They're unrelated despite sharing a name.

> [!NOTE]
> `message` and `normalized.text` are the same string, unless a `transform` deliberately makes them differ. `message` stays the raw text the throw site wrote. `normalized.text` is what a client shows. Most errors never set `transform`, so most of the time the two match.

### Consume the error response from a browser client

The error layer lives in `@venizia/ignis-inversion`, not in helpers, precisely so a browser app can
share it. It depends only on `lodash`, ships dual CJS+ESM, and pulls in no server module. A frontend
throws its own failures with the same `getError` the server uses, and reads the server's with the
same field names.

**Reading is all most clients need.** `normalized` is on every error response:

- `getError` always builds one.
- A foreign error gets one synthesized.
- A `ZodError` builds its own.

So there's no null-check and no parsing step: one lookup handles every case.

```ts
const { error } = await response.json(); // `error` is the rootKey, if one is configured

translate(error.normalized.code, error.normalized.args);
```

**Rehydrating** is for the client that wants one `catch` block for both a server failure and a
locally thrown one. `fromError` inverts the response the middleware emitted:

```ts
import { fromError, isApplicationError } from '@venizia/ignis-inversion';

const { error } = await response.json();
throw fromError({ error }); // now an ApplicationError - isApplicationError() is true
```

| Wire field   | Where it lands                                                                    |
| ------------ | --------------------------------------------------------------------------------- |
| `normalized` | `normalized`, verbatim - `text`, `code` and `args` round-trip unchanged           |
| `message`    | `normalized.text`, but only when `normalized` is missing entirely                 |
| `statusCode` | `statusCode`; `400` when the payload carries none                                 |
| `extra`      | `extra`, verbatim                                                                 |
| `requestId`  | `extra.requestId` - it is the identifier a support ticket quotes, so it survives   |
| `details`    | dropped - `url` and `path` the client already knows, and `stack` is the server's   |

Every field of `TResponsedError` is optional by design: a client parses what a gateway, a proxy or an
older server actually sent. A body that is not an IGNIS error at all still yields an
`ApplicationError`, degraded to `MessageCode.DEFAULT` and status `400`. No call site branches on
a parse failure.

> [!TIP]
> Same rule here: prefer `isApplicationError()` over `instanceof ApplicationError`. See the [callout above](#how-it-works) for why - a browser app bundles its own copy of the class, so `instanceof` fails across the boundary.

**Common status codes**

| Scenario                 | Status | `HTTP.ResultCodes` path    |
| ------------------------ | ------ | -------------------------- |
| Invalid input            | 400    | `RS_4.BadRequest`          |
| Missing/invalid auth     | 401    | `RS_4.Unauthorized`        |
| Insufficient permissions | 403    | `RS_4.Forbidden`           |
| Resource not found       | 404    | `RS_4.NotFound`            |
| Duplicate resource       | 409    | `RS_4.Conflict`            |
| Server failure           | 500    | `RS_5.InternalServerError` |

## See also

- [Controllers](/references/base/controllers) - throwing errors in route handlers
- [Services](/references/base/services) - error handling in business logic
- [Middlewares](/references/base/middlewares) - the `AppErrorMiddleware` handler
- [Environment](/extensions/helpers/env/) - `Environment.DEVELOPMENT_ENVS`, the error-detail boundary
- [Helpers Overview](/extensions/helpers/) - all available helpers

**Files:**

- [`packages/helpers/src/modules/error/index.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/error/index.ts) - module barrel
- [`packages/helpers/src/modules/error/schemas.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/error/schemas.ts) - `ErrorSchema`, `TErrorResponse` (the RESPONSE schema, for OpenAPI)
- [`packages/inversion/src/modules/error/app-error.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/error/app-error.ts) - `ApplicationError`, `getError`, `fromError`, `isApplicationError`
- [`packages/inversion/src/modules/error/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/error/types.ts) - `TError`, `TErrorDefinition`, `TErrorNormalized`, `TResponsedError`, `IErrorKeyRegistry`, `TRegisterErrors`
- [`packages/inversion/src/modules/error/definition.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/error/definition.ts) - `ErrorScopes`, `TErrorScope`
- [`packages/inversion/src/modules/error/message-code.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/error/message-code.ts) - `MessageCode`
