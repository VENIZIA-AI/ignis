---
title: Readable Error Logs and a logLevel Option on getError
description: A thrown error now logs as a compact block instead of a raw object dump, and getError takes a logLevel so an expected 404 stops landing next to a real 500.
---

# Changelog - 2026-07-25

## Readable Error Logs and `logLevel` on `getError`

<Badge type="tip" text="New Feature" /> <Badge type="tip" text="Enhancement" />

**In one line.** Your error log lines change shape: shorter, with the status code and the root cause up front, and a throw site can now pick the level it logs at.

## The problem it solves

A failed query logged the raw error. A `drizzle` error carries the statement in `message`, again in `stack`, and again in `query`, plus the wrapped `pg` error as `cause`. One failure printed the same SQL four times over, and the one useful line was buried:

```
… Error: { name: 'Error', message: 'Failed query: \n WITH summary AS (\n …800 chars… ',
  stack: 'Error: Failed query: \n …the SAME 800 chars… ', query: '\n …a THIRD time… ',
  params: [ '3f8c…', '3f8c…' ], cause: { message: 'cannot update table "SaleOrder" …',
  stack: '…', length: 245, severity: 'ERROR', code: '55000', hint: '…', file: '…' } }
```

The same failure now reads:

```
… error:  [req-abc] REQUEST ERROR | 500 | POST /sale-orders
cause: cannot update table "SaleOrder" because it does not have a replica identity (code 55000)
hint: To enable updating the table, set REPLICA IDENTITY using ALTER TABLE.
message:
Failed query:
      WITH summary AS ( … )
      UPDATE "sale"."SaleOrder" SET total = summary.total …
stack:
    at queryWithCache (…/drizzle-orm/pg-core/session.cjs:66:33)
```

## What changed

- **`getError` takes `logLevel`.** Pass `error`, `emerg`, `warn`, `info` or `debug`. It steers the server log only and never reaches the client response.
- **The log line leads with the status code.** `REQUEST ERROR | 404 | GET /orders/9` replaces the old `path: … | method: … | url: …` header.
- **Three fields that were missing now appear:** the resolved `statusCode`, the `normalized.code`, and the caller's `extra`.
- **`extra` is redacted.** A secret-named key inside it prints as `[REDACTED]`.
- **Driver diagnostics survive.** `pg` supplies `hint`, `detail`, `table` and `constraint`; each gets its own line when present.
- **Stack frames appear only for an unexpected failure.** An intentional `getError` knows why it failed, so its frames are HTTP-framework plumbing.
- **`ErrorPrettier` is a new public export** from `@venizia/ignis-helpers`, for logging an error anywhere else in your app.

## Lower the level of an expected failure

A `404` is the client's fault, not yours. It does not belong in the error log next to a real `500`:

```typescript
throw getError({
  message: 'Order not found',
  statusCode: 404,
  messageCode: 'server.sale.order.not_found',
  logLevel: 'warn',
});
```

That line now logs at `warn`, so it stays out of `APP-error-*.log` and still reaches `APP-info-*.log`.

| `logLevel` | Console | `APP-info-*.log` | `APP-error-*.log` |
|---|---|---|---|
| `emerg` | yes | yes | yes |
| `error` (default) | yes | yes | yes |
| `warn` | yes | yes | no |
| `info` | yes | yes | no |
| `debug` | yes | no | no |

> [!TIP]
> Use `info` rather than `debug` for a failure you want quiet but still recorded. A `debug` line reaches the console but neither log file.

## Who is affected

- **Existing `getError` call sites.** No action needed. `logLevel` is optional and defaults to `error`, so every current throw site behaves exactly as before.
- **Anyone reading server logs.** The format changed. Nothing to do, but the shape is new.
- **Log parsing, alerting or dashboards.** Action needed if any rule greps the old header. See below.
- **Browser clients.** No change. `logLevel` never crosses the wire.

## Breaking changes

> [!WARNING]
> No API breaks. But the error log line changed shape, so a grep-based alert on the old header stops matching.

**Before:**

```
[req-abc] REQUEST ERROR | path: /sale-orders | method: POST | url: http://host/sale-orders | Error: { … }
```

**After:**

```
[req-abc] REQUEST ERROR | 500 | POST http://host/sale-orders
name: TypeError
message:
cannot read properties of undefined
```

Update any rule that matched `path: ` in an error line. The path still appears, inside the URL.

## Details

`ErrorPrettier` projects any thrown value down to what a human needs, then renders it. Use it wherever you log an error yourself:

```typescript
import { ErrorPrettier } from '@venizia/ignis-helpers';

this.logger.warn('[recalculate] Order totals failed | %s', ErrorPrettier.format({ error }));
```

It keeps `name`, the full untruncated `message`, `code`, the `pg` diagnostics, the root stack frames and a flattened `cause` chain. It drops `query`, `params` and the duplicated stack header. Pass it through `%s`, which prints the string verbatim and keeps the message's real newlines.

| Option | Type | Default | Meaning |
|---|---|---|---|
| `error` | `unknown` | - | The thrown value. Anything works, including a string or a plain object |
| `messageCode` | `string` | - | Renders a `code:` line. The middleware passes `normalized.code` |
| `extra` | `Record<string, unknown>` | - | Caller context. Redacted before printing |
| `includeStack` | `boolean` | `true` | Frames are noise on an intentional error |

`ErrorPrettier.summarize` returns the same projection as a typed `IErrorSummary` object, for a JSON sink or a log aggregator.

| File | Package |
|------|---------|
| `src/modules/logger/formatting/error-prettier.ts` | helpers |
| `src/modules/error/types.ts` | inversion |
| `src/base/middlewares/app-error/app-error.middleware.ts` | core |
