---
title: Postgres Driver Seam & Supabase
description: The Postgres connector supports two interchangeable drivers, ships a Supabase submodule, and makes failed commit() and rollback() throw instead of silently succeeding.
packages: ['@venizia/ignis']
---

# Changelog - 2026-07-11

## Postgres Driver Seam & Supabase

<Badge type="warning" text="Breaking Change" /> <Badge type="danger" text="Security" /> <Badge type="tip" text="New Feature" /> <Badge type="info" text="Bug Fix" />

**In one line.** You can use either `node-postgres` or `postgres-js` with the Postgres connector, use the new Supabase submodule, and a failed `commit()` or `rollback()` now throws instead of looking like it worked.

## What changed

- **Two drivers.** Both `node-postgres` (`pg`) and `postgres-js` (`postgres`) now implement one `IRelationalDriver` contract and can back a datasource.
- **Transactions fail loudly.** `commit()` and `rollback()` throw when the database operation fails. Before, a failed `COMMIT` resolved, so the transaction looked committed but nothing was written. IGNIS destroys the connection behind a failed commit or rollback instead of returning it to the pool. A failed `BEGIN` no longer leaks its connection.
- **`pg` and `postgres` are optional peers.** An app that uses one never needs to install the other.
- **New sub-paths.** `@venizia/ignis/postgres/node-postgres`, `@venizia/ignis/postgres/postgres-js` and `@venizia/ignis/postgres/supabase`.
- **Supabase submodule.** Supavisor pooler presets (`PoolerModes`, `buildPostgresJsOptions`) and a transaction-scoped RLS helper, `withAuthContext({ transaction, claims, role? })`. It sets `request.jwt.claims` and `SET LOCAL ROLE`, so `auth.uid()` works in RLS policies under a transaction pooler. `role` defaults to the JWT's `role` claim.
- **Security fix.** The RLS role is now validated against a strict identifier pattern before use. This closes a SQL-injection path through a JWT-supplied role claim.
- **Fixed.** The `@venizia/ignis/grpc` export pointed at a missing directory and threw `ERR_MODULE_NOT_FOUND`.

## Who is affected

- **Apps that call `commit()` or `rollback()` directly, or import `TNodePostgresTransactionConnector`.** See breaking changes.
- **Supabase users.** The submodule is opt-in.
- **Apps that install only one of `pg` or `postgres`.** No action needed.

## Breaking changes

1. **`commit()` and `rollback()` throw on failure.** Put the rollback in its own `try` so a rollback failure never hides the original error.

   ```typescript
   // Before
   try {
     await userRepository.create({ data: user, options: { transaction } });
     await transaction.commit(); // a failed COMMIT resolved silently
   } catch (error) {
     await transaction.rollback(); // could throw and mask `error`
     throw error;
   }

   // After
   try {
     await userRepository.create({ data: user, options: { transaction } });
     await transaction.commit(); // throws if COMMIT fails
   } catch (error) {
     try {
       await transaction.rollback();
     } catch (rollbackError) {
       // log and continue
     }
     throw error;
   }
   ```

2. **`IDatabaseTransaction.connector` is retyped** to `TRelationalConnector<Schema>`. `TNodePostgresTransactionConnector` and `TNodePostgresConnector` remain as `@deprecated` aliases, so existing code still compiles.

   ```typescript
   // Before
   import type { TNodePostgresTransactionConnector } from '@venizia/ignis/postgres';

   // After
   import type { TRelationalConnector } from '@venizia/ignis/postgres';
   ```

3. **Build tooling that prunes optional peers.** Install the driver you use:

   ```bash
   bun add pg        # node-postgres
   bun add postgres  # postgres-js (needed for the Supabase transaction pooler)
   ```

## Details

- `buildPostgresJsOptions({ mode: PoolerModes.TRANSACTION })` returns `{ prepare: false }`, which Supavisor's transaction pool mode requires.
- After a failed `COMMIT`, `node-postgres` discards the poisoned connection. `postgres-js` cannot, so it returns the connection to its pool.

## See also

- [Postgres Drivers & Supabase](/guides/core-concepts/persistent/postgres-drivers)
- [Transactions](/guides/core-concepts/persistent/transactions)
- [Connectors Consistency Hardening](/changelogs/2026-07-11-connectors-consistency-hardening)
