---
title: Upgrading to Unified Connectors (BANA Guide)
description: What changed in @venizia/ignis 0.0.11-0 / @venizia/ignis-helpers 0.0.10-0 and the exact steps a consumer application must take
---

# Upgrading to Unified Connectors

**Target audience:** the BANA (nx-seller) team, and any application upgrading from `@venizia/ignis@0.0.10-x` / `@venizia/ignis-helpers@0.0.9-x`.

**Verification status:** every step below was validated against a full copy of BANA's `packages/core` source compiled against the release tarballs - the migration ends at **zero compile errors**. The search branch was additionally validated end to end against a live 3-node Typesense cluster.

## What changed (summary)

IGNIS core was restructured around ONE engine-neutral repository family:

- `src/base` now holds a single `AbstractRepository` / `AbstractDataSource` / `AbstractEntity` family. Every engine implements it under `src/connectors/{postgres,typesense,memory}`.
- Postgres remains re-exported from the root barrel - **your imports keep working unchanged**. Every connector is also addressable explicitly: `@venizia/ignis/postgres`, `@venizia/ignis/memory`, `@venizia/ignis/typesense` (typesense is subpath-only; its client is an optional peer).
- Canonical class names are the paradigm-family names (`BaseRelationalDataSource`, `BaseRelationalEntity`, `DefaultRelationalRepository`, ...); the engine name appears only at the concrete datasource (`TypesenseDataSource`) and the query dialect (`PostgresQueryOperators`). The historical names (`BaseDataSource`, `BaseEntity`, `BasePostgresDataSource`, `BasePostgresEntity`, `RDBQueryOperators`, `DefaultCRUDRepository`, ...) all remain as alias re-exports of the SAME classes - `instanceof`, metadata, and bindings are unaffected. No action required; prefer the family names in new code.
- New capabilities model: `dataSource.getCapabilities()` and a standardized NotSupported error (HTTP 501, messageCode `core.not_supported`) for engine gaps (e.g. transactions on search engines).
- New engines: a zero-dependency **memory connector** (prototyping/tests) and the **Typesense search branch** (`BaseSearchEntity`, `defineSearchCollection`, typed `TInferSearchDocument`, `DefaultSearchRepository`). Neither affects existing postgres code.

## Required migrations (in order)

### 1. Transaction type rename - the only sweeping change

`ITransaction` is now the neutral base contract (no `connector` field). The postgres-rich types were renamed:

| Old | New |
|---|---|
| `ITransaction<Schema>` (with `.connector`) | `IDatabaseTransaction<Schema>` |
| `ITransactionOptions` (postgres isolation levels) | `IDatabaseTransactionOptions` |
| `IExtraOptions` used as the repository 4th generic | `IDatabaseExtraOptions` |

Measured impact on BANA: 398 files, one mechanical rewrite, proven zero-error:

```bash
grep -rl 'ITransaction\|IExtraOptions' packages/*/src --include='*.ts' \
  | xargs sed -i 's/\bITransaction\b/IDatabaseTransaction/g; s/\bIExtraOptions\b/IDatabaseExtraOptions/g'
```

Note: `options?.transaction?.connector` inside `DefaultCRUDRepository` (alias of `DefaultRelationalRepository`) subclasses needs NO change - the postgres tiers now default their options generic to `IDatabaseExtraOptions`, so that path stays typed automatically.

### 2. `applicationEnvironment.get` - options object

The second positional argument became an options object (and gained `transform`):

```typescript
// Before
const port = applicationEnvironment.get<string>(Keys.PORT, '3000');

// After
const port = applicationEnvironment.get<string>(Keys.PORT, { defaultValue: '3000' });

// New capability - transform raw env values in one read:
const nodes = applicationEnvironment.get<string[], string>(Keys.NODES, {
  defaultValue: [],
  transform: value => toDelimitedArray(value),
});
```

Measured impact on BANA: **5 call sites** use the positional form. They fail at compile time (not silently), so `tsc` will point at each one:

```bash
grep -rnE "applicationEnvironment.get(<[^>]*>)?\([^,)]+, [^{]" packages/*/src --include='*.ts'
```

New helpers: `toDelimitedArray(input, separator?)` (split + trim + drop empties) and `toTrimmed(input)` from `@venizia/ignis-helpers`.

### 3. Purge stale TypeScript build info

The package's `exports` map changed; stale incremental caches replay phantom diagnostics for unchanged files (a page of bogus "missing property" errors while new files compile clean):

```bash
find . -name '*.tsbuildinfo' -not -path '*/node_modules/*' -delete
```

Run this once after the version bump, before trusting the first `tsc` run.

### 4. Auth endpoint error contract (only if you assert on it)

The three auth endpoints backed by unimplemented service methods (`refreshToken`, `getUserInformation`) now return the standardized NotSupported error: HTTP 501 with messageCode `core.not_supported` and message `[AuthController] <feature> is not supported.` (previously a plain `Method not implemented`). BANA was scanned: no code asserts on the old string - listed for completeness.

## Strongly recommended (not compile-blocking)

### Declare decorator flags directly in every bun-run app

bun 1.3.14 silently DROPS `@inject` constructor-parameter decorators when the app's `tsconfig.json` only inherits `experimentalDecorators` through a package-style `extends` it fails to resolve. Symptom: the app boots normally, every route mounts, and then `this.repository` / injected services are `undefined` at request time. Protect every app that runs via `bun src/...`:

```jsonc
// tsconfig.json - alongside your extends, not instead of it
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

All IGNIS examples now declare these explicitly.

## Rollout procedure (proven order)

1. Bump `@venizia/ignis` -> `0.0.11-0` and `@venizia/ignis-helpers` -> `0.0.10-0` in ONE canary package first - `packages/commerce` is the recommended canary (heaviest transaction + ControllerFactory usage).
2. Run migrations 1-3 on the canary; `tsc --noEmit` must be clean.
3. Run the canary's test suite.
4. Green -> apply migrations repo-wide, bump the remaining packages, full suite.

## What you explicitly do NOT need to do

- No import-path changes: root-barrel imports of `BaseDataSource`, `BaseEntity`, `DefaultCRUDRepository`, decorators, etc. all keep working (dual-door export model + compatibility aliases).
- No repository/generic signature changes: `DefaultCRUDRepository<Schema, DataObject, PersistObject, ...>` call sites are unchanged (a 4th options generic was APPENDED with a default).
- No runtime behavior changes on the postgres path: the whole pre-existing RDB behavior suite runs unchanged inside the release gates, and every behavior delta was verified to have no trigger inside BANA (`@model` tableName divergence: 0 occurrences; message-string assertions: 0).
- Nothing search-related: BANA imports zero search symbols today.
