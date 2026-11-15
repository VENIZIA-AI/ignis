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
        // name the value you read, or narrow it
        const handler = (opts: IQueryHandlerOptions<string>) => like(opts.column, opts.value);
    downgrade:
      steps:
        - "Use IQueryHandlerOptions without a type argument and read value freely; the older default was any."
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

**In one line.** The relational filter, update and operator internals no longer say `any`: you name or narrow what you read, and nothing changes at runtime.

## What changed

- **Operators.** `IQueryHandlerOptions` defaults its value to `unknown`; the `like` family builds its own `sql` fragment, the same one Drizzle builds.
- **Builders.** The `FilterBuilder` and `UpdateBuilder` hooks take `unknown` operands. `ITransformedUpdateData.regularFields` and `getVisibleProperties()` are typed.
- **Repository.** The deprecated `updateBuilder` getter answers `RelationalUpdateBuilder | undefined`, and `IRelationalQueryDialect` has an optional `updateBuilder`.
- **Dialect.** `mergeFilter`, `composeScope` and the scope helpers lose their `= any` default.
- **Selections.** A column selection passed to the Postgres or SQLite executors must be columns or SQL expressions (as the repository always builds them); another kind of value is refused with an error.

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
