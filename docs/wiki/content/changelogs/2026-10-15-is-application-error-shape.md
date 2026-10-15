---
title: isApplicationError Checks the Whole Shape
description: "isApplicationError() now also requires normalized.text, so a plain Error that only carries a statusCode - an HTTP client's, an engine's - is no longer taken for an ApplicationError."
---

# Changelog - 2026-10-15

## isApplicationError checks the whole shape

<Badge type="danger" text="Bug Fix" /> <Badge type="warning" text="Behavior Change" />

**In one line.** A plain `Error` with a `statusCode` is no longer an `ApplicationError`.

```typescript
const httpError = Object.assign(new Error('Request failed'), { statusCode: 502 });

isApplicationError(httpError); // false - it was true
isApplicationError(getError({ message: 'x', statusCode: 400 })); // true, as before
```

## What changed

`isApplicationError()` checked only `instanceof Error` and a numeric `statusCode`, yet narrowed the type to `ApplicationError`. Code after the guard then read `normalized` or called `toFilledText()` on an error that had neither, and crashed.

The guard now also requires `normalized` to be an object with a string `text`. It still tests shape, not class identity, so an `ApplicationError` from the other build copy (CJS against ESM) still matches.

Inside IGNIS this also fixes three paths that trusted the guard:
- A worker encoded such an error as an `ApplicationError` envelope with no `normalized`.
- The search connectors and the mail service rethrew it unwrapped, instead of sanitizing it as a 503 or 500.

## Who is affected

- **Code that relied on a `statusCode`-only error passing the guard.** Build the error with `getError`, or check `statusCode` yourself.
- **An `ApplicationError` from a copy older than 0.2.2-0.** It still matches, but has no `toFilledText()`.
- **Everyone else.** No change.

**Files:** [`packages/inversion/src/modules/error/app-error.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/error/app-error.ts)
