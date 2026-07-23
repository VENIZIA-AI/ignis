---
title: Database Driver Bundling Fix - pg and postgres Are Truly Optional Now
description: Applications that bundled with bun build --compile, esbuild, webpack, or rollup pulled in the unused Postgres driver package regardless of which one they installed. Datasources now name their driver as a class, which fixes bundling and needs a small config change.
---

# Changelog - 2026-07-14

## Database Driver Bundling Fix

<Badge type="warning" text="Breaking Change" /> <Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" />

**In one line.** Relational datasources now declare their driver as a class reference instead of a string. A bundler only packages the driver you actually use.

## The problem it solves

`@datasource({ driver: DataSourceDrivers.NODE_POSTGRES })` named the driver with a string. A bundler cannot follow a string to the package it identifies. `bun build --compile`, esbuild, webpack, and rollup all pulled in both `pg` and `postgres` - even for an application that only installed one:

```typescript
// BEFORE - a bundler cannot resolve a string to a package
@datasource({ driver: DataSourceDrivers.NODE_POSTGRES })

// AFTER - a bundler follows the class reference and packages only that driver
@datasource({ driver: NodePostgresDriver })
```

## What changed

- **Bundled applications no longer pull in the unused driver.** Naming the driver as a class lets a bundler trace the actual import instead of guessing from a string.
- **`@datasource({ driver })` now takes a class, not a string.** This is the two-line change described in Breaking changes below.
- **A pool-only datasource now gets a working connector.** Previously it silently had no connector at all, so every query on it read through an `undefined` value.
- **A bare `pg.Client` is no longer silently accepted where a `Pool` is required.** Passing one used to compile and run, but broke per-transaction connection handling under load.
- **Search datasources (Typesense, Meilisearch) no longer accept a `driver` option.** It was never read - drop it if you have it.

## Who is affected

- **Every application with a relational (Postgres) datasource** - needs the two-line migration below. Nothing else in the framework changes.
- **Applications that bundle their build** - fixed for free, once the driver is migrated to a class.
- **Applications with a search-only datasource that sets `driver`** - drop the option; it now has no effect and may fail to type-check.
- **Anyone with a custom driver calling `useDriver()`** - still works, but its constructor now takes `{ client }` instead of `{ pool }`.
- **Everyone else** - no action needed.

## Breaking changes

**Datasource driver: string to class.**

```typescript
// BEFORE
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

// AFTER
import { datasource } from '@venizia/ignis';
import { NodePostgresDriver } from '@venizia/ignis/postgres/node-postgres';

@datasource({ driver: NodePostgresDriver })
export class PostgresDataSource extends BasePostgresDataSource<IConfigs> {
  override configure(): ValueOrPromise<void> {
    this.client = new Pool(this.settings); // that is all - the base builds the connector
  }
}
```

| If you | Then |
|---|---|
| write `@datasource({ driver: DataSourceDrivers.NODE_POSTGRES })` | name the class instead: `@datasource({ driver: NodePostgresDriver })` |
| build the Drizzle connector by hand in `configure()` | delete that line - the base class builds it |
| call `useDriver({ driver: new NodePostgresDriver({ pool }) })` | the constructor now takes `{ client }` |
| pass a bare `pg.Client` | construct a `Pool` instead - a `Client` was never supported and now fails at construction |
| carry `--external postgres` in a bundler config | remove it - no longer necessary |
| write `@datasource({ driver: DataSourceDrivers.TYPESENSE })` on a search datasource | drop `driver` entirely: `@datasource()` |
| maintain a custom driver | keep calling `useDriver()` - unchanged and still public |

## Details

- Root cause: a dynamic `import()` defers **execution**, not **packaging**. Every bundler statically resolves the specifier and includes the target regardless. The previous "import whichever driver you need at runtime" approach never actually kept the other one out of the bundle.
- A bundling test (`bundle/optional-peers.test.ts`) now builds four fixtures and checks the actual bundle output, so this class of bug cannot regress silently again.
- `DataSourceDrivers` still exists as an identity constant for names and validation. It is no longer a configuration channel for choosing a driver.

| Package | Tests passing |
|---|---|
| inversion | 96 |
| helpers | 1014 |
| boot | 81 |
| core | 1518 |

Zero type errors, zero lint findings across all four packages; all nine examples type-check.

## See also

- [Postgres Drivers & Supabase](/guides/core-concepts/persistent/postgres-drivers) - the driver seam, and why `pg` and `postgres` are optional peers
- [DataSources - Full Reference](/references/base/datasources-reference) - the driver seam and the PostgreSQL connector in full
