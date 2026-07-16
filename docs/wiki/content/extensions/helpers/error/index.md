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

The framework's `appErrorHandler` middleware catches `ApplicationError` instances and formats them into a consistent JSON response - see [Common tasks](#common-tasks) below.

## How it works

- **Three equivalent entry points.** `getError(opts)`, `new ApplicationError(opts)`, and the static `ApplicationError.getError(opts)` all take the same input and build the same object - use the class form only when a direct reference reads better.
- **Two input shapes.** Free-form (`{ message, statusCode?, messageCode? }`) covers one-off failures - most throw sites. Catalogued (`{ error: TErrorDefinition }`) raises a failure declared once at module scope, so its code, status, and default text cannot drift across the call sites that raise it; `message` and `statusCode` may still be overridden per-raise.
- **`messageCode` always resolves to something.** `MessageCode.resolve()` lower-cases it and falls back to `MessageCode.DEFAULT` (`'core.system_error'`) when none is given or it is empty - `error.messageCode` is never `undefined`.
- **Every error carries a `normalized` message.** `{ code, args, text }` - `code` mirrors the resolved `messageCode`, `args` defaults to `messageArgs` (or the definition's own `messageArgs`), `text` defaults to `message`. A client renders any error with one lookup: `translate(error.normalized.code, error.normalized.args)`. Pass `transform` to build `normalized` yourself from a flat snapshot of the error.
- **Any key the input does not declare rides into `extra`.** Attach whatever context your clients need - `getError({ message, transaction: {...} })` lands at `error.extra.transaction`. Passing `extra` explicitly works too, and the two merge with the explicit one winning. `messageArgs` is additionally mirrored into `extra.messageArgs` for clients still reading the flat shape; `error.extra` is `undefined` only when there is nothing to carry.
- **`cause` reaches the native `Error.cause`,** not `extra` - wrap a lower-level failure with `getError({ message, cause: originalError })` and every tool that reads `.cause` sees it.
- **`isApplicationError()` checks shape, not class identity.** There is one `ApplicationError` - it lives in `@venizia/ignis-inversion` so a browser application can raise and read the same errors the server does, and `helpers` re-exports it. `instanceof` still fails across a package boundary: inversion ships dual CJS+ESM builds, so one source class has two runtime constructors. Test the shape.

**Options shared by both forms**

| Option          | Type                         | Description                                                                                                     |
| --------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `statusCode`    | `number`                     | Defaults to `400`, or the definition's `statusCode` for the catalogued form                                     |
| `messageArgs`   | `Record<string, unknown>`    | Interpolation values, mirrored into `extra.messageArgs` and `normalized.args`                                   |
| `cause`         | `unknown`                    | The wrapped failure - reaches `Error.cause`                                                                     |
| `extra`         | `Record<string, unknown>`    | Explicit context, merged with the `messageArgs` mirror and any swept keys - and it wins on a clash              |
| `transform`     | `TErrorNormalizeTransformFn` | Builds `normalized` in place of the default, from a flat snapshot `{ message, messageCode, statusCode, extra }` |
| _anything else_ | `unknown`                    | Rides into `extra` under its own name. `getError({ message, transaction })` lands at `error.extra.transaction`  |

> [!WARNING]
> Pass a definition as `error`, **never spread it**. `getError({ ...CategoryErrors.CREATE_DUPLICATE_NAME })` reads naturally and is wrong: a definition carries `key`, not `messageCode`, so the key lands in `extra.key` and the error degrades to `core.system_error` - unlocalizable, since clients branch on the code. The status and message still arrive, so it looks fine. Nothing catches this for you: the same index signature that carries your context accepts `key` too.

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
    key: 'server.commerce.category.create.duplicate_name',
    statusCode: HTTP.ResultCodes.RS_4.Conflict,
    category: ErrorScopes.VALIDATION,
    message: 'A category named "%{name}" already exists.',
  },
} as const satisfies Record<string, TErrorDefinition>;

throw getError({ error: CategoryErrors.CREATE_DUPLICATE_NAME, messageArgs: { name: 'Vé' } });
```

`ErrorScopes` groups a failure by intent - `AUTH`, `VALIDATION`, `BUSINESS`, `SYSTEM`, `INTEGRATION` - because `statusCode` cannot: a `409` is a business conflict in one place and a validation clash in another.

> [!WARNING]
> `category` is catalog **metadata only** - it does not reach the error response. `getError` reads `key`, `statusCode` and `message` off a definition and ignores the rest. Use it to group and filter catalogs (ops dashboards, translator exports); do not expect a client to receive it.

### Register catalog keys for `messageCode` autocomplete

Augment the module the file already imports from. `IErrorKeyRegistry` is declared in `@venizia/ignis-inversion` and re-exported by `helpers`; merging follows the re-export, so either name populates the same registry.

```typescript
import type { TRegisterErrors } from '@venizia/ignis-helpers';

declare module '@venizia/ignis-helpers' {
  interface IErrorKeyRegistry extends TRegisterErrors<typeof CategoryErrors> {}
}
```

> [!WARNING]
> TypeScript only treats `declare module` as an **augmentation** when the file imports that module. Name a module the file never imports and it silently becomes an inert ambient declaration - no error, no keys registered, autocomplete quietly empty.

Declare `key` as a literal string, not through `MessageCode.build()` - `build()` returns `string`, which would widen the registry to `Record<string, true>` and destroy the autocomplete.

### Build a code outside a catalog

`MessageCode.build()` validates at import time instead of shipping a malformed code into production.

```typescript
import { MessageCode } from '@venizia/ignis-helpers';

const NOT_FOUND = MessageCode.build({ parts: ['core', 'user', 'not_found'] });
// 'core.user.not_found' - throws if a segment isn't lower snake_case, or fewer than 2 parts
```

### Read the error response shape

`appErrorHandler` (from `@venizia/ignis`) routes every thrown value into one of five shapes. All five carry `message`, `messageCode`, `statusCode`, `normalized` and `details`; only an intentional error can carry `extra`.

| What was thrown                           | Status  | `messageCode`                                          | `message`                                                             | `extra`                                               |
| ----------------------------------------- | ------- | ------------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------- |
| `ZodError` (validation)                   | 422     | the first issue's `params.code`, else its raw Zod code | that issue's message; per-field list in `details.cause`               | never                                                 |
| DB client error (SQLSTATE class 22/23/44) | 400     | `core.system_error`                                    | a fixed, safe summary - never the driver's text                       | never                                                 |
| Transient DB conflict (40001/40P01)       | 409     | `database.conflict`                                    | a fixed retry message                                                 | never                                                 |
| `getError(...)` - intentional             | its own | its own                                                | its own                                                               | when the throw site attached `messageArgs` or `extra` |
| Anything else                             | 500     | `core.system_error`                                    | `Internal Server Error` in production; the raw message in development | never                                                 |

Only the intentional branch reports what the throw site wrote. The other four **replace** the message, because a driver error carries SQL, schema and constraint names - and `normalized` is built from the replacement, so it can never leak what `message` just scrubbed.

`rootKey` (e.g. `appErrorHandler({ logger, rootKey: 'error' })`) nests any of these under that key.

The handler is fail-closed on environment: it exposes `stack` and `cause` in `details` only when `NODE_ENV` is one of `local`, `debug`, `development`, `dev`, `sit` (`Environment.DEVELOPMENT_ENVS`). Everything else - including `alpha`, `staging`, a typo, or an unset `NODE_ENV` - gets the sanitized shape:

```json
{
  "message": "Only %{available} left of %{variantId}.",
  "messageCode": "server.core.stock_reservation.reserve.unavailable",
  "statusCode": 409,
  "normalized": {
    "text": "Only %{available} left of %{variantId}.",
    "code": "server.core.stock_reservation.reserve.unavailable",
    "args": { "variantId": "V1", "available": 2 }
  },
  "extra": {
    "messageArgs": { "variantId": "V1", "available": 2 },
    "details": { "locationId": "L9" }
  },
  "requestId": "abc-123-def",
  "details": { "url": "http://localhost:3000/reservations", "path": "/reservations" }
}
```

`extra` is absent entirely when the throw site attached neither `messageArgs` nor `extra`.

> [!IMPORTANT]
> **`messageCode` and `extra.messageArgs` are on their way out.** They duplicate `normalized.code` and `normalized.args`, and remain only until every client has migrated. Read `normalized`; do not build anything new against the flat pair.
>
> Note the two `details`: the inner one is context the throw site attached (it went through `extra`), the outer one is the middleware's own request info. They are unrelated despite the name.

> [!NOTE]
> `message` and `normalized.text` are the same string unless a `transform` deliberately makes them differ - `message` stays the raw text the throw site wrote, `normalized.text` is what a client shows. Most errors never set `transform`, so most of the time they match.

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
- [Middlewares](/references/base/middlewares) - the `appErrorHandler` middleware
- [Environment](/extensions/helpers/env/) - `Environment.DEVELOPMENT_ENVS`, the error-detail boundary
- [Helpers Overview](/extensions/helpers/) - all available helpers

**Files:**

- [`packages/helpers/src/modules/error/index.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/error/index.ts) - module barrel
- [`packages/helpers/src/modules/error/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/error/types.ts) - `TError`, `TErrorNormalized`, `ErrorSchema`
- [`packages/inversion/src/modules/error/app-error.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/error/app-error.ts) - `ApplicationError`, `getError`, `isApplicationError`
- [`packages/inversion/src/modules/error/definition.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/error/definition.ts) - `ErrorScopes`, `TErrorDefinition`, `IErrorKeyRegistry`
- [`packages/inversion/src/modules/error/message-code.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/error/message-code.ts) - `MessageCode`
