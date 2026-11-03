---
title: Error Handling - Normalized Messages, Error Catalog, and a Recovered cause
description: Every error carries a normalized message ready for translation, you can declare reusable error definitions in a catalog, and cause now reaches Error.cause.
packages: ['@venizia/ignis-helpers', '@venizia/ignis-inversion']
---

# Changelog - 2026-07-16

## Error Handling

<Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" /> <Badge type="info" text="New API" />

**In one line.** Clients get one `normalized` message to render and translate any error, you can declare reusable errors in a catalog, and `cause` finally reaches `Error.cause`.

## What changed

- **`normalized` on every error.** One object, `{ text, code, args }`, is all a client needs. All five handler branches emit it, including validation.
- **`cause` reaches `Error.cause`.** It used to be swept into `extra.cause` while the native field stayed `undefined`. Five framework call sites, including boot failures, lost their `cause` this way.
- **Error catalog.** Declare a domain error once with its code, HTTP status and default message, and every call site that raises it stays in sync.
- **`transform`.** Builds `normalized` yourself, so `normalized.text` can be a translated string while `message` keeps the raw text.
- **Error layer moved to `@venizia/ignis-inversion`.** Backend imports are unchanged; keep importing from `@venizia/ignis-helpers`. Browser applications can now raise and read the same errors as the server, and a second, divergent `ApplicationError` in inversion is deleted.

## Who is affected

- **Clients reading `error.messageCode` or `error.extra.messageArgs`.** Both still work but are deprecated. Move to `error.normalized.code` and `error.normalized.args`.
- **Browser or frontend apps.** Can import `ApplicationError`, `getError` and related types from `@venizia/ignis-inversion`.
- **Everyone else.** No action needed. `getError` accepts every shape it did before, unknown keys still land in `extra`, and the wire only gains `normalized`.

```typescript
throw getError({ message: 'Active transaction exists', transaction: { id, uid, status } });
// -> error.extra.transaction, exactly as before
```

## Details

- **Do not spread a definition into `getError`.** `getError({ ...SomeErrors.SOME_ERROR })` is wrong: a definition carries `key`, not `messageCode`, so the key lands in `extra.key` and the error degrades to `core.system_error`, which clients cannot localize. Pass it as `error` instead. The compiler does not catch this.
- **Typos compile.** The index signature that carries your context accepts any key, so `getError({ message, statuscode: 503 })` compiles, leaves `statusCode` at `400` and parks `503` in `extra.statuscode`.
- **Catalog `description`.** It is the only context a translator gets, so write it for them.
- **Catalog `key`.** Declare it as a string literal, not `MessageCode.build(...)`. `build()` returns `string`, which widens the key registry and silently breaks autocomplete.
- **`category`** is metadata for grouping and translator exports and does not reach the response.
- **Free-form errors.** `getError({ message })` is unchanged and still right for errors nobody translates.
- **Across packages.** Inversion ships CJS and ESM builds, so `instanceof ApplicationError` can still fail across a package boundary. Keep using `isApplicationError()`.

## See also

- [Error Helper](/extensions/helpers/error/)
- [Error Handling](/best-practices/error-handling)
