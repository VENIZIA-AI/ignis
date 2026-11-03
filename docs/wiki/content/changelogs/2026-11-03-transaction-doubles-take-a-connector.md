---
title: The transaction doubles take a connector and commit hooks
description: "TransactionDouble, PostgresTransactionDouble and SqliteTransactionDouble take an optional connector, onCommit and onRollback."
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-03

## The transaction doubles take a connector and commit hooks

<Badge type="tip" text="Enhancement" />

**In one line.** `TransactionDouble`, `PostgresTransactionDouble` and `SqliteTransactionDouble` take an optional `connector`, so a service that reads `transaction.connector` can use a double, and optional `onCommit` and `onRollback` hooks.

## What changed

- **`connector` option.** When it is given, the `connector` getter returns it, typed as the connector type: inferred from the value, or named with a generic, as in `new PostgresTransactionDouble<TRelationalConnector>({ connector })`. When it is not given, the getter throws the same error as before and is typed `never`.
- **`onCommit` and `onRollback` hooks.** They can be sync or async, and they are awaited. They run when a commit or rollback reaches the end statement: after `commitCount` or `rollbackCount` goes up, before `commitError` or `rollbackError` is thrown. A hook that throws fails the end like an injected error. A second end that the double refuses does not call the hook again.
- **Generic over the connector.** The doubles are `TransactionDouble<TConnector = never>`, so code that already uses them compiles unchanged.
- **SQLite and PGlite.** `SqliteTransactionDouble` takes the same options. PGlite has no double of its own: its connector is the Postgres connector type, so `PostgresTransactionDouble` is the PGlite double.

## Who is affected

- **Tests of a service that reads `transaction.connector`.** Pass a `connector`.
- **Tests that assert a side effect of a commit or rollback.** Pass a hook instead of writing a subclass.
- **Everyone else.** No action needed. Nothing in production code changes.

## Details

```typescript
import { PostgresTransactionDouble } from '@venizia/ignis/testing';
import type { TRelationalConnector } from '@venizia/ignis-connectors/postgres';

const events: string[] = [];
const double = new PostgresTransactionDouble({
  connector: stubConnector as unknown as TRelationalConnector,
  onCommit: () => events.push('committed'),
  onRollback: () => events.push('rolled back'),
});

double.connector; // the stub, typed TRelationalConnector
```
