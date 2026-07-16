---
title: Postgres Driver Seam & Supabase
description: The Postgres connector now supports two interchangeable drivers, ships a Supabase submodule, and makes failed transactions fail loudly instead of silently.
---

# Changelog - 2026-07-11

## Postgres Driver Seam & Supabase

<Badge type="warning" text="Breaking Change" /> <Badge type="danger" text="Security" /> <Badge type="tip" text="New Feature" /> <Badge type="info" text="Bug Fix" />

**In one line.** The Postgres connector now supports two interchangeable drivers (`node-postgres` and `postgres-js`), ships a Supabase submodule, and makes `commit()`/`rollback()` throw on failure instead of silently succeeding.

## What changed

- **Two drivers, one connector.** Postgres connections now go through a neutral `IRelationalDriver` contract. Both `node-postgres` (`pg`) and `postgres-js` (`postgres`) implement it, so either can back a datasource without forking it.
- **Transactions fail loudly.** `commit()` and `rollback()` now throw when the underlying database operation fails, instead of resolving successfully. The connection behind a failed commit/rollback is destroyed instead of being returned to the pool. A failed `BEGIN` no longer leaks the acquired connection either.
- **`pg` and `postgres` are genuinely optional now.** Both database client packages are optional peer dependencies - an app that uses one never needs to install the other.
- **New package sub-paths.** `@venizia/ignis/postgres/node-postgres`, `@venizia/ignis/postgres/postgres-js`, and `@venizia/ignis/postgres/supabase`.
- **New Supabase submodule.** Pooler-mode presets for Supavisor (`PoolerModes`, `buildPostgresJsOptions`) and a transaction-scoped RLS helper (`withAuthContext`) that sets `request.jwt.claims` and `SET LOCAL ROLE` safely under a transaction pooler.
- **Security fix.** The RLS role helper now validates the role against a strict identifier pattern before use, closing a SQL-injection path through a JWT-supplied role claim.
- **Fixed.** The `@venizia/ignis/grpc` export pointed at a directory that no longer existed and threw `ERR_MODULE_NOT_FOUND`.

## Who is affected

- **Every application using the Postgres connector.** No action needed unless your code calls `commit()`/`rollback()` directly, or imports `TNodePostgresTransactionConnector` - see Breaking changes below.
- **Supabase users.** New opt-in submodule at `@venizia/ignis/postgres/supabase`. Nothing changes unless you adopt it.
- **Apps that only install one of `pg` / `postgres`.** No action needed; both are optional now.

## Breaking changes

### 1. `commit()` and `rollback()` now throw on failure

**Before**
```typescript
const transaction = await dataSource.beginTransaction();
try {
  await userRepository.create({ data: user, options: { transaction } });
  await transaction.commit(); // a failed COMMIT resolved silently
} catch (error) {
  await transaction.rollback(); // could throw and mask `error`
  throw error;
}
```

**After**
```typescript
const transaction = await dataSource.beginTransaction();
try {
  await userRepository.create({ data: user, options: { transaction } });
  await transaction.commit(); // now throws if COMMIT fails
} catch (error) {
  try {
    await transaction.rollback();
  } catch (rollbackError) {
    // log and continue - `error` is still what the caller must see
  }
  throw error;
}
```

Nest the rollback in its own `try` so a rollback failure never masks the original error.

### 2. `IDatabaseTransaction.connector` is retyped

`connector` is now `TRelationalConnector<Schema>` instead of the node-postgres-specific `TNodePostgresTransactionConnector`.

**Before**
```typescript
import type { TNodePostgresTransactionConnector } from '@venizia/ignis/postgres';

function useTx(connector: TNodePostgresTransactionConnector<typeof schema>) {}
```

**After**
```typescript
import type { TRelationalConnector } from '@venizia/ignis/postgres';

function useTx(connector: TRelationalConnector<typeof schema>) {}
```

<details>
<summary>Not urgent - old names still compile</summary>

`TNodePostgresTransactionConnector` and `TNodePostgresConnector` remain as `@deprecated` compatibility aliases, so existing code keeps compiling. Migrate to `TRelationalConnector` at your convenience.

</details>

### 3. If your build tooling prunes optional peers

`pg` and `postgres` are now optional. If your tooling prunes unused optional peers, install the one you actually use:

```bash
bun add pg        # node-postgres
bun add postgres  # postgres-js (needed for the Supabase transaction pooler)
```

## Details

- **Driver contract:** `IRelationalDriver` (`createConnector`, `acquire`, `getClient`, `end`), `IRelationalConnection` (`execute`, `release`), `IStatementResult` (`{ count }`). Each driver maps its native result shape (`pg`'s `rowCount`, postgres-js's `count`) onto this shared vocabulary.
- **`useDriver({ driver, schema? })`** assigns `this.driver` and rebuilds `this.connector` from it in one call, so a datasource can never end up half-wired.
- **`resolveDatabaseDriver({ client })`** structurally detects the client (postgres-js vs node-postgres) and dynamically imports only the matching driver - the losing package is never loaded.
- **Supabase pooler presets:** `buildPostgresJsOptions({ mode: PoolerModes.TRANSACTION })` returns `{ prepare: false }`, required under Supavisor's transaction pool mode since a prepared statement does not survive a backend swap.
- **`withAuthContext({ transaction, claims, role? })`** binds `request.jwt.claims` as a parameter and sets a transaction-scoped `SET LOCAL ROLE` so `auth.uid()` resolves inside RLS policies. `role` defaults to the JWT's own `role` claim; the value is validated before any statement runs.
- **Driver asymmetry, deliberate:** after a failed `COMMIT`, `node-postgres` can discard the poisoned connection; `postgres-js`'s reserved-connection API cannot, so it returns the connection to its pool. `release({ destroy: true })` is accepted by both drivers and honored by the one that can act on it.

<details>
<summary>Files changed</summary>

| File | Changes |
|------|---------|
| `src/connectors/postgres/drivers/driver.ts` | New. `IRelationalDriver` / `IRelationalConnection` / `IStatementResult` contracts |
| `src/connectors/postgres/drivers/node-postgres.ts` | New. `NodePostgresDriver` |
| `src/connectors/postgres/drivers/postgres-js.ts` | New. `PostgresJsDriver` |
| `src/connectors/postgres/drivers/resolve.ts` | New. `resolveDatabaseDriver` |
| `src/connectors/postgres/drivers/index.ts` | New. Exports only the contract + `resolveDatabaseDriver` |
| `src/connectors/postgres/supabase/pooler.ts` | New. `PoolerModes` + `buildPostgresJsOptions` |
| `src/connectors/postgres/supabase/rls.ts` | New. `withAuthContext` |
| `src/connectors/postgres/supabase/index.ts` | New. Re-exports pooler/rls + Supabase Drizzle roles |
| `src/utilities/drizzle-result.utility.ts` | New. `readAffectedRowCount` / `readResultRows` driver-shape readers |
| `src/connectors/postgres/datasources/abstract.ts` | `driver` / `resolveDriver` / `useDriver` / `getClient`; `pool` deprecated |
| `src/connectors/postgres/datasources/base.ts` | Transaction lifecycle: BEGIN-leak fix, commit/rollback throw + destroy, commit/rollback race guard |
| `src/connectors/postgres/datasources/common/types.ts` | `TRelationalConnector`; `IDatabaseTransaction.connector` retyped; deprecated aliases retained |
| `packages/core/package.json` | `pg` + `postgres` optional peers; new sub-path exports; grpc export path fixed |

</details>

> [!TIP]
> The how-to lives in the guide [Postgres Drivers & Supabase](/guides/core-concepts/persistent/postgres-drivers) and the transaction lifecycle detail in [Transactions](/guides/core-concepts/persistent/transactions).
