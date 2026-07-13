---
title: Postgres Driver Seam & Supabase
description: Pluggable driver seam (node-postgres + postgres-js), transactions that throw on failed commit/rollback, optional pg/postgres peers, Supabase submodule
---

# Changelog - 2026-07-11

## Postgres Driver Seam & Supabase

The Postgres connector was hard-wired to `pg` in exactly two places: connection acquisition and the raw control statements (`BEGIN` / `COMMIT` / `ROLLBACK`). This release lifts both behind a neutral `IRelationalDriver` contract, ships two drivers that satisfy it (`node-postgres` and `postgres-js`), and hardens the transaction lifecycle so a failed `COMMIT` can no longer resolve successfully or leak a poisoned connection back into the pool. On top of the seam sits a Supabase submodule: pooler-mode presets and a transaction-scoped RLS auth-context helper.

Supabase is unmodified PostgreSQL, so it varies the **driver**, not the SQL dialect. That is why there is no new dialect folder - only a new driver and a thin Supabase submodule.

> [!TIP]
> This changelog is the release note. The how-to lives in the guide [Postgres Drivers & Supabase](/guides/core-concepts/persistent/postgres-drivers) and the transaction lifecycle detail in [Transactions](/guides/core-concepts/persistent/transactions).

## Overview

- **Transaction correctness**: `commit()` and `rollback()` now **throw** on failure instead of swallowing it, and the underlying connection is **destroyed** (not pooled) after a failed `COMMIT` / `ROLLBACK`. A failed `BEGIN` destroys the acquired connection instead of leaking it, and a `commit()` racing a `rollback()` can no longer double-release the same physical connection.
- **Driver seam**: a new `IRelationalDriver` / `IRelationalConnection` / `IStatementResult` contract under `connectors/postgres/drivers/`. `NodePostgresDriver` and `PostgresJsDriver` both satisfy it and are proven by the same conformance suite.
- **Driver resolution**: `resolveDatabaseDriver({ client })` structurally detects the client the app built and dynamically imports only the matching driver, so both database packages stay optional.
- **Optional peers + sub-path exports**: `pg` and `postgres` are both **optional** peer dependencies now. Three new package exports: `@venizia/ignis/postgres/node-postgres`, `@venizia/ignis/postgres/postgres-js`, and `@venizia/ignis/postgres/supabase`.
- **Supabase submodule**: `PoolerModes` + `buildPostgresJsOptions` (transaction-pooler-safe `prepare` handling) and `withAuthContext` (transaction-scoped `request.jwt.claims` + `SET LOCAL ROLE`, privilege-escalation guarded). Re-exports Supabase's own Drizzle roles.
- **grpc export-path fix**: `@venizia/ignis/grpc` pointed at a directory that no longer existed (`ERR_MODULE_NOT_FOUND`); it now resolves to the real component path.

## Breaking Changes

> [!WARNING]
> This section contains changes that require migration or manual updates to existing code.

### 1. `commit()` and `rollback()` now throw

Both verbs previously swallowed engine failures - a failed `COMMIT` resolved successfully, so a caller could believe a write was durable when it was not. Both now throw on failure. Because `rollback()` can itself throw, a `catch` block that rolls back must **nest its own try** so the rollback error does not mask the original one.

**Before:**

```typescript
import { PostgresDataSource } from './datasources/postgres.datasource';

const transaction = await dataSource.beginTransaction();
try {
  await userRepository.create({ data: user, options: { transaction } });
  await transaction.commit(); // a failed COMMIT resolved silently
} catch (error) {
  await transaction.rollback(); // if this threw, it replaced `error`
  throw error;
}
```

**After:**

```typescript
import { PostgresDataSource } from './datasources/postgres.datasource';

const transaction = await dataSource.beginTransaction();
try {
  await userRepository.create({ data: user, options: { transaction } });
  await transaction.commit(); // throws if COMMIT fails; connection is destroyed, not pooled
} catch (error) {
  // rollback() throws only when it is the FIRST verb to fail; after a FAILED commit it is a
  // silent no-op, so the bare `await transaction.rollback()` pattern stays safe there. Nesting
  // still guards the one remaining case: a first ROLLBACK that itself fails.
  try {
    await transaction.rollback();
  } catch (rollbackError) {
    // log and continue; the original `error` is what the caller must see
  }
  throw error;
}
```

> [!NOTE]
> Driver asymmetry, deliberate: after a failed `COMMIT`, `node-postgres` can discard the poisoned connection (`release(true)`); `postgres-js` cannot (`ReservedSql.release()` takes no argument), so it returns the connection to its pool. `release({ destroy: true })` is accepted by both drivers and honoured by the one that can.

### 2. `IDatabaseTransaction.connector` type renamed

The transaction's `connector` is now typed `TRelationalConnector<Schema>` - the shared `PgDatabase` base that every Drizzle Postgres driver satisfies - rather than the node-postgres-specific `TNodePostgresTransactionConnector`. This is what lets one transaction implementation carry no driver-specific code.

**Before:**

```typescript
import type { TNodePostgresTransactionConnector } from '@venizia/ignis/postgres';

function useTx(connector: TNodePostgresTransactionConnector<typeof schema>) {
  // ...
}
```

**After:**

```typescript
import type { TRelationalConnector } from '@venizia/ignis/postgres';

function useTx(connector: TRelationalConnector<typeof schema>) {
  // ...
}
```

> [!NOTE]
> `TNodePostgresTransactionConnector` and `TNodePostgresConnector` remain as `@deprecated` compatibility aliases, so existing code keeps compiling. Migrate to `TRelationalConnector` at your convenience.

## New Features

### The driver seam

**File:** `packages/core/src/connectors/postgres/drivers/driver.ts`

**Problem:** The connector called `pg.Pool.connect()` and issued `client.query('BEGIN ...')` directly. Supporting a second driver (postgres-js, needed for Supabase's transaction pooler) meant either forking the datasource or littering it with runtime shape checks.

**Solution:** Three neutral contracts:

- `IRelationalDriver` - owns `createConnector({ schema })` (the pooled connector), `acquire({ schema })` (a dedicated connection for one transaction), `getClient()` (the raw client escape), and `end()`.
- `IRelationalConnection` - one dedicated physical connection with `execute({ statement })` for raw control statements and `release({ destroy? })`.
- `IStatementResult` - `{ count: number }`, the same `count` vocabulary the repository verbs already speak. Each driver maps its native shape (`pg` `rowCount`, postgres-js `count`) to this at its own boundary.

```typescript
import type { IRelationalDriver } from '@venizia/ignis/postgres';
// concrete drivers are sub-path only, so an unused one never loads its package:
import { NodePostgresDriver } from '@venizia/ignis/postgres/node-postgres';
import { PostgresJsDriver } from '@venizia/ignis/postgres/postgres-js';
```

**Benefits:**

- One transaction implementation, zero driver-specific branches in the datasource.
- A future dialect can carry extra neutral result fields (for example a MySQL `insertId` on the repository result path) without breaking either existing driver - the conformance suite asserts the neutral floor, never the exact key set.

### `useDriver` - wire a driver in one step

**File:** `packages/core/src/connectors/postgres/datasources/abstract.ts`

**Problem:** Setting `this.driver` without also rebuilding `this.connector` left a half-wired datasource whose pooled queries silently bypassed the driver.

**Solution:** `this.useDriver({ driver, schema? })` assigns `this.driver` **and** builds `this.connector` from it in one call, making the half-wired state unrepresentable. `schema` defaults to `getSchema()`.

```typescript
import { BaseRelationalDataSource } from '@venizia/ignis/postgres';
import { PostgresJsDriver } from '@venizia/ignis/postgres/postgres-js';
import postgres from 'postgres';

export class SupabaseDataSource extends BaseRelationalDataSource<Settings, typeof schema> {
  async configure() {
    const client = postgres(this.getConnectionString(), { prepare: false });
    this.useDriver({ driver: new PostgresJsDriver({ client }) });
  }
}
```

**Benefits:**

- No footgun: you cannot end up with a driver set but a connector still bound to the old pool.
- A datasource that only assigns the raw client (`this.client = new Pool(...)`) is adopted into `NodePostgresDriver` on first use, so the short path keeps working without importing a driver.

### `resolveDatabaseDriver` - structural detection, lazy import

**File:** `packages/core/src/connectors/postgres/drivers/resolve.ts`

**Problem:** A static `import` of either driver module would pull its database package into every entry point that transitively reaches `connectors/postgres` - which is all of them - making an "optional" peer mandatory in practice.

**Solution:** `resolveDatabaseDriver({ client })` inspects the client structurally (`reserve` + `unsafe` means postgres-js, checked first; `connect` means node-postgres) and `await import()`s only the winner. An unrecognized client throws a message naming `bun add pg` or `bun add postgres`.

```typescript
import { resolveDatabaseDriver } from '@venizia/ignis/postgres';

const driver = await resolveDatabaseDriver({ client: this.getClient() });
```

**Benefits:**

- `pg` and `postgres` are both genuinely optional - IGNIS never forces a database client on a project that does not use it.
- The root barrel, `@venizia/ignis/postgres`, and the drivers barrel load zero `pg` and zero `postgres` modules in a fresh process (pinned by a subprocess guard test). `drivers/index.ts` exports only the contract plus `resolveDatabaseDriver`; the concrete drivers are sub-path only.

### Supabase submodule

**File:** `packages/core/src/connectors/postgres/supabase/`

Reachable only via `@venizia/ignis/postgres/supabase` - never re-exported from the Postgres barrel, so an app that does not use Supabase never pulls in `drizzle-orm/supabase`.

**Pooler presets** (`pooler.ts`): `PoolerModes` (`DIRECT` / `SESSION` / `TRANSACTION`) and `buildPostgresJsOptions({ mode, max? })`. Supavisor's transaction pool mode rebinds the backend per transaction, so a server-side prepared statement created on one backend will not exist on the next - `prepare: false` there is required, not a tuning knob. `max` is forwarded only when supplied.

```typescript
import { PoolerModes, buildPostgresJsOptions } from '@venizia/ignis/postgres/supabase';
import postgres from 'postgres';

const options = buildPostgresJsOptions({ mode: PoolerModes.TRANSACTION });
// => { prepare: false }
const client = postgres(connectionString, options);
```

**RLS auth context** (`rls.ts`): `withAuthContext({ transaction, claims, role? })` sets `request.jwt.claims` (a bound parameter) and `SET LOCAL ROLE` (interpolated, guarded by `/^[a-z_][a-z0-9_]*$/`) for the remainder of the current transaction, so `auth.uid()` resolves inside RLS policies. `SET LOCAL` is transaction-scoped, which is precisely what makes it safe under a transaction-mode pooler; a plain `SET` would leak the identity to the next borrower and is deliberately not offered. `role` defaults to the JWT's own `role` claim (PostgREST semantics); an explicit argument overrides it. The role is validated **before** any statement runs, so a rejected call leaves the session untouched.

```typescript
import { withAuthContext } from '@venizia/ignis/postgres/supabase';

const transaction = await dataSource.beginTransaction();
try {
  await withAuthContext({ transaction, claims: { sub: userId, role: 'authenticated' } });
  const rows = await postRepository.find({ filter: { where: { ownerId: userId } }, options: { transaction } });
  await transaction.commit();
} catch (error) {
  try {
    await transaction.rollback();
  } catch (rollbackError) {
    // log; keep the original error
  }
  throw error;
}
```

The submodule also re-exports Supabase's own Drizzle roles and table definitions (`anonRole`, `authenticatedRole`, `serviceRole`, `authUid`, `authUsers`, ...) so a schema author has a single import.

### Driver-result readers

**File:** `packages/core/src/utilities/drizzle-result.utility.ts`

Drizzle does not unify its raw query-result shape across Postgres drivers, and the difference is invisible once a connector is typed on the shared `PgDatabase` base: `node-postgres` resolves to `{ rows, rowCount }`, postgres-js to an array carrying `count`. `readAffectedRowCount({ result })` and `readResultRows({ result })` are the two runtime readers that know the difference. They take `unknown`, import no driver, and **throw** on a shape neither driver produces - returning `0` or `[]` there would turn a driver mismatch into a silently wrong answer (zero rows on a committed write, zero policy lines for an authorized user).

## Security Fixes

### RLS role interpolation

**Vulnerability:** `SET LOCAL ROLE $1` is not valid SQL, so the role must be interpolated. A role taken straight from a JWT and interpolated unvalidated is a privilege-escalation vector.

**Fix:** `withAuthContext` validates the role against `/^[a-z_][a-z0-9_]*$/` before issuing any statement, and binds `request.jwt.claims` as a parameter rather than interpolating it.

```typescript
// Before: an attacker-controlled role claim could inject SQL into `SET LOCAL ROLE ...`
// After: a role that is not a bare identifier throws before any statement runs; claims are bound
```

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/connectors/postgres/drivers/driver.ts` | New. `IRelationalDriver` / `IRelationalConnection` / `IStatementResult` contracts |
| `src/connectors/postgres/drivers/node-postgres.ts` | New. `NodePostgresDriver` (pg); destroys the connection on `release({ destroy: true })` |
| `src/connectors/postgres/drivers/postgres-js.ts` | New. `PostgresJsDriver` (postgres >= 3.4.0); reserves a connection for BEGIN/COMMIT, cannot destroy |
| `src/connectors/postgres/drivers/resolve.ts` | New. `resolveDatabaseDriver` - structural detection + lazy import of the matching driver |
| `src/connectors/postgres/drivers/index.ts` | New. Exports only the contract + `resolveDatabaseDriver` (never a concrete driver) |
| `src/connectors/postgres/supabase/pooler.ts` | New. `PoolerModes` + `buildPostgresJsOptions` |
| `src/connectors/postgres/supabase/rls.ts` | New. `withAuthContext` (transaction-scoped claims + role, guarded) |
| `src/connectors/postgres/supabase/index.ts` | New. Re-exports pooler/rls + Supabase Drizzle roles |
| `src/utilities/drizzle-result.utility.ts` | New. `readAffectedRowCount` / `readResultRows` driver-shape readers |
| `src/utilities/index.ts` | Export the new drizzle-result readers |
| `src/connectors/postgres/datasources/abstract.ts` | `driver`/`resolveDriver`/`useDriver`/`getClient`; `pool` deprecated; `Client` generic |
| `src/connectors/postgres/datasources/base.ts` | Transaction lifecycle: BEGIN-leak fix, commit/rollback throw + destroy, commit/rollback race guard |
| `src/connectors/postgres/datasources/common/types.ts` | `TRelationalConnector`; `IDatabaseTransaction.connector` retyped; deprecated aliases retained |
| `src/connectors/postgres/index.ts` | Re-export the drivers barrel (contract + resolver only) |
| `packages/core/package.json` | `pg` + `postgres` optional peers; new sub-path exports; grpc export path fixed |

## Migration Guide

> [!NOTE]
> Follow these steps if you are upgrading from a previous version.

### Step 1: Wrap `rollback()` in its own try

Any `catch` block that calls `rollback()` must nest its own try so a rollback failure cannot mask the original error. See Breaking Change 1 above for the before/after.

### Step 2: Treat `commit()` as fallible

A `commit()` that previously "always succeeded" can now throw. Ensure the surrounding `catch` handles it and does not, for example, send a success response before `commit()` resolves.

### Step 3: (Optional) migrate the connector type alias

Replace `TNodePostgresTransactionConnector` / `TNodePostgresConnector` with `TRelationalConnector`. The old names remain as `@deprecated` aliases, so this is not urgent.

### Step 4: (Optional) install the driver you use

`pg` and `postgres` are now optional peers. If your build tooling prunes optional peers, install the one you use explicitly:

```bash
bun add pg        # node-postgres
bun add postgres  # postgres-js (Supabase transaction pooler)
```
