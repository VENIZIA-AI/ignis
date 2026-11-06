---
title: "@venizia/ignis-connectors/postgres/pglite"
description: "Every export of @venizia/ignis-connectors/postgres/pglite, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/postgres/pglite`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

3 exports, 3 with TSDoc.

## `PGliteDriver`

*class*

Postgres compiled to WASM, in-process. Reports PostgreSQL 18.x, so the dialect works unchanged.

One session only, and a second `BEGIN` neither nests nor errors - it joins the open transaction,
so the outer COMMIT commits the inner writer's rows. Hence the 1-slot pool behind `acquire()`.

Consequence: a `createConnector()` write - the path all repositories take - runs INSIDE any open
transaction and dies with its ROLLBACK. Under concurrency, write through `acquire()`.

```ts
export declare class PGliteDriver<Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema> implements TRelationalDriver<Schema, PGlite> {
    private readonly client;
    /**
     * The pooled resource IS the single client, so `create()` always hands back the same instance.
     * The pool contributes the mutual exclusion PGlite lacks, not connection multiplicity.
     */
    private readonly slot;
    private readonly logger;
    /**
     * A leaked transaction never releases the one slot, so without a timeout every later `acquire()`
     * in the process hangs forever and silently. 30s outlasts any honest transaction on an in-process
     * database with no network in it, and turns a leak into a named error instead of a dead process.
     */
    static readonly DEFAULT_ACQUIRE_TIMEOUT_MS = 30000;
    /**
     * PGlite's Emscripten runtime plants this status on the HOST process during ordinary operation -
     * measured on `@electric-sql/pglite` 0.5.5, `process.exitCode` is `undefined` before the first
     * query and 99 after it, and every later query re-arms it. A server that shuts down cleanly then
     * exits 99, which Docker, systemd and CI all read as a crash.
     *
     * Named rather than inlined so a future PGlite using a different status stops matching and makes
     * the problem visible again, instead of {@link end} silently forcing a zero it did not verify.
     */
    private static readonly WASM_HOST_EXIT_STATUS;
    constructor(opts: TPGliteDriverOptions);
    createConnector(opts: {
        schema: Schema;
    }): TRelationalConnector<Schema>;
    acquire(opts: {
        schema: Schema;
    }): Promise<TRelationalConnection<Schema>>;
    getClient(): PGlite;
    end(): Promise<void>;
    /**
     * Clears the exit status PGlite planted on the host - see {@link WASM_HOST_EXIT_STATUS} - and
     * only while it still holds exactly that value, so an exit code the application set itself
     * survives untouched.
     *
     * `globalThis.process` is bound to a local and never member-accessed as `globalThis.process.x`:
     * this driver has to bundle clean for a browser target, where the property read yields
     * `undefined` and the optional chain short-circuits, while the member-access spelling is what the
     * purity gate treats as fatal.
     */
    private clearWasmHostExitStatus;
    /**
     * The pool's destroy hook. A failed COMMIT/ROLLBACK may leave the session inside a transaction,
     * and the next borrower would inherit it. `ROLLBACK` outside a transaction is a no-op, so this is
     * safe whichever state the session is actually in.
     */
    private scrubSession;
}
```

Source: `packages/connectors/src/relational/postgres/drivers/pglite.ts`

## `TPGliteDataSource`

*type*

A Postgres datasource whose client is PGlite: what `PGliteCRUDRepository` takes and what its `dataSource` is.

```ts
export type TPGliteDataSource = IPostgresDataSource<{}, TAnyDataSourceSchema, {}, PGlite>;
```

Source: `packages/connectors/src/relational/postgres/repositories/core/pglite.ts`

## `TPGliteDriverOptions`

*type*

Pool knobs the driver forwards, minus `size`: one slot IS the mutual exclusion PGlite lacks.

```ts
export type TPGliteDriverOptions = Omit<IPoolControlOptions, 'size'> & {
    client: PGlite;
};
```

Source: `packages/connectors/src/relational/postgres/drivers/pglite.ts`
