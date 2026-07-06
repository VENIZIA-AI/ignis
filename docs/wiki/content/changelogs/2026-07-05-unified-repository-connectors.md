---
title: Unified Repository & Connectors Architecture
description: AbstractRepository/AbstractDataSource/AbstractEntity split into an engine-neutral base plus postgres, typesense, and memory connectors
---

# Changelog - 2026-07-05

## Unified Repository & Connectors Architecture

The persistence layer has been restructured from a single PostgreSQL-and-Drizzle-coupled `AbstractRepository`/`AbstractDataSource`/`AbstractEntity` family into an **engine-neutral root** (`src/base`) plus three **connectors** (`src/connectors/{postgres,typesense,memory}`). This unlocks two new engines - a `typesense` connector for full-text/faceted search and a zero-dependency `memory` connector for prototyping and tests - while keeping the PostgreSQL connector's public API almost entirely backward compatible via naming aliases.

## Overview

- **Engine-neutral base**: `AbstractRepository<TDataObject, TPersistObject, TOptions>`, `AbstractDataSource`, and `AbstractEntity` in `src/base` no longer import Drizzle, `pg`, or SQL-shaped types. `AbstractDataSource.getCapabilities()` and `beginTransaction()` default to "not supported"; `AbstractEntity.getIdType()` defaults to `'string'`.
- **Connectors architecture**: PostgreSQL (`AbstractPostgresDataSource` -> `BasePostgresDataSource`, `PostgresBaseRepository` -> `Readable`/`Persistable`/`DefaultCRUD`/`SoftDeletableRepository`), typesense (`AbstractSearchDataSource` -> `BaseSearchDataSource` -> `TypesenseDataSource`, `TypesenseBaseRepository` -> `Readable`/`Persistable`/`DefaultSearchRepository`), and memory (`MemoryDataSource`, `MemoryRepository`) each implement the neutral contracts independently.
- **New memory connector**: zero-dependency, `Map`-backed engine implementing full `TWhere` operator coverage (postgres-parity semantics) for prototyping and tests - no transactions, no locks.
- **New typesense connector**: `defineSearchCollection`/`field` DSL, `TInferSearchDocument<T>` type inference, `search<TResult>()` raw passthrough, `TypesenseQueryDialect` translating `TFilter`/`TWhere` into Typesense's `filter_by`/`sort_by`/`per_page` syntax.
- **Capabilities model**: every datasource exposes `getCapabilities(): { transactions: boolean }`; unsupported operations (transactions, row-level locks) uniformly throw `NotSupported` (HTTP 501, `messageCode: 'core.not_supported'`) via a new shared `throwNotSupported` utility.
- **Dual-door exports**: root `@venizia/ignis` re-exports the framework plus `postgres` and `memory` connectors (compatibility default); `@venizia/ignis/postgres`, `@venizia/ignis/memory`, and `@venizia/ignis/typesense` are available as explicit subpaths. `typesense` is subpath-only (optional peer dependency) - never pulled in by importing from the root.
- **Naming symmetry + compat aliases**: canonical engine-carrying names (`BasePostgresDataSource`, `BasePostgresEntity`) replace the old ambiguous `BaseDataSource`/`BaseEntity`, which now survive as re-export aliases of the exact same classes.
- **`AbstractRepository` generics renamed**: `TDataObject`/`TPersistObject`/`TOptions` replace the Drizzle-flavored `DataObject`/`PersistObject`/`ExtraOptions extends IExtraOptions` naming at the neutral base - PostgreSQL's `PostgresBaseRepository` narrows these into the familiar `EntitySchema`/`TTableObject`/`TTableInsert`-based signature.
- **Auth controller factory**: unimplemented-endpoint responses (`/token/refresh`, `/who-am-i`, `/me` when the underlying service doesn't implement the method) now go through the same `throwNotSupported` convention instead of a hand-rolled error.

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
  TInferSearchDocument,
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

**Benefits:**
- Adding a new engine no longer means depending on Drizzle/`pg` types you don't use
- Capability discovery (`getCapabilities()`) lets calling code branch on what an engine supports instead of guessing
- PostgreSQL's real behavior (pool, transactions, isolation levels) is entirely opt-in, added by `AbstractPostgresDataSource`/`BasePostgresDataSource`

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

**Solution:** A first-class connector with its own entity DSL (`defineSearchCollection`/`field.*`), type inference (`TInferSearchDocument<T>`), and a repository ladder (`ReadableSearchRepository` -> `PersistableSearchRepository` -> `DefaultSearchRepository`) that reuses `@model` settings (`hiddenProperties`, `defaultFilter`, `defaultLimit`) and translates `TFilter`/`TWhere` into Typesense's native query syntax via `TypesenseQueryDialect`. A raw `search<TResult>()` passthrough covers full-text/facet queries the `TFilter` dialect doesn't model.

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
- `TInferSearchDocument<T>` derives the TypeScript document shape from the collection definition - no hand-maintained duplicate type
- Optional peer dependency (`typesense`), subpath-only import (`@venizia/ignis/typesense`) - zero cost for apps that don't use search

### Dual-door exports and naming symmetry

**File:** `packages/core/package.json`, `packages/core/src/connectors/postgres/{datasources,models}/index.ts`

**Problem:** Introducing engine-carrying canonical names (`BasePostgresDataSource`, `BasePostgresEntity`) risked breaking every existing import of `BaseDataSource`/`BaseEntity`.

**Solution:** Canonical names are re-exported under their old names as compatibility aliases - `export { BasePostgresDataSource as BaseDataSource } from './base-datasource'` - so both names resolve to the identical class. New subpath exports (`./postgres`, `./memory`, `./typesense`) sit alongside the existing root barrel, which continues to re-export `postgres` + `memory` for compatibility.

```typescript
// Both resolve to the exact same class:
import { BaseDataSource } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';
```

**Benefits:**
- Zero required changes for existing PostgreSQL-only applications
- New code can be explicit about which engine it depends on
- Naming is unambiguous once more than one connector is in play

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/base/repositories/core/abstract-repository.ts` | Generics renamed to `TDataObject`/`TPersistObject`/`TOptions`; no Drizzle imports |
| `src/base/datasources/abstract-datasource.ts` | New file - engine-neutral `AbstractDataSource`, `getCapabilities()`, `NotSupported`-throwing `beginTransaction()` |
| `src/base/models/base.ts` | New file - engine-neutral `AbstractEntity`, `getIdType()` |
| `src/base/datasources/common/types.ts` | Neutral `ITransaction` (no `connector`), `IDataSourceCapabilities` |
| `src/connectors/postgres/**` | New connector - `AbstractPostgresDataSource`/`BasePostgresDataSource`, `BasePostgresEntity`, `PostgresBaseRepository` tier ladder, `IDatabaseTransaction`/`IDatabaseTransactionOptions`/`IDatabaseExtraOptions` |
| `src/connectors/typesense/**` | New connector - search entity DSL, datasource/driver/query-dialect, repository tier ladder |
| `src/connectors/memory/**` | New connector - `MemoryDataSource`, `MemoryRepository`, `where-matcher.ts` |
| `src/utilities/error.utility.ts` | New file - `throwNotSupported` shared utility |
| `src/components/auth/authenticate/controllers/factory.ts` | Unimplemented-endpoint responses now use `throwNotSupported` |
| `package.json` | New `exports` subpaths (`./postgres`, `./memory`, `./typesense`); `typesense` added as optional peer dependency |

### Helpers Package (`packages/helpers`)

| File | Changes |
|------|---------|
| `src/modules/search-engine/` | Removed - functionality folded into `@venizia/ignis`'s typesense connector |

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

### Step 4: Purge stale incremental build caches

```bash
find . -name '*.tsbuildinfo' -delete
```

Then rebuild (`make build` or the per-package `bun run rebuild`) to force a full type-check against the new `ITransaction`/`IDatabaseTransaction` split.

### Step 5 (optional): Adopt canonical connector names

No functional change is required, but new code should prefer `BasePostgresDataSource`/`BasePostgresEntity` over the `BaseDataSource`/`BaseEntity` aliases for clarity once more than one connector is in scope.
