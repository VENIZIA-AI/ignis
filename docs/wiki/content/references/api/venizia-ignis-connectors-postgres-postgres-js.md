---
title: "@venizia/ignis-connectors/postgres/postgres-js"
description: "Every export of @venizia/ignis-connectors/postgres/postgres-js, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/postgres/postgres-js`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

1 exports, 1 with TSDoc.

## `PostgresJsDriver`

*class*

Driver over a `postgres` (postgres-js) `Sql` client. Throws on construction if the client lacks `reserve()` or `unsafe()`, such as a `pg.Pool`.

```ts
export declare class PostgresJsDriver<Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema> implements TRelationalDriver<Schema, Sql> {
    /** The engine this driver speaks; the migration ledger reads it (see {@link RelationalDialects}). */
    readonly dialect = "postgres";
    private readonly client;
    constructor(opts: {
        client: Sql;
    });
    createConnector(opts: {
        schema: Schema;
    }): TRelationalConnector<Schema>;
    acquire(opts: {
        schema: Schema;
    }): Promise<TRelationalConnection<Schema>>;
    getClient(): Sql;
    end(): Promise<void>;
}
```

Source: `packages/connectors/src/relational/postgres/drivers/postgres-js.ts`
