---
title: Unified Repository & Connectors Architecture
description: AbstractRepository/AbstractDataSource/AbstractEntity split into an engine-neutral base plus postgres, typesense, and memory connectors
---

# Changelog - 2026-07-05

## Unified Repository & Connectors Architecture

The persistence layer has been restructured from a single PostgreSQL-and-Drizzle-coupled `AbstractRepository`/`AbstractDataSource`/`AbstractEntity` family into an **engine-neutral root** (`src/base`) plus three **connectors** (`src/connectors/{postgres,typesense,memory}`). This unlocks two new engines - a `typesense` connector for full-text/faceted search and a zero-dependency `memory` connector for prototyping and tests - while keeping the PostgreSQL connector's public API almost entirely backward compatible via naming aliases.

## Overview

- **Engine-neutral base**: `AbstractRepository<TDataObject, TPersistObject, TOptions>`, `AbstractDataSource`, and `AbstractEntity` in `src/base` no longer import Drizzle, `pg`, or SQL-shaped types. `AbstractDataSource.getCapabilities()` and `beginTransaction()` default to "not supported"; `AbstractEntity.getIdType()` defaults to `'string'`.
- **Connectors architecture**: PostgreSQL (`AbstractRelationalDataSource` -> `BaseRelationalDataSource`, `RelationalBaseRepository` -> `ReadableRelationalRepository`/`PersistableRelationalRepository`/`DefaultRelationalRepository`/`SoftDeletableRelationalRepository`), typesense (`AbstractSearchDataSource` -> `BaseSearchDataSource` -> `TypesenseDataSource`, `SearchBaseRepository` -> `ReadableSearchRepository`/`PersistableSearchRepository`/`DefaultSearchRepository`), and memory (`MemoryDataSource`, `MemoryRepository`) each implement the neutral contracts independently.
- **New memory connector**: zero-dependency, `Map`-backed engine implementing full `TWhere` operator coverage (postgres-parity semantics) for prototyping and tests - no transactions, no locks.
- **New typesense connector**: `defineSearchCollection`/`field` DSL, `TSearchDocument<T>` type inference, `search<TResult>()` raw passthrough, `TypesenseQueryDialect` translating `TFilter`/`TWhere` into Typesense's `filter_by`/`sort_by`/`per_page` syntax.
- **Capabilities model**: every datasource exposes `getCapabilities(): { transactions: boolean }`; unsupported operations (transactions, row-level locks) uniformly throw `NotSupported` (HTTP 501, `messageCode: 'core.not_supported'`) via a new shared `throwNotSupported` utility.
- **Dual-door exports**: root `@venizia/ignis` re-exports the framework plus `postgres` and `memory` connectors (compatibility default); `@venizia/ignis/postgres`, `@venizia/ignis/memory`, and `@venizia/ignis/typesense` are available as explicit subpaths. `typesense` is subpath-only (optional peer dependency) - never pulled in by importing from the root.
- **Naming symmetry + compat aliases**: canonical names are paradigm-family names (`Relational`, `Search`) - the engine name appears only at the concrete datasource (`TypesenseDataSource`) and the query dialect (`PostgresQueryOperators`/`TypesenseQueryDialect`). All previous names - `BaseDataSource`, `BaseEntity`, and the interim `BasePostgresDataSource`/`BasePostgresEntity` - survive as aliases of the same classes. The same pattern applies to `PostgresQueryOperators` (alias `RDBQueryOperators`).
- **`AbstractRepository` generics renamed**: `TDataObject`/`TPersistObject`/`TOptions` replace the Drizzle-flavored `DataObject`/`PersistObject`/`ExtraOptions extends IExtraOptions` naming at the neutral base - PostgreSQL's `RelationalBaseRepository` narrows these into the familiar `EntitySchema`/`TTableObject`/`TTableInsert`-based signature.
- **Auth controller factory**: unimplemented-endpoint responses (`/token/refresh`, `/who-am-i`, `/me` when the underlying service doesn't implement the method) now go through the same `throwNotSupported` convention instead of a hand-rolled error.
- **`applicationEnvironment.get` is now options-based**: `get<ReturnType, BeforeTransformType>(key, { defaultValue?, transform? })` replaces the old positional `get(key, defaultValue)` signature, and ships alongside two companion transforms, `toDelimitedArray`/`toTrimmed`, for parsing list-shaped env values in one read.
- **Typesense cluster-validation fixes**: `TypesenseQueryDialect` no longer emits malformed `filter_by` fragments for empty `where` members, and `ensureCollection` no longer read-back-races newly created collections on multi-node clusters - both found during live validation against a real 3-node Typesense cluster.

## Breaking Changes

> [!WARNING]
> This section contains changes that require migration or manual updates to existing code.

### 1. `ITransaction` split into a neutral interface and a PostgreSQL-specific `IDatabaseTransaction`

The engine-neutral `ITransaction` no longer has a `connector` field - it only has `isActive`, `commit()`, `rollback()`. PostgreSQL-specific transaction details (`connector`, `isolationLevel`) moved to a new `IDatabaseTransaction` (and matching `IDatabaseTransactionOptions`/`IDatabaseExtraOptions`) in the postgres connector.

**Before:**
```typescript
import { ITransaction, ITransactionOptions, IExtraOptions } from '@venizia/ignis';

interface IExtraOptions {
  transaction?: ITransaction;   // ITransaction had `connector`, `isolationLevel` directly
}

async function withTx(tx: ITransaction) {
  await tx.connector.insert(userTable).values({ name: 'Alice' }); // connector on the neutral type
}
```

**After:**
```typescript
import { ITransaction } from '@venizia/ignis';                     // neutral - no `connector`
import {
  IDatabaseTransaction,
  IDatabaseTransactionOptions,
  IDatabaseExtraOptions,
} from '@venizia/ignis/postgres';                                    // postgres-specific

interface IDatabaseExtraOptions extends IExtraOptions {
  transaction?: IDatabaseTransaction;                                 // has `connector`, `isolationLevel`
}

async function withTx(tx: IDatabaseTransaction) {
  await tx.connector.insert(userTable).values({ name: 'Alice' });    // connector on the postgres-specific type
}
```

**Migrating your own type annotations:**

If your code annotates variables/parameters as `ITransaction` and accesses `.connector` or `.isolationLevel` on them, switch the annotation to `IDatabaseTransaction`:

```bash
# One-liner to find call sites that need the type annotation updated
grep -rln "ITransaction" src/ | xargs grep -l "\.connector\b\|\.isolationLevel\b"
```

Then update the import and annotation:

```typescript
// Before
import { ITransaction } from '@venizia/ignis';
function commitOrder(tx: ITransaction) { /* uses tx.connector */ }

// After
import { IDatabaseTransaction } from '@venizia/ignis/postgres';
function commitOrder(tx: IDatabaseTransaction) { /* uses tx.connector */ }
```

Code that only calls `tx.commit()`/`tx.rollback()`/`tx.isActive` and never touches `.connector`/`.isolationLevel` needs no changes - the neutral `ITransaction` still covers that surface.

> [!NOTE]
> After upgrading, delete any `*.tsbuildinfo` incremental build caches before rebuilding (`find . -name '*.tsbuildinfo' -delete`). `tsc --incremental` can otherwise skip re-checking files that reference the old `ITransaction` shape and report false green builds.

### 2. Search symbols moved from `@venizia/ignis-helpers` to `@venizia/ignis/typesense`

The prior `search-engine` helper module has been removed from `@venizia/ignis-helpers` entirely and folded into core as the typesense connector.

**Before:**
```typescript
import { SearchClient, defineSearchCollection } from '@venizia/ignis-helpers';
```

**After:**
```typescript
import {
  TypesenseDataSource,
  BaseSearchEntity,
  defineSearchCollection,
  field,
  TSearchDocument,
  DefaultSearchRepository,
} from '@venizia/ignis/typesense';
```

There is no compatibility re-export from `@venizia/ignis-helpers` - update imports directly. See the [Search & Typesense guide](/guides/core-concepts/persistent/search-typesense) for the full new API.

### 3. Auth controller unimplemented-endpoint responses now return `messageCode: 'core.not_supported'`

The HTTP status code is unchanged (501), but the response `messageCode` and message text changed for `/token/refresh`, `/who-am-i`, and `/me` when the underlying auth service doesn't implement the corresponding method.

**Before:**
```json
{ "statusCode": 501, "message": "Method not implemented" }
```

**After:**
```json
{ "statusCode": 501, "messageCode": "core.not_supported", "message": "[AuthController] refreshToken is not supported." }
```

If client code pattern-matches on the literal `"Method not implemented"` message string, switch to matching on `messageCode === 'core.not_supported'` instead - message text is not a stable contract.

### 4. `applicationEnvironment.get` takes an options object instead of a positional `defaultValue`

`ApplicationEnvironment.get` (`@venizia/ignis-helpers`) changed from `get(key, defaultValue)` to `get<ReturnType, BeforeTransformType>(key, { defaultValue?, transform? })`. The new `transform` parameter runs before `defaultValue` is applied, letting a single `get()` call parse a raw env string into its final shape - e.g. a comma-separated node list into an array of `{ host, port }` objects.

**Before:**
```typescript
import { applicationEnvironment } from '@venizia/ignis-helpers';

const host = applicationEnvironment.get(EnvironmentKeys.APP_ENV_TYPESENSE_HOST, 'localhost');
```

**After:**
```typescript
import { applicationEnvironment, toDelimitedArray } from '@venizia/ignis-helpers';

const host = applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_TYPESENSE_HOST, {
  defaultValue: 'localhost',
});

// transform: parse a comma-separated env value in the same read
const tags = applicationEnvironment.get<string[]>(EnvironmentKeys.APP_ENV_FEATURE_TAGS, {
  transform: toDelimitedArray,
  defaultValue: [],
});
```

Positional second-argument callers must wrap the value in `{ defaultValue }`. A bare `applicationEnvironment.get(key, 'localhost')` no longer type-checks - `opts` is now an object shape (`{ defaultValue?, transform? }`), so a plain string/number/boolean second argument fails `tsc` with an "is not assignable" error at every stale call site. This is a compile-time break, not a silent runtime one - a full rebuild (`tsc --noEmit` or the per-package `bun run rebuild`) surfaces every call site that needs updating.

**Companion utilities:** `toDelimitedArray(input, separator = ',')` splits a delimited string into trimmed, non-empty entries (`toDelimitedArray(' a, b ,, c ')` -> `['a', 'b', 'c']`), and `toTrimmed(input)` normalizes a possibly-absent value to a trimmed string (`''` when absent). Both live in `@venizia/ignis-helpers`'s `parse.utility` and are designed to be passed directly as `transform`:

```typescript
const nodes = applicationEnvironment.get<string[]>(EnvironmentKeys.APP_ENV_TYPESENSE_NODES, {
  transform: toDelimitedArray,
  defaultValue: [],
});
```

## New Features

### Engine-neutral `AbstractRepository` / `AbstractDataSource` / `AbstractEntity`

**File:** `packages/core/src/base/repositories/core/abstract-repository.ts`, `packages/core/src/base/datasources/abstract-datasource.ts`, `packages/core/src/base/models/base.ts`

**Problem:** The base classes every connector had to extend were themselves PostgreSQL-and-Drizzle-aware (`pool`, Drizzle `connector`, SQL-shaped `TWhere`/`TFilter`), making it impossible to add a non-relational engine without carrying dead weight or forking the base classes.

**Solution:** Strip `src/base` down to what every engine can implement - `AbstractRepository<TDataObject, TPersistObject, TOptions>` has no Drizzle types; `AbstractDataSource` has no `pool`/`connector`, and declares `getCapabilities()`/`beginTransaction()` with safe "not supported" defaults; `AbstractEntity` has just a `name` and `getIdType()`.

```typescript
abstract class AbstractDataSource<...> extends BaseHelper implements IDataSource<...> {
  getCapabilities(): IDataSourceCapabilities {
    return { transactions: false };
  }

  async beginTransaction(_opts?: ITransactionOptions): Promise<ITransaction> {
    return throwNotSupported({ scope: this.constructor.name, feature: 'Transactions', logger: this.logger });
  }
}
```

`AbstractEntity.getIdType()` follows the same pattern: it defaults to `'string'`, and each entity family narrows it independently - `BaseRelationalEntity.getIdType()` inspects the underlying `pgTable` column to return `'number'` or `'string'`, while `BaseSearchEntity` and the memory connector always resolve `'string'`. `ControllerFactory.defineCrudController` reads `entityInstance.getIdType()` to resolve the id path-param shape, so a generated CRUD controller gets the right `/{id}` type without an engine-specific branch.

**Benefits:**
- Adding a new engine no longer means depending on Drizzle/`pg` types you don't use
- Capability discovery (`getCapabilities()`) lets calling code branch on what an engine supports instead of guessing
- PostgreSQL's real behavior (pool, transactions, isolation levels) is entirely opt-in, added by `AbstractRelationalDataSource`/`BaseRelationalDataSource`

### Memory connector

**File:** `packages/core/src/connectors/memory/`

**Problem:** Testing repository/service/controller logic required a real PostgreSQL instance, even for simple unit tests with no relational query needs.

**Solution:** A zero-dependency, `Map`-backed `MemoryDataSource`/`MemoryRepository` pair implementing the full CRUD surface plus a scoped `TWhere` operator vocabulary (`eq`, `neq`, comparisons, `like`/`ilike`, `inq`/`nin`, `between`, `and`/`or`) with postgres-parity semantics (e.g. NULL-safe comparisons, NULLS LAST/FIRST sort defaults).

```typescript
@repository({ model: Note, dataSource: TestDataSource })
export class NoteRepository extends MemoryRepository<TNote> {}

const repo = new NoteRepository(new TestDataSource());
await repo.create({ data: { title: 'Draft', body: '...', archived: false } });
const { data } = await repo.find({ filter: { where: { archived: false } } });
```

**Benefits:**
- Tests run fully in-process with no external service
- Same `@repository`/`@model` decorators and `TFilter`/`TWhere` shapes as PostgreSQL - migrating a prototype to a real database is a datasource/base-class swap, not a rewrite

### Typesense connector: search & faceting

**File:** `packages/core/src/connectors/typesense/`

**Problem:** Full-text and faceted search didn't fit the SQL-shaped repository contract, and the previous `@venizia/ignis-helpers` search-engine module lived outside the framework's decorator/DI conventions.

**Solution:** A first-class connector with its own entity DSL (`defineSearchCollection`/`field.*`), type inference (`TSearchDocument<T>`), and a repository ladder (`ReadableSearchRepository` -> `PersistableSearchRepository` -> `DefaultSearchRepository`) that reuses `@model` settings (`hiddenProperties`, `defaultFilter`, `defaultLimit`) and translates `TFilter`/`TWhere` into Typesense's native query syntax via `TypesenseQueryDialect`. A raw `search<TResult = ISearchResult<TDocument>>()` passthrough covers full-text/facet queries the `TFilter` dialect doesn't model - the default type parameter returns the document's own `ISearchResult` shape, and callers override `TResult` for engine responses shaped differently (e.g. grouped hits).

```typescript
export class ArticleDocument extends BaseSearchEntity {
  static override schema = defineSearchCollection({
    name: 'articles',
    fields: [field.id(), field.string('title', { searchable: true }), field.number('views', { sortable: true })],
  });
}

@repository({ model: ArticleDocument, dataSource: SearchDataSource })
export class ArticleRepository extends DefaultSearchRepository<TArticleDocument> {}

const result = await articleRepository.search({ params: { q: 'typescript', query_by: ['title'] } });
```

**Benefits:**
- Search documents get the same `@model`/`@repository`/`@datasource` ergonomics as relational tables
- `TSearchDocument<T>` derives the TypeScript document shape from the collection definition - no hand-maintained duplicate type
- Optional peer dependency (`typesense`), subpath-only import (`@venizia/ignis/typesense`) - zero cost for apps that don't use search

**Cluster mode:** `TypesenseDataSource` accepts multiple `nodes` for a multi-node cluster instead of a single `host`/`port`. The `examples/typesense-search` reference app resolves this from a single comma-separated env var, `APP_ENV_TYPESENSE_NODES`, falling back to the single-node host/port pair when unset - the same `applicationEnvironment.get` + `transform` pattern from the breaking change above:

```typescript
// APP_ENV_TYPESENSE_NODES=node1:8108,node2:8108,node3:8108
const clusterNodes = applicationEnvironment.get<
  Array<{ host: string; port: number; protocol: string }>,
  string
>(EnvironmentKeys.APP_ENV_TYPESENSE_NODES, {
  defaultValue: [],
  transform: value =>
    toDelimitedArray(value).map(entry => {
      const [host, port] = entry.split(':');
      return { host, port: int(port), protocol };
    }),
});
```

### Dual-door exports and naming symmetry

**File:** `packages/core/package.json`, `packages/core/src/connectors/postgres/{datasources,models}/index.ts`

**Problem:** Introducing engine-carrying canonical names (`BasePostgresDataSource`, `BasePostgresEntity`) risked breaking every existing import of `BaseDataSource`/`BaseEntity`, and still left the naming ambiguous once a second engine (typesense) needed the same ladder shape.

**Solution:** Canonical names are the paradigm-family names (`Relational` for postgres, `Search` for typesense) - the engine name appears only at the concrete datasource (`TypesenseDataSource`) and the query dialect (`PostgresQueryOperators`/`TypesenseQueryDialect`). Every previous name, including the interim engine-carrying names, is re-exported as a compatibility alias of the exact same class - `export { BaseRelationalDataSource as BasePostgresDataSource } from './base'`, and `BaseDataSource` is aliased the same way. The same alias pattern applies to `export { PostgresQueryOperators as RDBQueryOperators } from './dialect'` (the operators file moved from `repositories/operators/` to `repositories/dialect/`). New subpath exports (`./postgres`, `./memory`, `./typesense`) sit alongside the existing root barrel, which continues to re-export `postgres` + `memory` for compatibility.

```typescript
// All three resolve to the exact same class:
import { BaseRelationalDataSource } from '@venizia/ignis/postgres';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';
import { BaseDataSource } from '@venizia/ignis';

// Both resolve to the exact same operator table:
import { PostgresQueryOperators } from '@venizia/ignis/postgres';
import { RDBQueryOperators } from '@venizia/ignis/postgres';
```

Tier semantics are uniform across both connectors: `Persistable*` (`PersistableRelationalRepository`, `PersistableSearchRepository`) implements all writes including delete; `Default*` (`DefaultRelationalRepository`, `DefaultSearchRepository`) is a convenience subclass only - it adds no new verbs.

**Benefits:**
- Zero required changes for existing PostgreSQL-only applications
- New code can be explicit about which paradigm family it depends on, without hardcoding an engine name into every class in the ladder
- Naming is unambiguous once more than one connector is in play - this is a rename with a compatibility alias, not a breaking change in practice, since the old names keep resolving to the identical class

## Performance Improvements

### Typesense connector: filter_by and provisioning fixes found during live cluster validation

**File:** `packages/core/src/connectors/typesense/query-dialect.ts`, `packages/core/src/connectors/typesense/driver.ts`

**Problem:** Two issues surfaced only under real multi-node Typesense conditions, not the in-memory fakes the connector's unit tests run against: (1) a `where` clause containing an empty member - e.g. `{}` merged in by default-filter plumbing when a repository combines a caller's filter with `@model({ settings: { defaultFilter } })` - produced a malformed `filter_by` fragment that Typesense rejected, surfacing as a 503 on operations like `count()` with an otherwise-empty where; (2) `ensureCollection` read the newly created collection back immediately after `create()`, which raced Typesense's raft replication on a multi-node cluster - a follower node could still 404 the read before catching up, crashing boot-time schema provisioning.

**Solution:** `TypesenseQueryDialect.buildLogicalGroup` now drops empty members before joining `and`/`or` clauses, so an empty `where` (or an empty branch inside one) never reaches `filter_by`. `TypesenseDriver.ensureCollection` uses the `create()` response directly as the return value instead of issuing a follow-up read - only the already-exists path (caught via the tolerated 409) still re-reads the collection.

| Scenario | Fix |
|----------|-----|
| `count()`/`find()` where `where` contains an empty `{}` member (e.g. via default-filter merge) | No more malformed `filter_by` fragment / 503 - empty members are dropped before the clause is joined |
| `ensureCollection` during boot provisioning on a 3-node cluster | No more read-after-write race - the create response is used directly, avoiding a follower-node 404 before raft catch-up |

Both were found and fixed during live validation against a real 3-node Typesense cluster - the connector's existing unit-test suite (in-memory fakes) does not exercise multi-node replication timing.

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/base/repositories/core/abstract-repository.ts` | Generics renamed to `TDataObject`/`TPersistObject`/`TOptions`; no Drizzle imports |
| `src/base/datasources/abstract-datasource.ts` | New file - engine-neutral `AbstractDataSource`, `getCapabilities()`, `NotSupported`-throwing `beginTransaction()` |
| `src/base/models/base.ts` | New file - engine-neutral `AbstractEntity`, `getIdType()` |
| `src/base/datasources/common/types.ts` | Neutral `ITransaction` (no `connector`), `IDataSourceCapabilities` |
| `src/connectors/postgres/**` | New connector - `AbstractRelationalDataSource`/`BaseRelationalDataSource`, `BaseRelationalEntity`, `RelationalBaseRepository` tier ladder (`ReadableRelationalRepository`/`PersistableRelationalRepository`/`DefaultRelationalRepository`/`SoftDeletableRelationalRepository`), `IDatabaseTransaction`/`IDatabaseTransactionOptions`/`IDatabaseExtraOptions` |
| `src/connectors/postgres/repositories/dialect/index.ts` | New compatibility alias - `export { PostgresQueryOperators as RDBQueryOperators }` |
| `src/connectors/typesense/**` | New connector - search entity DSL, datasource/driver/query-dialect, repository tier ladder |
| `src/connectors/typesense/query-dialect.ts` | Fix - `buildLogicalGroup` drops empty `where` members before joining `and`/`or` clauses, preventing malformed `filter_by` |
| `src/connectors/typesense/driver.ts` | Fix - `ensureCollection` returns the `create()` response directly instead of re-reading, avoiding a read-after-write race on multi-node clusters |
| `src/connectors/memory/**` | New connector - `MemoryDataSource`, `MemoryRepository`, `where-matcher.ts` |
| `src/utilities/error.utility.ts` | New file - `throwNotSupported` shared utility |
| `src/components/auth/authenticate/controllers/factory.ts` | Unimplemented-endpoint responses now use `throwNotSupported` |
| `package.json` | New `exports` subpaths (`./postgres`, `./memory`, `./typesense`); `typesense` added as optional peer dependency |

### Helpers Package (`packages/helpers`)

| File | Changes |
|------|---------|
| `src/modules/search-engine/` | Removed - functionality folded into `@venizia/ignis`'s typesense connector |
| `src/modules/env/app-env.ts` | Breaking - `ApplicationEnvironment.get` changed from positional `get(key, defaultValue)` to `get<ReturnType, BeforeTransformType>(key, { defaultValue?, transform? })` |
| `src/utilities/parse.utility.ts` | New exports - `toDelimitedArray(input, separator?)`, `toTrimmed(input)` transforms for env parsing |

### Examples (all bun-run apps)

| File | Changes |
|------|---------|
| `examples/*/tsconfig.json` | `experimentalDecorators`/`emitDecoratorMetadata` now declared directly in every app tsconfig instead of relying solely on `extends` (see Upgrade Notes below) |
| `examples/typesense-search/src/datasources/search.datasource.ts` | New example - cluster-mode `SearchDataSource` resolving `APP_ENV_TYPESENSE_NODES` via `applicationEnvironment.get` + `toDelimitedArray` |

## Migration Guide

> [!NOTE]
> Follow these steps if you're upgrading from a previous version.

### Step 1: Update `ITransaction` type annotations that access `.connector`/`.isolationLevel`

```bash
grep -rln "ITransaction" src/ | xargs grep -l "\.connector\b\|\.isolationLevel\b"
```

Switch each match's import/annotation from `ITransaction` (`@venizia/ignis`) to `IDatabaseTransaction` (`@venizia/ignis/postgres`).

### Step 2: Migrate search imports

Replace any `@venizia/ignis-helpers` search-engine imports with `@venizia/ignis/typesense` equivalents (see the [Search & Typesense guide](/guides/core-concepts/persistent/search-typesense) for the new entity/repository API).

### Step 3: Update client-side error matching for auth endpoints

If any client matches on the literal `"Method not implemented"` string for `/token/refresh`, `/who-am-i`, or `/me`, switch to matching `messageCode === 'core.not_supported'`.

### Step 4: Update `applicationEnvironment.get` call sites

Find calls that pass a positional second argument instead of an options object:

```bash
grep -rn "applicationEnvironment\.get(\|Envs\.get(" src/ | grep -v "{ *defaultValue"
```

Wrap the positional value in `{ defaultValue }`:

```typescript
// Before
applicationEnvironment.get(EnvironmentKeys.APP_ENV_HOST, 'localhost');

// After
applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_HOST, { defaultValue: 'localhost' });
```

A stale positional call fails `tsc` immediately (`opts` is now an object shape, not a scalar), so the grep above is a fast pre-check - the full rebuild in Step 5 is what confirms every call site across the codebase is updated.

### Step 5: Purge stale incremental build caches

```bash
find . -name '*.tsbuildinfo' -delete
```

Then rebuild (`make build` or the per-package `bun run rebuild`) to force a full type-check against the new `ITransaction`/`IDatabaseTransaction` split and the new `applicationEnvironment.get` signature.

### Step 6 (optional): Adopt canonical connector names

No functional change is required, but new code should prefer the `Relational`-family names - `BaseRelationalDataSource`/`BaseRelationalEntity`/`DefaultRelationalRepository` - over the `BaseDataSource`/`BaseEntity`/`DefaultCRUDRepository`/`BasePostgresDataSource`/`BasePostgresEntity` aliases for clarity once more than one connector is in scope. `PostgresQueryOperators` remains the canonical query-operators name (alias `RDBQueryOperators`).

### Step 7: Guard against bun silently dropping `@inject` decorators

> [!WARNING]
> Bun 1.3.14 silently drops `@inject` constructor-parameter decorators when an app's `tsconfig.json` only inherits `experimentalDecorators` through a package-style `extends` (e.g. `"extends": "@venizia/dev-configs/tsconfig.common.json"`) that bun cannot resolve at compile time. Dependency injection then returns `undefined` at runtime for the affected constructor parameters, while boot itself completes and reports healthy - there is no compile error and no startup failure to point at the cause.

Declare the decorator flags directly in every bun-run app's `tsconfig.json` `compilerOptions`, in addition to the `extends`:

```json
{
  "extends": "@venizia/dev-configs/tsconfig.common.json",
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

All IGNIS example apps (`examples/vert`, `examples/5-mins-qs`, `examples/typesense-search`, `examples/grpc-test`, `examples/socket-io-test`, `examples/websocket-test`, `examples/rpc-api-server`) already declare both flags directly for this reason - treat their `tsconfig.json` as the reference, not just the shared `dev-configs` base.
