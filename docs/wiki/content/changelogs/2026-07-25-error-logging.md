---
title: Readable Error Logs and a logLevel Option on getError
description: Error log lines are now short, lead with the status code and root cause, and getError takes a logLevel so an expected 404 stays out of the error log.
packages: ['@venizia/ignis', '@venizia/ignis-helpers', '@venizia/ignis-inversion']
---

# Changelog - 2026-07-25

## Readable Error Logs and `logLevel` on `getError`

<Badge type="tip" text="New Feature" /> <Badge type="tip" text="Enhancement" />

**In one line.** Error log lines are shorter, with the status code and the root cause up front, and a throw site can pick the level it logs at.

## What changed

- **`getError` takes `logLevel`.** Pass `error`, `emerg`, `warn`, `info` or `debug`. It affects the server log only and never reaches the client response.
- **The log line leads with the status code.** `REQUEST ERROR | 404 | GET /orders/9` replaces the old `path: … | method: … | url: …` header.
- **New fields.** The resolved `statusCode`, the `normalized.code`, and the caller's `extra` now appear. A secret-named key inside `extra` prints as `[REDACTED]`.
- **Driver diagnostics survive.** `pg` `hint`, `detail`, `table` and `constraint` each get their own line when present.
- **Stack frames appear only for an unexpected failure**, not for an intentional `getError`.
- **`ErrorPrettier`** is a new public export from `@venizia/ignis-helpers`, for logging an error anywhere else in your app.

```typescript
throw getError({
  message: 'Order not found',
  statusCode: 404,
  messageCode: 'server.sale.order.not_found',
  logLevel: 'warn',
});
```

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

- **Existing `getError` call sites.** No action needed. `logLevel` is optional and defaults to `error`.
- **Log parsing, alerting or dashboards.** Action needed if any rule matches the old header (see below).
- **Browser clients.** No change.

## Breaking changes

> [!WARNING]
> No API breaks. But the error log line changed shape, so an alert that matches the old header stops matching.

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

`ErrorPrettier.format` renders any thrown value for a human. Pass it through `%s` to keep the message's real newlines:

```typescript
import { ErrorPrettier } from '@venizia/ignis-helpers';

this.logger.warn('[recalculate] Order totals failed | %s', ErrorPrettier.format({ error }));
```

| Option | Type | Default | Meaning |
|---|---|---|---|
| `error` | `unknown` | - | The thrown value. Anything works, including a string or a plain object |
| `messageCode` | `string` | - | Renders a `code:` line |
| `extra` | `Record<string, unknown>` | - | Caller context. Redacted before printing |
| `includeStack` | `boolean` | `true` | Include stack frames |

`ErrorPrettier.summarize` returns the same projection as a typed `IErrorSummary` object, for a JSON sink.
