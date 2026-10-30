---
title: fromError - Rehydrate a Server Error on the Client
description: A new fromError turns the error response the server sends back into a live ApplicationError, so one catch block handles server and local failures alike.
packages: ['@venizia/ignis-inversion']
---

# Changelog - 2026-07-20

## `fromError` - Rehydrate a Server Error on the Client

<Badge type="tip" text="New API" />

**In one line.** `fromError({ error })` turns the JSON payload `AppErrorMiddleware` sends into a live `ApplicationError`, so one `catch` block handles a server failure and a locally thrown one alike.

## What changed

- **`fromError({ error })`** rebuilds an `ApplicationError` from the payload `AppErrorMiddleware` emits.
- **`TResponsedError`** names the response shape in plain TypeScript, so a browser can import it and drop its own partial copy of the type.
- **Every field of `TResponsedError` is optional.** A client can parse what a gateway, a proxy, or an older server actually sent.
- **A malformed response still yields a usable error.** An HTML 502 or an empty body produces an `ApplicationError` with `MessageCode.DEFAULT` and status `400`.

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

## Who is affected

- **Existing clients.** Nothing to do. Reading `error.normalized.code` stays correct.
- **Clients with a hand-rolled wire type or response-to-error mapping.** Replace it with `fromError` and drop the local declaration.

## Details

- Use `isApplicationError()` as the guard in a browser, not `instanceof ApplicationError`. The client bundles its own copy of the class, so `instanceof` fails across the package boundary.
- A body read straight from `response.json()` is a plain object, so `isApplicationError()` returns `false` on it until `fromError` has run.
- `message` becomes `normalized.text` only when `normalized` is missing. `requestId` lands in `extra.requestId`. `details` is dropped.

## See also

- [Error](/extensions/helpers/error/) - the full error layer, including the response shape
- [Error Module Redesign](./2026-07-17-error-module-redesign) - where `{ text, code, args }` came from
