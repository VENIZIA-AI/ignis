---
title: "@venizia/ignis-connectors/testing"
description: "Every export of @venizia/ignis-connectors/testing, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/testing`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

12 exports, 12 with TSDoc.

## `IPostgresTransactionDoubleOptions`

*interface*

Options of `PostgresTransactionDouble`: the shared ones plus the `isolationLevel` it reports.

```ts
export interface IPostgresTransactionDoubleOptions<TConnector = never> extends ITransactionDoubleOptions<TConnector> {
    isolationLevel?: TIsolationLevel;
}
```

Source: `packages/connectors/src/testing/transaction-double.ts`

## `ISqliteTransactionDoubleOptions`

*interface*

Options of `SqliteTransactionDouble`: the shared ones plus the `beginMode` it reports.

```ts
export interface ISqliteTransactionDoubleOptions<TConnector = never> extends ITransactionDoubleOptions<TConnector> {
    beginMode?: TSqliteBeginMode;
}
```

Source: `packages/connectors/src/testing/transaction-double.ts`

## `ITransactionDoubleOptions`

*interface*

Options shared by the transaction doubles: the `connector` to expose, errors to throw on the first commit or rollback, and hooks to observe them.

```ts
export interface ITransactionDoubleOptions<TConnector = never> {
    /**
     * What the `connector` getter returns, typed as `TConnector`. Without it the getter throws and is typed
     * `never`. `TConnector` is inferred from the value, so a stub is passed as the real connector type
     * (`stub as unknown as TRelationalConnector`), or the type is named: `new PostgresTransactionDouble<TRelationalConnector>(...)`.
     */
    connector?: TConnector;
    /** Thrown by the first commit(), which then ends the transaction by failure. */
    commitError?: Error;
    /** Thrown by the first rollback(), which then ends the transaction by failure. */
    rollbackError?: Error;
    /** Called, and awaited, when a commit() reaches the end statement: after `commitCount` goes up, before `commitError` is thrown. */
    onCommit?: TTransactionDoubleHook;
    /** Called, and awaited, when a rollback() reaches the end statement: after `rollbackCount` goes up, before `rollbackError` is thrown. */
    onRollback?: TTransactionDoubleHook;
}
```

Source: `packages/connectors/src/testing/transaction-double.ts`

## `PostgresTransactionDouble`

*class*

The Postgres handle's shape: carries the isolation level the real BEGIN would have used.

```ts
export declare class PostgresTransactionDouble<TConnector = never> extends TransactionDouble<TConnector> {
    readonly isolationLevel: TIsolationLevel;
    constructor(opts?: IPostgresTransactionDoubleOptions<TConnector>);
}
```

Source: `packages/connectors/src/testing/transaction-double.ts`

## `RepositoryDouble`

*class*

Test helper that gives a hand-made repository double the real transaction behaviour, without a database.

```ts
export declare class RepositoryDouble {
    /**
     * Gives a hand-made repository double the real `runInTransaction`, so a service that opens a transaction runs in a
     * unit test without a database. The methods are `source`'s own, read off its prototype with the two private helpers
     * they call, so the double commits, rolls back and joins exactly as a repository does. `source` is a repository
     * class (`DefaultCRUDRepository`): this entry imports no repository code, so it loads without the database driver.
     * `beginTransaction` returns `transaction`: pass a fresh `TransactionDouble` per test, a handle that has ended stays ended.
     * When `transaction` is a `TransactionDouble`, each `beginTransaction` is recorded in its `events`, so a test can assert the order
     * of begin, commit and rollback; a call that joins a transaction it was given does not begin one.
     * It overwrites the double's own `runInTransaction`, `beginTransaction` and `logger`, and returns the same object.
     */
    static withTransactions<Repository extends object>(opts: {
        repository: Repository;
        transaction: IRelationalTransaction<unknown>;
        source: {
            prototype: RelationalBaseRepository;
        };
        logger?: ILogger;
    }): TRepositoryWithTransactions<Repository>;
}
```

Source: `packages/connectors/src/testing/repository-double.ts`

## `SqliteTransactionDouble`

*class*

The SQLite handle's shape: carries the locking mode the real BEGIN would have used.

```ts
export declare class SqliteTransactionDouble<TConnector = never> extends TransactionDouble<TConnector> {
    readonly beginMode: TSqliteBeginMode;
    constructor(opts?: ISqliteTransactionDoubleOptions<TConnector>);
}
```

Source: `packages/connectors/src/testing/transaction-double.ts`

## `TransactionDouble`

*class*

A transaction handle for unit tests, with no database behind it. It ends by the same rules as the
real handle and counts every commit() and rollback() that reached the end statement. `events` lists, in order,
each begin, commit and rollback that reached the double. Reading
`connector` returns the `connector` option when one was given; without it the read throws, and a
repository method that would reach the database must be stubbed.

```ts
export declare class TransactionDouble<TConnector = never> extends TransactionLifecycle implements IRelationalTransaction<TConnector> {
    #private;
    constructor(opts?: ITransactionDoubleOptions<TConnector>);
    get state(): TTransactionState;
    get commitCount(): number;
    get rollbackCount(): number;
    /**
     * Each begin, commit and rollback that reached the double, in the order they came: a snapshot, so a later event is
     * not in a list read earlier. A begin is recorded by `RepositoryDouble.withTransactions` when the code under test
     * opens the transaction; a call that joins this handle opens nothing and records no begin. A second end that the
     * handle refuses is not recorded: it never reached the end statement.
     */
    get events(): ReadonlyArray<TTransactionDoubleEvent>;
    /** Records a begin. `RepositoryDouble.withTransactions` calls it when `beginTransaction` hands this handle out; a test that builds its own `beginTransaction` stub calls it the same way. */
    recordBegin(): void;
    get connector(): TConnector;
    protected executeEnd(opts: {
        end: ITransactionEnd;
    }): Promise<void>;
}
```

Source: `packages/connectors/src/testing/transaction-double.ts`

## `TransactionStates`

*class*

Lifecycle states of a transaction handle: `ACTIVE` until it ends as `COMMITTED`, `ROLLED_BACK` or `FAILED`.

```ts
export declare class TransactionStates {
    static readonly ACTIVE = "ACTIVE";
    static readonly COMMITTED = "COMMITTED";
    static readonly ROLLED_BACK = "ROLLED_BACK";
    static readonly FAILED = "FAILED";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/connectors/src/relational/core/datasources/transaction-lifecycle.ts`

## `TRepositoryWithTransactions`

*type*

What `RepositoryDouble.withTransactions` adds: the real `runInTransaction`, with the same contract.

```ts
export type TRepositoryWithTransactions<Repository extends object> = Repository & Pick<RelationalBaseRepository, 'runInTransaction'>;
```

Source: `packages/connectors/src/testing/repository-double.ts`

## `TTransactionDoubleEvent`

*type*

What `TransactionDouble.events` records: a begin the repository double made, a commit or a rollback that reached the end statement.

```ts
export type TTransactionDoubleEvent = 'begin' | 'commit' | 'rollback';
```

Source: `packages/connectors/src/testing/transaction-double.ts`

## `TTransactionDoubleHook`

*type*

A hook a test passes to see an end statement; it may be async. It reads `state` as the end settles it
(COMMITTED or ROLLED_BACK). A throw from it fails the end, and its error is thrown in place of `commitError`/`rollbackError`.

```ts
export type TTransactionDoubleHook = () => void | Promise<void>;
```

Source: `packages/connectors/src/testing/transaction-double.ts`

## `TTransactionState`

*type*

One of the {@link TransactionStates} values.

```ts
export type TTransactionState = TConstValue<typeof TransactionStates>;
```

Source: `packages/connectors/src/relational/core/datasources/transaction-lifecycle.ts`
