---
title: fromError - Rehydrate a Server Error on the Client
description: A new fromError inverts the error response the middleware emits, turning a wire payload back into a live ApplicationError. The wire shape is now a shared type, TResponsedError, instead of a partial duplicate declared in each client.
---

# Changelog - 2026-07-20

## `fromError` - Rehydrate a Server Error on the Client

<Badge type="tip" text="New API" />

The error layer already lived in `@venizia/ignis-inversion` rather than helpers so that a browser
app could share it. What was missing was the return trip: a client received an error response, but
had nothing to turn it back into an error.

## Overview

- **`fromError({ error })`** rebuilds an `ApplicationError` from the payload `AppErrorMiddleware`
  emitted, so one `catch` block handles a server failure and a locally thrown one alike.
- **`TResponsedError`** names the response shape in plain TypeScript, in inversion. The existing
  `ErrorSchema` still describes the same payload for OpenAPI, but it lives in helpers and depends on
  `@hono/zod-openapi`, so a browser cannot import it.
- **Nothing is required of existing clients.** Reading `error.normalized.code` remains the shortest
  path and stays correct - `fromError` is only for clients that want a unified `catch`.

## Why

A client that wanted the error as an error had to know how the response maps back onto the
constructor - that `normalized` becomes `message`, that `requestId` is worth keeping, that `details`
is not. Each client rediscovered this, and typically declared its own partial copy of the wire type
to do it. That is framework knowledge, and it belongs in the framework.

## Usage

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

## Mapping

| Wire field   | Where it lands                                                                   |
| ------------ | -------------------------------------------------------------------------------- |
| `normalized` | `normalized`, verbatim - `text`, `code` and `args` round-trip unchanged          |
| `message`    | `normalized.text`, but only when `normalized` is missing entirely                |
| `statusCode` | `statusCode`; `400` when the payload carries none                                |
| `extra`      | `extra`, verbatim                                                                |
| `requestId`  | `extra.requestId` - it is the identifier a support ticket quotes, so it survives  |
| `details`    | dropped - `url` and `path` the client already knows, and `stack` is the server's  |

Every field of `TResponsedError` is optional. A client parses what a gateway, a proxy or an older server
actually sent, not what it should have: an nginx HTML 502 or an empty body still yields an
`ApplicationError`, degraded to `MessageCode.DEFAULT` and status `400`. No call site branches on a
parse failure.

## Notes

`isApplicationError()` is the correct guard in a browser, not `instanceof ApplicationError`. The
client bundles its own copy of the class, so `instanceof` fails across the package boundary; the
guard duck-types on `statusCode` instead.

A response body read straight from `response.json()` is a plain object, not an error - it has no
prototype, so `isApplicationError()` returns `false` on it until `fromError` has run.

## See also

- [Error](/extensions/helpers/error/) - the full error layer, including the response shape
- [Error Module Redesign](./2026-07-17-error-module-redesign) - where `{ text, code, args }` came from
