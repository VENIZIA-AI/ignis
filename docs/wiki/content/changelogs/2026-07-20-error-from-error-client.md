---
title: fromError - Rehydrate a Server Error on the Client
description: A new fromError inverts the error response the middleware emits, turning a wire payload back into a live ApplicationError. The wire shape is now a shared type, TResponsedError, instead of a partial duplicate declared in each client.
---

# Changelog - 2026-07-20

## `fromError` - Rehydrate a Server Error on the Client

<Badge type="tip" text="New API" />

**In one line.** `fromError({ error })` turns the JSON payload `AppErrorMiddleware` sends back into a live `ApplicationError`, so one `catch` block handles a server failure and a locally thrown one alike.

## The problem it solves

The error layer already lived in `@venizia/ignis-inversion`, not helpers, so a browser app could import it. But there was no return trip: a client received an error response and had nothing to turn it back into an error. Each client had to rediscover how the response maps onto the constructor - that `normalized` becomes `message`, that `requestId` is worth keeping - and typically declared its own partial copy of the wire type to do it.

```ts
import { fromError, isApplicationError } from '@venizia/ignis-inversion';

try {
  const response = await fetch('/reservations', { method: 'POST', body });

  if (!response.ok) {
    const { error } = await response.json(); // `error` is the rootKey, if configured
    throw fromError({ error });
  }
} catch (error) {
  if (isApplicationError(error)) {
    showToast(translate(error.normalized.code, error.normalized.args));
  }
}
```

## What changed

- **`fromError({ error })`** rebuilds an `ApplicationError` from the payload `AppErrorMiddleware` emits.
- **`TResponsedError`** names the response shape in plain TypeScript, in inversion. The existing `ErrorSchema` still describes the same payload for OpenAPI, but it lives in helpers and depends on `@hono/zod-openapi`, so a browser cannot import it.
- **Every field of `TResponsedError` is optional.** A client parses what a gateway, a proxy, or an older server actually sent, not what it should have sent. An nginx HTML 502 or an empty body still yields an `ApplicationError`, degraded to `MessageCode.DEFAULT` and status `400`. No call site needs to branch on a parse failure.

## Mapping

| Wire field   | Where it lands                                                                   |
| ------------ | -------------------------------------------------------------------------------- |
| `normalized` | `normalized`, verbatim - `text`, `code`, and `args` round-trip unchanged         |
| `message`    | `normalized.text`, but only when `normalized` is missing entirely               |
| `statusCode` | `statusCode`; `400` when the payload carries none                                |
| `extra`      | `extra`, verbatim                                                                |
| `requestId`  | `extra.requestId` - the identifier a support ticket quotes, so it survives       |
| `details`    | dropped - `url` and `path` the client already knows, and `stack` is the server's |

## Who is affected

- **Existing clients: nothing to do.** Reading `error.normalized.code` is still the shortest path and stays correct. `fromError` is for a client that wants one unified `catch` instead.
- **Clients that hand-rolled a wire-type copy or their own response-to-error mapping.** Replace it with `fromError` and drop the local declaration.

## Notes

- Use `isApplicationError()` as the guard in a browser, not `instanceof ApplicationError`. The client bundles its own copy of the class, so `instanceof` fails across the package boundary - the guard duck-types on `statusCode` instead.
- A response body read straight from `response.json()` is a plain object, not an error. It has no prototype, so `isApplicationError()` returns `false` on it until `fromError` has run.

## See also

- [Error](/extensions/helpers/error/) - the full error layer, including the response shape
- [Error Module Redesign](./2026-07-17-error-module-redesign) - where `{ text, code, args }` came from
