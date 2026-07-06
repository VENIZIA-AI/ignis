---
title: Connectors Reference
description: How IGNIS separates engine-neutral base classes from per-engine connectors, dual-door exports, and adding a new engine
difficulty: advanced
---

# Deep Dive: Connectors

IGNIS's persistence layer is split into two layers: an **engine-neutral root** and a set of **connectors**, one per storage engine. This page documents that architecture, the dual-door export strategy, naming symmetry between engines, and how to add a new connector.

**Files:** `packages/core/src/base/**` (neutral) and `packages/core/src/connectors/{postgres,typesense,memory}/**` (per-engine)

## Why the split

Before the restructure, `AbstractDataSource`/`AbstractRepository`/`AbstractEntity` were PostgreSQL-and-Drizzle-aware from the start - `pool`, `connector` (Drizzle instance), and SQL-shaped `TWhere`/`TFilter` lived directly in `src/base`. Adding typesense (a document search engine, not a relational database) and an in-memory Map-backed engine (for tests/prototyping) exposed the coupling: neither engine has a connection pool, neither speaks SQL, and neither necessarily supports transactions or row-level locking.

The fix moves everything engine-specific out of `src/base` and into `src/connectors/<engine>/`, leaving `src/base` with only what every engine can implement:

| Concept | Neutral (`src/base`) | PostgreSQL (`connectors/postgres`) | Typesense (`connectors/typesense`) | Memory (`connectors/memory`) |
|---|---|---|---|---|
| DataSource | `AbstractDataSource` | `AbstractPostgresDataSource` → `BasePostgresDataSource` | `AbstractSearchDataSource` → `BaseSearchDataSource` → `TypesenseDataSource` | `MemoryDataSource` |
| Entity | `AbstractEntity` | `BasePostgresEntity` (alias `BaseEntity`) | `BaseSearchEntity` | (plain classes with a static `COLLECTION_NAME`) |
| Repository | `AbstractRepository` | `PostgresBaseRepository` → `ReadableRepository`/`PersistableRepository`/`DefaultCRUDRepository`/`SoftDeletableRepository` | `TypesenseBaseRepository` → `ReadableSearchRepository`/`PersistableSearchRepository`/`DefaultSearchRepository` | `MemoryRepository` |
| Transactions | throws `NotSupported` by default | real transactions, 3 isolation levels | throws `NotSupported` | throws `NotSupported` |
| Filtering | neutral `TWhere`/`TFilter` | SQL WHERE via Drizzle | typesense query DSL via `TypesenseQueryDialect` | in-memory `TWhere` matcher (postgres-parity semantics) |

## The neutral contract

### `AbstractDataSource`

`packages/core/src/base/datasources/abstract-datasource.ts` declares:

```typescript
abstract class AbstractDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
> extends BaseHelper implements IDataSource<Settings, Schema, ConfigurableOptions> {
  abstract configure(opts?: ConfigurableOptions): ValueOrPromise<void>;

  getCapabilities(): IDataSourceCapabilities {
    return { transactions: false };
  }

  async beginTransaction(_opts?: ITransactionOptions): Promise<ITransaction> {
    return throwNotSupported({
      scope: this.constructor.name,
      feature: 'Transactions',
      logger: this.logger,
    });
  }
}
```

No `pool`, no `connector`, no SQL types. Every engine either overrides `getCapabilities()`/`beginTransaction()` (PostgreSQL) or accepts the neutral default (typesense, memory).

### `AbstractEntity`

`packages/core/src/base/models/base.ts` declares the minimal entity contract, including `getIdType()`:

```typescript
abstract class AbstractEntity extends BaseHelper {
  getIdType(): TIdSchemaType {
    return 'string';
  }
}
```

`BasePostgresEntity` overrides `getIdType()` based on the Drizzle column's actual data type; other engines can override it per their own ID representation.

### `AbstractRepository`

`packages/core/src/base/repositories/core/abstract-repository.ts`:

```typescript
abstract class AbstractRepository<
  TDataObject extends object,
  TPersistObject extends object = TDataObject,
  TOptions extends IExtraOptions = IExtraOptions,
> extends BaseHelper implements IPersistableRepository<TDataObject, TPersistObject, TOptions>
```

Notice the generic parameters are named for their role (`TDataObject`, `TPersistObject`, `TOptions`), not for Drizzle concepts (`EntitySchema`, `TTableObject`) - those Drizzle-flavored names now belong to `PostgresBaseRepository` and its subclasses, which narrow `AbstractRepository`'s generics into a `TTableSchemaWithId`-based signature. `AbstractRepository` does **not** compose `FieldsVisibilityMixin`/`DefaultFilterMixin` - see [Repository Mixins](./repositories/mixins) for what happened to those.

### Neutral `TFilter`/`TWhere` and `ITransaction`

`packages/core/src/base/repositories/common/types.ts` and `packages/core/src/base/datasources/common/types.ts` define engine-neutral filter and transaction shapes shared by all three connectors. `ITransaction` has no `connector` field - each engine that supports transactions (currently only PostgreSQL) narrows it with its own connection type (`IDatabaseTransaction`).

## Dual-door exports

IGNIS ships both a **root barrel** (backward-compatible default) and **per-engine subpaths** (opt-in, tree-shakeable). Both resolve to the exact same compiled classes - there is no duplicated implementation.

```json
// packages/core/package.json - exports map
{
  ".": "dist/index.js",              // framework + postgres + memory (compatibility default)
  "./postgres": "dist/connectors/postgres/index.js",
  "./memory": "dist/connectors/memory/index.js",
  "./typesense": "dist/connectors/typesense/index.js"  // subpath-only, optional peer
}
```

```typescript
// packages/core/src/index.ts - root barrel
export * from './base';
export * from './common';
export * from './components';
export * from './connectors';   // -> connectors/index.ts: export * from './memory'; export * from './postgres';
export * from './helpers';
export * from './utilities';
```

- **Root (`@venizia/ignis`)** re-exports the framework plus the `postgres` and `memory` connectors - existing code that imports `BaseDataSource`/`DefaultCRUDRepository` from the root keeps working unchanged.
- **`@venizia/ignis/postgres`**, **`@venizia/ignis/memory`** re-export the same connector in isolation, for code that wants to be explicit about which engine it depends on.
- **`@venizia/ignis/typesense`** is **subpath-only** - it is deliberately excluded from the root barrel because `typesense` is an optional peer dependency (`"peerDependenciesMeta": { "typesense": { "optional": true } }`). Importing from the root must never force-install the typesense client for apps that don't use search.

```typescript
// Both of these resolve to the same BasePostgresDataSource class:
import { BaseDataSource } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';

// Typesense must be imported from its subpath - not available at the root:
import { TypesenseDataSource, defineSearchCollection } from '@venizia/ignis/typesense';
```

## Naming symmetry and compatibility aliases

Each connector's canonical class names carry the engine name (`BasePostgresDataSource`, `BasePostgresEntity`), matching the pattern typesense and memory follow (`TypesenseDataSource`, `MemoryDataSource`). PostgreSQL additionally re-exports the pre-restructure names as aliases, so existing imports do not break:

```typescript
// packages/core/src/connectors/postgres/datasources/index.ts
export { BasePostgresDataSource as BaseDataSource } from './base-datasource';

// packages/core/src/connectors/postgres/models/index.ts
export { BasePostgresEntity as BaseEntity } from './base';
```

| Canonical (new, engine-carrying) | Alias (compatibility) | Notes |
|---|---|---|
| `BasePostgresDataSource` | `BaseDataSource` | Same class, re-exported |
| `BasePostgresEntity` | `BaseEntity` | Same class, re-exported |

Write new code against the canonical names - they make it unambiguous which engine a class belongs to once you have more than one connector in play. Existing code using the aliases needs no changes.

## Adding a new engine connector

To add a fourth connector (e.g. a Redis-backed cache connector), follow the shape the three existing connectors share:

1. **`src/connectors/<engine>/datasources/`** - `Abstract<Engine>DataSource extends AbstractDataSource`, then `Base<Engine>DataSource` (or a single concrete `<Engine>DataSource` if there's no useful abstract/base split, as memory does) implementing `configure()`/`getConnectionString()`. Override `getCapabilities()` and `beginTransaction()` only if the engine truly supports transactions - otherwise inherit the neutral `NotSupported` default.
2. **`src/connectors/<engine>/models/`** (if the engine needs entity definitions beyond plain objects) - extend `AbstractEntity`, override `getIdType()` if the engine's ID representation differs from the neutral default.
3. **`src/connectors/<engine>/repositories/core/`** - `<Engine>BaseRepository extends AbstractRepository`, narrowing the generics to the engine's data/persist/options shapes, followed by a `Readable`/`Persistable`/`DefaultCRUD`-style tier ladder mirroring the postgres and typesense connectors. Any operation the engine cannot support (transactions, locks) should call `throwNotSupported({ scope, feature, logger: this.logger })` for consistency.
4. **`src/connectors/<engine>/index.ts`** - barrel export for the connector.
5. **`src/connectors/index.ts`** - add `export * from './<engine>'` **only if** the engine has no optional runtime peer dependency (mirroring `postgres`/`memory`). If the engine driver is an optional peer (like `typesense`), leave it out of `connectors/index.ts` and register it as a subpath-only export in `package.json`.
6. **`package.json` `exports`** - add `"./​<engine>": "dist/connectors/<engine>/index.js"`. If the driver is an optional peer, add it to `peerDependencies` + `peerDependenciesMeta.<driver>.optional: true`.

## See Also

- **Related Concepts:**
  - [DataSources](./datasources) - Full DataSource reference (neutral contract + PostgreSQL connector)
  - [Models & Enrichers](./models) - Entity reference (neutral `AbstractEntity` + PostgreSQL `BasePostgresEntity`)
  - [Repositories](./repositories/) - Repository hierarchy reference
  - [Repository Mixins](./repositories/mixins) - Legacy mixins, now orphaned from the public API

- **Guides:**
  - [Search & Typesense](/guides/core-concepts/persistent/search-typesense) - The typesense connector in depth
  - [Memory Connector](/guides/core-concepts/persistent/memory-connector) - The zero-dependency in-memory connector

- **Best Practices:**
  - [Architectural Patterns](/best-practices/architectural-patterns) - Layered architecture and separation of concerns
