---
title: Error Handling - Normalized Messages, Error Catalog, and a Recovered cause
description: Every error now carries a normalized message ready for translation, you can declare reusable error definitions in a catalog, and the error layer moved to inversion so server and browser code share the same errors.
---

# Changelog - 2026-07-16

## Error Handling

<Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" /> <Badge type="info" text="New API" />

**In one line.** Every error now carries a `normalized` message ready for translation, you can declare reusable error definitions in a catalog, and `cause` finally reaches `Error.cause`.

## What changed

- **Every error now carries a `normalized` message.** One object (`{ text, code, args }`) is all a client needs to render and translate any error, instead of pairing `messageCode` and `extra.messageArgs` by hand. All five handler branches emit it, including validation.
- **`cause` now actually reaches `Error.cause`.** It used to be swept into `extra.cause` while the native field stayed `undefined` - and the error handler reads the native field, so the stack of the failure you wrapped never surfaced. Five framework call sites were losing it, including boot failures.
- **New: declare a domain error once, reuse it everywhere.** A catalog entry fixes an error's code, HTTP status, and default message so every call site that raises it stays in sync. See Details below.
- **New: `transform`** builds `normalized` yourself, so `normalized.text` can be a rendered, translated string while `message` keeps the raw text the throw site wrote.
- **The error layer moved to `@venizia/ignis-inversion`.** Backend imports are unchanged - keep importing from `@venizia/ignis-helpers`. This lets browser applications (which already depend on inversion for dependency injection) raise and read the same errors the server does. It also deletes a second, divergent `ApplicationError` that lived in inversion and never resolved its `messageCode`.

## Who is affected

- **Anyone reading `error.messageCode` or `error.extra.messageArgs` on the client.** Both still work but are deprecated. Migrate to `error.normalized.code` / `error.normalized.args`.
- **Browser or frontend applications.** Can now import `ApplicationError`, `getError`, and related types from `@venizia/ignis-inversion` directly.
- **Anyone spreading an error definition into `getError`.** Not a regression - it was already broken - but worth fixing now. See Details.
- **Everyone else.** No action needed. `getError` accepts every shape it accepted before, unknown keys still land in `extra`, and the wire only gains `normalized`.

## No breaking changes

`getError`'s input is unchanged. Any key it does not model still rides into `extra`:

```typescript
throw getError({ message: 'Active transaction exists', transaction: { id, uid, status } });
// -> error.extra.transaction, exactly as before
```

The wire shape only gains `normalized`. Nothing is removed, nothing moves.

## Details

- `messageCode` and `extra.messageArgs` are deprecated in favor of `normalized.code` / `normalized.args`, and stay only until every client has migrated.
- **Never spread a definition into `getError`.** `throw getError({ ...SomeErrors.SOME_ERROR })` reads naturally and is wrong: a definition carries `key`, not `messageCode`, so the key lands in `extra.key` and the error degrades to `core.system_error` - unlocalizable, since clients branch on the code. The status and message still arrive, so it survives review. Pass it as `error` instead. Nothing catches this for you: the index signature that carries your context accepts `key` too.
- The index signature is a deliberate trade. It is what lets a throw site attach context the framework knows nothing about - and it is also why `getError({ message, statuscode: 503 })` compiles, leaves `statusCode` at `400`, and parks `503` in `extra.statuscode`. The framework cannot tell your context from your typo.
- The catalog entry's `description` field is not a code comment - it is the only context a translator gets, since they work from a spreadsheet, not the source.
- Declare a catalog entry's `key` as a string literal, not `MessageCode.build(...)` - `build()` returns `string`, which widens the key registry to `Record<string, true>` and silently breaks autocomplete.
- Free-form `getError({ message })` is unchanged and still the right choice for errors nobody translates (invariants, misconfiguration, seed guards).
- Inversion ships both a CJS and an ESM build, so `instanceof ApplicationError` can still fail across a package boundary even after this change - keep using `isApplicationError()`.
- `category` on a catalog entry is metadata for grouping and translator exports; it does not reach the response.

## See Also

- [Error Helper](/extensions/helpers/error/) - the full reference
- [Error Handling](/best-practices/error-handling) - when to catalog and when to raise free-form
