---
title: A Repository Method Runs Its Own Transaction, and a Double Stubs One In Tests
description: "runInTransaction begins, commits, and rolls back for you, and TransactionDouble from @venizia/ignis/testing stubs a transaction with no database behind it."
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-09-26

## `runInTransaction` runs commit and rollback for you

<Badge type="tip" text="Feature" />

**In one line.** You no longer hand-write begin, try, commit, catch and rollback in every repository method that needs a transaction.

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

Pass a `transaction` and `runInTransaction` joins it: it never commits or rolls back, and `transactionOptions` is ignored. Pass none and it owns one: it begins with `beginTransaction(transactionOptions)`, commits on success, and rolls back on failure, rethrowing the original error even when the rollback fails. A service method that must work stand-alone and nested is one forward:

```typescript
async function createOrder(opts: { data: TOrderCreate; transaction?: IDatabaseTransaction }) {
  return orderRepository.runInTransaction({
    transaction: opts.transaction,
    execute: async ({ transaction }) =>
      orderRepository.create({ data: opts.data, options: { transaction } }),
  });
}
```

If `execute` ends an owned transaction itself:

- Calling `commit()` inside `execute`: the result is returned, with no second commit.
- Calling `rollback()` inside `execute`, or leaving it failed: a dedicated error names that `execute` ended the transaction before it could be committed, with no rollback attempt.
- `execute` rejecting after ending the transaction: the original rejection, with no further rollback.
- Always `await` `commit()` and `rollback()` inside `execute`. An unawaited commit is read as committed before it settles, so `runInTransaction` can return while that commit goes on to fail.
- A transaction from an entirely different `ITransaction` implementation is unreadable and reports the "ended before it could be committed" error even if `execute` committed it.

See [Transactions](/guides/core-concepts/persistent/transactions#runintransaction).

## `TransactionDouble` stubs a transaction with no database

<Badge type="tip" text="Feature" />

**In one line.** Unit-test `runInTransaction` without standing up Postgres or SQLite.

`TransactionDouble` comes from the new `@venizia/ignis/testing` entry (`@venizia/ignis-connectors/testing` in the connectors package):

```typescript
import { spyOn } from 'bun:test';
import { PostgresTransactionDouble } from '@venizia/ignis/testing';

const double = new PostgresTransactionDouble();
spyOn(orderRepository, 'beginTransaction').mockResolvedValue(double);

await orderRepository.runInTransaction({ execute: async () => 'ok' });

expect(double.commitCount).toBe(1);
```

Reading `double.connector` throws, so a repository method that reaches the database must be stubbed too. Inject `commitError` or `rollbackError` to test a failed end. A double proves control flow, not SQL atomicity. See [Transaction Doubles](/best-practices/testing-strategies#transaction-doubles).

## Who is affected

Additive. Nothing existing changes behavior, and adopting either API is optional.

One small difference: `isActive` on the transaction handle `beginTransaction()` returns now lives on a shared prototype, not as an own property. A spread copy (`{ ...transaction }`) no longer carries it, so passing a spread copy to a repository now throws "Transaction is no longer active". Reading `isActive` through a `Proxy` or an `Object.create(transaction)` wrapper now throws a `TypeError`. Nothing in IGNIS does either.
