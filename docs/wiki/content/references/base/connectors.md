---
title: Connectors
description: How IGNIS supports multiple database and search engines behind one engine-neutral contract
difficulty: intermediate
---

# Connectors

A connector is how IGNIS adds a storage engine - PostgreSQL, SQLite, Typesense, Meilisearch - behind one engine-neutral contract. `DataSource`, `Entity`, and `Repository` mean the same thing no matter which engine backs them.

"A connector" (this page) means an engine-integration module. "The connector" means the Drizzle instance exposed as `this.connector` on a datasource or repository. The two senses are unrelated despite the shared word.

## In one example

The neutral `AbstractDataSource` has no SQL, no pool, no Drizzle. The relational tier adds all of that, the postgres branch binds it to the Postgres dialect as `BasePostgresDataSource`, and `@datasource({ driver })` names the concrete client class:

```typescript
import { Pool } from 'pg';
import { datasource } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';
import { NodePostgresDriver } from '@venizia/ignis/postgres/node-postgres';

interface IDataSourceConfigs {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

@datasource({ driver: NodePostgresDriver })
export class PostgresDataSource extends BasePostgresDataSource<IDataSourceConfigs> {
  override configure(): void {
    this.client = new Pool(this.settings);
  }

  override getConnectionString(): string {
    const { host, port, user, password, database } = this.settings;
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }
}
```

A Typesense datasource follows the same shape but extends the search connector's `BaseSearchDataSource` instead - no pool, no `getConnectionString()`, no transactions.

## How it works

- **Three engine-neutral roots.** `packages/kernel/src/base` declares three roots every connector implements:

| Root | Purpose | Neutral default |
|---|---|---|
| `AbstractDataSource` | Connection ownership | No `pool`, no Drizzle `connector`; `beginTransaction()` throws `NotSupported` |
| `AbstractEntity` | Model/schema contract | `name`, `getSchema()`, `getIdType()` |
| `AbstractRepository` | Data access contract | Generics named for role (data/persist/options), not any one engine's vocabulary |

- **Two paradigm tiers sit between the roots and the engines.** `packages/connectors/src/relational/core` and `packages/connectors/src/search/core` hold everything that is true of a whole family, so an engine branch stays thin:

| Tier | Adds | `getCapabilities()` |
|---|---|---|
| **relational** (`@venizia/ignis/relational`) | Drizzle `connector`, driver seam, SQL-shaped `TWhere`/`TFilter`, the `FilterBuilder`, real transactions | `{ transactions: true }` on `BaseRelationalDataSource` |
| **search** (`@venizia/ignis/search`) | Collections, one shared search query-dialect, no SQL and no transactions | inherited neutral default |

- **Engine branches bind a tier to a client.** Each one subclasses the tier and supplies the dialect, the executor and the driver:

| Engine | Subpath | Tier | Supplies |
|---|---|---|---|
| **postgres** | `@venizia/ignis/postgres` | relational | `PostgresQueryDialect`, `PostgresQueryExecutor`, `BEGIN ... ISOLATION LEVEL`, three drivers |
| **sqlite** | `@venizia/ignis/sqlite` | relational | `SqliteQueryDialect`, `SqliteQueryExecutor`, the libsql driver, `SqliteBeginModes` locking modes |
| **typesense** | `@venizia/ignis/typesense` | search | The typesense client and its collection schema |
| **meilisearch** | `@venizia/ignis/meilisearch` | search | The meilisearch client and its index schema |

- **`@datasource({ driver })` picks the concrete client, within an engine.** A relational datasource takes a driver **class** (`NodePostgresDriver`, `PostgresJsDriver`, `PGliteDriver`, `LibSqlDriver`), never a driver-name string. A bundler packages values, not text, so a string would leave the peer dependency uninstalled.
- **All engine clients stay optional peer dependencies.** Importing `@venizia/ignis/postgres` alone loads zero client libraries.
- **Search controllers ship on their own subpath.** `@venizia/ignis/search`, `/typesense` and `/meilisearch` carry no controller, so they load without `hono` or `drizzle-orm`. Import `AbstractSearchController`, `SearchControllerFactory` and `defineSearchRouteConfigs` from `@venizia/ignis/search/controllers` or `@venizia/ignis/typesense/controllers`.
- **Only postgres is reachable from the root barrel.** `@venizia/ignis` re-exports `@venizia/ignis/postgres` for backward compatibility. Every other engine, and both neutral tiers, are subpath-only. An app that never touches search never pulls a search client into its bundle.

**Neutral names and engine names**

| Layer | Neutral (`@venizia/ignis/relational`) | Postgres (`@venizia/ignis/postgres`) | Relationship |
|---|---|---|---|
| DataSource | `BaseRelationalDataSource` | `BasePostgresDataSource` | Subclass - adds the Postgres dialect, executor and BEGIN statement |
| Entity | `BaseRelationalEntity` | `BasePostgresEntity`, `BaseEntity` | **Alias** - one class, re-exported under two extra names |
| Repository | `RelationalBaseRepository` | `PostgresBaseRepository` | Subclass - rebinds `ExtraOptions` and `TDataSource` |

Only the Entity row is an alias. The other two are distinct classes, and the neutral names are deliberately **not** re-exported from the engine subpaths, so one name never denotes two classes. `import { RelationalBaseRepository } from '@venizia/ignis'` and `import { BaseRelationalDataSource } from '@venizia/ignis/postgres'` both fail to resolve; both live at `@venizia/ignis/relational`.

`BaseDataSource` is a genuine alias within the postgres subpath: it re-exports `BasePostgresDataSource` under its historical name.

## Common tasks

### Pick an engine

Import the connector for the engine you need - `@venizia/ignis/postgres` or `@venizia/ignis/sqlite` for a relational database with transactions, `@venizia/ignis/typesense` or `@venizia/ignis/meilisearch` for document search. The root `@venizia/ignis` barrel re-exports postgres for backward compatibility; every other engine is subpath-only:

```typescript
// Postgres: available at the root or the subpath - same class either way
import { BaseDataSource } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';

// SQLite and the search engines: subpath only, never at the root
import { BaseSqliteDataSource } from '@venizia/ignis/sqlite';
import { TypesenseDataSource } from '@venizia/ignis/typesense';
import { MeilisearchDataSource } from '@venizia/ignis/meilisearch';

// The engine-neutral relational tier, when you write code for both SQL engines
import { BaseRelationalDataSource, DefaultRelationalRepository } from '@venizia/ignis/relational';
```

### Know what lives in the kernel vs a tier vs an engine

- **Engine-specific -> engine branch.** A query dialect, an isolation level, or a `BEGIN` statement lives in `relational/postgres` or `relational/sqlite`, never in the tier above it.
- **Family-universal -> tier.** `relational/core` grows members every SQL engine shares, such as the `FilterBuilder` or the driver seam.
- **Universal -> kernel.** `packages/kernel/src/base` only ever grows members every engine can implement, such as `getSchema()` or `getIdType()`.
- **Litmus test.** Could typesense (no pool, no SQL, no transactions) implement it? If not, it does not belong in the neutral root.

### Add a new engine connector

- **Mirror the shape.** Under `packages/connectors/src/<tier>/<engine>/`, add a `datasources/` extending the tier's base datasource and a `repositories/core/` binding each rung of the tier's ladder. Add a `models/` extending the tier's entity too, if the engine needs entity definitions.
- **Override transactions only if supported.** Override `getCapabilities()` and `beginTransaction()` only if the engine truly supports transactions - otherwise inherit the neutral `NotSupported` default.
- **Export as a subpath.** Add the connector to `package.json` `exports` as `./<engine>` in both `@venizia/ignis-connectors` and `@venizia/ignis`. If its driver is an optional peer dependency, keep it out of the root barrel and register it as a subpath-only export instead, mirroring sqlite, typesense and meilisearch.
- **Do not re-export the tier's names.** Publishing `BaseRelationalDataSource` from your engine subpath would put two different classes behind one name.

## See also

- [DataSources](./datasources) - the engine-neutral contract and the PostgreSQL connector in depth
- [Models & Enrichers](./models) - the engine-neutral entity contract and the PostgreSQL connector's entity
- [Repositories](/references/base/repositories/) - the CRUD layer built on top of a connector's datasource
- [Filter System](/references/base/filter-system/) - querying through a connector's repository
- [Persistent Layer](/guides/core-concepts/persistent/) - the guide these reference pages support
- [Search & Typesense](/guides/core-concepts/persistent/search-typesense) - the typesense connector in depth
- [Search & Meilisearch](/guides/core-concepts/persistent/search-meilisearch) - the meilisearch connector in depth

**Files:**

- [`packages/kernel/src/base/datasources/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/datasources/abstract.ts) - neutral `AbstractDataSource`
- [`packages/kernel/src/base/models/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/models/base.ts) - neutral `AbstractEntity`
- [`packages/kernel/src/base/repositories/core/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/repositories/core/abstract.ts) - neutral `AbstractRepository`
- [`packages/connectors/src/relational/core/datasources/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/core/datasources/base.ts) - `BaseRelationalDataSource`, where `getCapabilities() -> { transactions: true }` lives
- [`packages/connectors/src/relational/postgres/datasources/index.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/postgres/datasources/index.ts) - `BasePostgresDataSource`, and the `BaseDataSource` alias; the comment explaining why the neutral names are not re-exported here
- [`packages/connectors/src/relational/sqlite/`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/sqlite) - the SQLite branch: datasource, libsql driver, repository bindings, enrichers
- [`packages/connectors/src/search/core/datasources/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/search/core/datasources/base.ts) - `BaseSearchDataSource`, shared by typesense and meilisearch
