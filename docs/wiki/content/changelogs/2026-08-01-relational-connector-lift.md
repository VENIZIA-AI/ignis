---
title: Relational Connector Lift - Engine-Neutral SQL Tier
description: The SQL repository tier gains an engine-neutral @venizia/ignis/relational export, ten relational names are renamed to their Postgres spellings, and findById now accepts options.retry.
packages: ['@venizia/ignis']
---

# Changelog - 2026-08-01

## Relational Connector Lift - Engine-Neutral SQL Tier

<Badge type="danger" text="Breaking Change" /> <Badge type="tip" text="Enhancement" /> <Badge type="info" text="Bug Fix" /> <Badge type="warning" text="Behavior Change" />

**In one line.** The SQL repository and datasource tier now splits into an engine-neutral `@venizia/ignis/relational` and a Postgres branch, ten `*Relational*` names move to their Postgres spellings, and `findById` accepts `options.retry`.

**Upgrading?** Go to the [Migration guide](#migration-guide). Every break is a rename, so `tsc` finds all of them.

## What changed

- **New engine-neutral tier** at `@venizia/ignis/relational`, beside `@venizia/ignis/postgres`. It is not merged into the root barrel. A second SQL engine plugs in through `getQueryDialect()` and `getQueryExecutor()` on its datasource.
- **Dialect-free `TTableSchemaWithId`** at `@venizia/ignis/relational`, bound by Drizzle's `Table` so a `sqliteTable` satisfies it. The one on `@venizia/ignis` and `@venizia/ignis/postgres` is unchanged.
- **`findById` accepts `options.retry`** on `SoftDeletableRepository`. The runtime always supported it; only the type signature rejected it.
- **`TSoftDeletableTableSchema` composes with the root barrel again.** If you hit `TS2344` intersecting it and feeding the result to `TTableObject`, that is fixed. Delete any local workaround that re-declared the schema.
- **`getIdType` is one function again.** Same signature and behavior.

## Who is affected

- **Anyone importing a `*Relational*` repository, datasource, driver type or `FilterBuilder` from `@venizia/ignis` or `@venizia/ignis/postgres`.** Rename per the table below.
- **Anyone using `ReadableRepository`, `PersistableRepository`, `DefaultCRUDRepository`, `SoftDeletableRepository`, `BasePostgresDataSource`, `AbstractPostgresDataSource`, `BaseDataSource`, `BaseRelationalEntity` or `NodePostgresDriver`.** No action needed.
- **Any repository subclass that calls `denyOperation`,** overrode `getQueryInterface`, or read `this._updateBuilder`. See below. Search repositories are affected by `denyOperation`.
- **Anything matching the string `"is not a postgres transaction"`,** parsing the `shouldReturn: false` debug log, or comparing repository classes by identity. See Behavior changes.
- **Building a second SQL engine connector.** `connectors/relational` has no Postgres coupling to work around.

## Breaking changes

> [!WARNING]
> Every rename is name-only: the same class or type, on the same import path, with the same type parameters and behavior.

### Ten names move to their Postgres spelling

Rename the import. Do not switch to `@venizia/ignis/relational`. The class of that name there is the neutral one, and its `connector` is `unknown` rather than a `PgDatabase`.

| Old name | Use instead | Kind |
|----------|-------------|------|
| `RelationalBaseRepository` | `PostgresBaseRepository` | abstract class |
| `ReadableRelationalRepository` | `ReadableRepository` | class |
| `PersistableRelationalRepository` | `PersistableRepository` | class |
| `DefaultRelationalRepository` | `DefaultCRUDRepository` | class |
| `SoftDeletableRelationalRepository` | `SoftDeletableRepository` | class |
| `AbstractRelationalDataSource` | `AbstractPostgresDataSource` | abstract class |
| `BaseRelationalDataSource` | `BasePostgresDataSource` | abstract class |
| `FilterBuilder` | `PostgresFilterBuilder` | class |
| `IRelationalDriver` | `TRelationalDriver` | type |
| `IRelationalConnection` | `TRelationalConnection` | type |

```typescript
// Before
import { BaseRelationalDataSource, DefaultRelationalRepository, FilterBuilder } from '@venizia/ignis';
export class UserRepository extends DefaultRelationalRepository<typeof User.schema> {}
// After
import { BasePostgresDataSource, DefaultCRUDRepository, PostgresFilterBuilder } from '@venizia/ignis';
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {}
```

`BaseDataSource`, `BaseEntity`, `BasePostgresEntity`, `BaseRelationalEntity`, `IStatementResult`, `UpdateBuilder`, `NodePostgresDriver` and `PostgresJsDriver` are untouched, at the same paths.

The two driver types now carry a `T` prefix because they are type aliases. A driver class needs one edit:

```typescript
// Before
import type { IRelationalConnection, IRelationalDriver } from '@venizia/ignis/postgres';
export class MyDriver<Schema extends TAnyDataSourceSchema> implements IRelationalDriver<Schema, Pool> {
  async acquire(opts: { schema: Schema }): Promise<IRelationalConnection<Schema>> { /* ... */ }
}

// After
import type { TRelationalConnection, TRelationalDriver } from '@venizia/ignis/postgres';
export class MyDriver<Schema extends TAnyDataSourceSchema> implements TRelationalDriver<Schema, Pool> {
  async acquire(opts: { schema: Schema }): Promise<TRelationalConnection<Schema>> { /* ... */ }
}
```

At `@venizia/ignis/relational` the real interfaces keep the `I` prefix and take a connector type parameter: `IRelationalDriver<TConnector, Client>` and `IRelationalConnection<TConnector>`. Use those only when building a second SQL engine.

### `denyOperation` takes an options object

`AbstractRepository.denyOperation` is `protected`, so this breaks any repository subclass that calls it, including search repositories.

```typescript
// Before
return this.denyOperation(this.create.name);
// After
return this.denyOperation({ methodName: this.create.name });
```

### Two protected members leave the repository tier

| Removed | Use instead |
|---------|-------------|
| `getQueryInterface(opts?)` | `queryExecutor`, a `protected` getter. To reach the raw connector, call `resolveConnector` (unchanged) |
| `_updateBuilder` | the public `updateBuilder` getter, or `dataSource.getQueryDialect()` |

The public `updateBuilder` getter is now typed `AnyType` and marked `@deprecated`. An engine without a builder returns `undefined`.

## Migration guide

A project with no `*Relational*` imports has nothing to do.

### 1. Find what is affected

```bash
# Renamed symbols
grep -rn --include='*.ts' --include='*.tsx' -E \
  '\b(RelationalBaseRepository|ReadableRelationalRepository|PersistableRelationalRepository|DefaultRelationalRepository|SoftDeletableRelationalRepository|AbstractRelationalDataSource|BaseRelationalDataSource|FilterBuilder|IRelationalDriver|IRelationalConnection)\b' src/

# Hand edits
grep -rn --include='*.ts' -E \
  '\b(denyOperation|getQueryInterface|_updateBuilder)\b|is not a postgres transaction' src/
```

Both silent means a drop-in upgrade.

### 2. Rename the imports

```bash
grep -rlZ --include='*.ts' --include='*.tsx' -E \
  '\b(RelationalBaseRepository|ReadableRelationalRepository|PersistableRelationalRepository|DefaultRelationalRepository|SoftDeletableRelationalRepository|AbstractRelationalDataSource|BaseRelationalDataSource|FilterBuilder|IRelationalDriver|IRelationalConnection)\b' src/ \
| xargs -0 -r sed -i -E '
  s/\bRelationalBaseRepository\b/PostgresBaseRepository/g;
  s/\bReadableRelationalRepository\b/ReadableRepository/g;
  s/\bPersistableRelationalRepository\b/PersistableRepository/g;
  s/\bDefaultRelationalRepository\b/DefaultCRUDRepository/g;
  s/\bSoftDeletableRelationalRepository\b/SoftDeletableRepository/g;
  s/\bAbstractRelationalDataSource\b/AbstractPostgresDataSource/g;
  s/\bBaseRelationalDataSource\b/BasePostgresDataSource/g;
  s/\bFilterBuilder\b/PostgresFilterBuilder/g;
  s/\bIRelationalDriver\b/TRelationalDriver/g;
  s/\bIRelationalConnection\b/TRelationalConnection/g;
'
```

The `\b` anchors matter: without them `FilterBuilder` also rewrites the inside of `PostgresFilterBuilder`. On macOS use `sed -i ''`.

The codemod cannot decide two things:

- **Duplicate imports.** A file that already imported `PostgresFilterBuilder` next to `FilterBuilder` now imports the same name twice (`TS2300`). Merge the two imports.
- **`@venizia/ignis/relational` imports.** `IRelationalDriver` and `IRelationalConnection` keep the `I` prefix there. Revert those two lines by hand.

### 3. The hand edits

| If you have | Change to |
|---|---|
| `denyOperation(name)` | `denyOperation({ methodName: name })` |
| an override of `getQueryInterface` | call `resolveConnector` directly, or use `queryExecutor` |
| a read of `this._updateBuilder` | the public `updateBuilder` getter |
| a match on `"is not a postgres transaction"` | `"is not a relational transaction"` |
| a parser reading `rs.rowCount` from the `shouldReturn: false` debug log | `rs.count` |
| `ReadableRepository === ReadableRelationalRepository` | `instanceof` |

### 4. Verify

Run `bun run typecheck` (or `tsc --noEmit`). Every break is a compile error, so a green typecheck is the proof. `bun test` is not enough, because Bun erases types.

### What NOT to change

Do not repoint the old names at `@venizia/ignis/relational`. They exist there, so the import resolves, but you get the neutral class: `connector` is `unknown` and every Drizzle call then fails to typecheck. That path is for building a second SQL engine, not for consuming Postgres.

## Behavior changes

- **Reworded error.** A repository given a transaction it cannot use now throws `"... is not a relational transaction"` instead of `"... is not a postgres transaction"`. The condition is identical.
- **Different debug log payload.** `create`, `updateAll` and `deleteAll` with `options: { shouldReturn: false }` log the same line, but `rs` is now `{ count, rows: [] }` instead of the raw driver result. Only this branch is affected.
- **Postgres repository names are subclasses, not aliases.** `ReadableRepository === ReadableRelationalRepository` is now false, and `instanceof DefaultCRUDRepository` is false for a `SoftDeletableRepository`. `instanceof` down the chain is unaffected.

## Fixes

`findById` now compiles with `options.retry`. Nothing to migrate:

```typescript
const category = await repository.findById({
  id: 123,
  options: { retry: { maxAttempts: 4 } },
});
```

With `retry` and `isStrict: true` together, retries run first. A strict read waits out replica lag before it throws `ENTITY_NOT_FOUND`.

```typescript
const category = await repository.findById({
  id: 123,
  options: { retry: { maxAttempts: 4 }, isStrict: true },
});
```

## Details

- Import one sub-path per file. Do not merge `@venizia/ignis/relational` with the root barrel: they declare different classes under similar names.
- The compatibility aliases are removed rather than kept, because an alias would reintroduce the collision between the two sub-paths.
- `TRelationalTransactionOptions` is the neutral SQL transaction options type at `@venizia/ignis/relational`. `IDatabaseTransactionOptions` extends it and is unchanged.

See also: [Connectors](/references/base/connectors) for the engine-neutral contract, and [Read retry](/references/base/repositories/advanced#read-retry-replica-lag).
