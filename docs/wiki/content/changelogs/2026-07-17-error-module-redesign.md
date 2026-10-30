---
title: Error Module Redesign
description: A definition, a getError input and a normalized response now share one {text, code, args} shape; messageCode and extra.messageArgs are removed and the error middleware is now a class.
packages: ['@venizia/ignis-inversion']
---

# Changelog - 2026-07-17

## Error Module Redesign

<Badge type="danger" text="Breaking Change" />

**In one line.** One message shape, `{ text, code, args }`, is used from definition to response, so `normalized` is the only place to read an error's code and args.

## What changed

- **One shape.** A definition, the `getError` input and `normalized` all speak `{ text, code, args }`. `message` is either the string or an object like `normalized`.
- **Flat duplicates removed.** No `error.messageCode`, no `extra.messageArgs`, no top-level `messageCode` on the wire. `normalized.args` is always populated (`{}` when empty).
- **Throw sites keep working.** `getError({ message: 'boom', messageCode: 'a.b' })` behaves as before.
- **Catalogued form takes a partial override.** For example `getError({ error: SlugErrors.TAKEN, message: { args: { slug: 've-hoa-nhac' } } })`. Omit a field and the definition supplies it.
- **`AppErrorMiddleware`** replaces the `appErrorHandler` function.
- **Spreading a definition is safe now.** It used to degrade to `core.system_error` silently.
- **Fixes.** A malformed `error` (for example `getError({ message: 'wrapper', error: 'boom' })`) threw a `TypeError` inside the error constructor and masked the original failure. It degrades instead, and passing a caught error as `error` is now a compile error: use `cause`. `MessageCode.isValid(123)` threw; it now returns `false`, and `resolve` falls back to `MessageCode.DEFAULT` for any non-string.

```typescript
getError({ message: 'Only %{n} left', messageCode: 'stock.low', messageArgs: { n: 2 } }); // flat
getError({ message: { text: 'Only %{n} left', code: 'stock.low', args: { n: 2 } } });     // nested
getError({ error: StockErrors.LOW, messageArgs: { n: 2 } });                              // catalogued
```

Precedence, most specific first: code is `message.code`, then the definition's `message.code`, then `messageCode`. Args are `message.args`, then `messageArgs`, then the definition's `message.args`.

## Who is affected

- **Anyone compiled against `@venizia/ignis-inversion@0.1.1-0`.** `TErrorDefinition` changed shape and `ApplicationError.messageCode` was removed. Migrate as below.
- **Everyone else.** No action needed. `ErrorScopes`, `category?`, the `getError` entry points, `isApplicationError`, the five middleware branches, their status codes and the production leak boundary are unchanged. Unknown keys still go to `extra`, and `cause` still reaches `Error.cause`.

## Breaking changes

> [!WARNING]
> Two classes of change are not caught by the compiler: reads of `error.messageCode` and `error.extra?.messageArgs`.

**Before:**

```typescript
// definition
{ key: 'server.core.user.duplicate', statusCode: 409, message: 'Taken: %{email}', messageArgs: {...} }

// reads
error.messageCode
error.extra?.messageArgs
body.messageCode  // HTTP

// middleware
server.onError(appErrorHandler({ logger, rootKey }));

// transform
transform: s => ({ code: s.messageCode, args: s.extra?.messageArgs ?? {}, text: 'VI' })
```

**After:**

```typescript
// definition
{ message: { text: 'Taken: %{email}', code: 'server.core.user.duplicate', args: {...} }, statusCode: 409 }

// reads
error.normalized.code
error.normalized.args
body.normalized.code  // HTTP

// middleware (an IProvider<ErrorHandler>)
server.onError(new AppErrorMiddleware({ logger, rootKey }).value());

// transform
transform: s => ({ ...s.message, text: 'VI' })
```

`TRegisterErrors` now indexes `['message']['code']` instead of `['key']`.

Migration:

1. Inside every `TErrorDefinition`: `key: 'x'` becomes `message: { code: 'x', ... }`, `message: 'text'` becomes `message: { text: 'text', ... }`, and `messageArgs: {...}` becomes `message: { args: {...} }`.
2. Reads of a definition: `definition.key` becomes `definition.message.code`. Hand-rolled `IErrorKeyRegistry` augmentations: `['key']` becomes `['message']['code']`.
3. Registration: `appErrorHandler({...})` becomes `new AppErrorMiddleware({...}).value()`.
4. Check by hand, because `tsc` stays green: grep for `.messageCode` and `extra?.messageArgs` and repoint them to `.normalized.code` and `.normalized.args`. If your client types against a different `ApplicationError` (a UI package of your own), the read silently yields `undefined`, which shows as a blank error toast. Also check `as any` and catch-variable reads.

```typescript
translate(error.messageCode, error.extra?.messageArgs);      // before
translate(error.normalized.code, error.normalized.args);     // after
```

## See also

- [Error reference](/extensions/helpers/error/)
- [Middlewares](/references/base/middlewares)
- [Error catalog and structured messages](/changelogs/2026-07-16-error-catalog-and-structured-message)
