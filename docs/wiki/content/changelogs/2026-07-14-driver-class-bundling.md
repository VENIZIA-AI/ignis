---
title: Database Driver Bundling Fix - pg and postgres Are Truly Optional Now
description: Datasources now name their Postgres driver as a class, so a bundler packages only the driver you use; this needs a small config change.
packages: ['@venizia/ignis-boot', '@venizia/ignis', '@venizia/ignis-helpers', '@venizia/ignis-inversion']
---

# Changelog - 2026-07-14

## Database Driver Bundling Fix

<Badge type="warning" text="Breaking Change" /> <Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" />

**In one line.** A bundled app (`bun build --compile`, esbuild, webpack, rollup) no longer pulls in the Postgres driver package it did not install, once you name the driver as a class.

## What changed

- **`@datasource({ driver })` takes a class, not a string.** A bundler cannot follow a string to a package, so it bundled both `pg` and `postgres`.
- **Pool-only datasources get a connector.** Before, such a datasource silently had none, so every query read through `undefined`.
- **A bare `pg.Client` is rejected where a `Pool` is required.** It used to compile and run, but broke per-transaction connection handling under load.
- **Search datasources (Typesense, Meilisearch) no longer accept `driver`.** It was never read.

## Who is affected

- **Every app with a relational (Postgres) datasource.** Needs the migration below.
- **Apps with a search-only datasource that sets `driver`.** Drop the option; it may fail to type-check.
- **Custom drivers calling `useDriver()`.** Still works, but the constructor takes `{ client }` instead of `{ pool }`.

## Breaking changes

```typescript
// Before
import { DataSourceDrivers, datasource } from '@venizia/ignis';
import { drizzle } from 'drizzle-orm/node-postgres';

@datasource({ driver: DataSourceDrivers.NODE_POSTGRES })
export class PostgresDataSource extends BasePostgresDataSource<IConfigs> {
  override configure(): ValueOrPromise<void> {
    const schema = this.getSchema();
    this.client = new Pool(this.settings);
    this.connector = drizzle({ client: this.client, schema });
  }
}

// After
import { datasource } from '@venizia/ignis';
import { NodePostgresDriver } from '@venizia/ignis/postgres/node-postgres';

@datasource({ driver: NodePostgresDriver })
export class PostgresDataSource extends BasePostgresDataSource<IConfigs> {
  override configure(): ValueOrPromise<void> {
    this.client = new Pool(this.settings); // the base builds the connector
  }
}
```

| If you | Then |
|---|---|
| write `@datasource({ driver: DataSourceDrivers.NODE_POSTGRES })` | use `@datasource({ driver: NodePostgresDriver })` |
| build the Drizzle connector by hand in `configure()` | delete that line |
| call `useDriver({ driver: new NodePostgresDriver({ pool }) })` | pass `{ client }` |
| pass a bare `pg.Client` | construct a `Pool`; a `Client` now fails at construction |
| carry `--external postgres` in a bundler config | remove it |
| write `@datasource({ driver: DataSourceDrivers.TYPESENSE })` on a search datasource | use `@datasource()` |

## Details

- `DataSourceDrivers` still exists as an identity constant for names and validation. It no longer selects a driver.

## See also

- [Postgres Drivers & Supabase](/guides/core-concepts/persistent/postgres-drivers)
- [DataSources - Full Reference](/references/base/datasources-reference)
