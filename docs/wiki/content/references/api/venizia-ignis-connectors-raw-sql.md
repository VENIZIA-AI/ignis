---
title: "@venizia/ignis-connectors/raw-sql"
description: "Every export of @venizia/ignis-connectors/raw-sql, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/raw-sql`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

8 exports, 8 with TSDoc.

## `BaseRawSqlDataSource`

*class*

Datasource for an engine that only runs raw SQL and returns rows. It has the normal lifecycle
(configure, driver wiring from `@datasource({ driver })` or `useDriver`, close once, soft-evict
after a secret rotation) and nothing else: no dialect, no executor, no connection string, no
transactions - `beginTransaction()` stays the kernel's NotSupported and `getCapabilities()` says
`{ transactions: false }`.

`configure()` stays app-written: build the engine's client and assign `this.client`. IGNIS ships
no engine connector; the app supplies one `IRawSqlConnector` and one driver (see the
"Raw SQL engines" guide).

```ts
export declare abstract class BaseRawSqlDataSource<Settings extends object = {}, Client = unknown, TConnector extends IRawSqlConnector = IRawSqlConnector, ConfigurableOptions extends object = {}> extends AbstractDriverDataSource<Settings, TRawSqlSchema, ConfigurableOptions, Client, TConnector, TRawSqlDriver<TConnector, Client>> {
    constructor(opts: {
        name: string;
        config: Settings;
    });
    /** The statement run through the connector, so a caller holding the datasource needs no connector in hand. */
    execute(query: TRawSqlQuery): Promise<IRawSqlResult>;
}
```

Source: `packages/connectors/src/raw-sql/datasource.ts`

## `BaseRawSqlRepository`

*class*

A repository over a raw-SQL engine: it holds the datasource and reads `this.connector`, typed by
the connector the datasource was built with, so `this.connector.execute(...)` needs no cast. It
has no CRUD verbs - the subclass writes its own statements.

Bind it with a datasource and no model, the same shape a remote repository has:
`@repository({ type: RepositoryTypes.REMOTE, dataSource: ReportDataSource })`.

```ts
export declare abstract class BaseRawSqlRepository<TConnector extends IRawSqlConnector = IRawSqlConnector> extends BaseHelper implements IRepository {
    dataSource: BaseRawSqlDataSource<AnyType, AnyType, TConnector>;
    entity: AbstractEntity;
    constructor(dataSource: BaseRawSqlDataSource<AnyType, AnyType, TConnector>);
    getEntity(): AbstractEntity;
    /** The engine's connector, typed by the generic this repository was declared with. */
    get connector(): TConnector;
    /** `this.connector.execute(query)`, for a repository that runs a statement and reads the rows. */
    protected execute(query: TRawSqlQuery): Promise<IRawSqlResult>;
}
```

Source: `packages/connectors/src/raw-sql/repository.ts`

## `IRawSqlConnector`

*interface*

The connector of an engine that only runs SQL and returns rows - an analytics engine beside the
main database (ClickHouse, DuckDB, BigQuery). No query builder, no dialect, no transactions: a
repository writes the statement and reads `rows`.

```ts
export interface IRawSqlConnector {
    execute(query: TRawSqlQuery): Promise<IRawSqlResult>;
}
```

Source: `packages/connectors/src/raw-sql/common/types.ts`

## `IRawSqlResult`

*interface*

The only thing a raw-SQL engine promises back: its rows.

```ts
export interface IRawSqlResult {
    rows: Array<Record<string, unknown>>;
}
```

Source: `packages/connectors/src/raw-sql/common/types.ts`

## `RawSqlEntity`

*class*

A raw-SQL repository has a name but no model and no schema.

```ts
export declare class RawSqlEntity extends AbstractEntity {
    getSchema<T = unknown>(_opts: {
        type: TSchemaType;
    }): T;
}
```

Source: `packages/connectors/src/raw-sql/repository.ts`

## `TRawSqlDriver`

*type*

A driver with `createConnector`, `getClient` and `end`, and nothing else: a raw-SQL engine has no transactions to acquire a connection for.

```ts
export type TRawSqlDriver<TConnector extends IRawSqlConnector = IRawSqlConnector, Client = unknown> = IConnectorDriver<TConnector, Client>;
```

Source: `packages/connectors/src/raw-sql/common/types.ts`

## `TRawSqlQuery`

*type*

What a raw-SQL engine runs: a statement as text, or a Drizzle `sql` template (the engine's connector turns it into text).

```ts
export type TRawSqlQuery = string | SQLWrapper;
```

Source: `packages/connectors/src/raw-sql/common/types.ts`

## `TRawSqlSchema`

*type*

A raw-SQL datasource owns no schema: its statements are the repositories' own.

```ts
export type TRawSqlSchema = Record<string, never>;
```

Source: `packages/connectors/src/raw-sql/common/types.ts`
