---
title: Connectors
description: How IGNIS supports multiple database and search engines behind one engine-neutral contract
difficulty: intermediate
---

# Connectors

A connector is how IGNIS adds a storage engine - PostgreSQL, Typesense, Meilisearch - behind one engine-neutral contract, so `DataSource`, `Entity`, and `Repository` mean the same thing no matter which engine backs them.

"A connector" (this page) means an engine-integration module; "the connector" means the Drizzle instance exposed as `this.connector` on a datasource or repository - the two senses are unrelated despite the shared word.

## In one example

The neutral `AbstractDataSource` has no SQL, no pool, no Drizzle - the postgres connector's `BasePostgresDataSource` adds all of that, and `@datasource({ driver })` names the concrete client class:

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

- **Three engine-neutral roots.** `packages/core/src/base` declares three roots every connector implements:

| Root | Purpose | Neutral default |
|---|---|---|
| `AbstractDataSource` | Connection ownership | No `pool`, no Drizzle `connector`; `beginTransaction()` throws `NotSupported` |
| `AbstractEntity` | Model/schema contract | `name`, `getSchema()`, `getIdType()` |
| `AbstractRepository` | Data access contract | Generics named for role (data/persist/options), not any one engine's vocabulary |

- **Connectors narrow the roots into a real engine.** `packages/core/src/connectors/<engine>` adds engine-specific members:

| Connector | Adds | `getCapabilities()` |
|---|---|---|
| **postgres** (`connectors/postgres`) | `pool`, Drizzle `connector`, SQL-shaped `TWhere`/`TFilter`, real transactions with isolation levels | `{ transactions: true }` |
| **search** (`connectors/search`) | Engine-neutral search base - no SQL, no transactions. Both typesense and meilisearch extend it (not `AbstractDataSource` directly), sharing one query-dialect and capability shape | inherited neutral default |

- **`@datasource({ driver })` picks the concrete client, within an engine.** Postgres takes a driver **class** (`NodePostgresDriver` or `PostgresJsDriver`), never a driver-name string - a bundler packages values, not text, so a string would leave the peer dependency uninstalled.
- **All engine clients stay optional peer dependencies.** Importing `@venizia/ignis/postgres` alone loads zero client libraries.
- **Search connectors are subpath-only.** `@venizia/ignis/typesense` and `@venizia/ignis/meilisearch` are excluded from the root `@venizia/ignis` barrel, so an app that never touches search never pulls a search client into its bundle.

**Canonical names and aliases**

| Layer | Canonical (`Relational` paradigm) | Compatibility alias (`Postgres`-prefixed) |
|---|---|---|
| DataSource | `BaseRelationalDataSource` | `BasePostgresDataSource` |
| Entity | `BaseRelationalEntity` | `BasePostgresEntity` |
| Repository | `RelationalBaseRepository` | `PostgresBaseRepository` |

Both names resolve to the same class - existing imports keep working.

## Common tasks

### Pick an engine

Import the connector for the engine you need - `@venizia/ignis/postgres` for a relational database with transactions, `@venizia/ignis/typesense` or `@venizia/ignis/meilisearch` for document search. The root `@venizia/ignis` barrel re-exports postgres for backward compatibility; search engines are always subpath-only:

```typescript
// Postgres: available at the root or the subpath - same class either way
import { BaseDataSource } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';

// Search engines: subpath only, never at the root
import { TypesenseDataSource } from '@venizia/ignis/typesense';
import { MeilisearchDataSource } from '@venizia/ignis/meilisearch';
```

### Know what lives in base vs a connector

- **Engine-specific -> connector.** A connection pool, query dialect, isolation level, or transaction lives in a connector, not `src/base`.
- **Engine-universal -> base.** `src/base` only ever grows members every engine can implement, such as `getSchema()` or `getIdType()`.
- **Litmus test.** Could typesense (no pool, no SQL, no transactions) implement it? If not, it belongs in the postgres connector, not the neutral root.

### Add a new engine connector

- **Mirror the shape.** Under `src/connectors/<engine>/`: a `datasources/` extending `AbstractDataSource`, a `models/` extending `AbstractEntity` (if the engine needs entity definitions), and a `repositories/core/` extending `AbstractRepository` with a `Readable`/`Persistable`/`DefaultCRUD`-style tier ladder.
- **Override transactions only if supported.** Override `getCapabilities()` and `beginTransaction()` only if the engine truly supports transactions - otherwise inherit the neutral `NotSupported` default.
- **Export as a subpath.** Add the connector to `package.json` `exports` as `./<engine>`; if its driver is an optional peer dependency, keep it out of `connectors/index.ts` and register it as a subpath-only export instead, mirroring typesense and meilisearch.

## See also

- [DataSources](./datasources) - the engine-neutral contract and the PostgreSQL connector in depth
- [Models & Enrichers](./models) - the engine-neutral entity contract and the PostgreSQL connector's entity
- [Repositories](/references/base/repositories/) - the CRUD layer built on top of a connector's datasource
- [Filter System](/references/base/filter-system/) - querying through a connector's repository
- [Persistent Layer](/guides/core-concepts/persistent/) - the guide these reference pages support
- [Search & Typesense](/guides/core-concepts/persistent/search-typesense) - the typesense connector in depth
- [Search & Meilisearch](/guides/core-concepts/persistent/search-meilisearch) - the meilisearch connector in depth

**Files:**

- [`packages/core/src/base/datasources/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/datasources/abstract.ts) - neutral `AbstractDataSource`
- [`packages/core/src/base/models/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/models/base.ts) - neutral `AbstractEntity`
- [`packages/core/src/base/repositories/core/abstract.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/repositories/core/abstract.ts) - neutral `AbstractRepository`
- [`packages/core/src/connectors/postgres/datasources/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/datasources/base.ts) - `BaseRelationalDataSource` (alias `BasePostgresDataSource`)
- [`packages/core/src/connectors/search/datasources/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/search/datasources/base.ts) - `BaseSearchDataSource`, shared by typesense and meilisearch
