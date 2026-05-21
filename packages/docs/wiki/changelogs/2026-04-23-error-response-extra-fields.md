---
title: Error Responses — messageCode & Arbitrary Extra Fields
description: App error middleware now surfaces messageCode and any extra fields attached to ApplicationError in the JSON error response
---

# Changelog - 2026-04-23

## Richer Error Responses

The application error middleware now propagates a machine-readable `messageCode` and any **extra fields** attached to an error into the JSON error response. `ApplicationError` collects unknown constructor options into an `extra` bag, and the `ErrorSchema` accepts arbitrary keys.

## Overview

- **`messageCode` in responses**: the middleware now includes `error.messageCode` in the response body (previously dropped)
- **Arbitrary extra fields**: any keys passed to `getError(...)` beyond the known ones are collected into `error.extra` and returned under `extra`
- **`ApplicationError.extra`**: new optional property on the error class in both `@venizia/ignis-helpers` and `@venizia/ignis-inversion`
- **`ErrorSchema` catch-all**: the Zod error schema uses `.catchall(z.any())`, so extra fields are typed and OpenAPI-documented

> [!NOTE]
> An interim release exposed a `messageArgs` field. It was superseded by the more general `extra` mechanism below and is no longer part of the response.

## New Features

### `messageCode` + `extra` in the error response

**File:** `packages/core/src/base/middlewares/app-error.middleware.ts`

**Problem:** Clients only received `message` (human text) and `statusCode`. There was no stable code to branch on for i18n/handling, and no way to attach structured context (entity id, field, etc.) to an error.

**Solution:** The handler reads `messageCode` and `extra` off the error (when present) and includes them in the response payload.

**Before:**
```typescript
const rs = {
  message: resolvedMessage,
  statusCode: resolvedStatusCode,
  requestId,
  details: { url, path, /* ... */ },
};
```

**After:**
```typescript
const messageCode = 'messageCode' in error ? error.messageCode : undefined;

const rs = {
  message: resolvedMessage,
  messageCode,
  statusCode: resolvedStatusCode,
  requestId,
  extra: 'extra' in error ? error?.extra : undefined,
  details: { url, path, /* ... */ },
};
```

### `ApplicationError` collects extra fields

**File:** `packages/helpers/src/modules/error/app-error.ts`, `packages/inversion/src/common/app-error.ts`

The constructor now spreads any unknown options into `extra` (excluding `message`, `messageCode`, `statusCode`, `name`):

```typescript
export class ApplicationError extends Error {
  statusCode: number;
  messageCode?: string;
  extra?: Record<string, unknown>;

  constructor(opts: TError) {
    const { message, messageCode, statusCode = 400, name: _name, ...extra } = opts;
    super(message);
    this.statusCode = statusCode;
    this.messageCode = messageCode;
    this.extra = Object.keys(extra).length > 0 ? extra : undefined;
  }
}
```

**Usage:**
```typescript
import { getError } from '@venizia/ignis-helpers';

throw getError({
  statusCode: 409,
  messageCode: 'app.user.email_taken',
  message: 'Email already registered',
  // anything extra is collected and returned under `extra`
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

**Benefits:**
- Stable, localizable `messageCode` for clients to switch on
- Structured error context without subclassing the error type
- `ErrorSchema.catchall(z.any())` keeps extra fields type-safe and documented in OpenAPI

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/base/middlewares/app-error.middleware.ts` | Surface `messageCode` and `extra` in the response body; destructure `NODE_ENV` for production detection |

### Helpers Package (`packages/helpers`)

| File | Changes |
|------|---------|
| `src/modules/error/app-error.ts` | `ApplicationError.extra` property; constructor collects unknown options |
| `src/modules/error/types.ts` | `ErrorSchema` already permits extra keys via `.catchall(z.any())` |

### Inversion Package (`packages/inversion`)

| File | Changes |
|------|---------|
| `src/common/app-error.ts` | Mirrors the helpers `ApplicationError` change |

## No Breaking Changes

All additions are optional. Existing errors without `messageCode`/`extra` serialize as before (those fields are simply `undefined`).
