---
title: PromiseUtility.withTimeout, a typed sleep, and PromiseUtility on /core
description: "PromiseUtility.withTimeout runs a call against a timer and always clears it. PromiseUtility.sleep now returns Promise<void>, and PromiseUtility is exported from @venizia/ignis-helpers/core."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-11-06

## PromiseUtility.withTimeout, a typed sleep, and PromiseUtility on /core

<Badge type="tip" text="New Feature" /> <Badge type="info" text="Enhancement" />

**In one line.** `PromiseUtility.withTimeout({ call, timeoutMs, message? })` replaces the hand-written timer around a call, and it clears its timer on every path. `PromiseUtility.sleep` is typed `Promise<void>`, and `PromiseUtility` can be imported from `@venizia/ignis-helpers/core`.

## What changed

- **`withTimeout`.** It runs `call` and resolves with its result, or rejects with an `ApplicationError` when `timeoutMs` passes first; `message` is the error text. The timer is cleared when the call wins, when the timeout wins and when the call throws, so none is left behind. The call's own rejection passes through unchanged. The error carries status 504 (Gateway Timeout). A `timeoutMs` that is not positive, or is larger than `2_147_483_647` (the most a timer takes; a larger one would fire at once), rejects without running the call. The call is not cancelled when it loses: pass your own signal for that.
- **`sleep`.** The return type was `Promise<unknown>`; it is `Promise<void>`. Code that read the resolved value gets a type error, and the value was always `undefined`.
- **`/core`.** `PromiseUtility` is pure, so browser code can import it from `@venizia/ignis-helpers/core`. The root export is unchanged.

## Who is affected

- **Code with its own timeout wrapper.** It can call `withTimeout`.
- **Code that used the result of `await PromiseUtility.sleep(...)`.** Drop it; it was `undefined`.
- **Everyone else.** No action needed.

## Details

```typescript
import { PromiseUtility } from '@venizia/ignis-helpers/core';

const rows = await PromiseUtility.withTimeout({
  call: () => repository.find({ filter: {} }),
  timeoutMs: 2_000,
  message: 'catalog lookup timed out',
});
```

| File | Package |
|------|---------|
| `src/utilities/promise.utility.ts` | helpers |
| `src/core.ts` | helpers |
