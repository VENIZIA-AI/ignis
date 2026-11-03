---
title: An Error Hands Out Its Filled Text
description: "ApplicationError.toFilledText() fills the args into the message template, for a reader that only knows .message, such as a queue's failure reason. message itself stays the template."
packages: ['@venizia/ignis-helpers', '@venizia/ignis-inversion']
---

# Changelog - 2026-10-14

## An error hands out its filled text

<Badge type="tip" text="Enhancement" />

**In one line.** `error.toFilledText()` gives the sentence a person reads; `error.message` stays the template.

```typescript
const error = getError({
  message: { text: 'Only %{available} left of %{sku}.', code: 'stock.unavailable' },
  messageArgs: { available: 2, sku: 'TRA-01' },
  statusCode: 409,
});

error.toFilledText(); // 'Only 2 left of TRA-01.'
error.message; // 'Only %{available} left of %{sku}.'
```

## What changed

- **`toFilledText()`** on `ApplicationError` fills each `%{key}` from `normalized.args`. A key with no arg stays as written. Use it where a plain reader shows the error, such as a BullMQ job, whose `failedReason` is `error.message`.
- **`MessageTemplate.render({ text, args })`** is the fill itself, exported from `@venizia/ignis-inversion` and `@venizia/ignis-helpers`. It also returns the keys it found no arg for. The response and `toFilledText()` fill the same way.
- **`message` does not change.** A filled `message` would print every arg value in each log line and error tracker, outside the `args` map the log redacts by key.

## Who is affected

- **A queue, tracker or log that stores `error.message`.** Call `toFilledText()` where you hand the error over. See [Store the filled text](/extensions/helpers/error/#store-the-filled-text-where-a-plain-reader-shows-it).
- **A client that casts a response error to `ApplicationError`.** The cast object has no `toFilledText()`, and calling it throws. Use `fromError({ error }).toFilledText()`, or the response `message`, which the server already fills.
- **An object literal typed `ApplicationError`** (a test fixture, a mock). It no longer compiles, because it lacks the method. Build it with `getError(...)`.
- **Everyone else.** No change.
