---
title: A Repository Method Runs Its Own Transaction, and a Double Stubs One In Tests
description: "runInTransaction begins, commits, and rolls back for you; TransactionDouble from @venizia/ignis/testing stubs beginTransaction() with no database behind it. The real transaction handle is now backed by a shared class - behavior unchanged."
---

# Changelog - 2026-09-26

## `runInTransaction` runs commit and rollback for you

<Badge type="tip" text="Feature" />

Hand-written begin / try / commit / catch / rollback blocks repeat wherever a repository method needs
a transaction. `runInTransaction` writes that block once:

```typescript
const order = await orderRepository.runInTransaction({
  execute: async ({ transaction }) => {
    const { data: created } = await orderRepository.create({
      data: orderData,
      options: { transaction },
    });

    await orderItemRepository.create({
      data: { orderId: created.id, ...itemData },
      options: { transaction },
    });

    return created;
  },
});
```

## Join or own, never both

Pass a `transaction` and `runInTransaction` joins it: it never commits or rolls back, and
`transactionOptions` is ignored. Pass none and it owns one: begins, commits on success, and rolls
back on failure - rethrowing the original error even when the rollback itself fails.

| | Joined (`transaction` passed) | Owned (none passed) |
|---|---|---|
| Begin | Never | `beginTransaction(transactionOptions)` |
| Commit | Never | After `execute` resolves |
| Rollback | Never | On failure, then rethrows the original error |

That turns a service method that must work stand-alone and nested inside a caller's transaction into
a one-line forward, not two code paths:

```typescript
async function createOrder(opts: { data: TOrderCreate; transaction?: IDatabaseTransaction }) {
  return orderRepository.runInTransaction({
    transaction: opts.transaction,
    execute: async ({ transaction }) =>
      orderRepository.create({ data: opts.data, options: { transaction } }),
  });
}
```

See [Transactions](/guides/core-concepts/persistent/transactions#runintransaction) for the full
rules, including what happens to an inactive handle and a failed rollback.

## `TransactionDouble` stubs a transaction with no database

<Badge type="tip" text="Feature" />

Unit-testing `runInTransaction` used to mean standing up Postgres or SQLite. `TransactionDouble`,
from the new `@venizia/ignis/testing` entry (`@venizia/ignis-connectors/testing` in the connectors
package), is a transaction handle with no database behind it:

```typescript
import { spyOn } from 'bun:test';
import { PostgresTransactionDouble } from '@venizia/ignis/testing';

const double = new PostgresTransactionDouble();
spyOn(orderRepository, 'beginTransaction').mockResolvedValue(double);

await orderRepository.runInTransaction({ execute: async () => 'ok' });

expect(double.commitCount).toBe(1);
```

Reading `double.connector` throws - a repository method that reaches the database must be stubbed
too. Inject `commitError` or `rollbackError` to test a failed end. See
[Transaction Doubles](/best-practices/testing-strategies#transaction-doubles) for the full guide,
including the limit: a double proves control flow, not SQL atomicity.

## If `execute` ends the owned transaction itself

`runInTransaction` expects `execute` to leave an owned transaction open for it to commit. Call
`commit()` or `rollback()` from inside `execute` instead, and `runInTransaction` never ends it a
second time: committed by `execute` - the result is returned, with no second commit attempt. Rolled
back or left failed by `execute` - a dedicated error, naming that `execute` ended the transaction
before it could be committed, with no rollback attempt. `execute` rejects after ending the
transaction itself - the ORIGINAL rejection, with no further rollback attempt. This reads the
transaction's own internal state, so it is reliable only for a handle IGNIS built (the real handle or
`TransactionDouble`) - given a transaction from another `ITransaction` implementation,
`runInTransaction` cannot tell whether `execute` already committed it, and reports the
"ended before it could be committed" error regardless.

## Who is affected

Additive. Nothing existing changes behavior, and adopting either API is optional.

One shape changed under the hood, not in behavior: the handle `beginTransaction()` returns is now a
class, `ConnectionTransaction`, instead of a closure building a fresh object literal each time. Its
datasource, connection, and internal state are ES private fields - invisible to `JSON.stringify`,
`util.inspect`, `Object.keys`, and a spread copy, exactly as before. `commit()`, `rollback()`, and
`connector` behave exactly as before, and reading `isActive` on the handle itself still works.

The one real difference: `isActive` now lives on the shared prototype, not as an own property. A
spread copy - `{ ...transaction }` - no longer carries it, so passing a spread copy to a repository
now throws "Transaction is no longer active" instead of working. Nothing in IGNIS does this.

**Files:**

- [`packages/connectors/src/relational/core/datasources/transaction-lifecycle.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/core/datasources/transaction-lifecycle.ts) - the shared end-of-transaction state machine
- [`packages/connectors/src/relational/core/datasources/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/core/datasources/base.ts) - the real handle, `ConnectionTransaction`
- [`packages/connectors/src/relational/core/repositories/core/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/core/repositories/core/base.ts) - `runInTransaction`
- [`packages/connectors/src/testing/transaction-double.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/testing/transaction-double.ts) - `TransactionDouble`, `PostgresTransactionDouble`, `SqliteTransactionDouble`
