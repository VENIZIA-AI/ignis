---
title: "@venizia/ignis-connectors/sqlite/libsql"
description: "Every export of @venizia/ignis-connectors/sqlite/libsql, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/sqlite/libsql`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

2 exports, 2 with TSDoc.

## `LibSqlDriver`

*class*

Covers `:memory:`, a local file, remote Turso and embedded replicas. Chosen over `better-sqlite3`
and `bun:sqlite` for its async result kind - those block the event loop.

`acquire()` takes a 1-slot pool, not a second connection: `drizzle()` binds to a `Client`, never
to libsql's `Transaction`, and `client.transaction()` swaps the connection out - against
`:memory:` that is a DIFFERENT empty database.

Consequence: a query on the `createConnector()` connector while a transaction is open runs INSIDE
it. Route work that must stay outside one through `acquire()`.

```ts
export declare class LibSqlDriver<Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema> implements TSqliteDriver<Schema, Client> {
    /** The engine this driver speaks; the migration ledger reads it (see {@link RelationalDialects}). */
    readonly dialect = "sqlite";
    private readonly client;
    /**
     * The pooled resource IS the single client, so `create()` always hands back the same instance.
     * The pool contributes mutual exclusion, not connection multiplicity.
     */
    private readonly slot;
    private readonly logger;
    /**
     * A leaked transaction never releases the one slot, so without a timeout every later `acquire()`
     * in the process hangs forever and silently. 30s outlasts any honest SQLite write transaction -
     * one writer at a time is the engine's own limit - and turns a leak into a named error.
     */
    static readonly DEFAULT_ACQUIRE_TIMEOUT_MS = 30000;
    constructor(opts: TLibSqlDriverOptions);
    createConnector(opts: {
        schema: Schema;
    }): TSqliteConnector<Schema>;
    acquire(opts: {
        schema: Schema;
    }): Promise<TSqliteConnection<Schema>>;
    getClient(): Client;
    end(): Promise<void>;
    /**
     * The pool's destroy hook. A failed COMMIT/ROLLBACK may leave the connection inside a transaction
     * and the next borrower would inherit it. The client offers no way to ask whether one is open, so
     * the ROLLBACK is issued blind and its rejection is the ordinary answer of a clean connection.
     */
    private scrubSession;
}
```

Source: `packages/connectors/src/relational/sqlite/drivers/libsql.ts`

## `TLibSqlDriverOptions`

*type*

Pool knobs the driver forwards, minus `size`: one slot
IS the mutual exclusion a single connection lacks.

```ts
export type TLibSqlDriverOptions = Omit<IPoolControlOptions, 'size'> & {
    client: Client;
};
```

Source: `packages/connectors/src/relational/sqlite/drivers/libsql.ts`
