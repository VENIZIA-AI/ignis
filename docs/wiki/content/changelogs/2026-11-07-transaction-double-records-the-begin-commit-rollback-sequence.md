---
title: TransactionDouble records the begin, commit and rollback sequence
description: "TransactionDouble.events lists, in order, each begin, commit and rollback that reached the double, so a test asserts the order of a flow without a hand-made beginTransaction stub."
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-07

## TransactionDouble records the begin, commit and rollback sequence

<Badge type="tip" text="Feature" />

**In one line.** A test that checks a flow begins before it writes, or rolls back on an error, reads `transaction.events` instead of stubbing `beginTransaction` by hand.

## What changed

- **`events`.** `TransactionDouble` (and `PostgresTransactionDouble`, `SqliteTransactionDouble`) has a read-only `events` list of `'begin' | 'commit' | 'rollback'`, in the order they reached the double. It is a snapshot: an event that comes later is not in a list read earlier.
- **Begin.** `RepositoryDouble.withTransactions` records a `'begin'` each time the code under test opens the transaction. A call that joins a transaction it was given opens nothing and records no begin.
- **Commit and rollback.** Recorded where `commitCount` and `rollbackCount` go up. An end the handle refuses (a second commit) is not recorded.
- **`recordBegin()`.** A test that builds its own `beginTransaction` stub calls it to record the begin the same way.
- **Unchanged.** `commitCount`, `rollbackCount`, `state` and the `onCommit` and `onRollback` hooks work as before.

```ts
const transaction = new PostgresTransactionDouble();
const repository = RepositoryDouble.withTransactions({ repository: { create }, transaction, source: DefaultCRUDRepository });

await service.createOrder(repository);

expect(transaction.events).toEqual(['begin', 'commit']);
```

## Who is affected

Nobody needs to act. It adds a getter and a method.

## Details

| File | Package |
|------|---------|
| `src/testing/transaction-double.ts` | connectors |
| `src/testing/repository-double.ts` | connectors |
