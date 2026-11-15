---
title: The relational query internals take unknown, not any
description: "IQueryHandlerOptions defaults to unknown, the filter and update builders take unknown operands, the repository's deprecated updateBuilder may be undefined, and the dialect merge defaults are gone."
packages: ['@venizia/ignis-kernel', '@venizia/ignis-connectors']
migration:
  - id: query-handler-options-unknown
    symbols: [IQueryHandlerOptions]
    upgrade:
      before: |
        const handler = (opts: IQueryHandlerOptions) => like(opts.column, opts.value); // value: any
      after: |
        // value is unknown: build the fragment with a template, as the shipped handlers do, or narrow it first
        const handler = (opts: IQueryHandlerOptions) => sql`${opts.column} like ${opts.value}`;
        const lengthHandler = (opts: IQueryHandlerOptions) =>
          typeof opts.value === 'string' ? sql`length(${opts.column}) = ${opts.value.length}` : undefined;
    downgrade:
      steps:
        - "Use IQueryHandlerOptions without a type argument and read value freely; the older default was any."
  - id: filter-builder-hooks
    symbols: [FilterBuilder, buildValueCondition, buildOperatorConditions, toOperatorObject, isOperatorObject]
    upgrade:
      before: |
        class MyFilterBuilder extends FilterBuilder {
          protected override buildValueCondition(opts: { column: any; value: any }): SQL { ... }
          protected override buildOperatorConditions(opts: { column: any; value: Record<string, any> }): SQL[] { ... }
        }
      after: |
        // the protected hooks take column: AnyColumn | SQL and value: unknown (Record<string, unknown> for operators);
        // an SQL.Aliased no longer type-checks as a column. toOperatorObject is new: it answers the operator record or undefined.
        class MyFilterBuilder extends FilterBuilder {
          protected override buildValueCondition(opts: { column: AnyColumn | SQL; value: unknown }): SQL { ... }
          protected override buildOperatorConditions(opts: {
            column: AnyColumn | SQL;
            value: Record<string, unknown>;
          }): SQL[] { ... }
        }
    downgrade:
      steps:
        - "Type the overrides' column and value as any again; the older signatures accepted them."
  - id: select-projection-is-flat
    symbols: [TColumnSelection, ISelectOptions, PostgresQueryExecutor, SqliteQueryExecutor]
    upgrade:
      before: |
        // a subclass that hands the executor a nested selection
        this.queryExecutor.select({ connector, table, columns: { meta: { id: table.id } } });
      after: |
        // a projection is flat: every entry is a column or an SQL expression (SQL, SQL.Aliased)
        this.queryExecutor.select({ connector, table, columns: { id: table.id, label: sql`upper(${table.name})` } });
    downgrade:
      steps:
        - "Pass the nested selection again; the older executors cast it through to Drizzle."
    data: "The old executors passed the selection to Drizzle with a cast, so a nested object or a whole table reached Drizzle unchecked. The same call now throws '[toSelectedFields] Invalid column selection'. The repositories in this framework build flat selections only; the break reaches a subclass that calls the executor itself, for select columns or for returning."
  - id: update-builder-may-be-undefined
    symbols: [PersistableRelationalRepository, IRelationalQueryDialect]
    upgrade:
      before: |
        repository.updateBuilder.transform({ data }); // deprecated getter, typed any
      after: |
        // the getter answers RelationalUpdateBuilder | undefined: check it, or use the dialect's own
        const builder = repository.updateBuilder;

        if (builder) {
          builder.transform({ data });
        }
    downgrade:
      steps:
        - "Call repository.updateBuilder directly again; the older getter was typed any."
  - id: transformed-update-data-unknown
    symbols: [ITransformedUpdateData, RelationalUpdateBuilder, FilterBuilder]
    upgrade:
      before: |
        const { regularFields } = builder.transform({ data });
        const name: string = regularFields.name; // any
      after: |
        const { regularFields } = builder.transform({ data });
        const name = typeof regularFields['name'] === 'string' ? regularFields['name'] : undefined;
        // a builder subclass overriding a hook typed any still compiles: the hooks take unknown now
    downgrade:
      steps:
        - "Read regularFields without a narrow again; the older values were any."
  - id: visible-properties-are-columns
    symbols: [getVisibleProperties]
    upgrade:
      before: |
        const visible = repository.getVisibleProperties(); // Record<string, any> | undefined
      after: |
        // a Record<string, AnyColumn> | undefined: the columns a read exposes
        const visible = repository.getVisibleProperties();
    downgrade:
      steps:
        - "Read the visible properties as a Record<string, any> again."
  - id: dialect-merge-defaults-removed
    symbols: [IRelationalQueryDialect, ScopeFilterDenial, ScopeResolution, PersistableRelationalRepository]
    upgrade:
      before: |
        const merged = dialect.mergeFilter({ defaultFilter, userFilter }); // T defaulted to any
      after: |
        // name the row type
        const merged = dialect.mergeFilter<IRow>({ defaultFilter, userFilter });
        // ScopeFilterDenial.where<IRow>() and ScopeResolution.normalize<IRow>() name the row type too;
        // applyScopeFilter and applyDefaultFilter now default it to the repository's DataObject, not any
    downgrade:
      steps:
        - "Drop the type argument; the older T defaulted to any."
---

# Changelog - 2026-11-15

## The relational query internals take unknown, not any

<Badge type="warning" text="Breaking Change" />

**In one line.** The relational filter, update and operator internals no longer say `any`: you name or narrow what you read, and the SQL is unchanged. The one runtime change is that an executor refuses a nested projection (see Selections).

## What changed

- **Operators.** `IQueryHandlerOptions` defaults its value to `unknown`; the `like` family builds its own `sql` fragment, the same one Drizzle builds.
- **Builders.** The `FilterBuilder` and `UpdateBuilder` hooks take `unknown` operands. `ITransformedUpdateData.regularFields` and `getVisibleProperties()` are typed.
- **Repository.** The deprecated `updateBuilder` getter answers `RelationalUpdateBuilder | undefined`, and `IRelationalQueryDialect` has an optional `updateBuilder`.
- **Dialect.** `mergeFilter`, `composeScope` and the scope helpers lose their `= any` default.
- **Selections.** A column selection passed to the Postgres or SQLite executors is flat: every entry is a column or an SQL expression (`SQL`, `SQL.Aliased`), as the repository always builds them. A nested object or a whole table, which the old cast let through to Drizzle, is refused with an error, for `columns` and for `returning`.

## Who is affected

- **Code that overrides a builder hook typed `any`, reads `regularFields` or `getVisibleProperties()` untyped, calls `repository.updateBuilder` without a check, or calls `mergeFilter` or `composeScope` with no type argument.** See the migration below.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> These are type-level breaks. The typecheck names each line.

**Before:**

```typescript
repository.updateBuilder.transform({ data });
```

**After:**

```typescript
repository.updateBuilder?.transform({ data });
```
