---
title: RepositoryDouble gives a repository double the real runInTransaction
description: "RepositoryDouble.withTransactions, from @venizia/ignis/testing, installs the repository's own runInTransaction on a hand-made double, so a service that opens a transaction runs in a unit test."
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-04

## RepositoryDouble gives a repository double the real runInTransaction

<Badge type="tip" text="New Feature" />

**In one line.** `RepositoryDouble.withTransactions({ repository, transaction, source })` from `@venizia/ignis/testing` gives a hand-made repository double the repository's own `runInTransaction`, so a service that opens a transaction runs in a unit test with no database.

## What changed

- **One helper.** It installs `runInTransaction` and the two private helpers it calls (`rollbackOwnedTransaction`, `resolveEndedByExecute`) from the prototype of `source`, a repository class you pass (`DefaultCRUDRepository`), and sets `beginTransaction` to return the `transaction` you pass. Nothing is reimplemented, so the double commits, rolls back and joins as a repository does.
- **No driver at import.** `source` is passed in, so the testing entry imports no repository code and loads without the database driver, like the transaction doubles.
- **No casts.** Reaching the private helpers needed a cast in every test suite that copied them. The helper reads them for you.
- **A logger.** `runInTransaction` logs when it joins a transaction with options and when a rollback fails. The helper gives the double a logger; pass `logger` to use your own. It overwrites any `runInTransaction`, `beginTransaction` or `logger` the double already had.

## Who is affected

- **Tests that copy `runInTransaction` onto a repository double.** Replace the copy with the helper.
- **Everyone else.** No action needed. Nothing in production code changes.

## Details

```typescript
import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';
import { PostgresTransactionDouble, RepositoryDouble } from '@venizia/ignis/testing';

const transaction = new PostgresTransactionDouble();
const create = mock(async (opts: { data: { name: string } }) => opts.data);
const repository = RepositoryDouble.withTransactions({
  repository: { create },
  transaction,
  source: DefaultCRUDRepository,
});

await repository.runInTransaction({
  execute: ({ transaction: owned }) => repository.create({ data: { name: 'a' }, options: { transaction: owned } }),
});

transaction.commitCount; // 1
```

Pass a fresh transaction double per test: a handle that has ended stays ended.
