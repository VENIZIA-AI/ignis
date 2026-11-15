---
title: The relational column and SQLite connector types stop using any
description: "The jValue column of the data-type enrichers is a Record<string, unknown>, and TSqliteConnector leaves the driver's run result as unknown."
packages: ['@venizia/ignis-connectors']
migration:
  - id: jvalue-column-is-unknown-record
    symbols: [PostgresDataTypeEnricher, SqliteDataTypeEnricher]
    upgrade:
      before: |
        const row = await repository.findById({ id: 1 });
        const label: string = row?.jValue?.label; // jValue was Record<string, any>
      after: |
        // jValue is Record<string, unknown>: narrow what you read
        const label = row?.jValue?.label;
        const text = typeof label === 'string' ? label : undefined;
    downgrade:
      steps:
        - "Read jValue without a narrow again; the older values were any."
  - id: jvalue-column-writers
    symbols: [PostgresDataTypeEnricher, SqliteDataTypeEnricher]
    upgrade:
      before: |
        // meta is an interface-typed value (IMeta): Record<string, any> accepted it
        interface IMeta { label: string }
        await repository.create({ data: { jValue: meta } }); // TS2769 now: no index signature
      after: |
        // jValue is Record<string, unknown>: spread the interface value, or declare the shape as a type alias
        await repository.create({ data: { jValue: { ...meta } } });
    downgrade:
      steps:
        - "Pass the interface value directly again; the older column type accepted it."
  - id: sqlite-connector-run-result-unknown
    symbols: [TSqliteConnector, TSqliteConnection, TSqliteDriver]
    upgrade:
      before: |
        const connector: TSqliteConnector = dataSource.getConnector();
        const result = await connector.run(sql`select 1`);
        result.rowsAffected; // any
      after: |
        // the run result slot is unknown (the drivers disagree on it): the repositories read it through the driver
        const connector: TSqliteConnector = dataSource.getConnector();
        const result: unknown = await connector.run(sql`select 1`);
    downgrade:
      steps:
        - "Read the run result as any again."
  - id: sqlite-connector-parameter-type
    symbols: [TSqliteConnector]
    upgrade:
      before: |
        // a helper that spelled the connector type with the driver's own result
        const migrate = (connector: BaseSQLiteDatabase<'async', ResultSet, TAnyDataSourceSchema>) => connector.run(sql`select 1`);
        await migrate(dataSource.getConnector()); // TS2345 now: the run result slot is unknown
      after: |
        // type the parameter as TSqliteConnector and read the run result as unknown
        const migrate = (connector: TSqliteConnector) => connector.run(sql`select 1`);
        await migrate(dataSource.getConnector());
    downgrade:
      steps:
        - "Spell the parameter with the driver's result type again."
---

# Changelog - 2026-11-15

## The relational column and SQLite connector types stop using any

<Badge type="warning" text="Breaking Change" />

**In one line.** `jValue` is a `Record<string, unknown>` and `TSqliteConnector`'s run result is `unknown`; nothing changes at runtime.

## Who is affected

- **Code that reads or writes a `jValue` property with an interface-typed value, reads a SQLite connector's `run()` result without narrowing it, or spells the SQLite connector type with the driver's own result.** See the migration above.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> These are type-level breaks. The typecheck names each line.

**Before:**

```typescript
const label: string = row?.jValue?.label;
const result = await connector.run(sql`select 1`);
result.rowsAffected;
```

**After:**

```typescript
const label = typeof row?.jValue?.label === 'string' ? row.jValue.label : undefined;
const result: unknown = await connector.run(sql`select 1`);
```
