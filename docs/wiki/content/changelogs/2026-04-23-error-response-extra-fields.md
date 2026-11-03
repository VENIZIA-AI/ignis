---
title: Error Responses - messageCode & Arbitrary Extra Fields
description: Error responses now include the error's messageCode and any extra fields you attach to it.
packages: ['@venizia/ignis-helpers', '@venizia/ignis-inversion']
---

# Changelog - 2026-04-23

## Richer Error Responses

**In one line.** Clients can now branch on a stable `messageCode` and read structured context from the JSON error response.

## What changed

- **`messageCode` in responses.** The error middleware now returns `messageCode` in the response body. It was dropped before.
- **Extra fields.** Any key you pass to `getError(...)` beyond the known ones is collected into `ApplicationError.extra` and returned under `extra`. This applies in both `@venizia/ignis-helpers` and `@venizia/ignis-inversion`.
- **Typed and documented.** `ErrorSchema` accepts arbitrary keys (`.catchall(z.any())`), so extra fields appear in OpenAPI.

```typescript
import { getError } from '@venizia/ignis-helpers';

throw getError({
  statusCode: 409,
  messageCode: 'app.user.email_taken',
  message: 'Email already registered',
  email: 'jane@example.com',
  conflictId: 42,
});
```

Response body:

```json
{
  "message": "Email already registered",
  "messageCode": "app.user.email_taken",
  "statusCode": 409,
  "requestId": "...",
  "extra": { "email": "jane@example.com", "conflictId": 42 }
}
```

## Who is affected

- **All users.** No action needed. Errors without `messageCode` or `extra` serialize as before, with those fields undefined.
- **Users of an interim release.** That release exposed a `messageArgs` field. It is gone; use `extra`.
