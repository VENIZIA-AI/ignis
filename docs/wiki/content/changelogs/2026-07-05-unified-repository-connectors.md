---
title: Unified Repository & Connectors Architecture
description: The persistence layer splits into an engine-neutral base plus Postgres, Typesense and memory connectors; existing Postgres code keeps working almost unchanged.
packages: ['@venizia/ignis', '@venizia/dev-configs', '@venizia/ignis-helpers']
---

# Changelog - 2026-07-05

## Unified Repository & Connectors Architecture

<Badge type="warning" text="Breaking Change" /> <Badge type="tip" text="New Feature" /> <Badge type="info" text="Enhancement" />

**In one line.** You can now use Typesense search (and a memory engine for tests) next to Postgres, and existing Postgres code keeps working almost unchanged.

## What changed

- **Engine-neutral base.** `AbstractRepository`, `AbstractDataSource` and `AbstractEntity` no longer import Drizzle, `pg` or any SQL type.
- **New Typesense connector.** Full-text and faceted search with its own entity DSL (`defineSearchCollection` / `field`), a repository ladder like the Postgres one, and a query dialect that translates `TFilter` / `TWhere`.
- **New memory connector.** A zero-dependency, `Map`-backed engine for prototyping and tests.
  > [!NOTE]
  > The memory connector was removed on 2026-07-11. See [Connectors Consistency Hardening](/changelogs/2026-07-11-connectors-consistency-hardening).
- **Capabilities.** Every datasource has `getCapabilities(): { transactions: boolean }`. Unsupported operations (transactions, row-level locks) throw `NotSupported` (HTTP 501).
- **Sub-path exports.** `@venizia/ignis` still re-exports Postgres and memory. `@venizia/ignis/postgres`, `@venizia/ignis/memory` and `@venizia/ignis/typesense` are also available. Typesense is sub-path only, so it never enters a bundle that does not use it.
- **Naming.** Canonical names are now family names (`Relational`, `Search`). Old names (`BaseDataSource`, `BaseEntity`, `BasePostgresDataSource`, `BasePostgresEntity`, `PostgresQueryOperators` / `RDBQueryOperators`) still resolve to the same class.
- **New env transforms.** `toDelimitedArray` and `toTrimmed` parse list-shaped environment values in one read.
- **Typesense fixes.** An empty `where` no longer produces a malformed `filter_by` fragment, and collection provisioning no longer races a read-after-write check.

## Who is affected

- **Postgres-only apps.** Almost nothing changes, but `ITransaction` and `applicationEnvironment.get` changed (see breaking changes).
- **Users of the `@venizia/ignis-helpers` search-engine module.** Update imports (breaking change 2).
- **Code reading `.connector` or `.isolationLevel` off a transaction.** Update the type annotation (breaking change 1).
- **Code calling `applicationEnvironment.get(key, defaultValue)`.** Now a compile error (breaking change 4).
- **Clients matching the literal `"Method not implemented"`.** Match on `messageCode` (breaking change 3).

## Breaking changes

1. **`ITransaction` split.** The neutral `ITransaction` now has only `isActive`, `commit()` and `rollback()`. `connector` and `isolationLevel` moved to `IDatabaseTransaction` in the Postgres connector. Code that never touches `.connector` or `.isolationLevel` needs no change.

   ```typescript
   // Before
   import { ITransaction } from '@venizia/ignis';
   async function withTx(tx: ITransaction) {
     await tx.connector.insert(userTable).values({ name: 'Alice' });
   }

   // After
   import { IDatabaseTransaction } from '@venizia/ignis/postgres';
   async function withTx(tx: IDatabaseTransaction) {
     await tx.connector.insert(userTable).values({ name: 'Alice' });
   }
   ```

   After upgrading, delete any `*.tsbuildinfo` caches before rebuilding (`find . -name '*.tsbuildinfo' -delete`). Otherwise `tsc --incremental` can skip files that use the old shape and report a false green build.

2. **Search symbols moved.** The `search-engine` helper module is gone from `@venizia/ignis-helpers`, with no re-export. It is now the Typesense connector in core. See the [Search & Typesense guide](/guides/core-concepts/persistent/search-typesense).

   ```typescript
   // Before
   import { SearchClient, defineSearchCollection } from '@venizia/ignis-helpers';

   // After
   import {
     TypesenseDataSource,
     BaseSearchEntity,
     defineSearchCollection,
     field,
     TSearchDocument,
     DefaultSearchRepository,
   } from '@venizia/ignis/typesense';
   ```

3. **Auth controller unimplemented-endpoint response changed.** The status stays 501, but `/token/refresh`, `/who-am-i` and `/me` now return a `messageCode` and new message text. Message text is not a stable contract; match on `messageCode`.

   ```json
   // Before
   { "statusCode": 501, "message": "Method not implemented" }

   // After
   { "statusCode": 501, "messageCode": "core.not_supported", "message": "[AuthController] refreshToken is not supported." }
   ```

4. **`applicationEnvironment.get` takes an options object.** A bare `get(key, 'localhost')` no longer type-checks.

   ```typescript
   // Before
   const host = applicationEnvironment.get(EnvironmentKeys.APP_ENV_TYPESENSE_HOST, 'localhost');

   // After
   const host = applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_TYPESENSE_HOST, {
     defaultValue: 'localhost',
   });

   // the new `transform` option parses a raw env string
   const tags = applicationEnvironment.get<string[]>(EnvironmentKeys.APP_ENV_FEATURE_TAGS, {
     transform: toDelimitedArray,
     defaultValue: [],
   });
   ```

## Details

- bun 1.3.14 can silently drop `@inject` constructor-parameter decorators when an app's `tsconfig.json` only inherits `experimentalDecorators` through a package-style `extends` that bun cannot resolve. Injection then returns `undefined` at runtime, with no compile or startup error. Declare both flags directly in every bun-run app:

  ```json
  {
    "extends": "@venizia/dev-configs/tsconfig.common.json",
    "compilerOptions": {
      "experimentalDecorators": true,
      "emitDecoratorMetadata": true
    }
  }
  ```

## See also

- [Search & Typesense guide](/guides/core-concepts/persistent/search-typesense)
- [Typesense Advanced Search](/changelogs/2026-07-08-typesense-advanced-search)
- [Connectors Consistency Hardening](/changelogs/2026-07-11-connectors-consistency-hardening)
