---
title: Validation Message Codes, SQLSTATE-Class DB Errors & Production Error Hardening
description: Zod 422 responses now derive messageCode/message from the schema; DB errors classify by SQLSTATE class; production responses no longer leak DB internals.
---

# Changelog - 2026-06-14

## Schema-Driven Validation Codes & Safer Production Errors

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" /> <Badge type="tip" text="Enhancement" />

**In one line.** Validation errors now carry a stable, localizable `messageCode`. Database errors classify more broadly and more correctly. Production error responses no longer leak database internals or raw system error text.

> [!NOTE]
> Builds on [Error Responses - messageCode & Extra Fields](/changelogs/2026-04-23-error-response-extra-fields), which added `error.messageCode` for domain errors. This release derives `messageCode`/`message` for validation errors directly from the failing Zod issue.

## The problem it solves

A 422 response used to carry the literal string `message: "ValidationError"` for every failed check. A frontend could not tell which rule failed without parsing `details.cause`. A database error in production could also leak row values and schema names through its `message`.

Attach a stable code to a custom Zod check, and it now surfaces on the response:

```typescript
schema.refine(fn, {
  message: 'Must not exceed 4 decimal places',
  params: { code: 'numeric.decimal.too_many_places' },
});
```

The 422 response now carries `messageCode: "numeric.decimal.too_many_places"` instead of the generic `"ValidationError"`.

## What changed

- **422 responses carry a real `messageCode`** - a schema-author `params.code` wins; otherwise the raw Zod code (for example `invalid_type`). `message` becomes that issue's human-readable text.
- **`params.code` schema convention** - attach a stable code to a custom check via `.refine(fn, { params: { code } })` or `superRefine`.
- **Database errors classify by SQLSTATE class, not exact code** - class `22` (data exception), `23` (integrity constraint), or `44` maps to `400`. Programming/infra classes (`42` syntax, `53` resources, `0A`, `25`, `28`) still return `500`.
- **Retryable database conflicts return `409`** - `40001` serialization failure and `40P01` deadlock return `409 Conflict` with `messageCode: "database.conflict"`, instead of a misleading `500`.
- **Production responses no longer leak database internals** - a DB client error exposes only the base message, never `detail`/`table`/`constraint`. Any error without an explicit `statusCode` returns a generic `"Internal Server Error"`. Non-production is unchanged.
- **`rootKey` now applies to validation responses** - 422 responses wrap under `error.rootKey`, consistent with every other error response.
- **Crash-proofing** - a non-string error `code` (for example a gRPC numeric code) no longer throws inside the handler.
- **Internal restructure** - `app-error` middleware split into `app-error.middleware.ts` (orchestrator), `zod.handler.ts`, `database.handler.ts`, `definition.ts`, `types.ts`.

## Who is affected

- **Frontends that parsed the literal `message: "ValidationError"`** - must switch to reading `messageCode` (breaking, see below).
- **Frontends that read `detail`/`table`/`constraint` off a production database error** - those fields are gone in production (breaking, see below).
- **Applications that set `error.rootKey`** - 422 responses are now wrapped like every other error response (breaking, see below).
- **Applications sending requests that previously 500'd on an unlisted class-22/23 Postgres code** - those now correctly return `400` (breaking, see below).
- **Schema authors** - can optionally attach `params.code` to custom Zod checks for a stable, localizable validation code. No changes required for existing schemas.
- **Backend application code** - no source changes required anywhere in this release; every change is in the shared `appErrorHandler`.

## Breaking changes

> [!WARNING]
> No source migration is required, but these change the **response body** for some errors. Update any frontend that parsed the old shapes.

### 1. 422 top-level `message` is no longer the literal `"ValidationError"`

```jsonc
// Before
{ "message": "ValidationError", "statusCode": 422, "details": { "cause": [ /* ... */ ] } }

// After
{ "message": "<first issue's message>", "messageCode": "<params.code or raw zod code>", "statusCode": 422, "details": { "cause": [ /* ... */ ] } }
```

Map `messageCode` to a localized string, falling back to `message`. `details.cause[]` is unchanged for consumers still reading it.

### 2. `rootKey` now wraps validation responses

If your app sets `error.rootKey`, 422 responses are now wrapped under that key (`{ "<rootKey>": { /* ... */ } }`), like every other error. Previously, the Zod branch returned the body unwrapped.

```typescript
const payload = config.rootKey ? body[config.rootKey] : body;
```

### 3. Production database error messages are generic

In production, a database error `message` no longer includes `Detail:`/`Table:`/`Constraint:` lines, and any unexpected error returns `"Internal Server Error"`. Non-production is unchanged. Rely on `requestId` plus server logs for diagnostics.

### 4. Unlisted class-22/23 codes now return 400

A Postgres data-exception or integrity-constraint code that wasn't explicitly listed previously returned `500`; it now returns `400` with a fallback message.

## Details

### Security: production responses leaked database internals

For database errors, the response `message` used to include the pg `detail` field. That field **echoes row values** (for example `Key (email)=(a@b.com) already exists`), plus `table` and `constraint` names, even in production.

Any unexpected error, such as a connection failure, returned its raw `error.message` instead. That could carry SQL, schema or column names, or a connection host and port (for example `connect ECONNREFUSED 10.0.0.5:5432`). Both are fixed as described in the breaking changes above. `details.stack` and `details.cause` remain gated to non-production, unchanged.

### `params.code` schema-author convention

```typescript
// .refine
schema.refine(fn, { message: 'Must not exceed 4 decimal places', params: { code: 'numeric.decimal.too_many_places' } });

// .superRefine
schema.superRefine((value, ctx) =>
  ctx.addIssue({ code: 'custom', message: '…', path: ['items', i, 'quantity'], params: { code: 'numeric.decimal.too_many_places' } }),
);

// A built-in rule that needs a code -> use refine instead of .min()
z.string().refine(s => s.length >= 5, { message: 'Too short', params: { code: 'name.too_short' } });
```

Built-in checks (type, `.min`, `.email`, ...) cannot carry a custom code in Zod v4 - re-express them as a `refine` if you need one.

### Files changed

| File | Change |
|------|--------|
| `src/base/middlewares/app-error/app-error.middleware.ts` | Thin orchestrator: routes Zod / DB-client / retryable-DB / domain / unknown errors; honors `rootKey` on the Zod branch; gates production messages |
| `src/base/middlewares/app-error/zod.handler.ts` | New - derives `messageCode`/`message` from the primary issue |
| `src/base/middlewares/app-error/database.handler.ts` | New - SQLSTATE class 22/23/44 classification and 40001/40P01 retryable detection |
| `src/base/middlewares/app-error/definition.ts` | Expanded Postgres error codes; adds `POSTGRES_CLIENT_ERROR_CLASSES`, `DATABASE_CLIENT_ERROR_FALLBACK_MESSAGE`, `POSTGRES_RETRYABLE_ERROR_CODES` |
| `src/base/middlewares/app-error/types.ts` | `IDatabaseError`, `IZodIssueLike` interfaces |
| `src/base/middlewares/index.ts` | Re-exports the per-middleware folders |

## See also

- [Middlewares Reference](/references/base/middlewares) - the full `appErrorHandler` reference
- [Error Responses - messageCode & Extra Fields](/changelogs/2026-04-23-error-response-extra-fields) - the changelog this release builds on
