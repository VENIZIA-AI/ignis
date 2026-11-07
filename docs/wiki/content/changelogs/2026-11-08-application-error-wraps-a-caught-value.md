---
title: ApplicationError.fromUnknown wraps a caught value
description: "ApplicationError.fromUnknown({ error }) turns whatever a catch block holds into an ApplicationError and never throws. An ApplicationError comes back as the same instance."
packages: ['@venizia/ignis-inversion', '@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-11-08

## ApplicationError.fromUnknown wraps a caught value

<Badge type="tip" text="New Feature" />

**In one line.** A `catch` block can turn whatever it caught into an `ApplicationError` with one call, without a hand-written wrapper.

```typescript
import { ApplicationError } from '@venizia/ignis-helpers';

try {
  await someOperation();
} catch (error) {
  throw ApplicationError.fromUnknown({ error });
}
```

## What changed

- **`ApplicationError.fromUnknown({ error })`** takes any value and returns an `ApplicationError`. It never throws: `undefined`, `null`, a string, a symbol, a Proxy, an object with throwing getters, a frozen object and a circular structure all work.
- **An `ApplicationError` comes back as the same instance**, including one built by another installed copy of the package.
- **Anything else becomes a new error** with the original kept as `cause`. Its `statusCode` is the value's `statusCode`, else its `status`, when that is an integer from 400 to 599, and `500` otherwise. Its message is the value's string `message`, else the fixed text `An unknown value was thrown`. A control character in the message is escaped, so it stays on one line.

## Who is affected

- **Code that wraps a caught value itself.** You can replace your wrapper with this call. No action needed otherwise.
- **Everyone else.** No action needed.

## Details

- The message you keep is the message a client reads in production. The error middleware replaces only an unexpected error's message with `Internal Server Error`; an `ApplicationError` message goes out as written. Wrap a value whose message is safe to show, or use `getError` with a message you chose. The `cause` is not sent in production.
- See [Wrap a caught value of any type](/extensions/helpers/error/#wrap-a-caught-value-of-any-type).
