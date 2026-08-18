---
title: Error Module Redesign
description: One message shape everywhere - a definition, a getError input and a normalized response now share {text, code, args}. The flat messageCode field and the extra.messageArgs mirror are gone, and the error middleware is now a class.
---

# Changelog - 2026-07-17

## Error Module Redesign

<Badge type="danger" text="Breaking Change" />

The error layer used three shapes for the same message. A catalog wrote `key` + `message: string`.
A throw site wrote `message` + `messageCode` + `messageArgs`. The response reported
`normalized { text, code, args }` **plus** a flat `messageCode` and an `extra.messageArgs` mirror of
the very same values.

Now there is one shape - `{ text, code, args }` - and it is the same at every stage.

> [!WARNING] This is a breaking change against the published `0.1.1-0`
> `TErrorDefinition` changed shape and `ApplicationError.messageCode` was removed. Any consumer
> compiled against `@venizia/ignis-inversion@0.1.1-0` needs the migration below. See
> [Migration](#migration) for the exact rewrites - the bulk is mechanical, but two classes of change
> are **not caught by the compiler**.

## Overview

- **One message shape.** A definition, the `getError` input and `normalized` all speak `{ text, code, args }`.
- **The flat duplicates are gone.** No `error.messageCode`, no `extra.messageArgs`, no top-level `messageCode` on the wire. `normalized` is the only source.
- **Nothing at the throw site had to change.** `getError({ message: 'boom', messageCode: 'a.b' })` still compiles and behaves exactly as before.
- **Spreading a definition is safe now** - it used to degrade silently.
- **`AppErrorMiddleware`** replaces the `appErrorHandler` function.
- **Three crash/silent-loss bugs fixed** (see [Fixes](#fixes)).

## New Features

### One shape for a message

**File:** [`packages/inversion/src/modules/error/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/error/types.ts)

**Problem:** the code and the interpolation args lived in a different field at every stage. A catalog
used `key`. A throw site used `messageCode`. The wire used `normalized.code`.

Each boundary needed its own translation step - and each step was a chance to drop a field.

**Solution:** `message` is either the historical string or an object mirroring `normalized`:

```typescript
// All three resolve to the same `normalized { text, code, args }`.
getError({ message: 'Only %{n} left', messageCode: 'stock.low', messageArgs: { n: 2 } }); // flat
getError({ message: { text: 'Only %{n} left', code: 'stock.low', args: { n: 2 } } });     // nested
getError({ error: StockErrors.LOW, messageArgs: { n: 2 } });                              // catalogued
```

**Precedence,** most specific first:

| Field | Order |
|-------|-------|
| code | `message.code` → the definition's `message.code` → `messageCode` |
| args | `message.args` → `messageArgs` → the definition's `message.args` |

**Benefits:**
- Existing flat call sites are untouched - the input is a union, not a replacement.
- A definition can be spread or passed; both resolve identically.
- `transform` receives the default it replaces, so it can amend one field: `s => ({ ...s.message, text })`.

### The catalogued form takes a partial override

**File:** [`packages/inversion/src/modules/error/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/error/types.ts)

```typescript
getError({ error: SlugErrors.TAKEN, message: { args: { slug: 've-hoa-nhac' } } }); // amends args
getError({ error: SlugErrors.TAKEN, message: { text: 'Custom' } });                // amends text
```

Omit a field and the definition supplies it.

## Fixes

### A malformed `error` crashed inside the constructor

**File:** [`packages/inversion/src/modules/error/app-error.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/error/app-error.ts)

`getError({ message: 'wrapper', error: 'boom' })` threw a `TypeError` **from inside the error
constructor**. That masked the original failure at the exact moment a catch block was trying to
report it. The optional chain guarded `definition`, not `definition.message`.

It now degrades instead of throwing. The shape is also refused at compile time:

```typescript
getError({ message: 'wrapper', error: caughtError }); // now a COMPILE ERROR - use `cause`
getError({ message: 'wrapper', cause: caughtError }); // correct
```

`error` is the catalogued form's discriminant. The free-form branch previously accepted it too,
through the index signature. It was then **silently dropped**, because `error` is a consumed key.

### `MessageCode` guards no longer throw on the input they screen

**File:** [`packages/inversion/src/modules/error/message-code.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/error/message-code.ts)

`isValid` is documented as a guard for a code arriving from outside, yet `isValid(123)` threw. It now
takes `unknown` and returns `false`. `resolve` falls back to `MessageCode.DEFAULT` for any
non-string.

### Spreading a definition no longer degrades it

Under the old shape, `getError({ ...Errors.X })` put `key` into `extra.key` and fell back to
`core.system_error`. The status and text still arrived, so it looked fine. A definition's `message`
object is now the free-form input shape, so the spread resolves identically to `{ error: Errors.X }`.

## Breaking Changes

### `TErrorDefinition` nests its message

**File:** [`packages/inversion/src/modules/error/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/error/types.ts)

```typescript
// Before
{ key: 'server.core.user.duplicate', statusCode: 409, message: 'Taken: %{email}', messageArgs: {...} }

// After
{ message: { text: 'Taken: %{email}', code: 'server.core.user.duplicate', args: {...} }, statusCode: 409 }
```

`TRegisterErrors` follows: it indexes `['message']['code']` instead of `['key']`.

### `ApplicationError.messageCode` and `extra.messageArgs` are removed

```typescript
// Before                     // After
error.messageCode             error.normalized.code
error.extra?.messageArgs      error.normalized.args
body.messageCode  (HTTP)      body.normalized.code
```

`normalized.args` is now **always populated** (`{}` when empty), so no consumer needs a null check.

### `appErrorHandler` is now `AppErrorMiddleware`

**File:** [`packages/core-server/src/base/middlewares/app-error/app-error.middleware.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/base/middlewares/app-error/app-error.middleware.ts)

```typescript
// Before
server.onError(appErrorHandler({ logger, rootKey }));

// After
server.onError(new AppErrorMiddleware({ logger, rootKey }).value());
```

It is an `IProvider<ErrorHandler>`, matching `RequestSpyMiddleware`. Routing, status codes and the
production sanitization boundary are unchanged.

### `transform` receives the normalized default

```typescript
// Before
transform: s => ({ code: s.messageCode, args: s.extra?.messageArgs ?? {}, text: 'VI' })

// After
transform: s => ({ ...s.message, text: 'VI' })
```

## Unchanged

- `ErrorScopes` (`AUTH`/`VALIDATION`/`BUSINESS`/`SYSTEM`/`INTEGRATION`) and `category?`.
- `getError` / `ApplicationError.getError` / `new ApplicationError` entry points.
- `isApplicationError` - still a shape check, still the only reliable identity test across packages.
- Unknown keys still ride the index signature into `extra`; `cause` still reaches `Error.cause`.
- The middleware's five branches, their status codes, and the production leak boundary.

## Migration

**Mechanical - the compiler finds every one.** A codemod plus `tsc` covers these:

| Rewrite | Notes |
|---------|-------|
| `key: 'x'` → `message: { code: 'x', … }` | inside every `TErrorDefinition` |
| `message: 'text'` → `message: { text: 'text', … }` | inside every `TErrorDefinition` |
| `messageArgs: {…}` → `message: { args: {…} }` | inside every `TErrorDefinition` |
| `definition.key` → `definition.message.code` | reads of a definition |
| `['key']` → `['message']['code']` | hand-rolled `IErrorKeyRegistry` augmentations |
| `appErrorHandler({…})` → `new AppErrorMiddleware({…}).value()` | registration |

**Not caught by the compiler - check these by hand:**

- **`error.messageCode` reads.** If your client types against a *different* `ApplicationError` (a UI
  package of your own), `tsc` stays green. The read then silently yields `undefined` - a blank error
  toast in production. Grep for `.messageCode` and repoint to `.normalized.code`.
- **`error.extra?.messageArgs` reads.** Same failure mode. Repoint to `.normalized.args`.
- **`as any` / catch-variable reads** of either field.

```typescript
// A client rendering an error changes one line:
translate(error.messageCode, error.extra?.messageArgs);      // before
translate(error.normalized.code, error.normalized.args);     // after
```

## Learn More

- [Error reference](/extensions/helpers/error/)
- [Middlewares](/references/base/middlewares)
- [Error catalog and structured messages](/changelogs/2026-07-16-error-catalog-and-structured-message)
