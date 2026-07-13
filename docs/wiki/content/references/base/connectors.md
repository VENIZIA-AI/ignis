---
title: Connectors Reference
description: How IGNIS separates engine-neutral base classes from per-engine connectors, dual-door exports, and adding a new engine
difficulty: advanced
---

# Deep Dive: Connectors

IGNIS's persistence layer is split into two layers: an **engine-neutral root** and a set of **connectors**, one per storage engine. This page documents that architecture, the dual-door export strategy, naming symmetry between engines, and how to add a new connector.

**Files:** `packages/core/src/base/**` (neutral) and `packages/core/src/connectors/{postgres,typesense,meilisearch,search}/**` (per-engine)

## Why the split

Before the restructure, `AbstractDataSource`/`AbstractRepository`/`AbstractEntity` were PostgreSQL-and-Drizzle-aware from the start - `pool`, `connector` (Drizzle instance), and SQL-shaped `TWhere`/`TFilter` lived directly in `src/base`. Adding typesense (a document search engine, not a relational database) exposed the coupling: it has no connection pool, doesn't speak SQL, and doesn't support transactions or row-level locking.

The fix moves everything engine-specific out of `src/base` and into `src/connectors/<engine>/`, leaving `src/base` with only what every engine can implement:

| Concept | Neutral (`src/base`) | PostgreSQL (`connectors/postgres`) | Typesense (`connectors/typesense`) |
|---|---|---|---|
| DataSource | `AbstractDataSource` | `AbstractPostgresDataSource` → `BasePostgresDataSource` | `AbstractSearchDataSource` → `BaseSearchDataSource` → `TypesenseDataSource` |
| Entity | `AbstractEntity` | `BasePostgresEntity` (alias `BaseEntity`) | `BaseSearchEntity` |
| Repository | `AbstractRepository` | `PostgresBaseRepository` → `ReadableRepository`/`PersistableRepository`/`DefaultCRUDRepository`/`SoftDeletableRepository` | `TypesenseBaseRepository` → `ReadableSearchRepository`/`PersistableSearchRepository`/`DefaultSearchRepository` |
| Transactions | throws `NotSupported` by default | real transactions, 3 isolation levels | throws `NotSupported` |
| Filtering | neutral `TWhere`/`TFilter` | SQL WHERE via Drizzle | typesense query DSL via `TypesenseQueryDialect` |

## The neutral contract

### `AbstractDataSource`

`packages/core/src/base/datasources/abstract.ts` declares:

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

No `pool`, no `connector`, no SQL types. Every engine either overrides `getCapabilities()`/`beginTransaction()` (PostgreSQL) or accepts the neutral default (typesense).

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

`packages/core/src/base/repositories/core/abstract.ts`:

```typescript
abstract class AbstractRepository<
  TDataObject extends object,
  TPersistObject extends object = TDataObject,
  TOptions extends IExtraOptions = IExtraOptions,
> extends BaseHelper implements IPersistableRepository<TDataObject, TPersistObject, TOptions>
```

Notice the generic parameters are named for their role (`TDataObject`, `TPersistObject`, `TOptions`), not for Drizzle concepts (`EntitySchema`, `TTableObject`) - those Drizzle-flavored names now belong to `PostgresBaseRepository` and its subclasses, which narrow `AbstractRepository`'s generics into a `TTableSchemaWithId`-based signature. `AbstractRepository` does **not** compose `FieldsVisibilityMixin`/`DefaultFilterMixin` - see [Repository Mixins](./repositories/mixins) for what happened to those.

### Neutral `TFilter`/`TWhere` and `ITransaction`

`packages/core/src/base/repositories/common/types.ts` and `packages/core/src/base/datasources/common/types.ts` define engine-neutral filter and transaction shapes shared by both connectors. `ITransaction` has no `connector` field - each engine that supports transactions (currently only PostgreSQL) narrows it with `IDatabaseTransaction`, whose `connector` is a `TRelationalConnector<Schema>` bound to the transaction's dedicated connection (the older `TNodePostgresTransactionConnector` name is kept as a `@deprecated` alias). Its `commit()`/`rollback()` **throw** on failure (a failed `COMMIT` no longer resolves as success) and destroy the poisoned connection rather than pooling it under the `node-postgres` driver; a failed `BEGIN` likewise destroys the acquired connection instead of leaking it. See [Transactions](/guides/core-concepts/persistent/transactions).

## Dual-door exports

IGNIS ships both a **root barrel** (backward-compatible default) and **per-engine subpaths** (opt-in, tree-shakeable). Both resolve to the exact same compiled classes - there is no duplicated implementation.

```json
// packages/core/package.json - exports map (persistence-relevant entries)
{
  ".": "dist/index.js",                                        // framework + postgres (compatibility default)
  "./postgres": "dist/connectors/postgres/index.js",           // relational connector - loads ZERO client library
  "./postgres/node-postgres": "dist/connectors/postgres/drivers/node-postgres.js", // concrete driver (value-imports `pg`)
  "./postgres/postgres-js": "dist/connectors/postgres/drivers/postgres-js.js",     // concrete driver (value-imports `postgres`)
  "./postgres/supabase": "dist/connectors/postgres/supabase/index.js",             // Supabase pooler + RLS helpers
  "./search": "dist/connectors/search/index.js",               // engine-neutral search paradigm (no engine client)
  "./typesense": "dist/connectors/typesense/index.js",         // subpath-only, optional peer
  "./meilisearch": "dist/connectors/meilisearch/index.js"      // subpath-only, optional peer
}
```

> [!IMPORTANT] Concrete Postgres drivers are sub-path only
> `pg` and `postgres` are **both optional peer dependencies** (`peerDependenciesMeta.pg.optional` / `.postgres.optional`). The root barrel, `@venizia/ignis/postgres`, and the drivers barrel (`connectors/postgres/drivers/index.ts`) load **zero** `pg`/`postgres` modules - the drivers barrel exports only the neutral contract plus `resolveDatabaseDriver`. A concrete driver value-imports its own client, so reach it by its own sub-path only: `@venizia/ignis/postgres/node-postgres` or `@venizia/ignis/postgres/postgres-js`. `resolveDatabaseDriver({ client })` structurally detects which client the app built and lazily `import()`s only the matching driver. This is what keeps IGNIS from forcing a database client on a project that does not use one. See [Postgres Drivers & Supabase](/guides/core-concepts/persistent/postgres-drivers).

> [!NOTE] `internal/` modules are not public API
> The search connectors (`search`/`typesense`/`meilisearch`) no longer re-export their `internal/` barrels (`SearchConnectorInternal`, `TypesenseInternal`, `MeilisearchInternal`) from the connector barrel. There is no sub-path export for them either, and package `exports` blocks deep imports - so no specifier reaches them from outside the package. They are implementation detail; if you need what they do, ask for a supported API.

```typescript
// packages/core/src/index.ts - root barrel
export * from './base';
export * from './common';
export * from './components';
export * from './connectors';   // -> connectors/index.ts: export * from './postgres';
export * from './helpers';
export * from './utilities';
```

- **Root (`@venizia/ignis`)** re-exports the framework plus the `postgres` connector - existing code that imports `BaseDataSource`/`DefaultCRUDRepository` from the root keeps working unchanged.
- **`@venizia/ignis/postgres`** re-exports the same connector in isolation, for code that wants to be explicit about which engine it depends on.
- **`@venizia/ignis/typesense`** is **subpath-only** - it is deliberately excluded from the root barrel because `typesense` is an optional peer dependency (`"peerDependenciesMeta": { "typesense": { "optional": true } }`). Importing from the root must never force-install the typesense client for apps that don't use search.

```typescript
// Both of these resolve to the same BasePostgresDataSource class:
import { BaseDataSource } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';

// Typesense must be imported from its subpath - not available at the root:
import { TypesenseDataSource, defineSearchCollection } from '@venizia/ignis/typesense';
```

## Naming symmetry and compatibility aliases

Each connector's canonical class names carry the engine name (`BasePostgresDataSource`, `BasePostgresEntity`), matching the pattern typesense follows (`TypesenseDataSource`). PostgreSQL additionally re-exports the pre-restructure names as aliases, so existing imports do not break:

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

To add a third connector (e.g. a Redis-backed cache connector), follow the shape the two existing connectors share:

1. **`src/connectors/<engine>/datasources/`** - `Abstract<Engine>DataSource extends AbstractDataSource`, then `Base<Engine>DataSource` (or a single concrete `<Engine>DataSource` if there's no useful abstract/base split) implementing `configure()`/`getConnectionString()`. Override `getCapabilities()` and `beginTransaction()` only if the engine truly supports transactions - otherwise inherit the neutral `NotSupported` default.
2. **`src/connectors/<engine>/models/`** (if the engine needs entity definitions beyond plain objects) - extend `AbstractEntity`, override `getIdType()` if the engine's ID representation differs from the neutral default.
3. **`src/connectors/<engine>/repositories/core/`** - `<Engine>BaseRepository extends AbstractRepository`, narrowing the generics to the engine's data/persist/options shapes, followed by a `Readable`/`Persistable`/`DefaultCRUD`-style tier ladder mirroring the postgres and typesense connectors. Any operation the engine cannot support (transactions, locks) should call `throwNotSupported({ scope, feature, logger: this.logger })` for consistency.
4. **`src/connectors/<engine>/index.ts`** - barrel export for the connector.
5. **`src/connectors/index.ts`** - add `export * from './<engine>'` **only if** the engine has no optional runtime peer dependency (mirroring `postgres`). If the engine driver is an optional peer (like `typesense`), leave it out of `connectors/index.ts` and register it as a subpath-only export in `package.json`.
6. **`package.json` `exports`** - add `"./​<engine>": "dist/connectors/<engine>/index.js"`. If the driver is an optional peer, add it to `peerDependencies` + `peerDependenciesMeta.<driver>.optional: true`.

## See Also

- **Related Concepts:**
  - [DataSources](./datasources) - Full DataSource reference (neutral contract + PostgreSQL connector)
  - [Models & Enrichers](./models) - Entity reference (neutral `AbstractEntity` + PostgreSQL `BasePostgresEntity`)
  - [Repositories](./repositories/) - Repository hierarchy reference
  - [Repository Mixins](./repositories/mixins) - Legacy mixins, now orphaned from the public API

- **Guides:**
  - [Search & Typesense](/guides/core-concepts/persistent/search-typesense) - The typesense connector in depth

- **Best Practices:**
  - [Architectural Patterns](/best-practices/architectural-patterns) - Layered architecture and separation of concerns
