---
type: Architecture
title: Transactions
description: How IGNIS opens explicit Postgres transactions, threads them through repository options, and guarantees that a failed COMMIT never resolves successfully.
resource: packages/connectors/src/relational/postgres/datasources/base.ts
tags: [architecture, transactions, postgres, correctness]
---

Transactions are a **relational-only** capability. `AbstractDataSource.getCapabilities()` returns `{ transactions: false }` and its `beginTransaction()` throws NotSupported (async, so callers get a rejected promise rather than a synchronous throw that skips their `try`/`catch`). Only the relational branch overrides both, split across two classes (see [Relational connector](/architecture/relational-connector.md)): the engine-neutral `BaseRelationalDataSource` (`connectors/relational`) acquires the connection, runs the BEGIN statement, and builds the `commit`/`rollback` closures; `BasePostgresDataSource` (`connectors/postgres`) supplies the BEGIN text itself and patches `isolationLevel` onto the returned handle.

## The API

```typescript
const transaction = await this.dataSource.beginTransaction();
try {
  await this.userRepository.create({ data, options: { transaction } });
  await transaction.commit();
} catch (error) {
  await transaction.rollback();
  throw error;
}
```

`beginTransaction(opts?: { isolationLevel })` checks out a **dedicated physical connection** from the driver (`driver.acquire({ schema })`), issues `BEGIN TRANSACTION ISOLATION LEVEL <level>` (default `READ COMMITTED`), and returns an `IDatabaseTransaction`: `{ isolationLevel, connector, isActive, commit(), rollback() }`. The isolation level is interpolated into the statement rather than bound, because `BEGIN TRANSACTION ISOLATION LEVEL $1` is not valid SQL - it is safe because the value comes from the `IsolationLevels` const-class, never from user input.

Repositories consume it through the options object. `RelationalBaseRepository.resolveConnector({ transaction })` returns the transaction's connector when one is passed and the pooled connector otherwise, throwing if the transaction is no longer active or is not a relational transaction. So `{ transaction }` is the only thing that redirects a query onto the transaction's connection.

## A failed COMMIT does not resolve successfully

Both `commit()` and `rollback()` are the same `finish()` closure. On a failed control statement it logs, marks the transaction failure-ended, destroys the connection, and **rethrows**. There is no path where a caller believes a failed COMMIT succeeded.

## Poisoned connections are never pooled

Every failure path releases with `{ destroy: true }` rather than returning the connection to the pool:

- a failed `BEGIN` - the connection was checked out but no caller ever receives a handle to release it, so leaking would exhaust the pool under repeated failures; the session state after a failed BEGIN is unknown, so it is destroyed rather than pooled;
- a failed `COMMIT` or `ROLLBACK` - the session may still hold an open transaction that the next borrower would silently inherit.

`IRelationalConnection.release({ destroy })` is part of the driver contract precisely so this is expressible for every driver.

## rollback() throws - so nest it

Because `finish()` rethrows, `rollback()` can throw. A bare `await transaction.rollback()` inside a `catch` will replace the original error with the rollback error. Handle it:

```typescript
catch (error) {
  try {
    await transaction.rollback();
  } catch (rollbackError) {
    this.logger.for('doWork').error('Rollback failed | Error: %s', rollbackError);
  }
  throw error;
}
```

There is one deliberate exception. `finish()` treats a **rollback after a failure-ended transaction** as a logged no-op instead of throwing `Transaction already ended`. The canonical caller pattern is `catch { await tx.rollback(); throw error; }`; after a failed commit the transaction is already torn down - nothing committed, connection destroyed - so the rollback request is satisfied by construction, and throwing would replace the caller's original error in every such catch block. A rollback on a *successfully* ended transaction still throws.

## Concurrency inside finish()

`isActive` is flipped to `false` **before** the `await`, not after. Two concurrent `finish()` calls (a commit racing a rollback) would otherwise both pass the guard, issue two control statements, and double-release the same physical connection.

## Interactions worth knowing

- **Row locking requires a transaction.** `validateLockOptions()` rejects `options.lock` without one, and rejects it on the Query API path (include/fields), because locking is only wired through the Core API's `.for(strength, config)`.
- **`shouldQueryRange` runs serially inside a transaction.** A transaction connector wraps a single `pg` client, so a parallel data+count pair would call `client.query()` while it is still busy. Outside a transaction the two run under `Promise.all`.
- **Search repositories reject transactions loudly.** `SearchBaseRepository.assertNoTransaction()` throws when `options.transaction` is passed, rather than silently running outside the transaction the caller expected.

## Related

- [Relational connector](/architecture/relational-connector.md)
- [DataSource Hierarchy](/architecture/datasource-hierarchy.md)
- [Repository Hierarchy](/architecture/repository-hierarchy.md)
- [Error Handling](/conventions/error-handling.md)
- [Gotchas](/conventions/gotchas.md)
