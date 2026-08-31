---
type: Package
title: connectors
description: Every datasource, driver and repository chain that talks to a backing engine - the engine-neutral relational and search tiers in the root barrel, with Postgres, SQLite, PGlite, Typesense and Meilisearch behind sub-paths.
resource: packages/connectors
tags: [packages, connectors, drizzle, relational, search, browser]
---

`@venizia/ignis-connectors` holds every datasource, driver, entity base and repository chain that
reaches a backing engine. Wave 3 of the kernel refactor carved it out of
`packages/core-server/src/connectors` - 168 source files outside `__tests__`, around 14,200 lines.

It depends on `kernel`, `filter`, `helpers`, and `inversion`, and sits between `kernel` and `core`:
`dev-configs -> inversion -> {filter, helpers} -> {boot, kernel} -> connectors -> core`.
`make connectors` needs `kernel`; `make core` needs `boot connectors`. It ships a **single-format
CommonJS build**, like `kernel` and unlike `inversion`, `filter`, and `boot`.

`core-worker` does NOT depend on it. A browser application that wants a database installs this
package directly - see [browser-bff](/examples/browser-bff.md).

## The root barrel is the abstract tiers, and only those

`src/index.ts` is two lines:

```typescript
export * from './relational/core';
export * from './search/core';
```

Every engine sits behind a sub-path, so importing the package root pulls in no driver and no engine
client. The bundle tests in `src/__tests__/postgres/bundle/` pin that: `root-only.entry.ts` imports
the root barrel and asserts neither `pg` nor `postgres` reaches the output. A dynamic import would
not have achieved this - `dynamic-import.entry.ts` proves that `await import()` defers execution, not
packaging. A driver reaches a bundle only when the application names its class.

## The 14 published sub-paths

The peers `drizzle-orm`, `drizzle-zod`, `hono`, and `@hono/zod-openapi` are required, because the
neutral tiers value-import them. The six engine peers below are declared optional in
`peerDependenciesMeta`.

| Sub-path | Source | Engine peer | Bundles for a browser |
|---|---|---|---|
| `.` | `relational/core` + `search/core` | none | yes |
| `/relational` | `relational/core` | none | yes |
| `/postgres` | `relational/postgres` | `drizzle-orm/pg-core` only | yes |
| `/postgres/node-postgres` | `NodePostgresDriver` | `pg` | no - `pg` requires `util/types` |
| `/postgres/postgres-js` | `PostgresJsDriver` | `postgres` | no - `postgres` requires `tls` |
| `/postgres/pglite` | `PGliteDriver` | `@electric-sql/pglite` | yes, with the vendor externalised |
| `/postgres/supabase` | RLS and pooler helpers | none | yes |
| `/sqlite` | `relational/sqlite` | `drizzle-orm/sqlite-core` only | yes |
| `/sqlite/libsql` | `LibSqlDriver` | `@libsql/client` | no |
| `/search` | `search/core` | none | yes |
| `/search/controllers` | `search/core/controllers` | none | yes |
| `/typesense` | `search/typesense` | `typesense` | no - the client needs `http`, `vm`, `crypto` |
| `/typesense/controllers` | `search/core/controllers` | none | yes |
| `/meilisearch` | `search/meilisearch` | `meilisearch` | yes - the client is fetch-based |

Two naming nuances. `./relational` and `./search` resolve to `relational/core` and `search/core` -
the published specifier drops the `core` segment. `./typesense/controllers` and
`./search/controllers` resolve to the SAME file: the search controllers are engine-neutral and
Typesense keeps its historical specifier.

`src/search/typesense/index.ts` re-exports `@/search/core` so the Typesense sub-path still resolves
every symbol it carried before the lift. `src/search/meilisearch/index.ts` does not - reach the
neutral search symbols through `/search` there.

## `core` re-exports it, and the two roots carry different symbols

`packages/core-server/src/connectors/` is now 14 alias barrels, one per sub-path, each a single
`export * from '@venizia/ignis-connectors/<sub-path>'`. That keeps every `@venizia/ignis/<sub-path>`
specifier resolving for published consumers.

The root alias is the one that is not mechanical. `packages/core-server/src/connectors/index.ts` re-exports
`@venizia/ignis-connectors/postgres`, not the connectors root:

```typescript
export * from '@venizia/ignis-connectors/postgres';
```

The pre-move root barrel of `@venizia/ignis` re-exported `./postgres` alone and never the neutral
cores. Re-exporting the connectors root here would drop every Postgres name. It would also collide
on the shared type names - `TTableObject`, `TRelationConfig` and friends - which the Postgres tier
redeclares rather than re-exports.

So the two package roots deliberately differ. Measured against `dist/`: the connectors root exports
43 runtime symbols, the Postgres sub-path exports 32, and they share 4 -
`BaseRelationalEntity`, `getIdType`, `getCachedColumns`, `createRelations`. `@venizia/ignis` gets the
Postgres 32 at its root; `@venizia/ignis-connectors` gets the neutral 43.

## What it owns

| Tier | What lives there |
|---|---|
| `relational/core` | `AbstractRelationalDataSource`, `BaseRelationalDataSource`, the `IRelationalDriver` contract, `BaseRelationalEntity`, the five-class repository chain, `FilterBuilder`, `RelationalUpdateBuilder`, `RelationalMigrationRunner`, `resolveAuditUserId` |
| `relational/postgres` | `BasePostgresDataSource`, three drivers, the column enrichers, `DefaultCRUDRepository` and its chain, `PostgresQueryDialect`, `IsolationLevels` |
| `relational/postgres/supabase` | `PoolerModes` and the RLS statement helpers |
| `relational/sqlite` | `BaseSqliteDataSource`, `LibSqlDriver`, `DefaultSqliteRepository` and its chain, `SqliteQueryDialect`, `SqliteBeginModes` |
| `search/core` | `ISearchConnector` and `BaseSearchConnector`, `BaseSearchDataSource`, `defineSearchCollection`, the search repository chain, `AbstractSearchController` and `SearchControllerFactory` |
| `search/typesense` | `TypesenseConnector`, `TypesenseDataSource`, `TypesenseQueryDialect`, the collection compiler |
| `search/meilisearch` | `MeilisearchConnector`, `MeilisearchDataSource`, `MeilisearchQueryDialect`, the collection compiler |

The relational tier is genuinely engine-neutral. Its bound is `TTableSchemaWithId`, built on drizzle's
root `Table` rather than `PgTable`, so `pgTable` and `sqliteTable` both satisfy it. The tier imports
no `drizzle-orm/pg-core` and no `drizzle-orm/sqlite-core` at all. For the depth, read
[relational connector](/architecture/relational-connector.md),
[SQLite connector](/architecture/sqlite-connector.md), and
[Typesense search connector](/architecture/search-typesense.md).

## `scopeFilter` - a row scope, relational only

`@model` settings.scopeFilter (kernel) ANDs a per-request `where` into every relational read, plus
`update` and `delete`, including `restore()` - see `RelationalBaseRepository.applyScopeFilter` in
`relational/core/repositories/core/base.ts`. It is a second, separate filter from `defaultFilter`:
`shouldSkipDefaultFilter` never removes it, because that flag is what soft-delete's `restore()` uses
to reach past `deletedAt: null`, and reusing one filter for both would hand `restore()` the same
reach into another caller's row scope. `resolve()` returning null/undefined denies by default
(matches zero rows) unless the model declares `onMissing: 'allow'`.

`resolve()` has three states, checked in this order: a `TWhere` ANDs in as always; the exact symbol
`ScopeFilters.UNRESTRICTED` (`base/repositories/common/constants.ts`, kernel) applies no scope for
THIS call; null/undefined falls through to `onMissing` (deny by default). The order is the safety
property - `UNRESTRICTED` is checked by strict identity before the null/undefined branch, so a
resolver that forgets a `return` on some branch produces `undefined`, not the symbol, and still
denies. `onMissing: 'allow'` cannot substitute for `UNRESTRICTED`: `onMissing` is declared once per
MODEL in static `settings`, so using it to bypass scoping for one caller (an internal operator) would
also unscope every ordinary user whose `resolve()` happens to return nothing. `UNRESTRICTED` is a
`Symbol.for('@venizia/ignis-kernel:scope-filter-unrestricted')` rather than a string or sentinel
object, so no request body, query string, or header can ever produce it - the bypass can only come
from code the application wrote and reviewed.

**`scopeFilter` NEVER covers `create`.** Scope is a `where` AND-ed into the query and an `INSERT` has
no `where` to AND into - `applyDefaultFilter` appears only in `_update` and `_delete`
(`persistable.ts`), never in `_create`. Structural, not an omission, and it means NOTHING stops a
caller inserting a row owned by somebody else: validating ownership at insert time is the
application's job, permanently.

**The mirror trap, on the side that IS scoped:** an administrative method that legitimately targets
another principal's rows (`deleteAllForUser({ userId })`) silently narrows to the CALLER's rows,
deletes nothing, and reports success. When adding `scopeFilter` to a model, audit every
`updateById`/`updateAll`/`deleteBy` taking another principal's id as an argument; the fix is a
method on the repository passing `dangerouslySkipScopeFilter`, never a flag in the request context.

**Declaring `scopeFilter` where it cannot take effect now REFUSES TO BOOT** -
`assertScopeFilterSupported({ asyncContextEnabled })` in `src/common/scope-filter.ts`, called from
core-server's `initialize()` after `postConfigure()` so component-contributed models are covered. It
catches the two silent configurations, which fail in OPPOSITE directions: a search-backed model
(`BaseSearchEntity` in the prototype chain) never reads the setting and returns MORE rows, while
`asyncContext.enable: false` leaves `resolve()` with no ambient context so `onMissing` denies EVERY
query - and nothing named the flag as the cause. Search is reported first: it needs a code change,
the other may be one config line. Lives in connectors because this package both applies the setting
(relational) and ignores it (search); the caller passes the flag so no app config type reaches down.
**Adopting it next to an existing ownership guard: REPLACE, never run both.** AND-ing the same
predicate twice is idempotent, so results stay correct and nothing looks wrong - which is exactly
why it is a trap. The redundancy adds no safety and HIDES divergence; a subclass overriding one hook
but not the other drifts with no compile error. There is no honest "migrate one family while the
guards stay" path.

**`scopeFilter` narrows, a guard throws, and the profiles are OPPOSITE.** Injecting a `where` means a
handler that forgets is still scoped (the win) but a legitimate cross-principal write silently does
nothing (the cost), and `create` is out of reach. A guard that loads the row and throws is the mirror:
it covers `create` and cannot silently succeed, but it is a hole wherever somebody forgot to call it,
and it costs a read per write. Neither dominates - pick per model, and keep guards on `create` either way.
**Beyond that, `scopeFilter` covers an update or delete whose scope is expressible as a filter
clause - not per-row or polymorphic ownership.** A `where` comparing a column against values the resolver already knows
(`merchantId`, `tenantId`) is exactly that shape. A row identified only by a `principalType` +
`principalId` pair, where the owner lives in a different table chosen by `principalType` at runtime,
is not: that check is per-row, asynchronous, and reads the payload, none of which `resolve(): TWhere`
can express. An application with that shape still must run its own ownership check before the write -
`scopeFilter` neither performs it nor detects that it is missing. This is a deliberate gap, tracked
the same way the search-repository gap below is: no hook exists for the per-row case yet, because its
shape varies enough between applications that building one before seeing more of them would guess
wrong.

**Search repositories (`search/core`, `typesense`, `meilisearch`) do not read this setting at all.**
They compile filters through a different pipeline - `SearchBaseRepository.buildQuery` and
`compileEffectiveWhere`, string `filterBy` expressions - and `scopeFilter` was deliberately left
uncovered there rather than half-implemented. A model mirrored from a scoped relational entity into
a search index carries no row scope in its search queries; the application must add its own.

**`include` reaches `scopeFilter` too, at every relation and every nesting depth.**
`FilterBuilder.toInclude` in `relational/core/repositories/dialect/filter.ts` resolves each relation's
`scopeFilter` from that relation's OWN `@model` settings - not the parent's - the same
`resolveModelEntry` lookup `resolveDefaultFilter`/`resolveHiddenProperties` already use, keyed by the
relation's own SQL table name. A parent's scope never cascades to a child, and a child with no
`scopeFilter` compiles to exactly the same query it always did. The same three-state order applies
per relation: an `UNRESTRICTED` parent never widens a still-scoped child, and a scoped parent never
narrows an `UNRESTRICTED` child, because each relation's `applyRelationScopeFilter` reads only that
relation's own `resolve()`. `toInclude` calls itself through
`build()` for a relation's own `include`, so a relation of a relation is scoped by the same code path,
not a special case. The relation-level `shouldSkipDefaultFilter` (on an `include` entry) still gates
only that relation's `defaultFilter`; it is deliberately excluded from the wire filter schema (see
`packages/filter/src/schemas/builder.ts`) precisely so it cannot double as a scope bypass. The deny
predicate (`{ id: { inq: [] } }`) is a static method on `ScopeFilterDenial` in
`relational/core/repositories/common/scope-filter.ts`, shared by `applyScopeFilter` and `toInclude` so
the two tiers can never drift onto two different definitions of "deny".

## Every published sub-path is probed, and eight rows are waived

`scripts/purity/manifest.ts` derives its rows from this package's `exports` map, so all 14 sub-paths
are measured. It used to carry three hand-written rows - the root, `relational/core` and the PGlite
driver - and reported `11/11` green while saying nothing about the other eleven. No ESLint rule
guards this package either: `eslint.config.mjs` is the shared preset alone, unlike `core-worker`,
which adds a `no-restricted-globals` and `no-restricted-imports` layer.

Eight rows cannot pass, so the claim names them in `impure` and `make purity-connectors` exits 0.
The waiver is exact in both directions: a listed row that turns out to be pure fails as loudly as an
unlisted one that is not, and deriving still owns the row set, so a sub-path added later is claimed
pure by default. The list lived in `.github/workflows/ci.yml` before, which meant `make
purity-connectors` could never pass on its own - and that failed a connectors release outright,
because the release workflow calls that target directly.

| Row | Why |
|---|---|
| `postgres/node-postgres` (import, require) | `pg` - node builtins, never browser-capable |
| `postgres/postgres-js` (import, require) | `postgres` - reaches for `tls` |
| `sqlite/libsql` (require) | `@libsql/client` - `child_process`; the `import` twin is pure |
| `typesense` (import, require) | 17 node builtins from the client |
| `postgres/supabase` (import) | not an engine client - see below |

`postgres/supabase [import]` is a real defect, waived only to keep the gate running. Under
`--target=browser` Bun drops the `export { anonRole, ... } from 'drizzle-orm/supabase'` re-export and
still lists those names in the bundle's export block, so the output exports identifiers it never
binds - `anonRole` appears exactly once in the emitted file, inside `export { ... }`. The `require`
twin bundles the same module fine.

`/postgres` and `/sqlite` were red too, on `node:async_hooks`. Both user-audit enrichers imported
`tryGetContext` from `hono/context-storage`, whose module body runs `var asyncLocalStorage = new
AsyncLocalStorage();` - a `TypeError` at import in a browser, not a lazy failure at first use, and
the Postgres model barrel re-exports the enricher, so merely importing the model tier killed a Worker
before any route was registered.

They now read the request context through `RequestContextRegistry` in the kernel. The enricher still
distinguishes the same three states, and each still carries its own message and its own
`allowAnonymous` behaviour:

| `resolve()` | Means | `allowAnonymous: true` | `allowAnonymous: false` |
|---|---|---|---|
| `undefined` | no request context - a Worker, a migration, a background job | stamps `null` | throws `Invalid request context to identify user` |
| a context, no `AUDIT_USER_ID` | a request with no authenticated user | stamps `null` | throws `No AUDIT_USER_ID found in request context` |
| a context with one | a request with an authenticated user | stamps the id | stamps the id |

`packages/core-server/src/base/applications/base.ts` installs the `hono/context-storage`-backed resolver in
`registerDefaultMiddlewares()`, the first step of `initialize()`. Deliberately NOT inside the
`asyncContext.enable` branch beside it: `tryGetContext()` already answers "no context" when no store
exists, so an unconditional install costs nothing and keeps a `contextStorage()` that an application
registered itself visible to the enrichers - which reading the module directly used to do. A method
body rather than the module body, because every package here declares `sideEffects: false`.

Both tiers reach `LoggerFactory` nowhere either: `drivers/libsql.ts`, `repositories/executor.ts` and
`repositories/dialect/query.ts` all resolve their logger through `BaseHelper` from
`@venizia/ignis-helpers/core`, so the ioredis edge that once failed `/sqlite` on `require('tls')` is
gone. What that costs is in [logging](#a-connectors-only-process-logs-to-the-console) below.

## Why the PGlite row uses `external`

`connectors/postgres/pglite` is the only entry with an `external` list, and it names one specifier:
`@electric-sql/pglite`. PGlite ships ONE universal Emscripten build and relies on its own
`package.json` `browser` field to remap `fs`, `path`, `util` and the rest to `false`. Vite honours
that remap; `bun build` does not. Probed without it, the driver entry drags in 18 node builtins and
three fatal global reads. That measures PGlite's packaging, not IGNIS's code. `drizzle-orm` is a
required peer and stays in the graph - measured, the entry is pure with it bundled.

## A connectors-only process logs to the console

`LoggerResolver` falls back to `ConsoleLogger` until something imports `LoggerFactory` as a value,
and only the `@venizia/ignis-helpers` ROOT barrel exports it. Every driver now reaches its logger
through `BaseHelper` from `@venizia/ignis-helpers/core`, which is what makes them browser-pure - and
which means an import graph containing connectors but not `@venizia/ignis` never loads the real
provider.

Measured: a script importing `@venizia/ignis-connectors/postgres` plus a driver logs
`[SeamProbe] hello` to stdout and writes **zero** files, with `APP_ENV_LOGGER_FOLDER_PATH` set. The
same script importing `@venizia/ignis` writes two. A migration or seed script that never constructs
an application is the case this hits.

`assertNoWorkspaceExternal` runs at manifest module-evaluation time and refuses any `external` under
the `@venizia/` scope. An `external` on our own source would hide the exact leak the gate exists to
catch rather than prove it absent.

## Gotchas

- Six architecture concepts still carry a `resource:` path under `packages/core-server/src/connectors` -
  relational-connector, sqlite-connector, search-typesense, datasource-hierarchy, transactions, and
  filter-system. The code moved. Treat `packages/connectors/src` as the real path, and note that the
  neutral relational tier gained a `core` segment: `relational/repositories` is now
  `relational/core/repositories`.
- `@venizia/ignis/postgres` and `@venizia/ignis-connectors/postgres` resolve to the same module.
  Application code should keep importing from `@venizia/ignis`; install this package directly only
  for the browser case.
- `drizzle-orm` and `drizzle-zod` are REQUIRED peers here, not optional as in `kernel`. The neutral
  relational tier value-imports `getTableColumns`, `sql`, `relations` and `createSchemaFactory`.
- `build.sh` type-checks `src` and `src/__tests__` before emitting, so a type error in a test blocks
  the production build. See [build system](/process/build-system.md).
- `isoTimestamp` (`relational/{postgres,sqlite}/models/common/columns.ts`) declares its column's
  `data` as `string | TIsoTimestamp`, not bare `string`. `TIsoTimestamp` is a branded type owned by
  `filter` (`connectors` depends on `filter`, never the other way), and it is what lets
  `TWhereValue<V>` admit a `Date` for this column only - its own `toDriver` already converts one. The
  union, not a bare brand, is deliberate: `$inferSelect` and `$inferInsert` read the same `data`
  field, so a bare-brand `data` would have also blocked inserting a plain string literal. See
  [filter](/packages/filter.md).

## Related

- [core](/packages/core-server.md)
- [kernel](/packages/kernel.md)
- [core-worker](/packages/core-worker.md)
- [Relational connector](/architecture/relational-connector.md)
- [SQLite connector](/architecture/sqlite-connector.md)
- [Typesense search connector](/architecture/search-typesense.md)
- [Repository hierarchy](/architecture/repository-hierarchy.md)
- [DataSource hierarchy](/architecture/datasource-hierarchy.md)
- [Transactions](/architecture/transactions.md)
- [browser-bff](/examples/browser-bff.md)
