---
type: Convention
title: Error handling
description: Use getError and ApplicationError, never raw new Error, and check errors by shape.
resource: packages/helpers/src/modules/error
tags: [conventions, errors]
---

Never throw a raw `new Error(...)`. Use `getError(opts: TError)` (or `ApplicationError.getError`)
from `packages/helpers/src/modules/error/app-error.ts`. It builds an `ApplicationError`: a `message`,
a resolved `messageCode`, a `statusCode` (defaults to `400`), and an optional `extra` payload.

```typescript
throw getError({
  message: `[${cls.name}] Constructor parameter ${index} has no @inject`,
});
```

## instanceof across packages is unreliable

`ApplicationError` extends `Error` and looks like an ordinary class, but it does not have one
runtime identity. `inversion` ships a dual CJS+ESM build (see
[dual-build & error identity](/architecture/error-handling-flow.md)), so a CJS consumer and an ESM
consumer hold two different constructor functions for the same source file. `instanceof
ApplicationError` across a package boundary can silently return `false` for an error the framework
itself raised.

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
