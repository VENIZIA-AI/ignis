---
title: PostgresErrors.find finds the Postgres error inside a wrapped error
description: "One public helper walks the cause chain and returns the Postgres error with its code, constraint and detail, whichever driver threw it. The error handler uses the same helper."
packages: ['@venizia/ignis-kernel', '@venizia/ignis']
---

# Changelog - 2026-11-08

## PostgresErrors.find finds the Postgres error inside a wrapped error

<Badge type="tip" text="New Feature" /> <Badge type="info" text="Bug Fix" />

**In one line.** `PostgresErrors.find({ error })` returns the Postgres error hidden in a wrapped error, with its `code`, `constraint` and `detail`, so you no longer write your own `cause` walker to spot a unique violation.

## What changed

- **A new helper.** `PostgresErrors.find({ error })` follows `cause` and returns an `IPostgresError` (`code`, plus `constraint`, `detail`, `table`, `column`, `schema` and `message` when the server sent them), or `undefined`. Compare `code` with `PostgresErrorCodes`.
- **The same fields for every driver.** node-postgres, postgres-js and PGlite are read into one shape: postgres-js's `constraint_name`, `table_name`, `column_name` and `schema_name` come back as `constraint`, `table`, `column` and `schema`.
- **Safe to call on anything.** It never throws. A `cause` cycle, a getter that throws, a Proxy, or a value that is not an object gives `undefined`.
- **Bounded.** It follows at most 10 `cause` hops (`PostgresErrors.MAX_DEPTH`). The outermost error with a real SQLSTATE wins.
- **A `code` counts only when it is a SQLSTATE.** Five characters of digits and upper-case letters. `ECONNRESET` or a number is skipped and the walk goes on.
- **The error handler uses it too.** It used to read one level of `cause`. A unique violation or a deadlock wrapped two or three levels deep now answers 400 or 409 instead of 500, and an outer error with a non-SQLSTATE `code` no longer hides the Postgres error under it.

```typescript
import { PostgresErrorCodes, PostgresErrors } from '@venizia/ignis';

const pgError = PostgresErrors.find({ error });

if (pgError?.code === PostgresErrorCodes.UNIQUE_VIOLATION) {
  // pgError.constraint, pgError.table, pgError.detail
}
```

## Who is affected

- **Apps with their own `cause` walker for Postgres errors.** You can replace it with `PostgresErrors.find`. No action needed.
- **Apps whose ORM wraps the driver error more than one level.** Those errors now get the 400 or 409 they should have had.
- **Everyone else.** No action needed.

## Details

- In non-production responses, `Detail:`, `Table:` and `Constraint:` now come from the same error that supplied the `code`, not always from the first `cause`. Production still returns the base message only.

| File | Package |
|------|---------|
| `src/base/middlewares/app-error/postgres-errors.ts` | kernel |
| `src/base/middlewares/app-error/database.handler.ts` | kernel |
