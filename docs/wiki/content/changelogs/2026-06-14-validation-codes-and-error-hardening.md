---
title: Validation Message Codes, SQLSTATE-Class DB Errors & Production Error Hardening
description: Zod 422 responses now derive messageCode/message from the schema; DB errors classify by SQLSTATE class; production responses no longer leak DB internals.
---

# Changelog - 2026-06-14

## Schema-Driven Validation Codes & Safer Production Errors

The application error edge (`appErrorHandler`) gained three improvements:

1. **Zod validation (422) responses** now surface a schema-author-controlled `messageCode` and a meaningful `message` instead of the literal `"ValidationError"`.
2. **Database errors** are classified by **SQLSTATE class** (not exact code), with a fallback message — broader, more predictable 400s.
3. **Production responses are hardened** so they never leak database internals (pg `detail`/`table`/`constraint`) or raw system error text (SQL, schema names, connection host/port).

The `app-error` middleware is split into a focused folder by responsibility: `app-error.middleware.ts` (thin orchestrator) / `zod.handler.ts` (validation errors) / `database.handler.ts` (DB classification) / `definition.ts` (codes & messages) / `types.ts` (interfaces).

> [!NOTE]
> Builds on [Error Responses — messageCode & Extra Fields](./2026-04-23-error-response-extra-fields). That release surfaced `error.messageCode` for domain errors; this one **derives** `messageCode`/`message` for validation errors directly from the Zod issues.

## Overview

- **Dynamic `messageCode`/`message` for 422s** — derived from the failing validation issues: a custom `params.code` wins, else the raw Zod code; `message` becomes that issue's message. The literal `"ValidationError"` is only used when the error carries no parseable issues.
- **`params.code` schema convention** — authors attach a stable code via `.refine(fn, { params: { code } })` / `superRefine`.
- **SQLSTATE-class DB mapping** — any class `22` (data exception), `23` (integrity), or `44` (WITH CHECK OPTION) code → HTTP 400, with specific messages plus `DATABASE_CLIENT_ERROR_FALLBACK_MESSAGE` for unlisted in-class codes. Programming/infra classes (`42` syntax, `53` resources, `0A`, `25`, `28`) stay 500.
- **Retryable DB conflicts → 409** — transient transaction conflicts (`40001` serialization_failure, `40P01` deadlock_detected) now return **409 Conflict** with `messageCode: "database.conflict"` and a safe "please retry" message, instead of a misleading 500. The client can retry the same request.
- **Production hardening (security)** — DB client errors expose only the base message (no `detail`/`table`/`constraint`); unexpected errors return a generic `"Internal Server Error"`; intentional `getError` messages are preserved.
- **`rootKey` honored on the Zod branch** — validation responses now wrap under `error.rootKey` like every other error response.
- **Crash-proofing** — a non-string error `code` (e.g. a gRPC numeric code) no longer throws inside the handler.

## New Features

### Schema-driven `messageCode` / `message` for validation errors

**File:** `packages/core/src/base/middlewares/app-error/app-error.middleware.ts`

**Problem:** Every validation failure returned the literal top-level `message: "ValidationError"` with no `messageCode`, so frontends always rendered `"ValidationError"` and had no stable code to map to a localized string.

**Solution:** `formatZodError` now scans the issues and picks a **primary issue** — the first one whose schema attached a `params.code`, otherwise the first issue. The response `messageCode` becomes that issue's `params.code` (or its raw Zod code), and `message` becomes that issue's human message. The per-field list under `details.cause[]` is unchanged.

```jsonc
// 422 — a refine with params.code
{
  "message": "Must not exceed 4 decimal places",
  "messageCode": "numeric.decimal.too_many_places",
  "statusCode": 422,
  "requestId": "...",
  "details": { "url": "...", "path": "...", "cause": [ /* all issues, unchanged */ ] }
}
```

**Benefits:**
- A stable, localizable `messageCode` the FE can switch on (falls back to the raw Zod code like `invalid_type` / `too_small`).
- `message` reflects the real failure instead of a generic literal.
- No change required for existing schemas — un-annotated fields just surface the raw Zod code.

### `params.code` schema-author convention

Attach a stable code to a **custom** check (`.refine` / `.superRefine` / `.check`). Built-in checks (type, `.min`, `.email`, …) cannot carry a custom code in Zod v4 — re-express them as a refine if you need one.

```typescript
// .refine
schema.refine(fn, { message: 'Must not exceed 4 decimal places', params: { code: 'numeric.decimal.too_many_places' } });

// .superRefine
schema.superRefine((value, ctx) =>
  ctx.addIssue({ code: 'custom', message: '…', path: ['items', i, 'quantity'], params: { code: 'numeric.decimal.too_many_places' } }),
);

// built-in rule that needs a code → use refine instead of .min()
z.string().refine(s => s.length >= 5, { message: 'Too short', params: { code: 'name.too_short' } });
```

### SQLSTATE-class database error classification

**File:** `packages/core/src/base/middlewares/app-error/definition.ts`

**Problem:** Only an exact list of pg codes mapped to 400; any unlisted code (even a real class-22/23 one) fell through to 500.

**Solution:** Classify by **SQLSTATE class** (first two chars). Codes in class `22` (data exception) or `23` (integrity constraint) are client errors → 400, using a specific message when known or `DATABASE_CLIENT_ERROR_FALLBACK_MESSAGE` otherwise. Everything else stays 500 — notably class `42` (syntax / undefined column), which is an application/SQL bug and must **not** be masked as a 400.

```typescript
export const POSTGRES_CLIENT_ERROR_CLASSES: readonly string[] = ['22', '23', '44'];
export const DATABASE_CLIENT_ERROR_FALLBACK_MESSAGE = 'Invalid database request';
// PostgresErrorCodes / DATABASE_CLIENT_ERROR_MESSAGES expanded with common class 22/23 codes
// (incl. JSON invalid_json_text/duplicate_key, binary, float, escape, datetime/tz) and class 44.
```

## Security Fixes

### Production error responses leaked database internals

**Vulnerability:** For database errors the response `message` included pg `detail` (which **echoes row values**, e.g. `Key (email)=(a@b.com) already exists`), plus `table` and `constraint` names — in **production**. Separately, any unexpected error (non-client DB error, connection failure) returned its raw `error.message`, which can carry SQL, schema/column names, or a connection host/port (e.g. `connect ECONNREFUSED 10.0.0.5:5432`).

**Fix:** In production the handler now exposes only safe text:

- DB client errors (class 22/23) → the generic base message only (`detail`/`table`/`constraint` are appended in **non-production** for debugging).
- Any error without an explicit `statusCode` (uncaught throws, non-client DB errors, connection failures) → the generic `"Internal Server Error"`.
- Intentional `getError`/`ApplicationError` messages (which set `statusCode`) are **preserved**.
- `details.stack` and `details.cause` remain gated to non-production (unchanged).

```jsonc
// Production
// unique violation:        { "message": "Unique constraint violation", "statusCode": 400, ... }   // no Detail/Table/Constraint
// undefined column (42P01): { "message": "Internal Server Error",      "statusCode": 500, ... }   // raw SQL not leaked
// connection refused:       { "message": "Internal Server Error",      "statusCode": 500, ... }   // host/port not leaked
```

## Breaking Changes

> [!WARNING]
> No source migration is required, but these change the **response body** for some errors. Update any frontend that parsed the old shapes.

### 1. 422 top-level `message` is no longer the literal `"ValidationError"`

**Before:**
```jsonc
{ "message": "ValidationError", "statusCode": 422, "details": { "cause": [ … ] } }
```
**After:**
```jsonc
{ "message": "<first issue's message>", "messageCode": "<params.code or raw zod code>", "statusCode": 422, "details": { "cause": [ … ] } }
```
The FE contract is now: map `messageCode` to a localized string, fall back to `message`. `details.cause[]` is unchanged for consumers still reading it.

### 2. `rootKey` now wraps validation responses

If your app sets `error.rootKey`, 422 responses are now wrapped under that key (`{ "<rootKey>": { … } }`) like every other error — previously the Zod branch returned the body unwrapped.

### 3. Production DB error messages are generic

In production, DB error `message` no longer includes `Detail:`/`Table:`/`Constraint:` lines, and unexpected errors return `"Internal Server Error"`. Non-production is unchanged. Rely on `requestId` + server logs for diagnostics.

### 4. Unlisted class-22/23 codes now return 400

A pg data-exception/integrity code that wasn't explicitly listed previously returned 500; it now returns 400 with the fallback message.

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/base/middlewares/app-error/app-error.middleware.ts` | Thin `appErrorHandler` orchestrator: routes ZodError / DB-client / retryable-DB / domain / unknown errors; Zod branch honors `rootKey`; production message gating (generic message for unexpected errors) |
| `src/base/middlewares/app-error/zod.handler.ts` | **New** — `formatZodError`: derives `messageCode`/`message` from the issues (custom `params.code`, else the raw Zod code) |
| `src/base/middlewares/app-error/database.handler.ts` | **New** — `isDatabaseClientError` (SQLSTATE class 22/23/44 → 400, non-string-code guard, prod context suppression) and `isRetryableDatabaseError` (40001/40P01 → 409) |
| `src/base/middlewares/app-error/definition.ts` | Expanded `PostgresErrorCodes` (class 22/23/44); added `POSTGRES_CLIENT_ERROR_CLASSES`, `DATABASE_CLIENT_ERROR_FALLBACK_MESSAGE`, `POSTGRES_RETRYABLE_ERROR_CODES` + retryable message/code |
| `src/base/middlewares/app-error/types.ts` | `IDatabaseError`, `IZodIssueLike` interfaces (extracted from the middleware) |
| `src/base/middlewares/index.ts` | Re-exports the per-middleware folders |

## Migration Guide

> [!NOTE]
> Backend code needs no changes. The steps below are for API/frontend consumers.

### Step 1: Read `messageCode` for validation errors

```typescript
// 422 handling
const code = body.messageCode;                 // e.g. 'numeric.decimal.too_many_places' or 'invalid_type'
const text = i18n[code] ?? body.message;       // fall back to the human message
```

### Step 2: (Optional) annotate schemas with stable codes

```typescript
z.number().refine(n => Number.isInteger(n * 10000), {
  message: 'Must not exceed 4 decimal places',
  params: { code: 'numeric.decimal.too_many_places' },
});
```

### Step 3: If you set `error.rootKey`, unwrap 422s like other errors

```typescript
const payload = config.rootKey ? body[config.rootKey] : body;
```
