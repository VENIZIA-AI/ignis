---
title: An Error Hands Out Its Filled Text
description: "ApplicationError.toFilledText() fills the args into the message template, for a reader that only knows .message - a queue's failure reason, a third-party log. message itself stays the template."
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

The error response already filled its `message` (2026-10-11). A reader outside the response did not get that: a BullMQ job stores `job.failedReason = error.message`, so its dashboard showed `%{available}`.

- **`toFilledText()`** on `ApplicationError` fills each `%{key}` from `normalized.args`. A key with no arg stays as written.
- **`MessageTemplate.render({ text, args })`** is the fill itself, exported from `@venizia/ignis-inversion` and `@venizia/ignis-helpers`. It also returns the keys it found no arg for. The error middleware uses it, so the response and `toFilledText()` fill the same way.
- **`message` does not change.** A filled `message` would print every arg value in each log line and error tracker, outside the `args` map the log redacts by key. Fill where you choose to store the text.

## Who is affected

- **A queue, tracker or log that stores `error.message`.** Call `toFilledText()` where you hand the error over - see [Store the filled text](/extensions/helpers/error/#store-the-filled-text-where-a-plain-reader-shows-it).
- **Everyone else.** No change.

**Files:** [`packages/inversion/src/modules/error/message-template.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/error/message-template.ts), [`packages/inversion/src/modules/error/app-error.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/error/app-error.ts), [`packages/kernel/src/base/middlewares/app-error/app-error.middleware.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/middlewares/app-error/app-error.middleware.ts)
