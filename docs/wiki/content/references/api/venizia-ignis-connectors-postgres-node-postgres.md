---
title: "@venizia/ignis-connectors/postgres/node-postgres"
description: "Every export of @venizia/ignis-connectors/postgres/node-postgres, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/postgres/node-postgres`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

1 exports, 1 with TSDoc.

## `NodePostgresDriver`

*class*

Driver over a `pg` `Pool`. Throws on construction if given anything without pool accounting, such as a bare `pg.Client`.

```ts
export declare class NodePostgresDriver<Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema> implements TRelationalDriver<Schema, Pool> {
    private readonly client;
    constructor(opts: {
        client: Pool;
    });
    createConnector(opts: {
        schema: Schema;
    }): TRelationalConnector<Schema>;
    acquire(opts: {
        schema: Schema;
    }): Promise<TRelationalConnection<Schema>>;
    getClient(): Pool;
    end(): Promise<void>;
}
```

Source: `packages/connectors/src/relational/postgres/drivers/node-postgres.ts`
