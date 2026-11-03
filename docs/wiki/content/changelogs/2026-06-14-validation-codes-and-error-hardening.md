---
title: Validation Message Codes, SQLSTATE-Class DB Errors & Production Error Hardening
description: Validation errors carry a stable messageCode from the schema, database errors classify more correctly, and production responses no longer leak database internals.
packages: ['@venizia/ignis']
---

# Changelog - 2026-06-14

## Schema-Driven Validation Codes & Safer Production Errors

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" /> <Badge type="tip" text="Enhancement" />

**In one line.** Validation errors now carry a stable, localizable `messageCode`, database errors map to better status codes, and production error responses no longer leak database internals or raw system error text.

## What changed

- **422 responses carry a real `messageCode`.** A `params.code` set in the schema wins; otherwise the raw Zod code (for example `invalid_type`). `message` becomes that issue's text instead of the literal `"ValidationError"`.
- **Database errors classify by SQLSTATE class.** Classes `22`, `23` and `44` return `400`. Classes `42`, `53`, `0A`, `25` and `28` still return `500`.
- **Retryable conflicts return `409`.** `40001` and `40P01` return `409 Conflict` with `messageCode: "database.conflict"`, not `500`.
- **No leaks in production.** A database client error exposes only the base message, never `detail`, `table` or `constraint`. Any error without an explicit `statusCode` returns `"Internal Server Error"`. Non-production is unchanged.
- **`rootKey` applies to 422 responses.** They are wrapped under `error.rootKey` like every other error.
- **No crash on a non-string error `code`.** For example a numeric gRPC code no longer throws in the handler.

Attach a stable code to a custom Zod check:

```typescript
schema.refine(fn, {
  message: 'Must not exceed 4 decimal places',
  params: { code: 'numeric.decimal.too_many_places' },
});

schema.superRefine((value, ctx) =>
  ctx.addIssue({ code: 'custom', message: '...', path: ['items', i, 'quantity'], params: { code: 'numeric.decimal.too_many_places' } }),
);
```

Built-in checks (type, `.min`, `.email`, ...) cannot carry a custom code in Zod v4. Re-express them as a `refine` if you need one.

## Who is affected

- **Frontends that parse `message: "ValidationError"`, read `detail`, `table` or `constraint` from a production database error, or depend on a `500` for an unlisted class-22 or class-23 Postgres code.** Update them (see breaking changes).
- **Apps that set `error.rootKey`.** 422 responses are now wrapped.
- **Schema authors.** `params.code` is optional. Existing schemas need no change.
- **Backend code.** No source change needed.

## Breaking changes

> [!WARNING]
> No source migration is required, but the response body changes for some errors. Update any frontend that parsed the old shapes.

1. **422 `message` is no longer `"ValidationError"`.** Map `messageCode` to a localized string, falling back to `message`. `details.cause[]` is unchanged.

   ```jsonc
   // Before
   { "message": "ValidationError", "statusCode": 422, "details": { "cause": [ /* ... */ ] } }

   // After
   { "message": "<first issue's message>", "messageCode": "<params.code or raw zod code>", "statusCode": 422, "details": { "cause": [ /* ... */ ] } }
   ```

2. **`rootKey` now wraps validation responses.** If your app sets `error.rootKey`, 422 responses are wrapped as `{ "<rootKey>": { /* ... */ } }`. Before, the body was unwrapped.
3. **Production database error messages are generic.** `message` no longer includes `Detail:`, `Table:` or `Constraint:` lines, and unexpected errors return `"Internal Server Error"`. Use `requestId` and server logs for diagnostics.
4. **Unlisted class-22 and class-23 codes return `400`.** They returned `500` before, and now return `400` with a fallback message.

## Details

- **Security.** The database `detail` field echoes row values (for example `Key (email)=(a@b.com) already exists`) and names tables and constraints. Raw messages of unexpected errors could carry SQL, schema names, or a connection host and port. Both were visible in production before this release. `details.stack` and `details.cause` stay non-production only.
- Builds on [Error Responses - messageCode & Extra Fields](/changelogs/2026-04-23-error-response-extra-fields).
- See the [Middlewares Reference](/references/base/middlewares).
