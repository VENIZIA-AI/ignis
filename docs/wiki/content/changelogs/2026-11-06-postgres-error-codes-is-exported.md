---
title: PostgresErrorCodes is exported from the kernel and from @venizia/ignis
description: "PostgresErrorCodes, the SQLSTATE codes the error middleware maps to HTTP 400, is now a real export of @venizia/ignis-kernel and @venizia/ignis, at runtime and in the types."
packages: ['@venizia/ignis-kernel', '@venizia/ignis']
---

# Changelog - 2026-11-06

## PostgresErrorCodes is exported from the kernel and from @venizia/ignis

<Badge type="info" text="Bug Fix" />

**In one line.** `PostgresErrorCodes` can now be imported from `@venizia/ignis-kernel` and `@venizia/ignis`. Before, the name was in no entry point, so the import was a type error, and `undefined` at runtime in a project that does not typecheck.

## What changed

- **A real export.** `PostgresErrorCodes` (`UNIQUE_VIOLATION`, `FOREIGN_KEY_VIOLATION`, ...) is exported from the kernel root and so from `@venizia/ignis`, in the `.d.ts` and at runtime.
- **Why it was missing.** The error middleware used the object internally, and the barrel re-exported only the middleware.

## Who is affected

- **Code that matched a database error against its own copy of the SQLSTATE codes.** It can import the constant instead.
- **Everyone else.** No action needed.

## Details

```ts
import { PostgresErrorCodes } from '@venizia/ignis';

if (error.code === PostgresErrorCodes.UNIQUE_VIOLATION) {
  // ...
}
```

| File | Package |
|------|---------|
| `src/base/middlewares/app-error/index.ts` | kernel |
