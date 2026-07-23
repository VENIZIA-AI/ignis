---
title: Unified Repository & Connectors Architecture
description: The persistence layer splits into an engine-neutral base plus Postgres, Typesense, and memory connectors. New storage engines slot in without touching the core repository contract.
---

# Changelog - 2026-07-05

## Unified Repository & Connectors Architecture

<Badge type="warning" text="Breaking Change" /> <Badge type="tip" text="New Feature" /> <Badge type="info" text="Enhancement" />

**In one line.** The persistence layer splits into an engine-neutral base plus three connectors: Postgres, Typesense, and memory. New storage engines slot in without touching the core repository contract, and existing Postgres code keeps working almost unchanged.

## The problem it solves

`AbstractRepository`, `AbstractDataSource`, and `AbstractEntity` used to import Drizzle and `pg` types directly. Adding a second storage engine meant reworking those core types, not writing an independent connector.

The base layer is now engine-neutral, so a new connector plugs in without touching the repository contract:

```typescript
import { TypesenseDataSource, DefaultSearchRepository } from '@venizia/ignis/typesense';
```

Postgres becomes one connector among several - existing Postgres code keeps working almost unchanged.

## What changed

- **Engine-neutral base.** `AbstractRepository`, `AbstractDataSource`, and `AbstractEntity` no longer import Drizzle, `pg`, or any SQL-shaped type. Every connector implements the same neutral contract independently.
- **New Typesense connector.** Full-text and faceted search, with its own entity DSL (`defineSearchCollection` / `field`). A repository ladder mirrors the Postgres one, and a query dialect translates `TFilter` / `TWhere` into Typesense's native syntax.
- **New memory connector.** A zero-dependency, `Map`-backed engine with full `TWhere` operator coverage (Postgres-parity semantics). Built for prototyping and tests with no external database.
  > [!NOTE]
  > The memory connector was later removed on 2026-07-11 for having no known consumers. See the [Connectors Consistency Hardening](/changelogs/2026-07-11-connectors-consistency-hardening) changelog.
- **Capabilities model.** Every datasource now exposes `getCapabilities(): { transactions: boolean }`. Unsupported operations (transactions, row-level locks) throw a `NotSupported` error (HTTP 501) instead of failing in engine-specific ways.
- **Dual-door exports.** The root `@venizia/ignis` package keeps re-exporting Postgres and memory for backward compatibility. `@venizia/ignis/postgres`, `@venizia/ignis/memory`, and `@venizia/ignis/typesense` are also available as explicit sub-paths. Typesense is sub-path-only, so it never enters a bundle that doesn't use it.
- **Naming symmetry, with compatibility aliases.** Canonical class names are now paradigm-family names (`Relational`, `Search`) rather than engine names. Every previous name (`BaseDataSource`, `BaseEntity`, `BasePostgresDataSource`, `BasePostgresEntity`, `PostgresQueryOperators`/`RDBQueryOperators`) still resolves to the identical class.
- **`applicationEnvironment.get` is now options-based.** It ships two companion transforms, `toDelimitedArray` and `toTrimmed`, for parsing list-shaped environment values in a single read.
- **Auth controller responses standardized.** Unimplemented-endpoint responses (`/token/refresh`, `/who-am-i`, `/me`) now go through the same `NotSupported` convention as every other engine capability gap.
- **Typesense cluster-validation fixes**, found during live validation against a real 3-node cluster. An empty `where` no longer produces a malformed `filter_by` fragment, and collection provisioning no longer races a read-after-write check.

## Who is affected

- **Existing Postgres-only applications.** Almost nothing changes. Old class names still resolve through compatibility aliases, but the `ITransaction` and `applicationEnvironment.get` shapes changed - see Breaking changes below.
- **Anyone using the previous `@venizia/ignis-helpers` search-engine module.** Search moved to core - update your imports; see Breaking change 2.
- **Anyone whose code reads `.connector` or `.isolationLevel` off a transaction object.** Type annotation change required; see Breaking change 1.
- **Anyone calling `applicationEnvironment.get(key, defaultValue)` with a positional second argument.** Now a compile error; see Breaking change 4.
- **Teams wanting search or prototyping-only storage.** New opt-in Typesense and memory connectors - nothing to do unless you adopt them.

## Breaking changes

### 1. `ITransaction` split into a neutral interface and a Postgres-specific `IDatabaseTransaction`

The neutral `ITransaction` no longer has a `connector` field - only `isActive`, `commit()`, `rollback()`. Postgres-specific details (`connector`, `isolationLevel`) moved to `IDatabaseTransaction` in the Postgres connector.

**Before**
```typescript
import { ITransaction } from '@venizia/ignis';

async function withTx(tx: ITransaction) {
  await tx.connector.insert(userTable).values({ name: 'Alice' }); // connector on the neutral type
}
```

**After**
```typescript
import { ITransaction } from '@venizia/ignis';                     // neutral - no `connector`
import { IDatabaseTransaction } from '@venizia/ignis/postgres';    // postgres-specific

async function withTx(tx: IDatabaseTransaction) {
  await tx.connector.insert(userTable).values({ name: 'Alice' });  // connector on the postgres-specific type
}
```

Code that only calls `tx.commit()` / `tx.rollback()` / `tx.isActive` and never touches `.connector` or `.isolationLevel` needs no changes.

```bash
# Find call sites that need the type annotation updated
grep -rln "ITransaction" src/ | xargs grep -l "\.connector\b\|\.isolationLevel\b"
```

> [!NOTE]
> After upgrading, delete any `*.tsbuildinfo` incremental build caches before rebuilding (`find . -name '*.tsbuildinfo' -delete`). `tsc --incremental` can otherwise skip re-checking files that reference the old `ITransaction` shape and report a false green build.

### 2. Search symbols moved from `@venizia/ignis-helpers` to `@venizia/ignis/typesense`

The `search-engine` helper module is gone from `@venizia/ignis-helpers`; it is now the Typesense connector in core. There is no compatibility re-export.

**Before**
```typescript
import { SearchClient, defineSearchCollection } from '@venizia/ignis-helpers';
```

**After**
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

See the [Search & Typesense guide](/guides/core-concepts/persistent/search-typesense) for the full API.

### 3. Auth controller unimplemented-endpoint responses changed shape

The HTTP status code stays 501 when the underlying auth service doesn't implement a method. The response `messageCode` and message text changed, for `/token/refresh`, `/who-am-i`, and `/me`.

**Before**
```json
{ "statusCode": 501, "message": "Method not implemented" }
```

**After**
```json
{ "statusCode": 501, "messageCode": "core.not_supported", "message": "[AuthController] refreshToken is not supported." }
```

If client code pattern-matches on the literal `"Method not implemented"` string, switch to matching on `messageCode === 'core.not_supported'`. Message text is not a stable contract.

### 4. `applicationEnvironment.get` takes an options object instead of a positional `defaultValue`

**Before**
```typescript
const host = applicationEnvironment.get(EnvironmentKeys.APP_ENV_TYPESENSE_HOST, 'localhost');
```

**After**
```typescript
const host = applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_TYPESENSE_HOST, {
  defaultValue: 'localhost',
});

// the new `transform` option parses a raw env string in the same read
const tags = applicationEnvironment.get<string[]>(EnvironmentKeys.APP_ENV_FEATURE_TAGS, {
  transform: toDelimitedArray,
  defaultValue: [],
});
```

A bare `applicationEnvironment.get(key, 'localhost')` no longer type-checks, so a full rebuild surfaces every call site that needs updating:

```bash
grep -rn "applicationEnvironment\.get(\|Envs\.get(" src/ | grep -v "{ *defaultValue"
```

## Details

### New engine-neutral base

`AbstractRepository<TDataObject, TPersistObject, TOptions>` has no Drizzle types. `AbstractDataSource` has no `pool` or `connector`; it declares `getCapabilities()` and `beginTransaction()` with safe "not supported" defaults. `AbstractEntity` has just a `name` and `getIdType()`. `AbstractRelationalDataSource` and `BaseRelationalDataSource` layer Postgres's real behavior (pool, transactions, isolation levels) on top, entirely opt-in.

### Naming symmetry example

```typescript
// All three resolve to the exact same class:
import { BaseRelationalDataSource } from '@venizia/ignis/postgres';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';
import { BaseDataSource } from '@venizia/ignis';
```

### Known gotcha: bun can silently drop `@inject` decorators

> [!WARNING]
> When an app's `tsconfig.json` only inherits `experimentalDecorators` through a package-style `extends` that bun cannot resolve at compile time, bun 1.3.14 silently drops `@inject` constructor-parameter decorators. Dependency injection then returns `undefined` at runtime for the affected parameters, with no compile error and no startup failure to point at the cause.

Declare the decorator flags directly in every bun-run app's `tsconfig.json`, in addition to `extends`:

```json
{
  "extends": "@venizia/dev-configs/tsconfig.common.json",
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

All IGNIS example apps already declare both flags directly for this reason.

<details>
<summary>Files changed</summary>

| File | Changes |
|------|---------|
| `src/base/repositories/core/abstract.ts` | Generics renamed to `TDataObject` / `TPersistObject` / `TOptions`; no Drizzle imports |
| `src/base/datasources/abstract.ts` | New. Engine-neutral `AbstractDataSource`, `getCapabilities()`, `NotSupported`-throwing `beginTransaction()` |
| `src/base/models/base.ts` | New. Engine-neutral `AbstractEntity`, `getIdType()` |
| `src/connectors/postgres/**` | New connector - Relational family (datasource, entity, repository ladder) |
| `src/connectors/typesense/**` | New connector - search entity DSL, datasource/driver/query-dialect, repository ladder |
| `src/connectors/memory/**` | New connector - `MemoryDataSource`, `MemoryRepository`, `where-matcher.ts` |
| `src/utilities/error.utility.ts` | New. `throwNotSupported` shared utility |
| `src/components/auth/authenticate/controllers/factory.ts` | Unimplemented-endpoint responses use `throwNotSupported` |
| `packages/core/package.json` | New `exports` sub-paths (`./postgres`, `./memory`, `./typesense`); `typesense` added as optional peer |
| `packages/helpers/src/modules/search-engine/` | Removed - folded into `@venizia/ignis`'s Typesense connector |
| `packages/helpers/src/modules/env/app-env.ts` | Breaking - `ApplicationEnvironment.get` options-based signature |
| `packages/helpers/src/utilities/parse.utility.ts` | New. `toDelimitedArray`, `toTrimmed` transforms |

</details>

## See also

- [Search & Typesense guide](/guides/core-concepts/persistent/search-typesense) - full Typesense connector API
- [Typesense Advanced Search](/changelogs/2026-07-08-typesense-advanced-search) - vector search, multi-search, and synonyms added on top of this connector
- [Connectors Consistency Hardening](/changelogs/2026-07-11-connectors-consistency-hardening) - removed the memory connector introduced here
