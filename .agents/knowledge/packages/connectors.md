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
`dev-configs -> inversion -> {filter, helpers} -> kernel -> connectors -> core` (`boot` is a leaf off
`helpers` that only applications consume). `make connectors` needs `kernel`; `make core` needs
`connectors`. It ships a **dual CJS + ESM build** - `dist/cjs` plus `dist/esm`, with every one of its
`exports` entries carrying both `import` and `require` - as `kernel`, `inversion`, `filter`,
`helpers`, and `boot` do. The ESM pass in `build.sh` is not cosmetic: it exists for the
browser-purity claim below, whose gate refuses any claimed sub-path that publishes no `import`
condition, because a bundler would otherwise fall back to the CommonJS entry and meet a bare
`require()`.

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

## `./http` - a datasource whose transport is not a database

`AbstractDataSource` is engine-neutral (only `configure()` is required), so a request to another
IGNIS server is a datasource in the same sense Drizzle-over-Postgres is one: same role, different
transport, same `@venizia/ignis-filter` vocabulary going in. `HttpRepository` implements
`IReadableRepository` rather than extending `AbstractRepository`, whose twelve abstract members
would force a read-only resource to stub three writes with throws.

It targets the IGNIS REST contract and promises nothing about an arbitrary REST API: how a filter
serialises and which header carries the total are one API's CONVENTIONS, and IGNIS-to-IGNIS is both
ends speaking its own.

The load-bearing decision is that a list with no `Content-Range` has NO total, reported as such
rather than folded into the page length - a count of 1 for a table of 7000 reads healthy everywhere
it is consumed. Generated CRUD routes always send the header; a hand-written `respond()` need not,
which is when it fires. `countPath` is opt-in for an API that publishes a count route, because one
publishes `/count`, another `/search/count`, and another deleted it.

An empty page is `records */N` - the total present, the range absent - and reads as that total; the
start comes from the filter's `skip`/`offset`, the rule the server used. Missing it made `count()`
throw on every filter that matched nothing.

`x-request-count` decides whether a list answers an array or a count envelope, and its DEFAULT is
on - so both are accepted. Handing an envelope back as one row is fifty records reported as one. The
shape is ASKED FOR, not sniffed: structure cannot tell an envelope from a record carrying a `data`
column and a `count` column. Caller headers are normalised to unique lowercase pairs, last spelling winning: `new Headers(input)`
APPENDS, so `{ 'X-Tenant': 'north', 'x-tenant': 'south' }` - what merging two config objects
produces - used to reach the wire as `"north, south"`. A `Headers` instance joined them before this
package saw it and is passed through as it stands. The connector OWNS `x-request-count`: a `headers` setting carrying it throws at
construction, and it always goes out `false`. Under the envelope a record read answers
`{ count, data }`, which `shape: 'one'` would return as the record (measured on a real server).

`count` with a `countPath` throws when that route answers no numeric count, and a list body that is
neither an array nor the `{ count, data }` envelope throws rather than counting as one row (which is
how `existsWith` answered true for an empty result). A header with no readable total (`records 0-24/*`) throws a message naming that header - distinct
from the no-header one, because the fix is the server's count, not a missing header. A filter travels
in the GET query string, and a server refuses a URL past ~16 KB with 431 (measured: 350 UUIDs in an
`inq` pass, 400 do not); the error says so and carries the URL's head and length, not all of it.

`onUnauthorized` is a hook, not a flag: it answers whether a retry can work, because recovery
(refresh, logout, both) is the host policy, and a boolean could only have meant "ask the resolver
again". `authTokenResolver` is a seam rather than a guard, and an explicit `authToken` wins over it.
The 401 retry rebuilds headers through the SAME builder: a second header-building path is where
`x-auth-provider` would be set unguarded, and `fetch` turns an `undefined` value into the literal
string "undefined".

12.8 KB gzipped against the root barrel's 144.2 KB, with no drizzle and no zod - guarded by
`__tests__/http/weight.test.ts`.

## The 15 published sub-paths

Every peer is optional in `peerDependenciesMeta`; a sub-path needs what it imports. Measured on
`dist` (static import graph, 2026-09-19): the root barrel imports `drizzle-orm` (with `/pg-core` and
`/sqlite-core`, for `RecursiveTreeSql`), `drizzle-zod`, and the kernel ROOT - which brings `hono` and
`@hono/zod-openapi`; the relational sub-paths `drizzle-orm` (plus `drizzle-zod` at `/relational`,
`/postgres`, `/sqlite`). `./search`, `./typesense` and `./meilisearch` import neither `hono` nor
`drizzle-orm` - they reach only `kernel/metadata` and `kernel/repository` - so the search
controllers (`AbstractSearchController`, `SearchControllerFactory`, `defineSearchRouteConfigs`,
`ISearchControllerOptions`, `ISearchCustomizableRoutes`) are NOT exported from them any more, nor
from the package root: only `./search/controllers` and `./typesense/controllers` carry them, and only
those two import `@hono/zod-openapi`. `./http` loads with no hono and no `@hono/zod-openapi` either.
What each sub-path may need is pinned per sub-path in `scripts/clean-install/manifest.ts` and proved
by `make clean-install-connectors` - see [release and publish](/process/release-publish.md).

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

## Two ways to declare a model, both supported

`BaseRelationalEntity` with a hand-written table on a static `schema` is the original, and 192 BANA
models use it - it is not going anywhere. `ModelFactory.defineEntity({ table, relations? })`
(`relational/core/models/factory.ts`, exported by `./relational`, `./postgres`, `./sqlite` and
`@venizia/ignis/postgres`) is the second, TABLE FIRST: the table is a plain drizzle table
(`pgTable`, `pgSchema(...).table`, `sqliteTable`), usually with
`...generateIdColumnDefs({ id: { dataType: 'string' } })` for a UUID v7 id, exported so drizzle-kit
sees it (measured: "No schema changes" on `examples/pglite-quickstart`). `TABLE_NAME` is
`getTableName(table)`. The returned class type is `TDefinedEntityClass<Schema, Relations>` =
`typeof BaseRelationalEntity<Schema>` plus the precise `schema`, `relationDefinitions` (`undefined`
when none) and `relations` - so the instance is typed and `AUTHORIZATION_SUBJECT` is there.

Relations come keyed by name - `many(table)` / `one(table)` - and `toRelationConfigs` flattens them
into the array the query dialect already reads, taking each name from its key. The thunk runs lazily
on first read, once (a thunk run at definition throws for a table declared later in the file).
`TEntityObject<typeof Entity>` is the row - read off the INSTANCE's `$inferData`, because the static
`schema` is widened to `Table` on the base and a row read through it would take `Table`'s index
signature - plus the relation rows; a model without relations gets a plain row.

`one` resolves its columns in `createRelations` (`repositories/dialect/relations/`: `one.ts` resolves a `one`, `many.ts` configures a `many`, `create.ts` builds both), for the keyed form
and hand-written arrays alike:

- Written `fields` + `references` are used as written. Only one of them throws.
- Exactly one foreign key from the source to the target is read off the table. With two or more,
  keys whose columns are exactly the `fields` of a written `one` on the same entity are set aside;
  ONE left is read, none or several throw at relation build, naming the columns left. So a written
  `author` (`author_id`) lets a fieldless `editor` read `editor_id`; a third key refuses it again.
  The self-reference guard below uses the same set-aside.
- No key on this side but ONE on the target's is the INVERSE side of a one-to-one: `one(target)` with
  no config. drizzle pairs it from the target's `one()` back, so the owning entity MUST declare that
  `one()`. A `relationName` there throws (drizzle pairs an inverse by table, never by name). Two
  or more keys back throw. The escape for both is `fields` / `references` written reversed on this
  side: `fields [users.id] references [profiles.user_id]`.
- A fieldless `one` to its own table reads the self key only when it is the entity's ONLY fieldless
  self `one`. Otherwise it throws: `previous` and `next` over one `previous_id` would both read it,
  and `next` would silently return the wrong row.
- No key either way throws.

Each resolution is memoized per `createRelations` call: drizzle re-runs the relations callback on
every `drizzle({ schema })`, and the drivers make one per `beginTransaction`.

`BaseRelationalDataSource.discoverSchema()` then asks `RelationPairing` (`core/datasources/relation-pairing.ts`,
internal - not in the barrel; the class file holds no loose functions) to run drizzle's own `extractTablesRelationalConfig` +
`normalizeRelation` over every relation, once. An unpaired INVERSE `one` (a drizzle `One` with no
config - only the new inference path produces one) THROWS through `getError` naming the entity, the
relation and the fix - at boot when `configure()` reads `getSchema()`, else on the first
`getConnector()` / `beginTransaction()`. A relation whose TARGET TABLE has no model on the datasource
is never fatal and never a warning: one `debug` line per datasource lists them ("N relations point to a
table outside this datasource: A.b -> T, ...") - BANA 2026-09-23 boot showed narrow datasources on
purpose (commerce direct: 2 models, report) printing 27 warn lines that taught readers to skim past
real ones. Any OTHER relation drizzle cannot pair (a `many` whose `relationName` matches no `one` on a
target that IS here) is WARNED about, one line each (BANA had 4, e.g. `Category.products`),
deliberately: BANA's 192 hand-written models boot today, and a latent broken relation must not
become a boot failure in a prerelease - its first query still throws, as before.

A `one` relation's key is its drizzle `relationName` (unless its metadata sets one), so
`many(table, { relationName })` pairs with the `one` whose key is that name. `TRelationConfig`'s ONE
`metadata` is optional and partial; `/postgres` re-exports the core type rather than keeping a copy.

Three constraints, each learned the hard way and each now enforced by the compiler
(`entity-factory-types.test.ts` compiles probe files with declarations emitted):

- **A relation points at a TABLE, never at an entity class.** Two entities importing each other hit
  TS7022 and both row types collapse to `any` while the app keeps running. The builders only accept
  a table, so the mistake does not compile - and two entities that relate both ways, self relations,
  and foreign-key relations across files all keep their row types.
- **Never intersect the table with `TTableSchemaWithId`.** The generic carries a wide `$inferSelect`,
  and the intersection gives the row an index signature - every unknown column then type-checks.
- **The factory's return type is a named type** (`TDefinedEntityClass`), because a consumer's
  declaration output cannot name an inferred anonymous class (TS2883). For the same family of
  reasons the base's static `schema` widened to `Table` and the zod `createSchemaFactory` singleton moved
  to module scope - the protected static `schemaFactory` getter is gone (TS4094: an anonymous class
  inheriting a protected static has no emittable declaration).

The unreleased first shape (`{ name, columns, relations, id, extra }`, commit `28978cb0`) never
shipped, so nothing migrates from it.

## What it owns

| Tier | What lives there |
|---|---|
| `relational/core` | `AbstractRelationalDataSource`, `BaseRelationalDataSource`, the `IRelationalDriver` contract, `BaseRelationalEntity`, `ModelFactory` with `one`/`many`/`TEntityObject`, `RecursiveTreeSql`, the five-class repository chain, `FilterBuilder`, `RelationalUpdateBuilder`, `RelationalMigrationRunner`, `resolveAuditUserId` |
| `relational/postgres` | `BasePostgresDataSource`, three drivers, the column enrichers, `DefaultCRUDRepository` and its chain, `PostgresQueryDialect`, `IsolationLevels` |
| `relational/postgres/supabase` | `PoolerModes` and the RLS statement helpers |
| `relational/sqlite` | `BaseSqliteDataSource`, `LibSqlDriver`, `DefaultSqliteRepository` and its chain, `SqliteQueryDialect`, `SqliteBeginModes` |
| `search/core` | `ISearchConnector` and `BaseSearchConnector`, `BaseSearchDataSource`, `defineSearchCollection`, the search repository chain |
| `search/core/controllers` | `AbstractSearchController`, `SearchControllerFactory`, `defineSearchRouteConfigs` - published only as `./search/controllers` and `./typesense/controllers` |
| `search/typesense` | `TypesenseConnector`, `TypesenseDataSource`, `TypesenseQueryDialect`, the collection compiler |
| `search/meilisearch` | `MeilisearchConnector`, `MeilisearchDataSource`, `MeilisearchQueryDialect`, the collection compiler |

The relational tier is genuinely engine-neutral. Its bound is `TTableSchemaWithId`, built on drizzle's
root `Table` rather than `PgTable`, so `pgTable` and `sqliteTable` both satisfy it. The tier imports
`drizzle-orm/pg-core` and `drizzle-orm/sqlite-core` in one place only - `RecursiveTreeSql`, which reads
the dialect off the table it is handed. For the depth, read
[relational connector](/architecture/relational-connector.md),
[SQLite connector](/architecture/sqlite-connector.md), and
[Typesense search connector](/architecture/search-typesense.md).

## Recursive tree SQL

`relational/core/repositories/sqls/recursive-tree.ts` exports `RecursiveTreeSql.walk(opts)`, which
builds a `WITH RECURSIVE` fragment (a Drizzle `SQL` value) walking an adjacency-list table up
(ancestors) or down (descendants) from `rootId`, for Postgres or SQLite. It value-imports
`drizzle-orm` (`is`, `sql`, `Table`, `PgTable`, `SQLiteTable`), so it lives here - not in `kernel`,
which reaches `drizzle-orm` through `import type` only, and not in `helpers`, which carries no
`drizzle-orm` at all. It is the one place in the relational tier that imports `drizzle-orm/pg-core`
and `drizzle-orm/sqlite-core`. Exported by the root, `./relational`, `./postgres` and `./sqlite`;
`@venizia/ignis` still exports it from its root through the postgres alias.
Ported from 14 hand-written BANA queries that each had to remember their own depth guard; one of
the 14 forgot and hung a production process walking an unbounded parent chain.

- **`maxDepth` is mandatory, no default, and validated at runtime (`<= 0` throws via `getError`).**
  `0` type-checks but produces a recursive term that never runs and a result set that is silently
  empty - the exact "zero looks plausible" failure this parameter exists to prevent. **It counts
  EDGES, not rows**: the root sits at `depth 0`, so `maxDepth: N` returns up to `N+1` rows (measured
  against a real Postgres - `1` gives 2 rows, `4` gives 5). "Depth" and "how many levels I want back"
  are the same word to most callers and differ by one.
- **`table` stays `unknown`**, checked at runtime with `is(table, Table)` from `drizzle-orm` rather
  than tightened to a Drizzle generic - this package cannot see an application's schema, and a type
  that pretends to know is worse than `unknown` because it looks safe. A non-table throws `getError`
  naming what actually arrived.
- **`table` also selects the SQL dialect.** `walk` checks `is(table, PgTable)` (from
  `drizzle-orm/pg-core`) and `is(table, SQLiteTable)` (from `drizzle-orm/sqlite-core`) and compiles
  the matching form internally, tagged with a private `RecursiveTreeEngines` const-class - there is
  no `engine` option in `IRecursiveTreeOptions`, so the public API gained no new parameter and there
  is no seam where an option could disagree with the schema it was called with. A table belonging to
  neither (for example `drizzle-orm/mysql-core`'s `MySqlTable`) throws the same `getError` naming what
  arrived, rather than silently compiling with the wrong dialect's syntax.
- **SQL injection is the primary risk, not the usual value-parameterization one.** `name`,
  `idColumn`, `parentColumn`, and every entry of `columns` become identifiers, and identifiers
  cannot be parameterized the way values can. Each is checked against a strict allowlist
  (`^[A-Za-z_][A-Za-z0-9_]*$`) before it reaches a template, on top of `sql.identifier`'s own
  quoting. `rootId`, `maxDepth`, and `startDepth` are ordinary bound parameters.
- **`trackPath: true`** emits a `path` value and an `is_cycle` flag, and adds `AND NOT r.is_cycle` to
  the recursive term so a row already flagged cyclic is never expanded again. Without `trackPath`,
  `maxDepth` alone still guarantees termination - it is the unconditional bound, `trackPath` only
  adds early detection and a visible flag. **Both emitted columns reach the caller in a different
  shape per engine, and nothing in the signature shows it** - `walk()` returns a `SQL`, so the row
  shape is whatever the driver hands back. Postgres gives `path: string[]` and `is_cycle: boolean`;
  SQLite gives `path: string` (ids wrapped in `char(31)`) and `is_cycle: 1 | 0`, because SQLite has
  no boolean literal. `row.path.length` therefore throws on SQLite, and `row.is_cycle === true` is
  quietly always false there - read it truthily and split `path` on `String.fromCharCode(31)`. The
  cycle guard's shape differs by engine because SQLite has no array type:
  - **Postgres**: `path` is a native array (`ARRAY[...]`), membership is `= ANY(path)` - unchanged
    from the original Postgres-only version, verified byte-identical by a dedicated test.
  - **SQLite**: `path` is text, with every id wrapped on both sides by `char(31)` (the ASCII Unit
    Separator, via a `sql.raw('char(31)')` constant) so a delimiter-bounded `instr(path, char(31) ||
    id || char(31)) > 0` cannot partial-match (an id of `1` inside a path containing `12`). This is
    exact as long as no id value itself contains a `char(31)` byte - a control character that does
    not occur in ordinary UUIDs, serials, slugs, or emails, but `RecursiveTreeSql` does not validate
    or escape id values against it. An id that did contain that byte could produce a false-negative
    cycle match. `depth`'s cast also differs (`::int` for Postgres, `CAST(... AS INTEGER)` for
    SQLite) since SQLite has no `::` cast operator.
- `RecursiveTreeDirections` (`UP`/`DOWN`) follows the repo's const-class + `TConstValue` idiom, not
  a bare `as const` object - see `RepositoryOperationScopes` for the same shape.
- The counterpart in-memory tree utilities (`ITreeNode<T>`, `TreeWalker`, `TreeBuilder`) live in
  `@venizia/ignis-helpers`' `modules/tree` - see [helpers](/packages/helpers.md). They are pure and
  carry no Drizzle dependency, which is why they are not here too.

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
relation's schema object first and its SQL table name second. A parent's scope never cascades to a child, and a child with no
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

**`toOrderBy` appends `id ASC` unless the order names `id`.** The cost is an index one: `ORDER BY
created_at DESC, id ASC` is no longer satisfied by a single-column `created_at` index alone -
Postgres 13+ finishes it with an incremental sort, and a composite `(created_at, id)` index removes
even that.
 Postgres breaks ties per page, so paging
over a non-unique column repeated and skipped rows (PGlite: 60 read, 50 distinct). Each column's
`asc`/`desc` SQL node is built once and reused - drizzle 0.45 wraps order nodes, never mutates them -
which took `build()` with one include from 870 to 446 ns.

## Every published sub-path is probed, and eight rows are waived

`scripts/purity/manifest.ts` derives its rows from this package's `exports` map, so all 14 sub-paths
are measured. It used to carry three hand-written rows - the root, `relational/core` and the PGlite
driver - and reported `11/11` green while saying nothing about the other eleven. No ESLint rule
guards this package either: `eslint.config.mjs` is the shared preset alone, unlike `core-worker`,
which adds a `no-restricted-globals` and `no-restricted-imports` layer.

Seven rows cannot pass, so the claim names them in `impure` and `make purity-connectors` exits 0.
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

`postgres/supabase [import]` is measured, and the verdict depends on the Bun version. Bun 1.4.0
dropped the `export { anonRole, ... } from 'drizzle-orm/supabase'` re-export under
`--target=browser` while still listing the names in the bundle's export block, and the row failed
with `drizzle-orm/supabase` as an unresolved external import. Bun 1.4.1 binds them and the row is
pure. The row carried a waiver for the 1.4.0 defect until a connectors release on 1.4.1 failed the
gate with "STALE WAIVER"; the gate needs Bun >= 1.4.1 for that row, and the release workflow runs
`bun-version: latest`.

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
peer the sub-path imports and stays in the graph - measured, the entry is pure with it bundled.

## A connectors-only process logs to the console

Every driver reaches its logger through `BaseHelper` from `@venizia/ignis-helpers/core`, which is what
makes them browser-pure - and which means an import graph containing connectors but not
`@venizia/ignis` never loads the real provider. `BaseHelper.logger` then writes to the console and
prints one `[BaseHelper] Logging to the console - no logger provider is installed...` warning per
process. It upgrades itself on its next call once something imports `LoggerFactory` as a value,
which only the `@venizia/ignis-helpers` ROOT barrel exports - see [helpers](/packages/helpers.md).

Measured: a script importing `@venizia/ignis-connectors/postgres` plus a driver logs
`[SeamProbe] hello` to stdout and writes **zero** files, with `APP_ENV_LOGGER_FOLDER_PATH` set. The
same script importing `@venizia/ignis` writes two. A migration or seed script that never constructs
an application is the case this hits.

`assertNoWorkspaceExternal` runs at manifest module-evaluation time and refuses any `external` under
the `@venizia/` scope. An `external` on our own source would hide the exact leak the gate exists to
catch rather than prove it absent.

## Gotchas

- The neutral relational tier gained a `core` segment during the connectors lift: `relational/repositories` is now `relational/core/repositories`.
- `@venizia/ignis/postgres` and `@venizia/ignis-connectors/postgres` resolve to the same module.
  Application code should keep importing from `@venizia/ignis`; install this package directly only
  for the browser case.
- `drizzle-orm` and `drizzle-zod` are optional peers, yet the relational tier value-imports
  `getTableColumns`, `sql`, `relations` and `createSchemaFactory` - a relational sub-path needs them
  installed. Optional spares `./http` and the three search entries, which import neither. `@venizia/ignis` still requires them.
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
