# Knowledge log

Append one entry per change to the bundle. Newest first. Keep entries short: what changed and why,
not how.

This file and `index.md` are reserved OKF filenames - they carry no `type:` frontmatter and are not
counted as concepts.

## 2026-08-31 - `TWhereValue<V>` admits a `Date` on `isoTimestamp` columns only

`isoTimestamp` (`connectors/relational/{postgres,sqlite}/models/common/columns.ts`) reads back as
`string`, but its own `toDriver` already accepts a `Date` and converts it - `{ effectiveFrom: { lte:
new Date() } }` always ran correctly, and the 2026-08-30 `TWhere<T>` value-typing change (see the
entry below) made it a compile error for the first time, purely because the type could not see the
conversion. Widening `TWhereValue<V>` for every `string` would have re-opened the exact hole that
change closed - comparing an unrelated `text` column against a `Date` is a real bug and must stay one.

Fix: a branded read type, `TIsoTimestamp = string & { readonly isoTimestampBrand: unique symbol }`,
added to `filter/src/common/types.ts` (not `connectors` - `filter` has no dependency on `connectors`,
and the brand is a pure type with no runtime import). `TWhereValue<V>` widens only a `V` that extends
the brand: `V extends TIsoTimestamp ? V | Date : V`, applied to both the bare-scalar position and
inside `TWhereOperators<V>`, so `{ gte: new Date() }` compiles too. `isoTimestamp`'s column now
declares `data: string | TIsoTimestamp`, a union rather than a bare brand - required, because drizzle
infers `$inferSelect` and `$inferInsert` from the SAME `data` field, and a bare-brand `data` (no plain
`string` member) was measured to also block inserting a plain string literal, which the compiled
`customType` test proved before landing on the union.

The literal brand shape given in the initial ask (`{ __isoTimestamp?: unique symbol }`, optional
field, no leading-underscore naming) does not work and was changed on both counts: an optional brand
field is structurally satisfied by a bare `string` (so `string extends TIsoTimestamp` is also true,
widening every text column), and the naming-convention lint rule rejects a double-leading-underscore
property name. The shipped field is `isoTimestampBrand: unique symbol`, required, no underscore.

Tests: `core-server/src/__tests__/filter-builder/iso-timestamp-where.test.ts` - bare `Date` and `{
lte: new Date() }` compile on an `isoTimestamp` column, `{ plainText: new Date() }` and `{ plainText:
{ lte: new Date() } }` on a `text` column stay `@ts-expect-error` (both markers verified load-bearing
by deleting and re-running `tsc`), a string literal and `$inferInsert` with a string literal still
work, SQLite's `isoTimestamp` carries the same brand, and a `Date` vs. its `.toISOString()` compile to
identical SQL text and params via `PgDialect.sqlToQuery`. Does not leak into generated schemas -
`drizzle-zod`'s `createSelectSchema`/`createInsertSchema` dispatch on the column's runtime
`columnType` string, never on this TypeScript-only brand. Changelog:
`docs/wiki/content/changelogs/2026-08-30-typed-where-clauses.md` (new "isoTimestamp exception"
section; corrected the `examples/vert` note - `createdAt` is an `isoTimestamp` column, so its
`.toISOString()` workaround is no longer required, though harmless to keep).

## 2026-08-31 - `resolveDomainEdges`'s `domains` argument documented as a membership closure, not an `assign_role` closure

Documentation-only - `ScopedCasbinAdapter`'s `resolveDomainEdges` hook (`core-server/.../adapters/scoped-casbin.adapter.ts`) keeps its exact prior signature, name, and single-function shape. A proposed rename to an array of `domainResolvers` run through `Promise.allSettled` was considered and dropped before landing: the one real consumer's equivalent array never held more than one element in its history, the second hierarchy axis that would have justified it has no schema yet, and an application can already compose more than one source with `resolveDomainEdges: async opts => [...(await organizerEdges(opts)), ...(await regionEdges(opts))]` - no API change needed.

What shipped: the hook's doc comment, the `authorization-casbin` concept, and the `resolveDomainEdges` section of the Authorization API reference now state that `domains` is the principal's **membership closure** (`join_domain` rows plus both ends of every `domainEdge` row), never the domains a principal holds a role in via `assign_role`. A principal can carry `assign_role` at a domain it never joined; a hook migrated from an `assign_role`-derived mechanism silently loses access for exactly those principals - no error, no log, just fewer `g3` edges than before. Measured on one production dataset: 17 principals held `assign_role` with no matching `join_domain`, 3 of them pointing at live records. The same three spots also gained a one-line composition note for a multi-axis hierarchy, pointing at the concatenation pattern above rather than a second hook.

## 2026-08-30 - `scopeFilter` gets a third `resolve()` state: `ScopeFilters.UNRESTRICTED`

A `where`, or null/undefined-denies, could not express "this caller sees everything on this one
call" - a real multi-tenant resolver's internal-operator branch. `onMissing: 'allow'` cannot cover it
either: `onMissing` is declared once per MODEL in static `settings`, so using it for a per-USER
bypass would also unscope every ordinary user whose `resolve()` happens to return nothing, turning a
configuration slip into a data leak. New `ScopeFilters.UNRESTRICTED`
(`packages/kernel/src/base/repositories/common/constants.ts`) is a
`Symbol.for('@venizia/ignis-kernel:scope-filter-unrestricted')`, not a string or sentinel object, so
no request body, query string, or header can ever produce it. `IScopeFilterSettings.resolve` widened
to `() => TNullable<TWhere> | typeof ScopeFilters.UNRESTRICTED`.

Both enforcement sites - `RelationalBaseRepository.applyScopeFilter` (`base.ts`) and
`FilterBuilder.applyRelationScopeFilter` (`filter.ts`, the `include` path) - check the three branches
in the same order: `TWhere` ANDs in; `scopeWhere === ScopeFilters.UNRESTRICTED` (exact identity)
returns the filter unscoped; otherwise null/undefined falls through to the existing `onMissing`
handling. The order is the whole safety property, stated in a comment at both call sites: a resolver
that forgets a `return` on some branch produces `undefined`, not the symbol, and still denies. Each
relation under `include` resolves its own `scopeFilterSettings` and therefore its own state
independently - an `UNRESTRICTED` parent never widens a still-scoped child, and a scoped parent never
narrows an `UNRESTRICTED` child - unchanged from how the two-state version already isolated relations.

**New write-path boundary, documented but not code-changed:** `scopeFilter` covers every write path
whose scope is expressible as a filter clause. Ownership resolved per row, or through a polymorphic
reference (a `principalType` + `principalId` pair pointing at a different table chosen at runtime),
is NOT expressible as `resolve(): TWhere` - that check is per-row, asynchronous, and reads the
payload. No hook or escape hatch was added for it: the shape of that check differs enough between
applications that building a seam before its shape is known would guess wrong. Documented in the
changelog, the `scopeFilter` doc comment (`IModelSettings.scopeFilter`), and `connectors.md`'s
`scopeFilter` section, in the same voice as the existing search-repository gap - a boundary a reader
does not see is a boundary they will design past.

Tests: new `connectors/src/__tests__/relational/conformance/pglite-scope-filter-unrestricted.test.ts`
(PGlite e2e - `UNRESTRICTED` reaches `find`/`findById`/`count`/`updateAll`/`deleteAll`/`restoreById`/
`restoreAll`; `undefined` still denies, asserted in the same file right next to the `UNRESTRICTED`
cases for contrast; per-call, not cached, across three consecutive `find()` calls; a model with no
`scopeFilter` at all stays byte-identical) and
`pglite-scope-filter-unrestricted-include.test.ts` (parent `UNRESTRICTED` + child scoped stays
scoped; parent scoped + child `UNRESTRICTED` unscopes only the child; three-level nested include,
mixed both directions). The pre-existing two-state suites
(`pglite-scope-filter.test.ts`, `pglite-scope-filter-include.test.ts`,
`postgres/repositories/scope-filter.test.ts`) still pass unmodified. Changelog:
`docs/wiki/content/changelogs/2026-08-30-row-scope-filter.md` (new "A third state" and "Write paths:
filter-shaped scope only" sections; `resolve()` type and the options table updated).

## 2026-08-30 - `scopeFilter` closed on `include`: a relation resolves its own scope, never the parent's

`FilterBuilder.toInclude` (`relational/core/repositories/dialect/filter.ts`) read only
`defaultFilter` for an included relation - `scopeFilter` never reached a relation loaded through
`include`, so a tenant-scoped parent queried with `include` handed back every other tenant's child
rows. Fixed by resolving each relation's own `scopeFilter` from its own `@model` settings (new
`resolveScopeFilter`, keyed by the relation's table name, same `resolveModelEntry` the other three
readers already share) and AND-composing it into that relation's filter via a new
`applyRelationScopeFilter`, applied BEFORE `defaultFilter` so it survives the relation-level
`shouldSkipDefaultFilter` exactly like the parent's does. `toInclude` recurses into a relation's own
`include` through `build()`, so a relation of a relation is scoped by the same code path with no
special-casing. Extracted the deny predicate (`{ id: { inq: [] } }`) out of
`RelationalBaseRepository.applyScopeFilter` into `ScopeFilterDenial.where()`
(`relational/core/repositories/common/scope-filter.ts`) so the repository tier and the dialect tier
compile "deny" from one definition - `base.ts`'s own behavior is otherwise unchanged, verified by its
existing suite still passing byte-for-byte.

Tests: new `connectors/src/__tests__/relational/conformance/pglite-scope-filter-include.test.ts`
(PGlite e2e) - positive control proves a sibling relation with no `scopeFilter` DOES leak the other
tenant's rows under the same parent FK before asserting the scoped relation excludes them; also
covers relation-level `shouldSkipDefaultFilter`, `onMissing: 'deny'` vs `'allow'`, a nested
relation-of-a-relation, a throwing resolver propagating, and a byte-identical no-`where` compile for
an unscoped relation. Changelog: `docs/wiki/content/changelogs/2026-08-30-row-scope-filter.md`
(new "Included relations are scoped too" section).

## 2026-08-30 - `@model` settings.scopeFilter: a row scope, denied by default, relational only

New `IScopeFilterSettings` (`packages/kernel/src/helpers/inversion/common/types.ts`): `resolve()`
returns a per-query `where`, `onMissing` (default `deny`) decides what happens when it returns
null/undefined. `RelationalBaseRepository.applyScopeFilter` (`connectors`) AND-composes it into
every read and write - including `restore()` - and it is NOT removable via `shouldSkipDefaultFilter`,
which stays scoped to `defaultFilter` alone (soft-delete's `restore()` reason for existing).
`onMissing: 'deny'` compiles to an empty `inq` (`sql\`false\``); `'allow'` is the explicit opt-out.
New internal-only escape hatch `dangerouslySkipScopeFilter` (parameter, never on `IExtraOptions`,
never wire-reachable) prevents `find()`'s own recursive call into `findWithCoreAPI` from AND-composing
the scope twice. `getScopeFilterSettings()` mirrors the existing `getDefaultFilter()` override seam,
needed because `applyScopeFilter` also resolves `this.entity` - a synthetic test repository with no
model binding must override it the same way it already overrides `getDefaultFilter()`.

**Search repositories are NOT covered** (owner decision, not a gap found late): `search/core`'s
`buildQuery`/`compileEffectiveWhere` pipeline never reads `scopeFilter`. Documented in the changelog,
the `scopeFilter` doc comment, and `connectors.md`'s search section - a half-covered security feature
is worse than an absent one if a reader assumes the absent half is covered.

Tests: `connectors/src/__tests__/postgres/repositories/scope-filter.test.ts` (unit, SQL-text
assertions for AND-composition/deny/allow/byte-identical) and
`connectors/src/__tests__/relational/conformance/pglite-scope-filter.test.ts` (PGlite e2e - every
verb including `restore()`'s cross-tenant leak proof). Changelog:
`docs/wiki/content/changelogs/2026-08-30-row-scope-filter.md`.

## 2026-08-30 - `TWhere<T>` now types the value, not only the column

`packages/filter/src/common/types.ts`: `TWhere<T>` was `{ [key in keyof T]?: any }` - a key not on
`T` was already rejected, but any value of any type compiled for a real column (`{ status: 123 }`
against a `string` column compiled clean). Added `TWhereOperators<V>` (mirrors all 25 field operators
in `common/operators.ts` `QueryOperators`, plus `not`) and `TWhereValue<V> = V | null |
TWhereOperators<V>` (`| null` mandatory - it is how a caller writes `IS NULL`); `TWhere<T>` now maps
each key to `TWhereValue<T[key]>`. `between`/`notBetween` are now a `[V, V]` tuple, so wrong arity is
a compile error too.

Fallout, all fixed: `connectors` - 4 sites (`persistable.ts`, `readable.ts`, `soft-deletable.ts`)
build `{ id: opts.id }` (`IdType`) against `TWhere<DataObject>` where `DataObject` is a class generic
too deep (through `EntitySchema['$inferSelect']`) for `tsc` to resolve; tightening the generic
constraint was tried and rejected (the default type parameter fails its own tightened constraint, and
the failure cascades into the postgres/sqlite subclasses without fixing the original sites) - fixed
with a narrow `as TWhere<DataObject>` cast per site instead. `core-server` -
`postgres-query-operators-between.test.ts` needed `as any` on its two deliberately-wrong-arity cases
to still reach the runtime guard. `examples/vert` - one real error (`Date` against a `string` column,
fixed with `.toISOString()`, did not widen the column type) plus 2 cascades. New test:
`core-server/src/__tests__/filter-builder/where-type-safety.test.ts` (`@ts-expect-error` markers
verified load-bearing by temporarily removing each). Does not cover JSON/JSONB columns (`any` in
application schemas) or dot-path key typing (needs `$type<>()` first) - deliberately out of scope.
All of `filter`, `kernel`, `connectors`, `core-server`, `core-worker`, `boot` and all 12 examples
green (tsc, `bun test`, eslint, prettier); `make purity` green.

## 2026-08-30 - `RecursiveTreeSql` now supports SQLite as well as Postgres, with no new option

`packages/kernel/src/base/repositories/sqls/recursive-tree.ts` was Postgres-only as of the entry
below ("Tree utilities (`helpers`) and `RecursiveTreeSql` (`kernel`)"). The dialect is now read off
`table` itself - `is(table, PgTable)` (from `drizzle-orm/pg-core`) vs `is(table, SQLiteTable)` (from
`drizzle-orm/sqlite-core`), tagged internally by a private (non-exported) `RecursiveTreeEngines`
const-class - so `IRecursiveTreeOptions` gained zero new fields, mandatory or optional. A table
belonging to neither engine (checked with a `drizzle-orm/mysql-core` table in tests) throws the same
`getError` shape as an invalid table, naming the table rather than silently compiling the wrong
dialect's syntax. This matches how `connectors` already keys dialect off the concrete table/executor
pair rather than an `engine` string - no new selection pattern invented.

The `trackPath` cycle guard, the only Postgres-specific SQL in the file, now has two forms picked by
the same `switch (engine)`: Postgres keeps `path` as a native array (`ARRAY[...]`, `= ANY(path)`),
unchanged. SQLite has no array type, so `path` is text with every id delimited on both sides by
`char(31)` (ASCII Unit Separator, via a module-level `sql.raw('char(31)')` constant reused in both
the base and recursive terms) and membership is `instr(path, char(31) || id || char(31)) > 0` -
double-sided delimiting is what stops a partial match (id `1` inside a path containing `12`). This is
exact as long as no id value itself contains a `char(31)` byte; that byte does not occur in ordinary
UUIDs, serials, slugs, or emails, but is neither validated nor escaped, so an id that did contain it
could produce a false-negative cycle match - documented as the one semantic gap, not silently
accepted. `depth`'s cast also differs per engine (`::int` for Postgres, `CAST(... AS INTEGER)` for
SQLite, since SQLite has no `::` operator) via a second `switch (engine)` method.

Proved the Postgres path byte-identical: a new test in `recursive-tree.test.ts` asserts the exact
full SQL string (trackPath + extra columns + recursiveFilter + custom startDepth together) against
the pre-change output, captured by running the original file's logic side by side before editing.
23 pre-existing Postgres tests pass unchanged. New: `recursive-tree-sqlite.test.ts` (23 tests,
mirroring the Postgres suite - shape, trackPath on/off, maxDepth throws, injection rejection
including the `'id"; DROP TABLE users; --'` case, other guard rails) and
`recursive-tree-dialect.test.ts` (2 tests, the MySQL-table rejection). `kernel` green (tsc, `bun
test` 120/120, eslint, prettier) and rebuilt; `core-worker` and `core-server` both still green (85
and 1274 passing respectively) against the rebuilt `kernel`; `make purity-kernel` still 2/2 pure -
the two new subpath imports (`drizzle-orm/pg-core`, `drizzle-orm/sqlite-core`) are the same
already-declared optional peer (`drizzle-orm`), not a new dependency. Updated the `packages/kernel`
concept's "Recursive tree SQL" section and
`docs/wiki/content/changelogs/2026-08-30-tree-and-recursive-sql.md` (options table, the `table`
section, Cycle safety, and the Details bullet all corrected from "Targets PostgreSQL" to describe
both engines and the delimiter gap).

## 2026-08-30 - Ten more classes extend `BaseHelper` for scoped logging

`ApplicationEnvironment` (`helpers`), `GrpcRequestAdapter`, `SwaggerUIProvider`/`ScalarUIProvider`, `NumericCodeGenerator`/`RandomTokenGenerator`/`DefaultVerificationDataGenerator` (`core-server`), `MeilisearchQueryDialect`/`TypesenseQueryDialect` (`connectors`), `InProcessBffTransport` (`core-worker`) now `extends BaseHelper`, each adding `super({ scope: <ClassName>.name })` as the constructor's first statement (a constructor was added where none existed). All keep their existing `implements` clause - none had a member colliding with `scope`/`identifier`/`logger`/`getIdentifier`/`getLogger`, so none needed the `AuthorizationRole`-style exclusion.

Logging added where a real failure path existed, matching neighbouring classes' style (`this.logger.for(<method>.name).warn/error(...)`): `InProcessBffTransport.fetch`'s `catch (error)` now logs before re-throwing the decoded `ApplicationError` (was silent); `SwaggerUIProvider`/`ScalarUIProvider.render` now wrap their optional-peer `await import(...)` in try/catch, log the failure, and throw a `getError` naming the missing package (mirrors `ModuleUtility.fail`'s pattern); both `MeilisearchQueryDialect`/`TypesenseQueryDialect`'s `compileOperatorClause` now log a `warn` immediately before every `throwUnsupportedOperator` call (Typesense: `is`/`isNot` on `null`, `exists`/`notExists`, and the default case; Meilisearch: the default case only - it has no null-only rejections). No logging added to `GrpcRequestAdapter`, the mail generators, or `ApplicationEnvironment` - none had a failure path in scope for this change.

All four packages (`helpers`, `connectors`, `core-server`, `core-worker`) green after rebuilding `helpers` then `connectors`: tsc, `bun test` (counts unchanged: 1454/1179/1266/85 passing), eslint, prettier. `make purity` unchanged at 34/34 pure (8 waived).

## 2026-08-30 - `hash()` and `utilities/crypto.utility.ts` removed outright (supersedes the shim decision recorded below)

The shim decision in the "`Hash` class added to `modules/crypto`" entry below - keep `hash()`, delegate to `Hash` - was reversed before shipping. `utilities/crypto.utility.ts` and its test are deleted entirely, and the barrel no longer exports `hash`. There is no delegating wrapper and no `@deprecated` alias: `hash()` does not exist. Every caller (~15 external call sites, all BANA payment code) must migrate directly to `Hash.withAlgorithm(...).digest()`/`.hmac()`. Digest bytes are unchanged, so a migrated call site produces the same value a payment gateway already verifies.

Docs-only follow-up for the reversal: rewrote `docs/wiki/content/changelogs/2026-08-30-crypto-hashing.md`'s hashing section from "deprecated, delegates" to "removed", with a migration table for the three known call shapes; rewrote the Hashing section of `docs/wiki/content/extensions/helpers/crypto/reference.md` around `Hash` (source link, API table, troubleshooting entry); added a short `Hash` mention to `docs/wiki/content/extensions/helpers/crypto/index.md`; removed `docs/wiki/content/references/utilities/crypto.md` outright - its entire subject was the deleted function - along with its `references/utilities/index.md` entry and its `docs/wiki/site/.vitepress/config.mts` sidebar entry; dropped `crypto.utility.ts` from the `./utilities` barrel comment in `packages/helpers/src/core.ts` and from the `packages/helpers` concept's crypto bullet and `/core` paragraph.

## 2026-08-30 - Tree utilities (`helpers`) and `RecursiveTreeSql` (`kernel`) - BANA's tree/graph mechanism moved into IGNIS

Per the agent contract `2026-08-31-tree-graph.md`: BANA hand-wrote 15 recursive SQL queries (14 with their own depth guard, 1 without - which hung a production process walking an unbounded parent chain) plus 2 duplicate in-memory tree algorithms. Both moved into IGNIS.

`packages/helpers/src/modules/tree/` (pure - `Map`/`Set`/arrays only, no Drizzle/DI/I/O): `common/types.ts` (`ITreeNode<T>`, `INodeWithPath<T>`, the option interfaces), `walk.ts` (`TreeWalker`: static `walk`/`walkAsync`/`height`/`heightWhere`/`count`/`collectLeaves`), `builder.ts` (`TreeBuilder`: static `build`/`leaves`/`nonLeaves`/`print`). Named `TreeBuilder` not `GraphHelper` - `build` cuts cycles, so the result is always a tree, and a wider name invites real graph algorithms (shortest path, topological sort) it does not and should not implement. Kept both `walk` and `walkAsync` as distinctly-named methods rather than one method with a mode flag - the return types genuinely differ (`void` vs `Promise<void>`), unlike the event-bus `mode` case where the same work just runs differently. Three behaviors preserved verbatim from production, commented in the code because each is counter-intuitive: `shouldPrune(node, depth)` returning `true` still visits the node, only its children are skipped from the queue; `build`'s `seen`-by-`getKey` cycle guard SKIPS a repeated branch rather than throwing, because real hierarchies contain legitimate diamonds; `leaves({ includePath: true })` returns the root-to-leaf chain alongside each leaf. `modules/index.ts` gained `export * from './tree'` (also added the pre-existing but undocumented `slug` to the same list and to the module-map prose - a gap unrelated to this change, fixed while touching the same line).

`packages/kernel/src/base/repositories/sqls/recursive-tree.ts`: `RecursiveTreeSql.walk(opts)` builds a Postgres `WITH RECURSIVE` fragment (a Drizzle `SQL`) walking an adjacency-list table up or down from `rootId`, bounded by a MANDATORY `maxDepth` (no `?`, no default - validated at runtime too, `<= 0` throws via `getError`, since `0` type-checks but silently returns nothing). `table` stays `unknown` per the contract's own settled decision - IGNIS cannot see an application's schema, and a type that pretends to know is worse than `unknown` because it looks safe; validated at runtime with `is(table, Table)` from `drizzle-orm`, throwing `getError` naming what arrived. `name`/`idColumn`/`parentColumn`/every entry of `columns` become SQL identifiers, so each is checked against a strict allowlist (`^[A-Za-z_][A-Za-z0-9_]*$`) before reaching a template, on top of `sql.identifier`'s own quoting - identifiers can't be parameterized the way values can, so this is the primary injection defense, not an afterthought. `trackPath: true` emits `path`/`is_cycle` using the standard Postgres cycle-detection idiom and adds `AND NOT r.is_cycle` so a flagged row is never re-expanded; `maxDepth` alone already guarantees termination regardless of `trackPath`. `RecursiveTreeDirections` (`UP`/`DOWN`) uses the repo's const-class + `TConstValue` idiom, matching `RepositoryOperationScopes`, not the bare `as const` object the contract's draft API showed. Targets PostgreSQL only (native array `path` + `= ANY(...)`, no SQLite equivalent). `repositories/index.ts` gained `export * from './sqls'`; confirmed `import { RecursiveTreeSql } from '@venizia/ignis'` resolves through `core-server`'s built `dist/index.js` (kernel re-exported wholesale, no new core-server code needed).

Tests: 21 new in `helpers/__tests__/tree/` (all three preserved behaviors, a real cycle terminating, BFS depth/order, height/heightWhere/count/collectLeaves, print). 23 new in `kernel/__tests__/repositories/sqls/` (generated-SQL shape via `PgDialect().sqlToQuery` for both directions, trackPath on/off, `maxDepth <= 0`/non-integer throws, malicious `idColumn`/`parentColumn`/`name`/`columns` entries all rejected before reaching a template, a non-Drizzle `table` rejected). No live-database execution test - kernel carries no Postgres/PGlite devDependency and adding one for this alone was out of scope; verified via SQL-text assertions instead, consistent with the existing `dialect/*.test.ts` pattern in `connectors`. `helpers`/`kernel`/`core-server` all green (tsc, `bun test`, eslint, prettier) and rebuilt; `make purity-helpers` and `purity-kernel` both fully pure after rebuild. Updated the `packages/helpers` and `packages/kernel` concepts and `docs/wiki/content/changelogs/2026-08-30-tree-and-recursive-sql.md`.

## 2026-08-30 - `kdfSalt`/`kdfIterations` overrides for AES key derivation

`DEFAULT_KDF_SALT` (`crypto/common/constants.ts`) is a single string shipped in every IGNIS deployment, flagged by a prior sweep: one precomputed table attacks every deployment deriving a key from a weak passphrase. Changing the default was ruled out - a downstream product already has ciphertext encrypted under it, and a new default would make that permanently undecryptable. Added optional `kdfSalt`/`kdfIterations` to `AES`'s `encrypt`/`decrypt` `opts` (`IAESDecryptOptions`), threaded through `resolveEncryptKey`/`resolveDecryptKey` (now options-object methods, previously positional) to `BaseCryptoAlgorithm.normalizeSecretKey`. Omitting both reproduces the shipped default byte-for-byte, pinned in a test against a `node:crypto` `pbkdf2Sync` call using the literal salt/iteration values (not read from the module's own constants), so a change to the default fails that test. A supplied `kdfSalt` must be at least 16 UTF-8 bytes (`MINIMUM_KDF_SALT_BYTES`, NIST SP 800-132's 128-bit minimum) or `normalizeSecretKey` throws via `getError` - an empty or short salt would look configured while giving up most of the protection. `LegacyAES` deliberately does NOT get the option: its `normalizeSecretKeyLegacy` is padEnd/truncate, never PBKDF2, so there is no salt to override, and adding the option there would silently do nothing. `RSA` and `ECDH` don't derive keys via PBKDF2 from a passphrase, so neither takes the option. Documented the weakness directly on `DEFAULT_KDF_SALT`. Left unchanged and reported (not this sweep's scope): `RSA.generateDERKeyPair({ modulus })` still accepts any modulus with no lower bound. Updated the `packages/helpers` concept (crypto section) and `docs/wiki/content/changelogs/2026-08-30-crypto-hashing.md`.

## 2026-08-30 - `retry.utility.ts` moved to `modules/retry/`; deprecated aliases gone for good

The five module-level aliases (`executeWithRetry`, `executeWithRetryUntil`, `runWithTimeout`, `isRetryTimeoutError`, `computeBackoffDelayMs`) had already been dropped from `RetryHelper`'s source in a prior change that never touched the test file or the two downstream call sites still importing them bare from `@venizia/ignis-helpers/core` - `packages/kernel/src/base/events/event-bus.ts` and `.../repositories/core/abstract.ts` - leaving the whole monorepo red (`tsc` failed on the test file; `bun test` in `connectors` threw `SyntaxError: Export named 'executeWithRetry' not found`). Fixed both call sites to `RetryHelper.executeWithRetry`/`RetryHelper.executeWithRetryUntil`.

Also completed the pending structural move: `packages/helpers/src/utilities/retry.utility.ts` (487 lines, flat) is now `src/modules/retry/` - `common/constants.ts` (`RetryBackoffStrategies`, `RetryJitterModes`, their `TRetry*` types), `common/types.ts` (`IRetryBackoffOptions`, `IRetryContext`), `helper.ts` (`RetryHelper`), matching the `crypto`/`uid` module shape. `src/core.ts` now re-exports `RetryHelper`/`RetryBackoffStrategies`/`RetryJitterModes`/the option types from these new leaf files instead of `./utilities/retry.utility` - still leaf-path, never the module's own `modules/retry` barrel, consistent with every other `/core` entry. `modules/index.ts` gained `export * from './retry'`; `utilities/index.ts` lost its retry re-export. The class-level comment justifying `RetryHelper.xxx(...)` over `this.xxx(...)` no longer cites the removed aliases - detachability into a standalone reference is reason enough on its own.

Test file moved to `__tests__/retry/helper.test.ts`; the `'deprecated module-level aliases delegate to RetryHelper'` block (5 tests) is deleted outright rather than migrated - the risk it guarded (a detached static losing `this`) died with the aliases it detached. Every other test rewritten from bare calls (`executeWithRetry(...)`) to `RetryHelper.executeWithRetry(...)` and kept, unchanged in behavior: 42 -> 37 tests in this file, 1431 pass package-wide. `make purity-helpers` still 4/4 after rebuild. `connectors`/`core-server`/`core-worker`/`kernel` all green after rebuilding `kernel`'s dist. Updated the `packages/helpers` concept (module map, `/core` paragraph, retry section) and `references/utilities/retry` + `references/base/repositories/advanced` wiki pages; the wiki page was NOT moved - it documents a user-facing concept ("Utilities"), and `crypto`/`pool` already live in `modules/` while staying documented under `references/utilities/`.

## 2026-08-30 - New convention: narrow only what the framework owns

`conventions/narrowing-authority.md`. Written after `kernel@0.2.0-6` narrowed `PolicyDefinition.variant` to a closed union and broke a consuming application that stored its own edge kind in the same table. The narrowing was right about which values are wrong and wrong about who may extend the set - two separate questions that had been asked as one. Records the extensible-seam shape, why `TKnown | (string & {})` is rejected, why `unknown` beats a type that guesses at an application's schema, and that tightening a boundary type surfaces the whole loose chain feeding it one layer at a time (which reads as a cascade of new failures unless the changelog says otherwise).

## 2026-08-30 - `RetryHelper` added to the browser-pure `/core` surface

`src/core.ts` named only the `executeWithRetry`/`executeWithRetryUntil` aliases, so browser consumers could not reach the class that is now the canonical surface. Exporting `RetryHelper` also carries the four operations that have no alias in `/core` - `runWithTimeout`, `isRetryTimeoutError`, `computeBackoffDelayMs` and the private helpers - into the browser as statics, which is intended: the class is the API, the standalone aliases are back-compat for existing node code. Verified by `make purity-helpers` (4/4 entries browser-pure) rather than by reading imports, and by running `RetryHelper.executeWithRetry` through the built `/core` sub-path. Updated the `packages/helpers` concept and the wiki retry reference.

## 2026-08-30 - `Hash` class added to `modules/crypto`; `crypto.utility.ts`'s plaintext-passthrough removed

`utilities/crypto.utility.ts`'s `hash(text, options)` had two branches that returned `text` unhashed - a missing SHA256 secret, and any algorithm outside `'SHA256' | 'MD5'` - so a caller that forgot `secret` stored or compared plaintext with no error. Added `Hash` to `packages/helpers/src/modules/crypto/algorithms/hash.algorithm.ts`: a `BaseHelper` (not `BaseCryptoAlgorithm`/`ICryptoAlgorithm` - a digest has no inverse, so there is no `decrypt` to implement). `digest({ message, opts? })` takes no secret; `hmac({ message, secret, opts? })` requires one and throws (via `getError`) if it is empty. `HashAlgorithms` (`md5`/`sha1`/`sha256`/`sha384`/`sha512`) and `HashOutputEncodings` (`hex`/`base64`/`base64url`) are new const-classes with `TConstValue` types in `crypto/common/constants.ts`, alongside a new `DEFAULT_HASH_OUTPUT_ENCODING` (`hex`).

`crypto.utility.ts`'s `hash()` keeps its exact positional signature (published API, ~15 external call sites in BANA payment code) and now delegates to `Hash`, byte-identical for every existing call site (pinned against `node:crypto` directly in `__tests__/utilities/crypto.utility.test.ts`); the one behavior change is both former passthrough branches now throw. Also replaced the deprecated `crypto.Encoding` type with `BufferEncoding` in `aes.algorithm.ts`, `aes-legacy.algorithm.ts` (not previously flagged, found by the same sweep), and `rsa.algorithm.ts` - identical type in the resolved `@types/node`, zero behavior change. Swept the rest of `modules/crypto` for other deprecated/discouraged Node crypto APIs: none found (`createCipheriv`/`createDecipheriv` throughout, no unsalted `createCipher`, no legacy `Buffer()` constructor, RSA OAEP padding is Node's default). Two pre-existing judgement calls left unchanged and reported, not fixed: PBKDF2's salt (`DEFAULT_KDF_SALT`) is a single hardcoded string shared by every derived key, and `RSA.generateDERKeyPair` accepts any `modulus` including insecure sizes (e.g. 1024) with no lower bound. Updated the `packages/helpers` concept.

## 2026-08-30 - `retry.utility.ts` converted to a `RetryHelper` class

`packages/helpers/src/utilities/retry.utility.ts` held nine module-level arrow functions instead of the repo's class-oriented convention. Moved all nine (plus the private `RETRY_TIMEOUT_MARKER` symbol) onto a new `RetryHelper` class as static/private-static members, modeled on `LoggerFactory`'s shape. `RetryBackoffStrategies`/`RetryJitterModes` were already correct const-classes and are untouched.

The five public names (`isRetryTimeoutError`, `runWithTimeout`, `computeBackoffDelayMs`, `executeWithRetry`, `executeWithRetryUntil`) are published API with external consumers, so they stay as `@deprecated` module-level `const` aliases assigned straight from the class (`export const executeWithRetry = RetryHelper.executeWithRetry;`). A detached static method loses its `this` binding, so every cross-method call inside the class uses the explicit `RetryHelper.xxx(...)` form, never `this.xxx(...)` - otherwise the aliases would throw at runtime when called as bare functions. `executeWithRetryUntil` stays a plain loop, not a wrapper around `executeWithRetry`, per its own comment.

`packages/helpers/src/utilities/index.ts` (`export *`) and `src/index.ts` already surface `RetryHelper` and all five aliases with no change; `src/core.ts`'s hand-curated browser-pure subset only ever named `executeWithRetry`/`executeWithRetryUntil`/the two const-classes individually and still does - widening it to `RetryHelper` or the other three exports was out of scope for this structural-only change. Test count: 37 -> 42 in `retry.utility.test.ts` (5 new alias-delegation tests), 1391 -> 1396 pass package-wide (16 skip unchanged). `connectors`/`core-server`/`kernel` suites unaffected (pre-existing, unrelated `tsc` errors in `connectors`/`core-server` predate this change). Updated the `packages/helpers` concept and the `references/utilities/retry` wiki page.

## 2026-08-30 - `PolicyDefinition.variant` can be widened per app, `effect` stays closed

`kernel@0.2.0-6` narrowed `variant` (`core-server/.../models/entities/policy-definition.model.ts`) to `AuthorizationPolicyVariants.ALL`'s seven values, closing a real bug class - three wrong vocabularies (`p`/`g`, `group`/`policy`) had shipped before, and `ScopedCasbinAdapter` filters every query with an explicit `variant = ...`, so a wrong value silently selects zero rows (permanent 403, no error). But the narrowing over-reached: it left no way for an app to store its own edge type in the same table, a pattern the adapter was always safe to ignore (unknown variants are simply never selected).

Fixed by adding an `extraVariants` option to `extraPolicyDefinitionColumns`, e.g. `extraPolicyDefinitionColumns({ idType: 'string', extraVariants: ['merchant_role'] })`. Chose the options-object shape over a second type parameter: `extraPolicyDefinitionColumns` already infers `Opts` (carrying `idType`) from its single argument, and TypeScript has no partial type-argument application, so a second explicit type parameter for the variant would either collide with `Opts` inference or require specifying both positionally. The options object keeps one inferred type parameter, marked `const` so the extra-variants array infers as a literal tuple with no `as const` needed at the call site, and the default (no args) stays exactly the seven-value union - verified as a `@ts-expect-error` pin in `core-server/src/__tests__/authorize/grant-utility.test.ts`.

`effect` (`AuthorizationDecisions`: allow/deny/abstain) did **not** get the same treatment. Unlike `variant`, its value is written straight into the raw casbin policy line and read by casbin's own effect evaluator - an app-defined fourth value would not be filtered out, it would reach the evaluator and produce a decision nobody defined the meaning of. That is a correctness risk in the enforcement path itself, not a harmless unselected row.

While pinning "`AuthorizationPolicyBuilder.grant()`'s output assigns cleanly to the column", found the output did not: `grant()`/`customGrant()` had no explicit return type, and TypeScript's return-type inference silently widened `effect: TAuthorizationDecision` back to `effect: string` (see the new gotcha, `TConstValue`-derived literals go fresh through an indexed-access type and widen on an unannotated return). Fixed by adding explicit return types to both methods in `kernel/.../builders/policy.builder.ts` - a latent, pre-existing gap, not a regression from this change, but one this change's own tests would otherwise have failed to catch. See the [2026-08-30 changelog](/changelogs/2026-08-30-policy-definition-extra-variants).

## 2026-08-30 - domain-hierarchy shared tree removed - one mechanism, not three

The same fact - a role held, or a grant declared, at a parent domain reaching every domain beneath it - was expressed three times: `g3` policy lines built per-principal from `domain_inherits` rows (`ScopedCasbinAdapter`'s `DOMAIN_EDGE` branch), a process-wide shared tree (`ICasbinEnforcerOptions.domainHierarchy` -> `DomainHierarchyStore` -> `addDomainHierarchy` on `g`), and the per-principal `resolveDomainEdges` hook. The shared tree and the per-principal path were both added in the prior two days; nothing consumed the shared tree. Kept the per-principal path - it reads live on every user-cache miss, is correct across processes because the user policy-line cache is already Redis-backed, and needs no duplicated rows, no TTL, and no staleness ceiling.

Deleted outright: `enforcers/domain-hierarchy.ts` (`DomainHierarchyGraph` + `DomainHierarchyStore`), `adapters/domain-hierarchy-loader.ts`, `ICasbinEnforcerOptions.domainHierarchy` (kernel `common/types.ts`, all three fields), and `CasbinAuthorizationEnforcer.invalidateDomainHierarchy()` plus its optional declaration on `IAuthorizationEnforcer`. `addDomainHierarchy` on the `g` axis stays - casbin only accepts a `RoleManager` there - but its instance now reads only the shared per-request overlay `Map`, with no store behind it.

`DomainHierarchyRoleManager` and `MembershipRoleManager` both dropped their `store` constructor field; `BaseRoleManager.collectAncestors` dropped its `graph` parameter and walks the overlay alone. `CasbinAuthorizationEnforcer.registerMatchers()` now wires the overlay and all three role managers (`g2`, `g3`, and the reversed `g` instance) unconditionally for every `isScoped` model, rather than gating that wiring on the now-deleted option - functionally identical when no `g3` edges exist (an empty overlay degrades to the old per-principal-only behavior), and the only way hierarchy edges reach `g`/`g2` when they do exist.

`ScopedCasbinAdapter`'s public and protected surface is unchanged; `TDomainHierarchyEdge` moved from the deleted loader file into `scoped-casbin.adapter.ts` itself, same shape, same export. Test count: 1299 pass -> 1263 pass (1 skip unchanged) in `core-server`. Removed the store's own suite (`domain-hierarchy.test.ts`, 27 cases) outright, and cases exercising the option / `maxStaleMs` / `invalidateDomainHierarchy` from `domain-hierarchy-enforce-e2e.test.ts` (19 -> 13) and `domain-hierarchy-role-managers.test.ts` (28 -> 26, rewired onto the overlay-only constructors rather than dropped). See the rewritten [2026-08-29 changelog](/changelogs/2026-08-29-casbin-domain-hierarchy) and the updated `authorization-casbin` concept.

## 2026-08-30 - the no-enforcer branch in `authorize()` now fails closed

`AuthorizationProvider.createAuthorizeMiddleware` (`kernel/.../providers/authorization.provider.ts`) had one branch that ignored `IAuthorizeOptions.defaultDecision`: when `AuthorizationEnforcerRegistry.hasEnforcers()` was `false`, it called `next()` unconditionally, at `debug` level. Every other inconclusive outcome in the same function (an `ABSTAIN` decision) already fell back to `defaultDecision`; this one hard-coded ALLOW instead.

Fixed to read `options?.defaultDecision ?? AuthorizationDecisions.DENY`, same fallback the `ABSTAIN` branch already uses. `deny` (the default) throws a new `AuthorizationErrors.ENFORCER_NOT_REGISTERED` (403, `core.authorization.enforcer_not_registered`) naming the actual cause instead of a generic denial; `allow` still proceeds but now logs at `warn`. `alwaysAllowRoles`, `spec.allowedRoles`, and the voter chain all run earlier in the same function and are unchanged - verified with a regression test that a voter/role bypass still short-circuits before this branch runs.

Breaking: an application relying on the old fail-open behavior during a rollout now gets 403s unless it sets `defaultDecision: 'allow'` explicitly. Tests added under `kernel/src/__tests__/authorize/no-enforcer-decision.test.ts`. `AuthorizationEnforcerRegistry.resolveOptions()` only searches registered enforcers' containers, so with zero enforcers it can never see a real app's bound options regardless of this fix - a separate, pre-existing coupling gap, not touched here. See the [2026-08-30 changelog](/changelogs/2026-08-30-authorize-no-enforcer-fails-closed).

## 2026-08-30 - `ScopedCasbinAdapter.resolveDomainEdges`: a per-principal domain-edge hook

New optional constructor option on `ScopedCasbinAdapter` (`core-server/.../adapters/scoped-casbin.adapter.ts`), not on `ICasbinEnforcerOptions.domainHierarchy` as first proposed - the enforcer never constructs the adapter (an application does, passing it in as `options.adapter`), so there is no channel from enforcer options down to per-adapter construction. Verified against `casbin.enforcer.ts` and `component.ts` before implementing.

`resolveDomainEdges({ principal, domains })` returns `{ child, parent }[]`, already `<Type>_<id>` tokens, folded into `g3` lines exactly like a real `domain_inherits` row - no reformatting either side. `domains` is the principal's domain closure, reconstructed from rows `queryPrincipalPolicies` already returns (the `join_domain` seed plus both ends of every `domainEdge` row) rather than a third query. This is for a hierarchy an app already owns as a plain foreign key on a business table; `domainHierarchy.load` is for a hierarchy that IS authorization data. Neither is a fallback for the other.

A throwing hook is caught, logged, and treated as no edges for that load - rows already gathered still load. Chosen over aborting the whole load: a missing `g3` edge can only narrow what `g`/`g2`/`g3` reach (all three share one overlay `Map`), never widen it, so the degrade is toward less access, not toward an outage that would deny a principal's unrelated, already-fetched access over one flaky enrichment call - the same reasoning `DomainHierarchyStore.graph` already uses past `maxStaleMs`.

A hook edge duplicating a real `domain_inherits` row is harmless, verified rather than assumed: `DomainHierarchyRoleManager.addLink` stores parents in a `Set`, so a duplicate `addLink(child, parent)` is a no-op. Proven end to end through a real `enforce()` (`scoped-adapter-domain-edge-hook-e2e.test.ts`), not just at the adapter, because the role (`g`) axis only sees a per-request `g3` edge through the overlay `Map` `registerMatchers()` shares across all three role managers.

The hook cannot join `queryPrincipalPolicies`'s wave (it needs that query's rows to compute `domains`) but does not wait on the independent `queryEdgePolicies` either - both resolve concurrently once the closure is known. Absent, behavior is byte-identical to before (1291 pre-existing tests unmodified, all pass; 8 new tests added). See the updated `authorization-casbin` concept.

## 2026-08-30 - Typesense `collectionExists()` stops reporting infrastructure failure as absence

Third instance of the same drift as the entry below, deliberately owner-decided rather than discovered: `TypesenseConnector.collectionExists` (`packages/connectors/src/search/typesense/connector.ts`) wrapped its engine call in a blanket try/catch and returned `false` on ANY error - network, auth, anything - while `MeilisearchConnector.collectionExists` already tolerated only a genuine not-found via `runEngineCall` + `notFoundFallback`. That asymmetry mattered because `ensureCollection()` reads a `false` as "go create it" - reporting "does not exist" when the truth is "could not check" is the wrong shape for a caller whose next move is a write. Checked the Typesense SDK source (`Collection.exists()`) before touching anything: it already swallows its own `ObjectNotFound` internally and resolves `false` for a real absence, only ever rejecting on an infrastructure failure - so there was no not-found case left to tolerate. Typesense now just routes the call through `runEngineCall` with no `tolerate` clause at all; every throw is real and reaches the caller as a sanitized 503, matching Meilisearch.

Locked into `packages/connectors/src/__tests__/search/conformance/connector-conformance.ts` as a second required builder, `buildWithFailingExistenceCheck` (same shape as `buildWithFailingHealth`), so a third engine joining the suite must answer it too. The principle that makes this and the entry below one story: a probe whose job is to detect failure must never throw (`getHealth`); a query whose `false` triggers a write must never lie (`collectionExists`) - opposite directions, both intentional. See the extended [2026-08-30 changelog](/changelogs/2026-08-30-search-connector-health-and-import-contract).

## 2026-08-30 - search connector contract: `getHealth()` never throws, Typesense imports keep partial progress

Meilisearch and Typesense connectors (`packages/connectors/src/search/{meilisearch,typesense}/connector.ts`) had drifted from the shared `ISearchConnector` contract in two ways, both fixed to match Typesense's already-correct behavior. `getHealth(): Promise<{ ok: boolean }>` must never reject - `BaseSearchConnector.ping()` (`search/core/connector.ts`) just reads `.ok` off the result - but Meilisearch's probe ran through `runEngineCall`, which turns a failure into a sanitized 503; it now try/catches around the probe and resolves `{ ok: false }`, same as Typesense. Typesense's `importDocuments()` promised (in its own comment) to attach partial progress to every failure, but the `isApplicationError(error)` branch did a bare `throw error`; it now merges `{ totalCount, processedCount, successCount, failCount }` onto `error.extra.details` before rethrowing the SAME error, preserving its `statusCode`/`messageCode` - matching what Meilisearch's `throwImportFailure` already did.

Locked down in `packages/connectors/src/__tests__/search/conformance/connector-conformance.ts`: the shared conformance suite now takes a required `buildWithFailingHealth` builder and asserts `getHealth()`/`ping()` degrade to `{ ok: false }`/`false` rather than throwing - both engines inherit this for free. Engine-specific `getHealth()` status-string mapping (`ok: true` on `available`, `ok: false` otherwise) lives in the new `meilisearch/connector/lifecycle.test.ts`. Typesense's existing ApplicationError-path import test (`typesense/connector/documents.test.ts`) was extended to assert `error.extra.details`, not just `statusCode`/`messageCode`. See the [2026-08-30 changelog](/changelogs/2026-08-30-search-connector-health-and-import-contract).

## 2026-08-30 - `casbin.enforcer.ts` split: policy-line codec and per-user cache moved out

Pure refactor, zero behavior change (502 tests unmodified, all pass). `CasbinAuthorizationEnforcer` carried six responsibilities under one class name; two of them were coupled to the rest only through `this.options`, so they moved to their own files: `PolicyLineCodec` (`enforcers/policy-line-codec.ts`, static methods - extracting a user's lines from an isolated throwaway enforcer, and loading a line list into a borrowed enforcer's model) and `UserPolicyLineCache` (`enforcers/user-policy-line-cache.ts`, a `BaseHelper` instance - the Redis cache key, TTL, and the `pendingLineFetches` single-flight map). `CasbinAuthorizationEnforcer` now holds one `UserPolicyLineCache` (lazily, via `requireRedisCache()`) and delegates. Pool lifecycle, the `IAuthorizationEnforcer` contract, and scoped-model wiring (`registerMatchers`, `resolveModel`, `validateExpiresIn`, ...) stayed put - the audit found those internally tangled enough that splitting them further would scatter rather than clarify. `casbin.enforcer.ts` is 653 -> 530 lines; public surface and the `loadPolicyLinesIntoModel` protected-override point (used by `enforcer-pool*.test.ts`) are unchanged.

## 2026-08-30 - the domain overlay reaches all three axes, not two

`MembershipRoleManager` (`g2`) read only the shared graph while `g` and `g3` read the shared graph plus the per-request overlay. Ancestor resolution is now one `collectDomainAncestors` walk (`enforcers/domain-hierarchy.ts`) used by all three, and `registerMatchers()` hands the same overlay `Map` to all three.

The asymmetry broke exactly the membership shape the bundle recommends - a single `join_domain` row at the parent. A just-created child domain stayed denied on the membership axis until the next TTL reload while the role axis already allowed it, which reads as "the user holds the role and is still refused". Found in cross-team review, not by the suite: every existing membership test used a row per child domain, where the ancestor walk is never needed.

## 2026-08-29 - `domainHierarchy`: `g`, `g2` and `g3` gain parent-to-child reach

`ICasbinEnforcerOptions.domainHierarchy` (`{ load, refreshMs?, maxStaleMs? }`, `kernel/src/base/auth/authorize/common/types.ts`) is a new opt-in option. Unset, `g`/`g2`/`g3` behave exactly as before and `CASBIN_RBAC_DOMAIN_SCOPED_MODEL` is byte-identical - the matcher never changed, only the role-manager layer beneath it.

`DomainHierarchyStore` (`core-server/.../enforcers/domain-hierarchy.ts`) owns one shared child->parent tree per enforcer, warmed in `configure()` before the pool exists, and refreshed on a TTL. It loads once per enforcer, not once per user, and is never shipped inside a cached policy-line payload - the tree is tenant-structural and identical for every principal. `warmup()` throws on a failed first load - never serve with an empty tree.

Three role managers consume it: `DomainHierarchyRoleManager` backs `g3` directly and, reversed, plugs into casbin's own `DefaultRoleManager.addDomainHierarchy()` on `g`; `MembershipRoleManager` backs `g2`. What each gains: `g` - a role assigned at a parent domain matches a request at a child domain; `g3` - a grant declared at a parent domain applies at its children; `g2` - joining a parent domain makes you a member of every child, which is what the `ANY_MEMBER` grant scope tests.

**Correction to the story above: the shared tree is not what makes this fresh.** It is a completeness and performance layer with a TTL. Freshness rides the existing per-user policy-cache invalidation path instead: `ScopedCasbinAdapter` still emits per-principal `g3` lines from a `domain_closure` seeded by the principal's own `join_domain` rows, re-read from the database on every cache miss - a path that was already correct across every process (Redis-backed). `registerMatchers()` hands the `g3` `DomainHierarchyRoleManager` and the reversed `g` instance the SAME overlay `Map` (casbin never puts the `g`-axis manager in its own `rmMap`, so without sharing it would never receive `addLink` calls at all). A per-request `g3` edge therefore satisfies the role axis too, with no TTL wait: a newly created child domain is reachable as soon as the owning principals' policy caches are invalidated, not on the tree's next reload. The contract this asks of the application: write the `join_domain` row in the same transaction that creates the domain, invalidate the affected principals' caches only after that transaction commits, and invalidate every affected principal, not only the actor - otherwise the feature works for one user and silently does not for the rest.

**A `SYSTEM_WIDE` grant is untouched by any of this.** It bypasses the domain clause in the matcher before membership or nesting are ever consulted - a role whose grants are all `SYSTEM_WIDE` is already global and gains nothing from enabling `domainHierarchy`.

**The precondition check operators need is narrower than it looks.** The naive question - "does anyone have a role assignment with no domain plus membership at a parent domain" - measures shape, not exposure: on a real dataset it returned 1254 users, none of whom were affected. The right question is "does any role in that intersection carry an `ANY_MEMBER` grant it should not", because the membership change only touches the `ANY_MEMBER` branch of the matcher. On the same dataset, that returned 8.

A role assignment with no domain was already a wildcard (`g, User, Role, *` - confirmed at `scoped-casbin.adapter.ts`'s `row.domain ?? '*'` and documented on `AuthorizationPolicyBuilder.assignRole`) - unaffected by this change, since a wildcard already matches every domain. Operators narrowing a role assignment going forward should use an explicit domain, not the wildcard.

`DomainHierarchyLoader` (`adapters/domain-hierarchy-loader.ts`) builds `load` from the same entity mapping `ScopedCasbinAdapter` takes, reading the whole `domain_inherits` tree once. `PolicyConnectorResolver` (`adapters/connector.ts`) is the connector-resolution logic `BaseFilteredAdapter` already had, extracted so the new loader shares it instead of duplicating it.

**Two options added after the design review, both operational.** `invalidateDomainHierarchy()` (optional on `IAuthorizationEnforcer`, next to `invalidateUserCache`) force-reloads the shared tree now; it refreshes only the process that receives the call, never a cluster-wide broadcast. `maxStaleMs` bounds how long a failed reload may keep serving the previous snapshot - past it, `graph` returns an EMPTY graph instead of throwing (hierarchy-derived access stops, direct grants keep working), because throwing on the enforce hot path would turn a database blip into an outage. Leaving `maxStaleMs` unset is safe only while the domain tree is append-only; an application that can move a domain to a new parent must set it, or a stale tree keeps the former parent's grants alive.

**A retry-gating defect was caught in the same review** - `refreshIfStale()` originally gated on the last successful load, so an unhealthy dependency got hit on every call instead of once per interval. Fixed by gating on the last attempt instead (`lastAttemptAt`, set regardless of outcome). General pattern, not specific to this feature - see [Gotchas](/conventions/gotchas.md).

See the [2026-08-29 changelog](/changelogs/2026-08-29-casbin-domain-hierarchy) and the updated `authorization-casbin` concept.

## 2026-08-24 - FilterQuerySchema / WhereQuerySchema

Two composed query shapes in `kernel/src/base/repositories/query-schemas/index.ts`, and the CRUD
factory's `find`/`findById`/`findOne` now name them instead of rebuilding `z.object({ filter: ... })`.

Measured on the consumer that asked: 47 copies of
`z.object({ filter: FilterSchema.optional() }).partial()` and 22 of the `where` equivalent, across
51 files. The 47 are **noise** - `FilterSchema` already ends with `.optional()`, so the second
`.optional()` and the `.partial()` are both no-ops, and the override throws away the framework's own
`.openapi()` description. Deleting them is behaviour-neutral.

The 22 are **not** noise. `WhereSchema` has no trailing `.optional()`, and `resolveCountConfig`
requires `where` whenever `isStrict.requestSchema` is set - which is the default from
`factory/controller.ts`. Measured: `GET /x/count` and `GET /x/count?where=` both 400, only
`?where={}` passes. Reviewed and **deliberately left unchanged** on 2026-08-24; the test
`core-server/src/__tests__/repositories/query-wrapper-schemas.test.ts` pins it so a future change is a
decision rather than an accident.

`updateBy` and `deleteBy` also keep required `where`, for a different and stronger reason: a missing
one rewrites or deletes every row. They must never be migrated to `WhereQuerySchema`.

Both wrappers stay plain `ZodObject`s so `.extend()` covers the composed call sites without a second
API. Re-applying `.openapi({ description })` returns a NEW schema and preserves parsing - that is how
`findById`/`findOne` keep their own wording off one shared shape.

## 2026-08-22 - console log color is environment-gated

`resolveLoggerColorize()` in `logger/common/constants.ts` decides, at call time, whether a line may
carry ANSI. First match wins: `APP_ENV_LOGGER_COLOR`, then a non-empty `NO_COLOR`, then `NODE_ENV`
outside `Environment.DEVELOPMENT_ENVS`. Reusing that set rather than testing `=== 'production'` is
deliberate - it is the same fail-closed boundary the error sanitizer draws, and staging and uat ship
their lines to an aggregator exactly like production does.

The return type is `boolean | undefined` on purpose. `undefined` means the framework has NO opinion:
winston has no terminal detection of its own, so it reads that as on and nothing regresses; the pino
path forwards no option at all, so `pino-pretty`'s `isColorSupported` still suppresses color when
stdout is not a terminal. Collapsing this to a plain boolean would force color through a pipe in
development, which is the bug the change exists to remove.

`ICustomLoggerOptions.colorize` overrides everything, both directions.

**Trap for anyone writing a test here:** `bun test` sets `NODE_ENV=test`, which is not in
`DEVELOPMENT_ENVS`, so the default is OFF under the test runner. `default-logger.test.ts` now passes
`colorize: true` explicitly - it asserts the wiring, not the policy.

## 2026-08-21 - `service` is a framework authentication strategy

An Ed25519 assertion per request, verified against the caller's own JWKS. The protocol and the
verifier's claim checks were proven in a consumer application first; the framework took the design,
not the files.

**Why it had to be a FRAMEWORK name.** An application registering `service` under its own package
means every route naming it imports from that package - and an IGNIS application that does not
depend on that package has no correct way to name the strategy at all. Measured on the consumer
that asked: 576 route declarations, 201 files needing a new import, and five files in a package
that could not compile because it depends on `@venizia/ignis` and not on their core. With
`AuthenticateStrategy.SERVICE` the same migration is a textual substitution with zero new imports.

**What the assertion covers, and only this:** the HTTP method and the percent-ENCODED path. Not the
query string, not any header, not the body. That matters most for tenant selection, which is
usually a header or a query parameter - so an assertion proves which service called, never which
tenant it acts on.

Decisions worth not re-deriving:

- **The path is compared as `new URL(context.req.url).pathname`, never `context.req.path`.** Hono
  hands the second one back DECODED, so any route carrying a space or a non-ASCII slug would 401
  permanently while every ASCII-safe test fixture passed. Measured both accessors on a live request.
- **The allowlist is `Object.hasOwn`, not a truthiness check on the index.** The caller map is a
  plain object, so `iss: 'constructor'` returns `Function` - truthy - walks past the guard and
  reaches `new URL(<function>)` as an uncaught TypeError.
- **`signLifetimeSeconds` and `acceptMaxAgeSeconds` are SEPARATE**, and only the second is a
  security control. The caller already sets `exp` - it signs the token - so the callee's accepted
  age is the only bound that survives a compromised caller, and it can never be something the caller
  requests. A caller needing more slack is named in the callee's `callers` map.
- **`clockToleranceSeconds` is for the FUTURE case**, not for widening the window. Two machines
  never agree to the second, and without tolerance a caller one second ahead is refused outright.
  Measured at tolerance 5: `iat + 5s` accepted, `iat + 6s` refused.
- **There are TWO windows, not one, and writing either alone loses the other.** Measured at the
  defaults: with clocks agreed a token is accepted to age 64 and refused at 65, so the ACCEPTANCE
  window is 65s; with the caller running the full `clockTolerance` fast the same token is still
  accepted 69s after minting, so the REPLAY window is 70s. 65 answers "what does this machine
  accept", 70 answers "how long can a capture be used" - the second is the threat-model number.
  The refusal is `ERR_JWT_EXPIRED` either way: `exp` fires, so `maxTokenAge` never binds for an
  honest caller.

  That makes `clockToleranceSeconds` a SECURITY knob: it widens the replay window second for second.

  This number moved three times before it settled - 60 in the original spec, 70, then 65 as a
  straight replacement, then both. It lives in two tests now for exactly that reason.
- **The signer takes PEM only, deliberately.** `importSPKI` refuses a private PEM outright, which
  makes the private half unreachable from the published document by construction. The `jwk` format
  cannot offer that - see the `/certs` entry below.
- **`resolvePrincipal` returns `IAuthUser | null`, and the strategy validates `userId`.**
  `executeAnyMode` calls `setCurrentUser` unconditionally, so a principal without one would
  authenticate here and fail at the first write, far from the cause. `executeAllMode` already
  refused it; this closes the gap between the modes.

`AuthenticateComponent` now accepts service-only configuration: the guard was "jwt or basic", which
refused the exact application this exists for - one that verifies assertions and consumes no user
tokens at all.

## 2026-08-21 - `/certs` could publish the signing key, through the `jwk` format

`JWKSIssuerTokenService` served whatever `keys.public` parsed into. The `pem` format was never
exposed - `importSPKI` rejects a private PEM outright. The `jwk` format was: `keys.public` is
`JSON.parse`d straight into `importJWK`, which imports whatever it is handed, and a private JWK
carrying `"ext": true` yields an EXTRACTABLE key. `exportJWK` then carries `d` into the document
served at an unauthenticated URL.

Measured on the jose in this tree, not reasoned:

```
ext=true       import OK, export has d: true
ext=false      refused: non-extractable CryptoKey cannot be exported as a JWK
ext=undefined  refused
```

So the only thing between a mis-pasted key and a published signing key was an optional flag on the
input. It needs operator error to reach, which is not much comfort: a field named `public` must make
serving something private impossible, not unlikely.

`assertPublicJWK` refuses `d`, `p`, `q`, `dp`, `dq`, `qi`, `k` in TWO places - when key material is
loaded, and again immediately before the JWKS document is built. The second is not redundant: that
object is the one `/certs` actually serves, so it is the last place to notice a signing key about to
be published, whatever route the material took. Named members rather than a blanket scan, because a
public JWK legitimately carries `x`, `y`, `n`, `e`.

Present in the published `@venizia/ignis@0.2.0-2`. Found while evaluating BANA's service-auth
implementation, whose PEM-only signer is immune - and that immunity is the guard the service
strategy inherits.

## 2026-08-20 - `scripts/release.ts` drives the release chain

`make release-plan` prints what needs releasing; `make release ARGS="--yes"` runs it. It dispatches
`package-release.yml` one package at a time in dependency order and WAITS for each run before the
next.

The waiting is the reason it exists. `force-update` runs over the whole workspace
(`--filter "@venizia/*"`), so a range that goes stale mid-flight fails the run - a core-worker
release once died on a range belonging to core-server, six minutes after a connectors release made
it stale. Hand-dispatching invites exactly that.

Three things it checks that a human dispatching by hand does not:

- **The tree must be clean and pushed.** The workflow checks out the BRANCH, not local HEAD, so
  uncommitted or unpushed work is simply not in the release. Reported, not thrown, under `--dry-run`.
- **It fetches before reading any version.** A stale checkout makes the repo and the registry look
  like they disagree when they do not - that misreading happened while writing this script.
- **A green run is not proof of a publish.** The registry is re-read afterwards and the run is a
  failure unless the version actually moved. The workflow publishes BEFORE it commits, so both
  half-states are possible: published-but-uncommitted, and green-but-nothing-published.

It also `git pull --ff-only`s after each package, because the workflow pushes its own release commit.

**Measured on the 2026-08-20 release, dispatched in parallel rather than through this script:** three
runs CANCELLED and one FAILED out of nine. The workflow's `concurrency: { group: npm-release,
cancel-in-progress: false }` keeps at most one pending run, so extra simultaneous dispatches are
cancelled outright rather than queued. The failure was `Sync develop` - `git pull origin develop`
losing a race with a sibling release's push.

That failure was harmless, and by design: `Sync develop` sits BEFORE `Publish to NPM`, so the run
died with git untouched and nothing published. This is the payoff of publishing ahead of every git
write - the common failure leaves nothing to roll back. The retry then succeeded. Every package
still landed correctly, but four wasted runs is the cost of not serialising.

Which packages need releasing is derived, never listed: source files changed since that package's
own `chore(<pkg>): release v...` commit. An explicit `bun scripts/release.ts kernel connectors` is
honoured as given; a full sweep releases only what changed.

## 2026-08-19 - the deprecated `Swagger*` aliases are removed

`SwaggerComponent`, `ISwaggerOptions` and `SwaggerBindingKeys` are all gone, by an explicit decision
rather than by attrition. `SwaggerComponent` had first disappeared as a silent side effect inside the
auth change - a pre-release audit caught it, it was restored, and only then was removing the family
chosen deliberately.

The distinction is the whole point: a public export deleted without a changelog line breaks a
consumer who has nothing to search for. This is a documented breaking change with a migration table,
and every surface that promised the aliases was corrected in the same change -
`core-server/README.md`, the api-reference wiki page (both its rename note and its binding-keys
section), this bundle's core-server concept, and the test that pinned `SwaggerBindingKeys`.

**All three, not one.** Removing only the named symbol would have left a consumer of the deprecated
surface breaking on one of three - the worst of both states. Historical changelogs that describe the
original rename are left alone: they are a record of what happened, not a claim about today.

It is a pure rename with no runtime consequence: `SwaggerBindingKeys.SWAGGER_OPTIONS` always held the
same `'@app/api-reference/options'` string, so no binding moves. Verified before removing: no usage
in `packages/*/src`, `examples/*/src`, or BANA.

## 2026-08-19 - service-to-service authentication, phase 1

Requested by BANA as a written change spec, evaluated claim by claim against `packages/*/src`, and
built after they accepted the two places the evaluation overrode them. Both the request and the
response documents live outside this repo; what matters here is the reasoning.

**The strategy type is open now:** `TAuthStrategy = TConstValue<typeof AuthenticateStrategy> |
(string & {})`, the same idiom `TDataSourceDriver` already used. The runtime was always open - the
registry keys a `Map<string, ...>` and the middleware factory takes `string[]` - only the type was
closed, and a type alias cannot be widened by declaration merging from a consumer.

**The widening deletes the only typo guard that existed, so its replacement shipped with it.**
Measured before assuming: a misspelled strategy fails CLOSED, not open - `strategies.length > 0` is
satisfied, the middleware mounts, `resolveStrategy` throws, every request 401s. But
`executeAnyMode` catches that at DEBUG level, so nothing surfaces. The compiler was what stopped a
typo reaching production. `AuthenticationStrategyRegistry.reportUnregistered` now runs while route
configs are built, at both the REST and the gRPC call site - the two carried a verbatim-duplicated
block, and fixing only REST would have left every RPC unguarded.

**It REPORTS, it does not throw, and the first cut got that wrong.** A pre-release audit caught it:
`defineAuthController` hard-codes `strategies: ['jwt']` on four routes it registers unconditionally,
so an application that registers its JWT strategy under a custom name - the exact configuration this
release adds support for - died at `registerControllers()`. A route listing several strategies under
ANY mode also tolerates one that does not resolve, by design. So the framework logs at error level
and `assertRegistered` stays as the throwing method an APPLICATION can call in its own startup.
Pinned by a test that builds route middlewares for an unregistered `'jwt'` and asserts no throw;
swapping the call site back to `assertRegistered` fails it.

Two traps in that check, both found by reading the code rather than by reasoning:

- **An EMPTY strategies array is the framework's own encoding of `authenticate: { skip: true }`**
  (`resolveRouteAuth` returns `{ strategies: [] }`, and `auth-config.test.ts` asserts it). A check
  that rejected `[]` would break every intentionally public route.
- The check is skipped while the registry is empty. Route configs are built in
  `registerControllers()`, which runs after `preConfigure()` and `registerComponents()`, so a real
  application has registered by then; an empty registry means a unit test on a controller, where no
  name resolves either way.

`AuthenticateStrategy.isValid` and `SCHEME_SET` know the two built-ins ONLY and now say so. They
have no call site in this repo but are public exports, so they stay - the real hazard was a future
reader wiring `isValid` into the boot check and rejecting every application-registered strategy.

**The generated OpenAPI document had to move with the type.** `buildRouteMiddlewares` emits
`security: strategies.map(s => ({ [s]: [] }))`, while `ApiReferenceComponent` registered exactly two
schemes. A requirement naming an undeclared scheme is an invalid OpenAPI 3.1 document: the UI renders
an unknown scheme and a generated client silently omits the credential, so the route publishes as
effectively unauthenticated in the contract other teams build against. `IApiReferenceOptions
.securitySchemes` closes it, applied last so an application can also override either built-in.

**`verify` and `sign` on the JWT services.** Nothing checked `aud`, `iss` or `algorithms` anywhere,
so in a fleet pointing every verifier at one issuer JWKS, a token minted for one service was accepted
verbatim by all of them. `IJWTVerifyOptions` mirrors jose's own `JWTVerifyOptions` and is a pure
pass-through. Three options beyond what was asked for: `maxTokenAge` (the real replay window - `exp`
is chosen by whoever minted the token), `typ` (cross-token-type confusion, which matters when one
JWKS serves both user tokens and service assertions) and `requiredClaims`.

**The sign precedence was INVERTED against the request, deliberately.** The ask was for
`sign.issuer`/`sign.audience` to be defaults that YIELD to a payload-supplied claim, preserving an
existing smuggling path. Refused: `iss`, `aud`, `sub` and `jti` are in `JWT_COMMON_FIELDS` and ride
through the AES envelope in the clear, the framework never calls `generate` itself, so the payload is
entirely application-shaped - an issuer identity any payload can overwrite is not an identity. The
configured value is authoritative and a conflicting payload claim is overwritten with a warn.
Per-token variation became an explicit argument instead: `generate({ payload, claims: { audience,
subject, jwtId } })`, which is strictly more capable than what was asked for.

`JWSTokenService.getSigner` has its own independent fluent chain, so the same treatment had to land
in BOTH services - a `sign` option declared on the JWS options and applied only in the JWKS issuer
would be silently inert, which is worse than an absent option.

Two behaviours worth not re-deriving:

- **jose's audience matching is OVERLAP, not equality.** A token carrying `['commerce','inventory']`
  satisfies `verify.audience: 'inventory'`. Strict single-audience has to be enforced at issue time.
- **`maxTokenAge` measures against `iat`, not `exp`.** A token minted this instant has age 0, so
  `maxTokenAge: '0 seconds'` does NOT reject it - a test for this must backdate `iat` directly.

The `applicationSecret` interaction is the finding that mattered most and neither side had listed:
`decryptPayload` runs after every successful verify and calls `aes.decrypt` with `doThrow = true`
for every claim outside `JWT_COMMON_FIELDS`. A verifier with `applicationSecret` set therefore
CANNOT consume a foreign service's token at all, whatever `verify.audience` says - it throws before
audience is reached. No framework knob was added: the answer is a dedicated verifier instance
without `applicationSecret`, which works today.

## 2026-08-19 - a browser BFF that survives a second tab

`SharedBffTransport` (`packages/core-worker/src/transport/shared.ts`) runs one Worker per ORIGIN
instead of one per tab, and is the default choice for a browser BFF now. `WorkerBffTransport` is
correct only when the BFF touches no origin-exclusive resource.

The constraint is storage, not framework. Measured end to end in Chromium, two tabs of a
PGlite/OPFS BFF without this transport:

- The FIRST tab holds the OPFS access handle and works normally.
- The SECOND tab renders its UI but its database never boots - every BFF call fails with
  `Failed to execute 'createSyncAccessHandle': Access Handles cannot be created if there is another
  open Access Handle or Writable stream associated with the same file`.
- The first tab is UNAFFECTED while the second is broken (read 200, write 201 throughout).
- Closing the lock holder and reloading the other tab recovers fully, including every row the first
  tab committed in the meantime.

So the limitation was real, contained and self-healing - and the second tab still died with a raw
OPFS error and no explanation. The transport elects one tab with the Web Locks API, calls
`createWorker()` only in the winner, and forwards every other tab's request over a
`BroadcastChannel` in the envelope the Worker already speaks. Re-measured with two real tabs after
the change: tab 2 reads and writes through tab 1, and closing tab 1 promotes tab 2 in place with no
reload.

Design points that are not obvious from the code:

- **Web Locks, not a heartbeat.** The browser releases the lock when the tab goes away, a crash
  included, so there is no stale-leader window and nothing has to detect a death.
- **`{ ifAvailable: true }` first, then a second QUEUED request.** The first tells a tab it is a
  follower without hanging behind the leader; the second is the promotion, and it resolves on its
  own.
- **`createWorker` is a factory, not a `Worker` instance.** Passing an instance would start the
  Worker before the election, which is the exact thing the election prevents.
- **Promotion rejects everything in flight** rather than replaying it. Those requests went to a
  leader that is gone, and a write may already have been applied.
- **`close()` aborts the queued lock request.** Without it a closed transport stays in the queue and
  is eventually handed leadership over a tab that could have served.
- **There is deliberately NO "new leader is ready" broadcast.** It existed, was posted and was never
  consumed, and it cannot be consumed safely: `BroadcastChannel` does not order messages across
  senders, so a request posted around a promotion may still be answered by the new leader, and a
  follower failing its in-flight requests on the announcement would turn those successes into
  errors. The request timeout is the honest answer for that window.
- A host with no `navigator.locks` runs single-tab, which costs nothing: measured on a plain-http
  origin, `navigator.locks` and `navigator.storage.getDirectory` are BOTH undefined, because both
  are secure-context only. Wherever OPFS works the lock exists.

Bun has `BroadcastChannel` but no `navigator.locks`, so the suite drives a `LockManagerStub` -
without it every test would take the single-tab branch, which is the one branch it is not about.

**The stub grants the lock ASYNCHRONOUSLY, and that is load-bearing.** It granted synchronously
first, which made the role settle before the constructor returned - closing the window where
`close()` races the grant. A review found two blockers hiding in exactly that window, and the suite
was structurally unable to reach either. A real `LockManager` grants from a queued task; a stub that
cannot reach a window cannot test it.

The two blockers, both in the first cut of this transport:

- **`close()` during the election started a worker and then held the lock forever.** The
  `ifAvailable` callback had no `isClosed` guard while the queued branch did. A closed transport
  called `becomeLeader()`, booted PGlite, took the OPFS handle, and reported itself leader - and
  `close()` had already read and cleared `releaseLeadership` before `heldUntilClosed()` assigned it,
  so nothing could ever resolve it. No other tab was ever promoted, and that dead leader answered
  nobody: its channel listener was already detached. An origin-wide outage from one transport closed
  a few milliseconds after construction.
- **The worker was never terminated, and `close()` released the lock BEFORE tearing down.**
  `WorkerBffTransport.close()` deliberately leaves its worker running - it did not create the one it
  was handed - but `SharedBffTransport` DID create it. So closing on a live page promoted another
  tab, which opened the same database while the old worker still held the exclusive access handle:
  the transport reintroduced the exact failure it exists to prevent. It now holds the `Worker`,
  terminates it, and releases the lock only after.

Four more found in the same pass: `fetch()` did not re-check `isClosed` after awaiting the role;
`WorkerBffTransport.fetch` checked `isClosed` before an await, so a request encoded across a
`close()` still reached and was EXECUTED by the worker; `becomeLeader()` was not failure-safe, so a
CSP-refused `createWorker()` left every caller parked forever with no timer to save them; and an
undecodable envelope on the channel left a follower's promise unsettled - version skew is the
realistic trigger, since two builds share one channel and lock by design.

- The page-side fetch bridge moved out of `examples/browser-bff` into `@venizia/ignis-worker` as
  `installBffFetch({ transport, basePath })`. It takes any `IBffTransport` (so an in-process one
  works in a test), accepts several prefixes, returns an uninstall function that restores the
  previous `fetch` only if the bridge is still the installed one, refuses a second install rather
  than stacking, and carries the runtime's own `fetch` properties across (Bun hangs `preconnect`
  there). It resolves the request URL WITHOUT constructing a `Request`: measured in Chromium,
  `new Request(original)` flips `original.bodyUsed` to `true` and the next read throws "body stream
  already read" - so the example's version broke the pass-through it was deciding about. Bun does
  NOT disturb it, so the unit tests cannot guard this; the comment records that.

## 2026-08-19 - the framework audit: 52 findings, 18 defects fixed

- 168 agents raised 52 findings, 34 survived three adversarial lenses, 18 distinct defects
  were fixed. The ones that change BEHAVIOUR a consumer can notice:
  - `AxiosFetcher` defaulted `rejectUnauthorized` to **false**, so every HTTPS request the framework
    made accepted any certificate. It is `true` now, the agent is built once per instance
    (keep-alive, no handshake per call), a caller-supplied `httpsAgent` is no longer overwritten by
    the `...rest` spread, and `rejectUnauthorized` is a declared option instead of reaching the agent
    through an index signature. BANA uses this fetcher at 12 sites - VNPay, T-VAN, iiapi - and had
    never set the flag, so any partner endpoint with a bad chain now fails loudly.
  - `RequestSpyMiddleware` tested `env !== 'production'`, which logged full request bodies in
    `staging`, `uat`, `alpha`, `beta`, `prod` and with `NODE_ENV` unset. It now asks
    `EnvironmentNames.DEVELOPMENT_ENVS`, matching `BaseAppErrorMiddleware.isProduction`, which was
    already documented fail-closed. Pinned by `request-spy-environment.test.ts`.
  - `limit` is `int().nonnegative()` on the wire, and `assertLimitWithinCeiling` on
    `AbstractRepository` enforces `@model settings.maxLimit` for the relational tier, which read it
    nowhere. A negative limit removed Drizzle's LIMIT clause entirely and returned the whole table.
    The ceiling is consulted only when a `@repository` model binding exists - reading `maxLimit`
    resolves the entity, and that throws for a repository without one.
  - `shouldSkipDefaultFilter` is off the wire `InclusionSchema`. It stays on the internal
    `TInclusion` type and on repository `options`, which is where BANA's four call sites use it.
  - A malformed `filter`/`where` query string is a 400, not a 500: zod lets a `SyntaxError` escape
    `safeParse`, so the bare `JSON.parse` inside the transform bypassed the controller's validation
    hook entirely.
  - `Authorization.RULES` holds a `Map` keyed by enforcer name, and the resolved domain is a local
    instead of being read back off the context - one spec's domain used to leak into the next.
  - Log redaction now covers `%o`/`%O` and placeholder-less arguments, plus `*Secret`, `*_password`,
    `connection_string` and `dsn` spellings; `NodeFetcher` logs a body SIZE, never the body.
  - Measured performance: redis `mSet` 1921ms -> 1.4ms at 10k keys (spread-in-reduce was O(n^2)),
    TCP disconnect drain 738ms -> 1.1ms at 5000 clients (`omit` rebuilt the whole registry).
- What the audit found CLEAN, so an absent finding reads as checked: SQL injection in the query
  builders, authentication bypass, error-response leakage on the middleware path, transaction
  correctness, crypto misuse, and worker envelope integrity.

- The audit fixes are PINNED now, and each pin was proved by running it against the exact pre-fix
  file from HEAD - not by reasoning about it. Two lessons from doing that:
  - **A hand-rolled partial revert proves nothing.** Reverting only the `domain: domainScope` read
    left the test passing, because the same fix ALSO made `context.set(Authorization.DOMAIN, ...)`
    unconditional - which overwrites the previous spec's domain with `undefined` and neutralises the
    leak on its own. Only `git show HEAD:<file>` reproduced the real defect. Use it.
  - `assertLimitWithinCeiling` guarded the top-level `limit` only, so `include[].scope.limit: -1`
    still dropped Drizzle's LIMIT clause one level down - the same defect the fix set out to close.
    `assertFilterLimits` now walks the whole filter. A relation's limit gets the SHAPE check only:
    the ceiling belongs to the relation's own model, which the parent repository cannot resolve.
  - New pins: `request-state-isolation.test.ts` (rules keyed per enforcer, domain not inherited
    across specs, one `configure()` under 40 concurrent first requests, a failed warmup retried) and
    `redaction-coverage.test.ts` (`%o`/`%O`/no-placeholder redaction, the nine key spellings that
    used to leak, the depth bound). 13 of the 18 redaction tests fail against pre-fix HEAD.

## 2026-08-19 - the worker package is renamed, and browser-bff becomes a react-admin app

- The published package is `@venizia/ignis-worker`; the directory stays `packages/core-worker`, so
  `make core-worker` and the release workflow's `core-worker` choice are unchanged. The old name
  `@venizia/ignis-core-worker` is GONE from npm - `npm view` answers 404, so it was unpublished
  rather than deprecated. Nothing in IGNIS or BANA imported it; only `examples/browser-bff` did.
- `examples/browser-bff` is now a react-admin application on `@minimaltech/ra-core-infra`, not a
  hand-rolled page. The integration is one file: `src/bff-fetch.ts` replaces the global `fetch` so
  `/api/*` is answered by the Worker. `DefaultRestDataProvider` reaches the network through
  `NodeFetchNetworkRequest`, which calls the global `fetch` and takes no custom fetcher, so
  intercepting `fetch` is the only seam that does not fork the provider. Verified in Chrome: list,
  create, reload-persistence and delete all round-trip through the Worker.
- Two traps found while wiring `ra-core-infra`, both measured. `noAuthPaths` is matched by EXACT
  resource name (`['notes']`), never a pattern - `['*']` is a literal and every request then demands
  a token the Worker never issues. And `CoreRaApplication` resolves the data, auth AND i18n providers
  with a non-optional `container.get`, so an unbound key throws before the first render.
- `@minimaltech/ra-core-infra@0.0.3-17` declares peers `@venizia/ignis-inversion: ^0.1.1-6` and
  `@venizia/ignis-filter: ^0.1.2-0`, neither of which covers 0.2.0-0. The four symbols it actually
  uses - `Container`, `IProvider`, `TFilter`, `TWhere` - all still exist, so this is a stale range
  and not a break. It also calls `crypto.randomUUID()` unguarded for its request-tracing header,
  which is the same secure-context trap IGNIS just removed from `RequestIdGenerator`.

## 2026-08-19 - RequestIdGenerator mints a UUID v4 again

- `RequestIdGenerator` mints a UUID v4 again, not a base62 Snowflake. Snowflake cost 609 ns/op,
  against 51 ns/op for `crypto.randomUUID()` - the intuition that "UUID calls crypto so it must be
  slower" is backwards, because 72% of the Snowflake cost is the BigInt base62 encode loop, while
  drawing 8 random bytes takes 19 ns. The secure-context problem that motivated Snowflake is real but
  is solved without it: the strategy resolves once in the constructor, falling back to an RFC 9562 v4
  assembled from `crypto.getRandomValues()`, which no browser gates. Verified in Chrome on a
  plain-http LAN origin (`isSecureContext: false`, `randomUUID: undefined`): 10,000 ids, all valid
  v4, none duplicated. `SnowflakeUidHelper` itself is UNTOUCHED - BANA mints business ids with it at
  23 sites.

## 2026-08-18 - OpaqueUidHelper, the short-id counterpart to Snowflake

`packages/helpers/src/modules/uid/opaque.ts`. No time ordering; a chosen length, `prefix` and
`delimiter` as `{ enable, value }` toggles, and an alphabet from `UidAlphabets`. Default is 6
Crockford characters, uppercase.

Named for the PROPERTY, not the mechanism - `RandomUidHelper` was the first name and it described
the implementation. A Snowflake id is transparent: `parseId()` returns the exact millisecond it was
minted and the worker that minted it. An opaque id returns nothing. That is the axis a caller
chooses on, and the reason both classes exist.

`enable` rather than "empty string means off", deliberately: a toggle keeps `value` while switched
off, so a configured delimiter can be flipped back on without retyping it, and an accidentally-empty
prefix is a reportable bug instead of a silent no-op.

Two facts worth not re-deriving:

- **A two-case alphabet cannot be case-folded, and the helper refuses to try.** Uppercasing `BASE58`
  produces 35 characters, not the 33 an entropy calculation predicts, because every lowercase letter
  folds onto the uppercase set and drags `I` and `O` back in - the exact pair `BASE58` drops so `1`
  and `0` stay unambiguous. Lowercasing brings back `l`. Found by the test asserting 33, which was
  the wrong number. Single-case alphabets fold cleanly; that is what `CROCKFORD` is for.
- **`crypto.getRandomValues` is NOT secure-context-only.** Only `crypto.randomUUID` is - the
  restriction that forced `RequestIdGenerator` into existence. So this helper works on a plain-http
  origin and inside a browser Worker, and stays on the browser-pure `/core` surface.

The default length of 6 is 2^30, chosen against airline record locators. It holds for the same three
reasons theirs do - scoped per carrier, recycled after the trip, regenerated on conflict - not
because 2^30 is large. Measured: ~4,600 ids for a 1% collision chance in one space, ~38,000 for 50%.
Both the doc comment and the wiki say so, because a caller reading only the default would not guess.

## 2026-08-18 - the error middleware's host reads become options, and one finding refused

**`BaseAppErrorMiddleware` takes `environment` and `formatError` as constructor options.** They were
`protected` hooks, and three subclasses existed to answer them and nothing else. One option now
carries what two hooks did: its PRESENCE claims the host has an ambient environment at all, and a
present function returning `undefined` means a host that should have one is misconfigured.

A class seam is unreachable from application code, which is why `examples/browser-bff` faked the
environment with a Hono middleware assigning `context.env`. It sets `config.error.environment` now,
and its `TBffEnv` binding type is gone. `AppErrorMiddleware` in `@venizia/ignis` survives as a name
that supplies the two server options - it overrides nothing. Verified in Chrome.

**The injected-host-object half of the seam review is REFUSED, with the measurement.** It proposed
replacing `AbstractApplication`'s remaining virtuals with an injected `IApplicationHost`. BANA
overrides `getProjectRoot()` in **10+ applications** (`commerce`, `search`, `licensing`, `taxation`,
`finance`, `ledger`, `helpdesk`, `inventory`, `pricing`, and a migration bootstrap) - it is
application API, not an accident. Its substance was the `host`/`port` duplication and the port
validity logic re-implemented in core, and both went with the socket split in the entry above; what
is left is one legitimate override plus `getDefaultAsyncContextEnabled`.

## 2026-08-18 - four duplications closed, and the packaging gap under two of them

**The migration runner left the example.** `RelationalMigrationRunner`
(`connectors/src/relational/core/migrations/`) owns what the browser example used to: the DDL and
its ledger row commit in ONE transaction, so an interrupted first visit cannot leave a created table
with an empty ledger and no way back except clearing OPFS by hand. Engine-neutral, over a driver
connection.

Two things it does that the example's version did not: it splits on `drizzle-kit`'s
`--> statement-breakpoint` (PGlite's `query` and postgres-js both reject a multi-statement string,
where PGlite's `exec` accepted one), and it REFUSES a migration name outside `[A-Za-z0-9._-]` rather
than escaping it - placeholder syntax is not portable, so the name is embedded as a literal and
proven safe first. `IRelationalConnection` gained `query()` for the ledger read; all four drivers
implement it in one line.

Proven in Chrome against a PRE-EXISTING OPFS database: 3 notes from 2026-08-14 read back, no
re-migration, a write accepted. The example passes `ledgerTable: 'ignis_browser_migrations'` on
purpose - the runner's default would have read as an empty ledger and re-run `CREATE TABLE`.

**One `initialize()`.** `RestApplication.initialize()` now states the artifact ordering
(staticConfigure → preConfigure → datasources → components → controllers → postConfigure) once, and
`examples/browser-bff` deleted its copy. `BaseApplication` remains the one deliberate override, for
phases only a server has.

NOT done, and deliberately: the same finding asked for no-op defaults on the four lifecycle hooks.
That turns them concrete, and `noImplicitOverride` then demands `override` at every implementation -
**7 sites in BANA, including its shared `packages/core/src/application/base.ts`**. It is a real
breaking change, not a cleanup; left for an explicit decision.

**One audit-user resolver.** `resolveAuditUserId` in `relational/core/models/enrichers/` replaces
the byte-identical `getCurrentUserId` that the postgres and sqlite enrichers each carried - the
security-adjacent path was being reviewed twice. Each dialect keeps only its column builders.

**Every browser-claiming package now dual-builds.** kernel, core-worker, connectors and helpers ship
`dist/cjs` + `dist/esm` with `import`/`require` conditions, joining inversion and filter.
`assertBrowserImportCondition` makes the claim enforce it. `examples/browser-bff` deleted both of its
bundler workarounds, and its page chunk fell **682 KB -> 54 KB**.

Four things this surfaced, each of which would have shipped silently:

- `"sideEffects": false` let Rolldown drop `import 'reflect-metadata'` from the entry, so every
  decorator died with `Reflect.defineMetadata is not a function` - in the PRODUCTION build only.
  The packages that import it now list their entry files.
- The ESM build needs `tsc-alias` `resolveFullPaths`: `bun build` cannot resolve an extensionless
  FILE import, though a directory with an `index.js` resolves either way.
- TypeScript maps a `.d.ts` under `outDir` back to its source, so `tsconfig.json`'s `outDir` had to
  move to `dist/cjs` alongside the build config - otherwise helpers' self-referencing augmentation
  test stopped resolving.
- `bun build`'s METAFILE marks `export { name } from './x.js'` as external while inlining it,
  which the purity probe read as a leak. Relative specifiers are now skipped, with the measurement
  in the comment.

`connectors/sqlite/libsql [import]` is browser-pure where `[require]` is not: the gate got more
truthful, not just wider. 42 rows now, 8 red, all pinned in CI per condition.

## 2026-08-18 - the release pipeline, and a purity gate that could never pass

- `scripts/purity/manifest.ts` now DERIVES its rows from each package's `package.json` `exports` map
  instead of listing them by hand. 11 rows became 24, and `make purity` turned red on six connectors
  entries it had never probed: `postgres` and `sqlite` reach `node:async_hooks` through the
  user-audit enricher's static `hono/context-storage` import (a defect), while `node-postgres`,
  `postgres-js`, `libsql` and `typesense` pull their own engine client's node builtins (server-only
  by construction). `helpers` is the one partial claim - its root barrel is server-side by design.
  `cli.ts` now exits non-zero when a `package` filter matches no row, so a renamed directory can no
  longer turn a release gate into a silent pass. The pglite row's `external` narrowed from three
  specifiers to `@electric-sql/pglite` alone; `drizzle-orm` is a required peer and measures clean.
- `probe.test.ts`'s prefixed-builtin case asserted only that `buildError` contained `'fs'`, which
  `unresolved external import(s): node:fs` also satisfies - measured, breaking `isBuiltinSpecifier`
  left the file at 11 pass / 0 fail. It asserts `result.builtins` now.
- `packages/{inversion,filter,boot}/scripts/rebuild.sh` type-check `tsconfig.esm.json` as well as
  `tsconfig.json` before cleaning. `build.sh` emits both programs and the ESM config swaps
  module/moduleResolution, so guarding one left `dist/` holding `cjs/` and no `esm/`. Reproduced on
  filter, then closed.
- `ServerApplication.getEnvServerPort()` walks `PORT` then `APP_ENV_SERVER_PORT` on VALIDITY, not
  truthiness. `.find(Boolean)` let an unusable `PORT` shadow a usable `APP_ENV_SERVER_PORT`:
  `PORT=abc APP_ENV_SERVER_PORT=8080` bound 3000, and so did Docker's legacy-link
  `PORT=tcp://172.17.0.5:8080`.
- `PGliteDriver.end()` clears the exit status PGlite plants on the host process. Measured on 0.5.5:
  `process.exitCode` is `undefined` before the first PGlite query and 99 after it, ONCE per process
  at the first WASM instantiation - a later instance never re-plants it. `packages/connectors`'s
  suite printed `1141 pass / 0 fail` and exited 99; it exits 0 now. The clearing only fires while the
  value is still exactly 99, so an application's own exit code survives. Also measured: closing a
  PGlite that was never queried writes 0 to the host exit code on its own.
- `no-engine-cycle.test.ts` walks every paradigm family's `core` tier, not just `relational`. The
  tier split had narrowed the discovered adapter set from five directories to two, dropping the whole
  search tier out of the guard.
- The release workflow's rollback resets `develop` only when its remote tip IS that run's own release
  commit, and pushes with `--force-with-lease`. One change is a 4-package chain, so overlapping
  dispatches are normal and the blind `reset --hard HEAD~1` erased a sibling package's release commit
  (reproduced). `IS_PUBLISHED` is now set BEFORE `bun publish`, so a publish that succeeded and lost
  its response is reported instead of silently rolled back. The unreachable `IS_MERGED` branch, which
  nothing ever set and which force-reset `main` the same blind way, was removed.

- `make purity-connectors` could never exit 0, so a connectors release died at the purity gate. The
  known-impure engine clients were allowed only by a hand-kept list inside `.github/workflows/ci.yml`,
  which the release workflow never reads. The list now lives in `scripts/purity/manifest.ts` as an
  `impure` waiver on the claim, checked in both directions: a waived row that comes back pure fails
  as `STALE WAIVER`, and deriving still owns the row set. `ci.yml`'s duplicate step is gone.
- `postgres/supabase [import]` is waived for a different reason than the engine clients, and is a
  real defect: under `--target=browser` Bun drops the `export { ... } from 'drizzle-orm/supabase'`
  re-export yet keeps those names in the bundle's export block, so the output exports identifiers it
  never binds. An attempt to treat this as a probe false positive was reverted - the probe's own
  fixture proved the "specifier absent from the output" test also passes a `browser: false` remap,
  which is exactly the leak the gate exists to catch.
- The release workflow runs `force-update` BEFORE `bun install`, not after. Rewriting ranges after
  resolution left node_modules holding a stale registry tarball: kernel built against helpers 0.1.1
  while the workspace carried 0.2.0-0, and failed with 15 x TS2305 on `@venizia/ignis-helpers/core`.
  A new step now asserts every `@venizia/*` dependency resolves to the workspace, never to a tarball.
- `force-update.sh` (all 10 copies) parses `npm view --json` with `jq`, not `grep '"' | tail -1`.
  For an unpublished package npm prints its E404 body on STDOUT, and the old pipe fed that error text
  to `sed` as the version.
- The release workflow publishes BEFORE it commits, pushes or tags, so no failure path force-pushes
  `develop` any more. Both git rollback steps became unreachable and were replaced by two failure
  reports. `CI` is `workflow_dispatch` only - neither a push to `develop` nor a pull request runs it.

- `force-update` runs over the whole workspace (`--filter "@venizia/*"`), not just the package being
  released. `bun install` resolves every workspace member, so one stale internal range anywhere fails
  the run: a core-worker release died on a range belonging to core-server, six minutes after a
  connectors release made it stale. Reproduced locally, error text identical.
- Internal dependencies deliberately stay literal `^x.y.z`, NOT bun's `workspace:` protocol. The
  protocol was measured end to end: it fixes the install side, but `bun pm pack` resolves the
  published floor from the version recorded in `bun.lock`, and bun 1.3.14 refreshes that record
  through no install path (`bun install`, `--force`, `--lockfile-only` all leave it stale; only
  deleting the lock rewrites it, which re-resolves hundreds of third-party packages). A release would
  then publish a floor one version behind with no error anywhere. Do not re-propose it without first
  re-testing that bun refreshes workspace version records.

## 2026-08-17 - the kernel stops pretending it has a socket

Three altitude findings, done together because they are one thing seen from three sides: server
assumptions left behind in the browser-pure layer.

**One default middleware stack.** `requestId()`, the framework error handler and `notFoundHandler`
were installed from two independent code paths - `WorkerApplication` and `BaseApplication` - and a
test hand-copied the list a third time to compare them. They now come from
`RestApplication.registerDefaultMiddlewares()`. `WorkerApplication` overrides nothing;
`BaseApplication` calls `super()` and adds `contextStorage`, `RequestTrackerComponent` and the
favicon. `buildErrorMiddleware()` is the seam core overrides for the `ErrorPrettier` formatter.

`RequestTrackerComponent` no longer installs `requestId()` - the application already did.

**One request-id rule, for both ends.** `BffRequestIdGenerator` became `RequestIdGenerator` in
`@venizia/ignis-helpers/core`, beside `SnowflakeUidHelper`. It was never a BFF rule: the server half
still took hono's `crypto.randomUUID` default, so the two ends of one request stamped different
formats. `packages/core-worker/src/common/` is gone with it.

**`host`, `port`, the runtime union and start/stop left the kernel.** `RestApplication.server` is
`{ hono }` alone. `IApplicationConfigs` in the kernel declares no address, and `ServerApplication`'s
own constructor resolves one - the kernel used to write `localhost:3000` into every Worker
application's config. Kernel `IApplication` narrowed to what every host implements; the rest is
`@venizia/ignis`'s new `IServerApplication`. `getEnvServerHost`/`getEnvServerPort` are gone as seams.

Two things that would have broken silently, both now pinned by a test:

- `@venizia/ignis` must keep exporting `IApplicationConfigs` WITH `host`/`port` - nx-seller writes
  both. It does, via an explicit `export type { IServerApplicationConfigs as IApplicationConfigs }`
  in `src/index.ts`. It has to be explicit and in the entry module: a name reachable through two
  `export *` lines is ambiguous and TypeScript then exports NEITHER, with no error.
  `config-shape.test.ts` asserts the widening at COMPILE time, with an `IsAny` guard so it cannot
  pass vacuously - verified red with the line removed.
- `hono/request-id`'s `ContextVariableMap` augmentation only applies where that module is in the
  program. Once the middleware moved into the kernel, no consumer imported it and
  `context.get(REQUEST_ID_KEY)` silently lost its type. `middlewares/common/constants.ts` restates
  the augmentation so it reaches every consumer.

## 2026-08-17 - two measured hot paths, and one that measured as not worth fixing

**Boot no longer re-scans the binding map per item.** `RestApplication.registerDynamicBindings`,
`RestComponent.binding` and `GrpcComponent` each fetched a tagged binding list, took ONE entry, then
re-scanned the whole map - N+1 full scans. They drain the batch and re-scan once after it, which is
all the re-scan was ever for (picking up bindings a `configure()` added). Measured on a synthetic
container: 200 controllers / 1002 bindings, **3.50 ms -> 0.043 ms**.

The batch introduces one hazard the per-item re-scan hid: a binding configured by a SIBLING inside
the same batch would run twice. Guarded with a `configured.has(key)` check per item, and pinned by
`dynamic-bindings.test.ts` - proven red with the guard removed.

**`toInclude` asks the registry once per relation, not three times.** `resolveHiddenProperties`,
`resolveDefaultFilter` and `resolveDefaultLimit` each ran `getTableName` + `getModelEntry` on the
same schema. They now accept an optional already-resolved `modelEntry`, and `toInclude` resolves it
once. `build()` **1205 -> 942 ns** with one include.

A per-schema `WeakMap` memo was tried FIRST and reverted: it made 40 core-server tests fail across
suites, because a model entry cached under one test's registry mock leaked into every later one.
That is not test-only fragility - it is the same staleness a re-registered model (HMR in the browser
BFF) would hit. Do not re-introduce it.

**The error-path log gate was measured and rejected.** A review found `formatError` is rendered
eagerly as an argument to `logger.log()` - 46.58 µs, 98.6% of the error path - and proposed gating on
the resolved level. Gating needs an `isLevelEnabled` on `ILogger`, and the win is zero here: the
level only falls below the floor when a throw site passes `getError({ logLevel })`, and of the two
framework sites that do, both pass `warn`, which is emitted. BANA has **zero** `logLevel` sites. So
every error logs at `error` and nothing is discarded. Revisit only if an application starts throwing
below its logger floor.

## 2026-08-17 - module-level state moved into classes, and the last cross-package `instanceof`

Two related sweeps. Both leave every published name in place.

**The `redisConnection` check is a brand now.** `SocketIOComponent` and `WebSocketComponent` both
validated their `REDIS_CONNECTION` binding with `instanceof AbstractRedisHelper` - the same hazard
`@repository` already retired, one package boundary further out. `isRedisHelper` reads
`Symbol.for('@venizia/ignis-helpers:abstract-redis-helper')` off the instance instead. The brand is
an INSTANCE field here, not a static: these checks receive a helper, not a class.

**Module-level mutable state now lives in a class.** Eight files kept `let`/`Map`/`WeakMap` at module
scope with exported arrows reading it - state outside any owner:

| Was | Is |
|---|---|
| `getRing`, `ringState` | `HfLogRing.get` |
| `textEncoder`, `scopeCache`, `encodeScope` | private statics of `HfLogger` |
| `textDecoder`, `renderEntry`, `buildDefaultSink` | private statics of `HfLogFlusher` |
| `backingInstance`, `backingTransport` + 7 arrows | `PinoDestination`, `PinoBackingLogger` |
| `droppedRouteDecorators`, `isReported` + 3 arrows | `DroppedRouteDecorators` |
| `hasReportedUnavailable`, `getIncomingIp` | `NetworkUtility` |
| `columnCache`, `getCachedColumns` | `TableColumnCache` |
| 7 envelope codec arrows | `BffEnvelope` |

Where a name was published it stays exported as a one-line delegate to the class - the shape
`getError`/`fromError` already use for `ApplicationError`. Only `core-worker`'s envelope functions
were renamed outright, that package having never shipped. Pure exported functions with no state were
left alone: wrapping them in a class buys nothing.

## 2026-08-15 - duration units and conversion, brought over from BANA

`DurationUnits`, `TDurationUnit`, `IDuration` and `DurationMultipliers` now live in
`packages/helpers/src/common/constants/duration.ts`, on the browser-pure `/common` sub-path. Ported
from BANA's `packages/core/src/models/schemas/common/constants.ts`, keeping `toMilliseconds`'s
`null`-not-throw contract so BANA migrates by changing an import.

Left behind deliberately: `LABELS` (English/Vietnamese display strings - an application's
presentation concern, and it pulls BANA's `INameI18n`) and `NearExpiryThreshold` (business logic).

Added beyond the port: `DurationAliases` (a const class whose UPPER_CASE member names ARE the
accepted spellings), `fromMilliseconds`, `convert`, `parse` and `parseToMilliseconds`.

Two things measured rather than assumed:

- **The lookup is not the cost - normalising the input is.** `Map.get` and object property access are
  both ~1 ns; `trim().toUpperCase()` is ~55 ns. So `resolve` tries the input as given first and
  normalises only on a miss, and the derived table stores each spelling upper and lower.
  `resolve('day')` went 70.8 -> **2.1 ns**; a messy `'  Days '` still pays the ~80 ns it must.
- **Reading the const class directly is 5x slower than a table derived from it**, and would need
  `name`/`length`/`constructor` guarded out. The table is built from the class's own static fields,
  so the two cannot drift, and a test asserts every canonical unit resolves to itself.

`m` is MINUTE and `mo` is MONTH. There is no single-letter month.

## 2026-08-15 - kernel singletons anchored on the realm, and one `instanceof` retired

A review recommended making `@venizia/ignis-kernel` a `peerDependency` of `connectors` and
`core-worker`, to stop a second copy ever being installed. Rejected in favour of making a second copy
**harmless**, which is strictly stronger: a peer prevents the common case at the cost of an explicit
install for every consumer, and still cannot stop hoisting, aliasing or a strict-mode resolver from
producing two copies.

- `SingletonRealm.resolve` (`packages/kernel/src/helpers/singleton-realm.ts`) anchors a value on
  `globalThis` under `Symbol.for('@venizia/ignis-kernel:<key>')`. Five singletons moved onto it:
  `MetadataRegistry`, `AuthenticationStrategyRegistry`, `AuthorizationEnforcerRegistry`,
  `GrantBuilder`, and the `RequestContextRegistry` resolver slot. No bare `private static instance`
  remains in the kernel.
- `@repository`'s first-parameter check no longer uses `instanceof AbstractDataSource`. Two copies
  give two classes and that check is `false` between them, rejecting a valid repository at import.
  It now reads a `Symbol.for` brand via `isDataSourceClass` - the move `isApplicationError` already
  makes for `ApplicationError`.

Proven against two genuinely separate module graphs of the built kernel: class identity `false`, all
four registry instances shared `true`, the request-context resolver crossing copies `true`, the old
`instanceof` check `false` where the new predicate is `true`.

`dependencies` stays. Public surface 227 -> 229; nothing removed.

## 2026-08-15 - packages/core becomes packages/core-server

The DIRECTORY only. The package is still published as `@venizia/ignis` - 227 runtime exports and all
19 sub-paths resolve unchanged, verified from a real consumer after the move.

- 785 path references rewritten across 160 files, 678 of them GitHub source links in `docs/wiki`.
  The rewrite is boundary-aware: `packages/core` NOT followed by a hyphen, because
  `packages/core-worker` shares the prefix and a naive replace would have produced
  `packages/core-server-worker` in 19 places.
- The concept moved with it - `packages/core.md` becomes `packages/core-server.md`. The `okf-check`
  coverage rule keys on the directory name, so leaving it behind would have failed the gate.
- `make core-server`, `lint-core-server`, `update-core-server` and `purity-core-server` are the
  primary targets; `core`, `lint-core` and `update-core` remain as aliases. The short names are in
  muscle memory, in the wiki, and in scripts outside this repository.
- The release workflow input is `core-server`, because `PACKAGE_PATH="packages/$PACKAGE"` addresses
  the directory. All ten inputs were checked against real directories.

Two gates went red immediately after the move and were green on a re-run: `make build-all` and
`make okf-check`. Both were reading a `dist/` left half-written by the rename - the same shape as the
empty-`dist` trap. Re-run before believing a failure that arrives with a directory move.

## 2026-08-15 - the review fixes, and a gate that now tells the truth

- **The published helpers floor was a lie about contents.** Every package pinned
  `@venizia/ignis-helpers: ^0.1.1-17`, the highest version on npm, while this branch added
  `EnvironmentNames`, `executeWithPerformanceMeasure`, `executeWithRetry*` and the parse utilities to
  `helpers/core` without bumping. `npm pack` of the published tarball has none of them, and the
  kernel's `dist` calls four. `bun add @venizia/ignis-kernel` would have died on the first
  `registerComponents()`. helpers is now `0.1.1-18` and the floor is raised in the two packages that
  actually call the new symbols. The release workflow carries the rule: a dependency range is not a
  contract about contents, and the registry-existence check cannot see the difference.
- **`BaseAppErrorMiddleware` logged `extra` unredacted.** It is the only error middleware exported
  from the `@venizia/ignis` root, so `getError({ extra: { apiKey } })` printed the key to a browser
  console while the server path redacted. Now `toJsonSafe`. The BigInt replacer stayed: `toJsonSafe`
  leaves BigInt intact and `JSON.stringify` refuses it, so dropping it would have collapsed the whole
  fragment to `[unrenderable]`. Measured, against the review's claim that the replacement was a
  straight swap.
- **`toJsonSafe` has the same shared-reference defect** the kernel's hand-rolled renderer had - its
  `seen` set is a visited-set, not an ancestor-set, so `{ requested: user, owner: user }` renders the
  second as `[Circular]`. NOT fixed: making it an ancestor-set is correct semantically and can
  explode on a wide DAG, which is a separate decision affecting every `redactSecrets` caller.
- **`hasAmbientEnvironment()` added beside `resolveEnvironment()`.** Only a host that HAS an ambient
  environment can be misconfigured about one, so the Worker no longer logs `INVALID ENV IDENTIFIER`
  at error level on every single error and buries the real one. Both paths still fail closed.
- `packages/core-worker` gained `BffRequestIdGenerator`, a `statusCode` on the error envelope,
  synchronous listener attachment with envelope queueing, an idempotent `listen()`, `stop()`, one
  shared worker-error listener over a pending-request map, and an `InProcessBffTransport` that mirrors
  the real envelope. `examples/browser-bff` dropped its ready handshake, `common/constants.ts` and
  `whenBffReady` - the framework queues now.
- The purity manifest derives its rows from each package's `exports` map. 11 hand-written rows became
  24 derived ones, and `make purity` is deliberately RED on six. See
  [gotchas](/conventions/gotchas.md) for which are defects and which are engine clients.
- **`@venizia/ignis-connectors/postgres` and `/sqlite` are browser-importable.** Both user-audit
  enrichers imported `tryGetContext` from `hono/context-storage`, whose module body constructs an
  `AsyncLocalStorage` - a `TypeError` at import in a Worker. They read `RequestContextRegistry`
  (kernel, `base/request-context/`) now, and core installs the `tryGetContext()` resolver in
  `registerDefaultMiddlewares()`, ungated, so a `contextStorage()` an application registered itself
  stays visible. The registry answers `undefined` for "no request context", which stays distinct from
  "a context with no user" - the enricher raises a different error for each, and `allowAnonymous`
  reads them differently. `make purity` is 4 red, all engine clients. `examples/browser-bff` dropped
  its `hono/context-storage` alias and its shim.

## 2026-08-14 - core-worker, the browser BFF, and two gate blind spots

- New concept `packages/core-worker.md`: an IGNIS application inside a dedicated Worker, answering
  its own REST routes over `postMessage`. `Request`/`Response`/`Headers` all throw `DataCloneError`
  under structured clone, so an envelope crosses instead; an `ApplicationError` crosses as its
  normalised shape and `fromError` rebuilds it.
- New concept `examples/browser-bff.md`: the same model, repository and controller as
  `pglite-quickstart`, unchanged apart from import specifiers, answering from PGlite in OPFS with no
  server. OPFS persistence across a reload was reproduced independently three times.
- New concept `packages/connectors.md` for the package carved out in Wave 3.
- `architecture/error-handling-flow.md` corrected: the middleware logic now lives in the kernel as
  `BaseAppErrorMiddleware`, and `packages/core-server` keeps a thin subclass overriding `resolveEnvironment()`
  and `formatError()`. One controller now renders one error envelope on either host.
- Three gotchas added, each measured rather than reasoned. `types: []` cannot make `process.env` a
  compile error, because `ioredis` and `casbin` carry `/// <reference types="node" />` into any
  consumer's program. `make purity` is silent about published sub-paths with no manifest row, which
  is why `@venizia/ignis-connectors/postgres` reaches `node:async_hooks` while the gate reads 11/11.
  The root `package.json` PGlite pin is load-bearing and must not be relaxed.
- Three files under `connectors/relational/sqlite` imported `LoggerFactory` from the helpers ROOT
  barrel, which pulls `ioredis` and failed the browser build outright on `tls`. Switched to
  `new BaseHelper({ scope }).getLogger()`, the pattern `postgres/drivers/pglite.ts` already used.
  `/sqlite` now builds, and is down to the same single `node:async_hooks` blocker `/postgres` has.
  Removing the last root-barrel import broke the `IErrorKeyRegistry` augmentation in
  `search/core/common/errors.ts`, which had been silently anchored by it - an empty
  `import type {}` now puts the barrel in the program at zero bundle cost.

## 2026-08-13 - kernel release plumbing and a sharper purity gate

- `drizzle-orm` and `jose` joined `casbin` as optional peers of `@venizia/ignis-kernel`: both are
  reached by `import type` only, so a non-optional declaration forced a browser consumer under strict
  peers to install a SQL ORM and a JOSE stack for four type aliases. Recorded in `packages/kernel.md`.
- The purity probe now grades node-global reads by whether they can throw. `globalThis.process.X` and
  `require(`/`Bun.` member access are fatal; `globalThis.process?.X` is reported as `guarded` and
  stays green. Bare `process?.X` is reported only - the probe matches bundled text and cannot see
  that hono destructures `const { process } = globalThis` first. Recorded in `packages/kernel.md`.
- `make purity-test` added: the probe's own regression tests live outside every package, so
  `cd packages/<x> && bun test` never discovered them and nothing ran the gate that guards CI.
- `TBunServerInstance` moved from the kernel to `ServerApplication` in core. `ReturnType<typeof
  Bun.serve>` survived into the kernel's published `.d.ts`, where it resolves only through
  `@types/bun` - a devDependency - so a browser consumer typechecking with `skipLibCheck: false` got
  `Cannot find name 'Bun'`. `@venizia/ignis` exports the same type unchanged.

## 2026-08-13 - full sync: the kernel package, and the framework split across a browser boundary

Full-mode sync over `a7e57a1..HEAD` plus the working tree - 5 area verifiers, 6 directory
spot-auditors and 2 critics produced 146 findings against 341 claims confirmed still true, applied
across 47 concept files. The scan had to read the working tree rather than the commit range: the
largest change, `packages/kernel` itself, was still staged when this ran.

**A new package, and a new axis the bundle did not have.** `@venizia/ignis-kernel` now holds the
browser-pure half of the framework - the DI container, the application lifecycle, the REST controller
layer, the repository and datasource abstractions, and the authentication and authorization seams -
about 128 files. It sits *beside* `boot`, not after it (`dev-configs -> inversion -> {filter,
helpers} -> {boot, kernel} -> core`), which is what keeps boot's node-only glob discovery out of the
kernel graph. `packages/core-server/src/index.ts` re-exports the kernel wholesale, so `@venizia/ignis` keeps
its published name and its whole public surface and no consumer import changed. New concept:
[kernel](/packages/kernel.md).

**The application base is four layers across two packages, not one class.** `AbstractApplication`
(kernel: config, hooks, `init()`, no router, no server) -> `RestApplication` (kernel: builds the two
`OpenAPIHono` instances, `getServer()`, `getRootRouter()`) -> `ServerApplication` (core: the only
layer that touches a socket - `start`/`stop`, `startBunModule`/`startNodeModule`) ->
`BaseApplication` (core: the configuration sequence, secrets, boot). Every concept describing one
monolithic `AbstractApplication` that built a Hono server in its constructor was wrong. Two related
corrections: `asyncContext.enable` no longer hard-defaults to `true` - it resolves through an
overridable `getDefaultAsyncContextEnabled()`, `false` on the kernel layers and `true` on
`ServerApplication`; and that hook, like `getEnvServerHost`/`getEnvServerPort`, is called from the
`AbstractApplication` constructor, so an override must return a pure literal or read only
module-level state. The `initialize()` sequence also gained the two secrets steps it had always run
but never documented.

**`@repository` no longer drags Drizzle into every graph that uses it.** `RepositoryMetadataMixin`
resolves relations through `RelationBuilderRegistry`, and the relational connector installs the
concrete `createRelations` from the module body of `connectors/relational/datasources/base.ts` - not
from `relation.ts`, because under `sideEffects: false` a module reached only through an unused
re-export is dropped. Guarded by `relation-builder-wiring.test.ts`, which fails if the install is
ever lost.

**The empty-`dist` trap is closed.** `rebuild.sh` now type-checks before `bun run clean`, so a broken
test fails loudly with the last good `dist/` intact instead of deleting it first.
`packages/dev-configs/scripts/rebuild.sh` is the one exception - it has no type-check gate to fail.
The diagnostic habit stays worth keeping for fresh clones. Replaced the old gotcha rather than
deleting it.

**A gate the type-checker cannot see.** `make purity` bundles each entry claimed browser-pure for
`target: browser` and fails on node builtins or node globals; the kernel is in that manifest. It
cannot be a text scan: measured on Bun 1.3.14, `bun build --target=browser` silently stubs an
unpolyfillable builtin to an empty object, exits 0, leaves no `node:` string in the output, and
inlines `process.env.NODE_ENV` at compile time. The gate therefore reads the `--metafile` module
graph, passes `--env=disable`, and matches against `node:module`'s own `builtinModules` rather than a
`node:` prefix. New gotcha recorded.

Gates: `make okf-check` OK (64 files, 62 concepts), structural coverage 18/18.

## 2026-08-12 - `%j` log arguments are projected before `JSON.stringify` sees them

A log argument bound to `%j` used to reach `JSON.stringify` raw, which answers `[Circular]` for the
WHOLE argument when a single cycle sits anywhere inside it. One live transaction handle in a payload
therefore erased every other field - the reported symptom was pages of `Args: [Circular]`. The `%j`
path now runs `toJsonSafe` (new export in `common/redact.ts`), so cycles collapse per branch, secret
keys are masked as they already were under `%s`, and the walk is capped at
`APP_ENV_LOGGER_INSPECT_DEPTH`. The shared traversal also stopped flattening `Date` to `{}`. Still
open by design: `%o`/`%O` and no-placeholder arguments are not redacted. Updated
`packages/helpers`.

## 2026-08-06 - AES on PBKDF2, keyring rotation, and a cipher seam

PR #32 replaced the pad-or-truncate key derivation with PBKDF2-SHA256 (100k iterations) and gave the
ciphertext a version + key-id header, so a keyring can rotate keys without re-encrypting. The
envelope change is BREAKING: data written by an earlier IGNIS no longer decrypts with `AES`, and
`LegacyAES` is the deliberate read path - the formats never cross-decrypt and nothing falls back on
its own. Follow-up landed the seam that makes that opt-out reachable: `IPayloadCipher` plus a
`cipher` option on the bearer-token services, which previously hardcoded `AES` and left an
application no way to keep already-issued tokens valid. Also closed the `resolveDecryptKey`
empty-secret gap and dropped `iv` from the decrypt options, where it was silently ignored. Updated
`packages/helpers`.

## 2026-08-06 - logged errors carry their args, code, frames, and a JSON shape

`ErrorPrettier` modelled `extra` but never `normalized`, so an `ApplicationError` logged its raw
`%{placeholder}` template with the values nowhere on the line - `messageArgs` is a consumed key and
deliberately never reaches `extra`. `IErrorSummary` gained `args` (root only) and `messageCode`, kept
separate from the error's own `code` so a driver's `23505` is never printed as a message code.
`format` gained `maxStackFrames` and a `format` option following `APP_ENV_LOGGER_FORMAT`, with `json`
emitting one line. `AppErrorMiddleware` now gives an intentional error 5 frames instead of none.
Design at `docs/superpowers/specs/2026-08-06-error-log-rendering-design.md`. Updated
`architecture/error-handling-flow`.

## 2026-08-02 - release-readiness audit and migration guide

Measured rather than assumed, by building both f1eb610 (the merge-base with develop) and HEAD and
diffing them. A probe importing all 774 base symbols through their old sub-paths typechecked against
the new `.d.ts`: 764 resolve, exactly 10 break, and they are the 10 the 2026-08-01 changelog already
listed - no gap in either direction. 626 of 634 shared declarations are byte-identical; the 8 that
differ changed only their heritage clause, and resolving the member sets of the six renamed classes
showed no public member lost.

Two documentation gaps found and closed. `getQueryInterface` and `_updateBuilder` are `protected`
and were removed from the repository tier with no changelog entry - they are part of the contract a
subclass inherits. And the sqlite-quickstart concept named `DefaultCRUDRepository` where the SQLite
tier spells it `DefaultSqliteRepository`.

The 2026-08-01 changelog now carries a project-agnostic migration guide: detection grep, a
word-boundary codemod, the hand edits, and the verification step. Every command in it was run
against a fixture project - before the codemod 5 errors, after it 0. The `\b` anchors are
load-bearing: without them `FilterBuilder` rewrites the inside of `PostgresFilterBuilder`.

## 2026-08-02 - quickstart examples use real migrations

Both quickstarts applied a hand-written DDL string at boot, justified in a comment by "an embedded
database has no server for a migration CLI to reach". That is false: drizzle-kit supports
`driver: pglite` and a sqlite file url, and both `drizzle-orm/pglite/migrator` and
`drizzle-orm/libsql/migrator` export `migrate`. Generating the migration also proved the DDL had
already drifted - the Postgres one declared `id uuid default gen_random_uuid()` where the model
emits `text` with an application-side `$defaultFn`.

They now carry generated migrations under `migration/`, applied in-process by `migrate()`. The
real constraint is narrower and PGlite-only: it holds an exclusive lock on its data directory, so
`drizzle-kit migrate` cannot reach a database the app has opened.

drizzle-kit reads `src/models/note.model.ts` directly - esbuild erases the `@model` decorator and
the framework import before the table export is evaluated. The compiled `migration-schema.js`
re-export `vert` carries is needed only for entities whose table lives on a `.schema` static.

## 2026-08-02 - PGlite and SQLite quickstart examples

Two runnable examples, one per new engine, with concepts in `examples/`. They exist to show the
difference between the two integrations: PGlite is a driver swap under the Postgres connector, so
only the datasource file knows about it, while SQLite is a second connector sharing the neutral
relational tier. Both were run, not just type-checked, which is what surfaced four traps now
documented in their concepts: the raw-client fourth type parameter, `init()` before `start()`, the
`@inject`ed constructor a CRUD controller subclass must declare, and `ISO_TIMESTAMP_NOW` needing
`sql.raw()` unless `generateTzColumnDefs` applies it.

## 2026-08-02 - relational model enrichers stop dropping data

The SQLite tz enricher gated `modified` and `deleted` on truthiness while `TTzEnricherOptions`
declares `enable?: true`, so `{ modified: { columnName: 'modified_at' } }` type-checked as producing
`modifiedAt` and emitted nothing. Omitting `enable` now means enabled on both the type and the
runtime; only `enable: false` drops a column.

Both data-type enrichers gated each `default()` on truthiness, so `0`, `''` and `false` produced a
column with no default and inserts wrote NULL. They test for presence now.

The SQLite `isoTimestamp` read a zone-less driver value - what SQLite's own `CURRENT_TIMESTAMP`
writes - through `new Date()`, which parses it as host-local and shifted every such row by the host
offset. Zone-less values are read as UTC, which is what SQLite defines them to be.

## 2026-08-02 - SQLite driver and rotation safety fixes

`LibSqlDriver` built its 1-slot pool with no `acquireTimeoutMs` and no way to set one, so a
transaction leaked between `BEGIN` and commit left every later `acquire()` in the process awaiting a
promise that never settled. It now takes `TLibSqlDriverOptions` and defaults to 30s, matching
`PGliteDriver`; an app raises it by constructing the driver itself and calling `useDriver()`, since
the framework's own wiring passes only `{ client }`.

`SqliteBeginModes.isValid` existed with zero call sites while `beginMode` was interpolated raw into a
statement the driver runs verbatim - now wired, and `beginTransaction()` resolves the mode once
instead of twice.

`onSecretRotated()` drained clients with `typeof client.end === 'function'`; neither PGlite nor libsql
has `end()`, so all three drain sites silently skipped and repeated rotations accumulated live WASM
instances and open file handles. Replaced by `drainClient()`, which probes `end()` then `close()` -
capability, not class, so the neutral tier still names no engine.

## 2026-08-02 - PGlite and SQLite documented for humans

The wiki gained two guides, `guides/core-concepts/persistent/pglite.md` and `sqlite.md`, plus the
changelog `changelogs/2026-08-02-sqlite-and-pglite-connectors.md`. Both connectors had shipped with
no human-facing page at all. `postgres-drivers.md` said two drivers ship; it says three now, and the
persistent-layer overview and DataSources guide no longer describe Postgres and Typesense as the only
connectors. Every sample on the new pages was type-checked against `dist` before it was written.

Two facts corrected against the source while writing: the conformance suite is **23 tests per
engine** (46 across both), not the 21 it had when the divergence pins landed; and `migrate()` from
`drizzle-orm/pglite/migrator` will not take `getConnector()` - that returns the generic
`TRelationalConnector`, while the migrator demands drizzle's narrower `PgliteDatabase`, so the pages
build a `drizzle({ client })` over the same client instead.

## 2026-08-02 - engine-neutral guards generalised; two divergences pinned; update skeleton lifted

The `dist` cycle guard named Postgres, so a `relational -> sqlite` edge would have passed silently;
it now discovers the adapter set by listing the siblings of `dist/connectors/relational`, and is
renamed `no-engine-cycle.test.ts`. `IConformanceCapabilities` gained `caseInsensitiveLike` and
`nullsSortHigh`: unlike the three refusals, these are divergences where identical caller code
succeeds on both engines and answers differently, so each engine pins its own answer. SQLite's
`LIKE` folds ASCII case (`like` widens, `nlike` drops rows) and its NULLs sort low, both inverting
against Postgres. `RelationalUpdateBuilder` is the new neutral base for the update transform with
one abstract member, `composeJsonSet()`; the split, the column throws, `toUpdateData` and both path
validators stopped being copied per engine. Messages interpolate `this.scope`, so the pinned
`[UpdateBuilder]` / `[SqliteUpdateBuilder]` prefixes still name the builder that ran.

## 2026-08-02 - FilterBuilder no longer defaults to Postgres JSON SQL

`buildJsonWhereCondition` and `buildJsonOrderBy` are `protected abstract` on the neutral
`FilterBuilder`; their `#>>`/`#>` and `::numeric` bodies moved into `PostgresFilterBuilder`. The
neutral base emitted Postgres syntax by default, so the next engine that forgot to override got it
silently, with no compile error. The `not` branch of `buildJsonOperatorConditions` now asks
`jsonNeedsNumericCast` instead of testing `typeof operand === 'number'`, so an engine that
neutralises the cast is no longer cast through that branch, and the bare-operand mapping it shares
with the where branch is the new `toBareJsonOperators`. `validateJsonColumnType`'s message says
`is not a JSON column` rather than naming JSONB, which is meaningless off Postgres.

## 2026-08-02 - PGlite slot wait is now bounded

`PGliteDriver`'s 1-slot pool had no `acquireTimeoutMs` and no way to set one, so a transaction leaked
between `BEGIN` and commit hung every later `acquire()` in the process forever and silently. The
constructor now forwards the pool's control knobs with `size` pinned at 1 and `acquireTimeoutMs`
defaulting to 30s, and the class docblock states the other one-session hazard plainly: a
`createConnector()` write lands inside any open transaction and is lost on its `ROLLBACK`.

## 2026-08-02 - SQLite connector assembled; one conformance suite now runs on two engines

New concept: [SQLite connector](/architecture/sqlite-connector.md). `connectors/sqlite/datasources`
completes the branch - `AbstractSqliteDataSource` supplies the two memoized ports,
`BaseSqliteDataSource` supplies `BEGIN IMMEDIATE` (deferred deadlocks on `SQLITE_BUSY` when it
upgrades), attaches `beginMode`, and throws NotSupported on `isolationLevel`. Five repository
subclasses bind `ISqliteExtraOptions` + `ISqliteDataSource`. Sub-paths `./sqlite` and
`./sqlite/libsql` ship; `connectors/index.ts` still exports `./postgres` only.

`__tests__/connectors/relational/conformance/` is one repository suite run against PGlite and libsql
`:memory:` - 21 tests per engine, real databases, no mocks. Capability gaps assert the NotSupported
throw instead of skipping. It found a live defect on first run:
`PostgresQueryExecutor.readAffectedRowCount` did not know PGlite's `affectedRows`, so every Postgres
write with `shouldReturn: false` threw against PGlite. Fixed, and the relational-connector concept's
executor section now lists all four spellings.

`DataSourceDrivers` gains `LIBSQL` - it was already six drivers in source and five in the constant.

## 2026-08-02 - SQLite query dialect added; `FilterBuilder` seam widened to eight members

`SqliteQueryDialect` completes `IRelationalQueryDialect` on the neutral tier: `SqliteQueryOperators`
throws NotSupported for `regexp`/`iregexp` (no such SQLite function) and the array operators (no
array storage class), and maps `ilike` onto `LIKE`, which SQLite already folds for ASCII.
`SqliteFilterBuilder` overrides four members and inherits the rest - `json_extract` needs no numeric
cast because it returns the JSON value in its own type. `SqliteUpdateBuilder` chains `json_set`.

`isOperatorObject()` and `buildValueCondition()` on the neutral `FilterBuilder` went `private` ->
`protected`: an engine overriding `buildJsonWhereCondition` cannot reach the bare-value branch
without them, and the seam table in the relational-connector concept now lists both as call-only.

## 2026-08-02 - SQLite executor and libsql driver added

`SqliteQueryExecutor` implements the seven neutral executor verbs on Drizzle's SQLite core, throwing
NotSupported for `lock` - SQLite locks the database file, never a row. `LibSqlDriver` is the SQLite
driver: libsql is the only client that is async, covers memory/file/Turso/replica, and runs on Node
and Bun. `acquire()` borrows from a 1-slot pool over the single client because Drizzle binds to a
libsql `Client` and never to its interactive `Transaction`, and it refuses a remote client, whose
statements each get their own connection. `@libsql/client` is an optional peer. No sub-path export
or barrel entry yet.

## 2026-08-02 - SQLite models tier added

`connectors/sqlite/models` is the first slice of a second SQL dialect on the engine-neutral
relational tier: `SQLiteTable`-branded schema types, `BaseSqliteEntity`, and the five enrichers.
The types are declared, not re-exported from the neutral tier, so this barrel's `TTableObject`
stays intersectable with its own schema bound. No dialect, executor, driver or datasource yet, and
no package.json entry - the tier is not reachable from any barrel.

## 2026-08-02 - PGlite driver added

`PGliteDriver` ships at `@venizia/ignis/postgres/pglite`, giving an honest test database and
single-file embedded deployments on the unchanged Postgres dialect. PGlite has one session and a
second `BEGIN` silently joins the open transaction, so `acquire()` serialises through a 1-slot pool.
`DataSourceDrivers` and `datasource-hierarchy.md` now name five shipped drivers, not four.

## 2026-08-02 - search findById now carries its filter; the family's signature divergences listed

`ReadableSearchRepository.findById` declared no `filter`, so a caller typed at `ICrudRepository` -
including the generated CRUD controller - lost `fields` silently. Parameter bivariance hid it from
`tsc`. The signature now matches the base and `search-typesense.md` gained a table of the
divergences that are deliberate, so the next audit can tell the two apart.

## 2026-08-02 - the lift changelog completed: six changes it had omitted

`2026-08-01-relational-connector-lift.md` recorded the lift and the `FilterBuilder` withdrawal only.
Six later changes are now in it, grouped so an upgrading reader sees every breaking one at once.

Three rules a future agent needs, because each one drove a change here and will drive the next:

**The prefix follows the declaration keyword.** `I` for an `interface`, `T` for a `type` alias.
`connectors/postgres/drivers/driver.ts` turned `IRelationalDriver`/`IRelationalConnection` from
interfaces into Postgres narrowings - type aliases over the neutral interfaces - so both became
`TRelationalDriver`/`TRelationalConnection`. Breaking: both were published from `@venizia/ignis` and
`@venizia/ignis/postgres`. Type parameters unchanged, so it is a pure rename for driver authors. The
neutral tier keeps `IRelationalDriver`/`IRelationalConnection` as genuine interfaces, parameterized
by connector rather than schema. `IStatementResult` stayed an interface and stayed put.
`TRelationalTransactionOptions` is the same rule applied to a type that was never published.

**A `protected` member is public API to a subclass.** `AbstractRepository.denyOperation(methodName)`
became `denyOperation({ methodName })` under the options-object convention. `protected` hides it from
`tsc` at the package boundary but not from consumers - every subclass calling it breaks, in both
connector families (`ReadableSearchRepository` overrides call it six times, the relational readable
tier six more). Treat a `protected` signature change as breaking, never as internal.

**The root barrel's `TTableObject`/`TTableInsert` are `PgTable`-branded, so anything composing with
them must be too.** `connectors/postgres/repositories/core/soft-deletable.ts` re-exported the neutral
`Table`-branded `TSoftDeletableTableSchema` for a while. A consumer intersecting the schema and
feeding it to `TTableObject` then hit `TS2344`, which is how it reached a downstream application. The
Postgres tier declares its own binding again. `bun test` cannot see any of this - only
`bun run typecheck` - and `__tests__/connectors/postgres/root-barrel-composability.test.ts` is the
type-level pin.

Also folded in: `findById`'s recovered `options.retry` with its retry-before-`isStrict` ordering
(already in `repository-hierarchy.md`, absent from the changelog - it was the most user-visible
change in the set), and the `getIdType` dedupe, which is a re-export with no runtime effect.

Found while re-checking the page against the commit: the `*RelationalRepository` and
`*RelationalDataSource` compat aliases are gone from `@venizia/ignis` and `@venizia/ignis/postgres`,
which the changelog had not recorded - its Details section still claimed the datasource aliases were
exported. Ten withdrawn names now sit in one migration table, each mapped to the Postgres spelling on
the same path. Migrating to `@venizia/ignis/relational` instead is wrong: the class of that name
there is the neutral one, whose `connector` is `unknown`.

## 2026-08-02 - the `FilterBuilder` alias is withdrawn; docs repointed to the neutral tier

`FilterBuilder` moved to `connectors/relational/repositories/dialect/filter.ts` and became `abstract`
with `protected abstract get operators()`; `PostgresFilterBuilder extends FilterBuilder` supplies
`PostgresQueryOperators.FNS`. The `export { PostgresFilterBuilder as FilterBuilder }` alias is gone,
so `FilterBuilder` no longer resolves from `@venizia/ignis` or `@venizia/ignis/postgres` - it
published two different classes under one name across sibling sub-paths. Verified against `dist`.
`filter-system.md` and `relational-connector.md` repointed; both had also claimed
`PostgresQueryDialect extends FilterBuilder` and that the operator table was a `protected` member
rather than `abstract`. 17 wiki reference source-links repointed, one of which
(`dialect/internal/json-utils.ts`) was a dead GitHub path, and `default-filter.md`'s
`new FilterBuilder()` sample no longer compiled against an abstract class.

## 2026-08-02 - the neutral relational tier stopped naming Postgres

`connectors/relational/repositories/core/*.ts` held ten `import type`s of `IPostgresDataSource` and
`IDatabaseExtraOptions`, purely to serve the two engine-facing generic defaults - the dependency
arrow pointed backwards. Both now default to the neutral contracts, and `IRelationalExtraOptions`
gained a `TConnector` parameter (defaulting to `unknown`) so a bound engine keeps its connector type.
`connectors/postgres/repositories/core/*.ts` changed from re-exports to five real subclasses that
rebind those two parameters, so `PostgresBaseRepository`/`ReadableRepository`/`PersistableRepository`/
`DefaultCRUDRepository`/`SoftDeletableRepository` are now distinct class objects from their neutral
parents: `ReadableRepository === ReadableRelationalRepository` is false, `instanceof` unaffected. The
neutral names no longer resolve from `@venizia/ignis/postgres`. Recorded in
`repository-hierarchy.md` and `relational-connector.md`, whose "SAME class object" claims were the
facts this change falsified.

## 2026-08-01 - `options.retry` restored on the relational read verbs that had narrowed it away

`SoftDeletableRelationalRepository.findById` (3 overloads) and `RelationalBaseRepository`'s 4
abstract read verbs typed `options` as bare `ExtraOptions`, which drops `IWithReadRetry` - so
`options.retry` was a compile error on exactly the class BANA extends most, while every sibling
accepted it. Runtime plumbing was always complete; only the signatures blocked it. Both now carry
`TFindOneOptions`/`TFindOptions`/`TFindRangeOptions`. `repository-hierarchy.md` gains the hazard:
re-declaring a read verb silently narrows `retry` away, and neither `tsc` nor a test holding the
concrete subclass can see it. Also recorded there - `isStrict` is evaluated AFTER the retry loop is
exhausted, so a strict read waits out replica lag before it throws `ENTITY_NOT_FOUND`.

## 2026-08-01 - final review fixes: the `FilterBuilder` seam is real, and no two classes share a declaration name

Two facts recorded in the entry below were wrong and are corrected here.

**The `FilterBuilder` override seam did not exist.** Three documents said a second SQL engine
supplies "an operator table plus a JSON-path variant of those five methods" and reuses
`FilterBuilder` unchanged. Every one of those methods was `private`, and the operator table was
reached as a hardcoded `PostgresQueryOperators.FNS` - so an author had to fork 736 lines. Six
methods (`buildOperatorConditions`, `validateJsonColumn`, `jsonNeedsNumericCast`,
`buildJsonWhereCondition`, `buildJsonOperatorConditions`, `buildJsonOrderBy`) are now `protected`,
and the table is reached through a `protected get operators(): TQueryOperatorHandlers`. No
behaviour changed and no declaration-emit error (TS4094) appeared. Falsified by
`__tests__/connectors/postgres/repositories/dialect-seam.test.ts`, a `SqliteShapedDialect` that
emits `json_extract` with no SQLite driver involved. `relational-connector.md`, `filter-system.md`
and the SQLite research spec now carry the exact override list.

**"The two barrels deliberately share class names" was a defect, not a decision.**
`connectors/postgres/datasources/{abstract,base}.ts` declared `AbstractRelationalDataSource` and
`BaseRelationalDataSource` - the same names the neutral tier declares - so the two sub-paths
published different classes under one name. They are renamed to `AbstractPostgresDataSource` and
`BasePostgresDataSource`, which were already their public alias names, so the API surface is
unchanged: `@venizia/ignis/postgres` still exports both `*RelationalDataSource` spellings, and
`BaseDataSource`, as aliases. The name collision now lives only in the alias layer, which is still
why `connectors/index.ts` never gains `export * from './relational'`.

## 2026-08-01 - `connectors/relational` goes public; the SQLite spec's FilterBuilder claim was wrong

Connector sub-project 1 (Tasks 1-8, this repo's `feat/relational-connector` line) hoisted an
engine-neutral SQL tier - datasource root, driver contract, entity base, the five-class repository
chain, both ports (`IRelationalQueryDialect`, `IRelationalQueryExecutor`) - out of
`connectors/postgres` into `connectors/relational`. Task 9 makes it reachable and documented: a new
barrel (`connectors/relational/index.ts`) plus a `@venizia/ignis/relational` package export,
published beside `./postgres`. `connectors/index.ts` does **not** gain `export * from './relational'`
- the two barrels deliberately share several class names (`BaseRelationalDataSource`,
`AbstractRelationalDataSource` each name TWO different classes, one neutral, one Postgres), so
merging them into the root namespace would make one of each pair unreachable by name.

New concept: [Relational connector](/architecture/relational-connector.md) - the two ports and why
there are two, the seven executor verbs and which Drizzle call each replaces, why
`TTableSchemaWithId` widened from `PgTable` to the dialect-free `Table`, why `buildBeginStatement` is
abstract, and what is genuinely Postgres-only. `datasource-hierarchy.md`, `repository-hierarchy.md`,
`filter-system.md` and `transactions.md` are corrected where they named Postgres as the only SQL
branch or quoted the old `resolveConnector` error text (`is not a postgres transaction`, reworded to
`is not a relational transaction` in Task 8 - a behaviour change, not just a doc fix).

`docs/superpowers/specs/2026-07-31-sqlite-connector-research.md`'s "What SQLite costs, measured"
section claimed a SQLite connector needs its own 724-line filter translator. Measured against the
file as it stands after the lift: **wrong**. `FilterBuilder` has zero `drizzle-orm/pg-core` imports;
its only table-identity coupling (`getTableConfig(schema).name`) was already replaced by drizzle's
root `getTableName(schema)`, which also resolves on a `sqliteTable` (the pg-core call throws there).
Only ~471 of the ~1104 dialect lines are genuinely Postgres-specific: `PostgresQueryOperators`
(136 lines - `ilike`/array ops emit literal Postgres SQL), `UpdateBuilder` (184 lines - composes
`jsonb_set`), and five private JSON-path methods inside `FilterBuilder` itself (~151 of its 736
lines - hardcode `#>>`/`#>`). A SQLite dialect is an operator table plus a JSON-path variant of those
methods, not a second `FilterBuilder`. Spec corrected; sub-project 1 marked done in both the spec and
`docs/superpowers/MINIMAP.md`; sub-projects 2 (`PGliteDriver`) and 3 (`connectors/sqlite/`) unblocked.

`UpdateBuilder` stays reachable two ways - directly from `connectors/postgres/repositories/dialect`
and as `PostgresQueryDialect.updateBuilder` - both public before this task, neither deleted. New code
should go through the dialect (`dataSource.getQueryDialect().updateBuilder`); the direct constructor
bypasses the datasource's port resolution.

Verified against the built package, not just types: every BANA-facing compat alias
(`SoftDeletableRepository`, `ReadableRepository`, `PersistableRepository`, `DefaultCRUDRepository`,
`PostgresBaseRepository`, `BaseEntity`/`BasePostgresEntity`, `AbstractPostgresDataSource`,
`BasePostgresDataSource`/`BaseDataSource`) resolves from `@venizia/ignis/postgres` and is the SAME
class object as its `connectors/relational` canonical name - a runtime probe, not a grep. Suite
unchanged at 1722 pass / 2 skip / 0 fail across 159 files; `make lint-all` and `make okf-check` green.

## 2026-07-30 - whole-wave review: `/common`'s type surface, and `getWorker()`'s `unknown` cast

Two defects the per-task reviews below could not see, since each only looked at `/core`.

`common/index.ts` still had `export * from './jsx'`, so `@venizia/ignis-helpers/common` reached
`hono/jsx` the same way `/core` did before the entry below - a consumer without `hono` gets
`TS2307`, one compiling for a Worker gets a flood of DOM-intrinsic errors. Fixed the same way
`ErrorSchema` left the error barrel: `export * from './jsx'` is gone from `common/index.ts`;
`Child`/`FC`/`PropsWithChildren` are re-exported directly from the root barrel instead
(`export * from './common/jsx'` in `src/index.ts`, beside `export * from './common'`), so the root
barrel's public surface is unchanged (verified: `examples/rpc-api-server` imports all three from
`@venizia/ignis-helpers` in three files). `core-type-surface.test.ts` is now parameterised over
`(entry, fixture)` pairs - `./core` and `./common` - instead of hardcoding one; run against the
unfixed `common/index.ts` it failed with the same `hono/jsx` DOM-intrinsic errors `/core` hit.

The entry below widened `IFetchable`/`AbstractNetworkFetchableHelper`'s `getWorker()` to `unknown`
to keep the interface `axios`-free, then had each concrete fetcher override `getWorker()` and
`declare` its own `worker` field to recover the concrete type. That shape does not check anything: a
class can implement `IFetchable<'axios', ...>` with `getWorker()` returning `fetch`, and
`BaseNetworkRequest.getWorker(): TFetcherWorker<T>` cast the widened result back to the concrete
type with `as`, so the lie compiled clean. Fixed with a fourth type parameter instead of the
widen-and-cast shape: `IFetchable<V, RQ, RS, W = unknown>` and
`AbstractNetworkFetchableHelper<V, RQ, RS, W = unknown>`; `W` defaults to `unknown` so the interface
and the abstract base stay `axios`-free, but `AxiosFetcher`/`NodeFetcher` now bind it to their real
worker type (`AxiosInstance`, `typeof fetch`) in the `extends` clause, so `this.worker`/`getWorker()`
are correctly typed by inheritance - the `declare protected worker` overrides and the redundant
`getWorker()` overrides are gone from both. `BaseNetworkRequest.getWorker()` now returns
`this.fetcher.getWorker()` with no cast: its `fetcher` field is typed
`IFetchable<T, IRequestOptions, TFetcherResponse<T>, TFetcherWorker<T>>`, so the interface itself
carries the constraint end to end. Confirmed closed by writing a rogue `getWorker(): typeof fetch`
implementor against `IFetchable<'axios', ...>` - `TS2322`, "Type 'typeof fetch' is missing ...
`AxiosInstance`" - then deleting the scratch file. This is the pattern the next `kernel` gate
(`AbstractRepository` re-exporting `drizzle-orm` types) should follow: type-parameter-with-neutral-
default, not widen-and-cast, wherever the escaped type is load-bearing rather than incidental.

## 2026-07-30 - `/core`'s `.d.ts` graph gets its own gate, after three ambient-global leaks

Bundling erases types, so the bundle-and-spy purity tests never saw three ambient-global leaks
sitting in `/core`'s type graph. `pool/types.ts`'s `IPoolWaiter.timer` used `NodeJS.Timeout`, now
`ReturnType<typeof setTimeout>`. `common/types.ts` re-exported `Child`/`FC`/`PropsWithChildren` from
`hono/jsx`; that re-export moves to a new `common/jsx.ts`, still exported through `common/index.ts`.
`http-request/types.ts`'s `TFetcherResponse`/`TFetcherWorker` move to a new `fetcher/types.ts`, but
not as a pure relocation: `base-fetcher.ts`'s `IFetchable`/`AbstractNetworkFetchableHelper` generics
were bounded by those types, which would still drag `axios` into any file reaching the fetcher's
leaf module. The bound is dropped instead - `RS` and `worker` go unconstrained (`unknown`), and each
concrete fetcher (`AxiosFetcher`, `NodeFetcher`) redeclares its own `worker` type and overrides
`getWorker()` to recover the concrete type at the call site.

`src/__tests__/core-type-surface.test.ts` is the gate that should have caught all three: it runs
`tsc --noEmit` on a fixture Worker consumer of `/core` under a `tsconfig` with `types: []` (drops the
ambient `NodeJS` namespace) and `skipLibCheck: false` (stops a bad declaration silently widening to
`any`) - drop either setting and it passes for the wrong reason. Helpers' `purity` script now runs it
alongside the bundle-and-spy gates.

The bundle-and-spy harness duplicated across six purity test files (helpers x4, inversion, filter,
core) is extracted to a shared `__tests__/support/browser-purity-probe.ts` per package; each test
file now only supplies its allowed packages and entry point.

## 2026-07-29 - helpers ships a `/core` sub-path: the isomorphic surface a Web Worker can import

`@venizia/ignis-helpers/core` (`src/core.ts`) re-exports `BaseHelper`, the error layer, `uid`,
`pool`, `HfQueueHelper`, the `ILogger` contract, and the fetcher interfaces - every leaf the prior
two waves proved bundles clean for `target: 'browser'`. Each re-export names a **leaf** module path,
never a barrel: the logger barrel drags `node:module`, the error barrel drags `@hono/zod-openapi`,
and the `http-request` barrel drags `node:querystring` from a sibling file, so `core.ts` reaches the
fetcher through `modules/network/http-request/fetcher/base-fetcher` directly. `ErrorSchema` stays out
- it needs `@hono/zod-openapi` and belongs to the server surface, not the worker one.
`src/__tests__/core-purity.test.ts` guards the entry with the same bundle-and-spy harness as the
other purity gates, and helpers' `purity` script now runs all four of its gates
(`browser-purity`, `common/browser-purity`, `error/error-barrel-purity`, `core-purity`) instead of two.

## 2026-07-29 - two `process` reads in `common/` become `globalThis`-guarded

`common/constants/app.ts`'s `Defaults.APPLICATION_NAME` and `common/redact.ts`'s
`isRedactionEnabled` read `process.env` directly - a bare Node global a browser bundle of `/common`
cannot resolve. Both now read through `globalThis.process?.env?...`, so they degrade instead of
throwing outside Node. `Defaults.APPLICATION_NAME` keeps its `'APP'` fallback; redaction stays
fail-closed - only the literal string `'false'` disables it, and the read stays per-call so it can
be flipped at runtime.

## 2026-07-29 - `ErrorSchema` leaves the error barrel

`modules/error/types.ts` (its only contents: an `@hono/zod-openapi` import plus `ErrorSchema` and
`TErrorResponse`) is deleted; both moved to a new `modules/error/schemas.ts`. The error barrel
(`modules/error/index.ts`) is on the browser path through `getError` - `helpers/core` and
`BaseHelper` both reach it - and `@hono/zod-openapi` is not browser-safe, so it cannot stay in that
barrel. The root barrel (`modules/index.ts`) re-exports `error/schemas` directly alongside `error`,
so `@venizia/ignis-helpers` consumers (including `core`'s three importers) see no change - only a
deep import of `modules/error/types` would have broken, and none existed.

## 2026-07-29 - the two orphaned browser-purity tests are wired, and core gets its own gate

`packages/helpers/src/__tests__/common/browser-purity.test.ts` and
`packages/core-server/src/__tests__/repositories/browser-purity.test.ts` existed but ran nowhere. Helpers'
`purity` script now runs both of its purity test files; core gets a `purity` script of its own plus
a `purity-core` Makefile target. `purity-core` depends on `core`, not on `inversion` alone, because
core resolves BOTH `@venizia/ignis-helpers` and `@venizia/ignis-inversion` through `exports` maps
into `dist/` - `core` is the target that rebuilds that whole chain, the same reasoning `purity-filter`
and `purity-helpers` already used for their own `inversion` prerequisite.

`.githooks/pre-commit` now runs `make purity` after `make lint-all`, so a purity break fails a
commit instead of staying invisible until someone manually cuts a release.

## 2026-07-28 - the Kafka bundler stops dying on a hoisted `require`

- `platformaticRequirePlugin()` added to the Kafka bundler, plus `platformaticKafkaPlugins()` as the
  one entry point compile scripts should register. `@platformatic/kafka@2.8.0` hoisted
  `require('ajv-draft-04')` and `require('ajv/dist/refs/json-schema-draft-06.json')` to MODULE SCOPE
  in `registries/confluent-schema-registry.js`, behind `createRequire(import.meta.url)`, and
  `dist/index.js` re-exports that file - so every compiled binary importing any Kafka helper died
  with `Cannot find package 'ajv-draft-04'` before boot. The plugin rewrites each module-scope
  `const X = require('spec')` into a static import at bundle time. The injected binding is
  `const X = <alias>;` with NO `?.default` unwrap: the draft-06 meta schema JSON has its own
  top-level `default` key, so unwrapping silently swaps the meta schema for `{}` - the binary boots
  and the registry constructs, then draft-06 validation fails. `platformaticWasmPlugin()` is
  unchanged and still exported; the helpers dev dependency moved to `^2.8.0` (peer range `^2.6.1`
  stays valid) so the failure is reproducible in CI.

## 2026-07-27 - the gRPC component takes its peer through the options, and `register` stops lying

Three fixes, all measured against a `bun build --compile --minify` binary run without `node_modules`.

`IGrpcComponentConfig.module` (`{ connect, protocol }`, typed as `IConnectRpcModule`) closes the
last compiled-binary gap. `GrpcComponent` reads its options binding and assigns the module to each
controller before `configure()`, the same way it already assigns `basePath`; `GrpcRequestAdapter`
skips both `assertInstalled` and its own `createRequire` when the module is present.

That correction matters because the entry below named `@connectrpc/connect` as the case `register`
was for. It never could be. The adapter resolves the specifier itself, so a registry entry only made
`assertInstalled` pass and then let the raw `Cannot find module` through - strictly worse than the
install hint. `assertInstalled` now takes `allowRegistered`, default **false**: a registration counts
only where `ModuleUtility` itself performs the load. Same reasoning kills the `pino-pretty` /
`pino-roll` case, where the worker thread resolves the target.

`register` no longer logs. It runs at the entrypoint of exactly the deployment that has no logger
provider, where `LoggerFactory` throws - and because the loop set each entry before logging it,
one call registered the first module and silently dropped the rest. Guard test installs an unusable
provider and asserts all three entries survive.

Also fixed while in there: `createSecretsHelper` asserted `node-vault` / `@dotenvx/dotenvx` present
even when the caller injected `client` / `decode`, which defeated the very escape those options
exist for. The assert is now skipped when the escape is supplied.

`register` now has no first-choice call site left in the framework. It stays public for consumers.

`IGrpcComponentConfig.interceptors` is wired at the same time. It had been dead config since it was
introduced: the component bound it, nothing read it, and `configure()` called
`GrpcRequestAdapter.build({ controller })` with nothing else. The adapter half already worked - it
forwards a non-empty list to `createConnectRouter` - so the fix was the missing component ->
controller -> `build` link, the same one `module` needed. Kept as `unknown[]` rather than
ConnectRPC's `Interceptor`: the type is published, BANA could not be crosschecked from this repo,
and widening it later breaks nobody.

## 2026-07-27 - the mail transports take their peer through the options

`INodemailerMailOptions.module` / `IMailgunMailOptions.module`, threaded through
`MailTransportProvider` into both transport helpers, which now fall back to `ModuleUtility.loadSync`
only when the option is absent. Both helper constructors moved to an options object
(`{ config, module }`) - a shape change, and the reason core needs a republish; nothing outside
`MailTransportProvider` constructs them.

Written the day after `register` shipped, and it demotes it. A global registry keyed by string is a
service locator: it depends on call order (register must beat the component's binding, nothing
enforces that), a typo is a runtime failure, and the value is `AnyType`. The options seam is DI -
typed to the shape each transport calls, arriving where it is used. IGNIS already had the seam for
the vault helpers (`client`, `decode`); mail was the gap because it builds the client itself.

`register` stays for peers with no options in between. It does NOT help a `pino` transport target:
`pino.transport()` resolves inside a worker thread the registry never reaches. (The
`@connectrpc/connect` case named here originally was wrong - corrected in the entry above.)

## 2026-07-27 - optional peers reach compiled binaries through a registry

`ModuleUtility.register({ modules })` closes the hole the bundler-invisible specifier opened.
Hiding a specifier from `Bun.build` moves resolution to runtime, and a `bun build --compile` binary
runs with no `node_modules` to resolve against - so a peer the app really installed is still
unreachable. BANA's `identity` proved it in production: `nodemailer` in `package.json`, in the
image nothing, boot dead at `MailComponent` binding the moment the mail transport switched from
`require('nodemailer')` to `ModuleUtility.loadSync` (core 0.1.1-13).

Injecting a ready-made client already covered the secrets helpers, but not a component that builds
the client itself, which both mail transports do. The registry is checked first by `load`,
`loadSync` and `assertInstalled`; the app statically imports the peer - that import is what embeds
it - and registers it before the consuming component binds. Nothing changes for apps running from
source.

## 2026-07-26 - the error catalog is complete, and it was nearly finished already

`SearchErrors` (`connectors/search/common/errors.ts`) and `MailErrors`
(`components/mail/common/errors.ts`) close the last nine client-facing 4xx that still spelled their
status and code at the throw site. Seven catalogs now, all pinned in `framework-catalog.test.ts`.

The measurement that mattered was knowing what NOT to convert. 244 `getError` sites in `core` still
carry an inline message, which reads like an 85% backlog - but the convention only catalogs
CLIENT-FACING 4xx. Of those 244: **197 declare no status** (500, internal) and **38 declare a 5xx**.
Exactly **9** carried a 4xx. Internal failures stay codeless on purpose, so the catalog was ~95%
done, not 15%.

What those nine had wrong was not a missing code - each already passed `messageCode`. It was
retyping code AND status at the throw, the drift the convention warns about:
`ALREADY_EXISTS` + `Conflict` hand-typed in both the Typesense and Meilisearch connectors,
`INVALID_CONFIGURATION` + `400` in three mail sites, and mail using bare `404`/`400` literals rather
than `HTTP.ResultCodes`.

Codes are unchanged on the wire - the definitions restate the exact strings
`MessageCode.build()` produced, as literals, because `build()` returns `string` and erases the
literal type `TRegisterErrors` needs. `SearchErrorCodes` / `MailErrorCodes` stay exported: their
remaining members are raised on 5xx paths that are codeless by design.

## 2026-07-26 - core declares `zod`: a hoisting-dependent declaration-emit failure

The `core` release failed CI at Build with TS2742: "The inferred type of 'WhereSchema' cannot be
named without a reference to '$ZodTypeInternals' from '.bun/zod@4.4.3/...'". It built fine locally.

`core` re-exports `WhereSchema`/`FilterSchema` from `buildQuerySchemas()` in `@venizia/ignis-filter`,
so its public `.d.ts` must NAME zod's types - but core declared no `zod` dependency. Locally a
hoisted `node_modules/zod` let TypeScript write the portable `import("zod/v4/core")`; CI's layout had
no such hoist, so TS fell back to the bun store path and refused it as non-portable. The local pass
was luck, and a warm `tsbuildinfo` hid it further - reproduce by deleting `dist/` AND the
`.tsbuildinfo` files, then hiding `node_modules/zod`.

The same gap would have broken CONSUMERS: `@venizia/ignis` shipped types referencing zod without
depending on it. Fixed by declaring `zod: catalog:` in core, which also gives it
`packages/core-server/node_modules/zod` so resolution no longer depends on hoisting. A sweep of every
package's emitted `.d.ts` against its manifest now shows no other package referencing an undeclared
dependency.

## 2026-07-26 - force-update derives its package list, and no longer clobbers `catalog:`

Each `scripts/force-update.sh` carried a HARDCODED `PACKAGES` list, so a new workspace dependency was
silently never refreshed. Two had already drifted: `core` never refreshed `@venizia/ignis-filter`
(pinned at a stale `^0.1.1-0` while filter shipped `0.1.1`) and `filter` never refreshed
`@venizia/ignis-inversion`. The list is now derived from `package.json` with `jq`, so it cannot go
stale; `EXTRA_PACKAGES` carries the one non-`@venizia` pin (`dev-configs` -> `@minimaltech/eslint-node`).

Second bug, found by running the scripts rather than reading them: force-update's `sed` overwrote a
`catalog:` value with a registry version, which would have failed `make catalog-check` in the very
next workflow step - the release of `dev-configs` was primed to break. The loop now skips any dep
whose current value is `catalog:`, since the root catalog owns that range.

Everything else about `filter` was already registered correctly - Makefile chain and targets, release
workflow choice and `DIST_DIRS`, knowledge concept, wiki changelog.

## 2026-07-25 - the query schemas follow the vocabulary into `ignis-filter`

User decision: bring the zod schemas across so a browser can use them. They sit on a separate
`@venizia/ignis-filter/schemas` entry point, so the root barrel still resolves no `zod` for consumers
who only want `QueryOperators`.

They are built with plain `zod` through `buildQuerySchemas({ decorate })`. The injected decorator is
not ceremony: `.openapi()` returns a NEW schema instead of mutating, and 3 of the 11 decorations sit
on inner nodes of a nested tree, so core cannot annotate them after composition - it would only ever
decorate the outer node while the composed children stayed bare. `core` calls the builder with the
OpenAPI decorator and re-exports under the original names, so no consumer changed.

The side-effect `import '@hono/zod-openapi'` in core's `query-schemas/index.ts` is load-bearing:
the package peers on `zod`, so importing it patches `.openapi()` onto the shared prototype, and ESM
evaluates imports before the module body where the builder runs. Without it the schemas build
undecorated and everything still compiles and still validates - the API reference just loses every
description. `query-schema-openapi.test.ts` closes that hole by generating an OpenAPI 3.1 document
and asserting descriptions at the top level AND on nested properties.

Types stay hand-written rather than `z.infer`: `TFilter<User>` rejects `{ where: { notAField: 1 } }`,
the inferred type accepts it, because the recursive where-clause is `z.ZodType<any>`.

## 2026-07-25 - `@venizia/ignis-filter` is a package

The filter vocabulary - the `TFilter` shape, `QueryOperators`, `TQueryOperator`, `Sorts` - moved out
of `core/src/base/repositories/` into its own package so a browser data layer can speak the same
filter language as a server repository. 181 lines across two files.

It sits BESIDE helpers in the chain, not after it: `dev-configs -> inversion -> {filter, helpers} ->
boot -> core`. Its only dependency is inversion, which supplies both `getError` and `TConstValue`;
helpers merely duplicates `TConstValue`, so an edge to helpers would have cost more for nothing.

Two assumptions in the design spec turned out wrong and are corrected here: `mergeFilter` is NOT
extractable - it is a method on the Postgres query dialect, Drizzle-coupled, not a standalone
function - and the vocabulary never needed helpers at all.

`core` re-exports the package from `base/repositories/common/index.ts`, so no public name moved and
no consumer import changed. Seven internal core imports were repointed. The zod query schemas stay in
core and stay Hono-coupled, which is correct for them.

## 2026-07-25 - the filter vocabulary is split from the HTTP query schemas

`TFilter`, `TWhere`, `TFields`, `TInclusion`, `TLimit`, `TOffset`, `TSkip` and `TOrderBy` moved out of
the individual `query-schemas/*.ts` files into `query-schemas/common/types.ts`, which has no runtime
import at all. The zod schemas stay where they are: they parse HTTP query strings, so being coupled to
`@hono/zod-openapi` is correct for them, not a defect. The point of the split is that a package
extraction can now take the types and leave the schemas - types are erased at runtime, so they cost a
browser bundle nothing, but they could not be moved while they shared a file with the schemas.

`operators.ts` now reaches `getError` from `@venizia/ignis-inversion` and `TConstValue` from
`@venizia/ignis-helpers/common`; through the helpers root barrel it was pulling 13 node builtins plus
`@hono/zod-openapi` and `ioredis`. Now zero builtins.

Public surface is unchanged: same names from the same barrel, and `TLimit`/`TOffset`/`TSkip`/
`TOrderBy` were re-stated as literal types that a compile-time assertion proves identical to the
`z.infer` they replaced. `core` has 16 `exports` entries and no wildcard, so no consumer could have
been deep-importing the files that changed.

## 2026-07-25 - browser purity is measured, and `helpers/common` is the pure sub-path

Two guards now bundle an entry for `target: 'browser'` and assert the resolved graph is clean:
`packages/inversion/src/__tests__/browser-purity.test.ts` and
`packages/helpers/src/__tests__/common/browser-purity.test.ts`. Three things they had to get right,
each of which silently produces a false pass: `Bun.build` with a browser target does NOT error on
`node:fs`, so build success proves nothing; the spy must sit on `onResolve`, not `onLoad`, because a
probe entry outside the workspace never resolves a root-hoisted package and the leak passes unseen;
and the probe must run with cwd at the package root or tsconfig `paths` do not resolve and the walk
stops at the first aliased import. Both are proven to bite by mutation.

Measured: `inversion` is genuinely browser-clean (`lodash` + `reflect-metadata`, zero builtins). The
`helpers` root barrel is not - it pulls 14 node builtins and 27 packages, so `core`'s pure filter
vocabulary is unusable in a browser purely because it reaches `getError` through that barrel. New
`@venizia/ignis-helpers/common` sub-path exposes the already-clean surface. Additive only: no
existing export moved, so consumers are unaffected.

## 2026-07-25 - the framework finally has an error catalog

`normalized.code` was `core.system_error` on almost every framework error: 367 of 402 `getError`
sites carried no code, and NOTHING in `packages/*` used the `TErrorDefinition` mechanism the docs
describe. The client-facing 4xx set - 39 sites - is now catalogued as `AuthenticationErrors`,
`AuthorizationErrors`, `StaticAssetErrors`, `RepositoryErrors` and `RequestErrors`, all
`core.<area>.<reason>` and all registered with `IErrorKeyRegistry` for consumer autocomplete.

Purely ADDITIVE: every original `message` string is preserved as an override, so only the code and
(where it was already implied) the status change. The 443-test auth suite passed unchanged, which is
the proof. Internal failures - boot misconfiguration, DI invariants, programming errors - stay
codeless deliberately; they surface as 500s where a code helps nobody.

`framework-catalog.test.ts` pins all 24 codes, asserts none is the sentinel, none collides, and
every one is 4xx. They are a public contract, so a rename fails the build.

## 2026-07-25 - every Error logged via `%s` is prettified, and auth stops double-logging

The block is a `- field: value` bullet list, message first (what happened), then the `cause` chain,
then identity, diagnostics, `extra`, and `stack` last. Only the FIRST dependency frame survives -
the throw site is usually there and the rest is HTTP plumbing - with the omitted count printed. A
`ZodError`'s JSON issue array is compressed to one `path: reason` line per issue, capped at 10.

`formatLogMessage` now routes an `Error` bound to `%s` through `ErrorPrettier` instead of
`util.inspect`. That fixes ~100 raw-dump call sites at once without touching any of them, and every
consumer's own logging too. A BANA `jose` failure was printing the entire JWT payload - 2900 chars
down to 382, payload gone. The block starts on its own line so it never trails off the end of the
caller's sentence. `ErrorPrettier` now also keeps an error's own `extra` (root only, redacted), so a
direct log call does not lose the caller context the middleware path renders; `inspectOptions` is
threaded through, so `APP_ENV_LOGGER_INSPECT_DEPTH` still applies.

Secrets are now dropped rather than masked: an `AxiosError`'s `config` never reaches the line at
all, a stronger guarantee than `[REDACTED]`. Two tests that asserted the `[REDACTED]` marker were
updated to assert the property (secret absent, diagnosis present).

Auth logged the same failure twice and still lost the reason: `verify()` logged the raw `jose`
error, then `executeAnyMode` caught it, traced at `debug`, and threw a fresh 401 with NO `cause` -
so the boundary log only ever said "Tried strategies: jwt, basic". Both now thread `cause` and set
`logLevel: 'warn'`, and `verify()` logs nothing. One line at the boundary carries the whole chain.

## 2026-07-25 - release publishes with `bun publish`, plus two pre-publish gates

`package-release.yml` published with `npm publish`, which ships Bun's `catalog:`/`workspace:`
protocols verbatim - the cause of the three broken releases below. It now uses `bun publish`, which
resolves them while packing (`bun pm pack` substitutes, `npm pack` does not - measured both ways).

Auth had to change, and the reason is a real bun/npm difference: **bun does not read
`NPM_CONFIG_USERCONFIG`**, which is where `actions/setup-node` writes its `.npmrc`. Measured against
a local registry with an isolated `HOME`: `NPM_CONFIG_USERCONFIG` and `BUN_AUTH_TOKEN` both fail with
`missing authentication`; only **`NPM_CONFIG_TOKEN`** works. The publish step therefore passes
`NPM_CONFIG_TOKEN`, while `npm dist-tag add` keeps `NODE_AUTH_TOKEN` (npm does honor setup-node's
config). A bun `.npmrc` in the CWD also works, but the env var writes no token to disk.

`npm version` and `npm dist-tag add` stay (bun has no dist-tag command, and neither packs).

Two gates now run before publish: `make catalog-check`, and a packed-manifest check that packs with
`npm pack` ON PURPOSE - bun would substitute the protocol away, so a bun-packed tarball could never
fail the check.

## 2026-07-25 - root dependencies removed; versions now pinned by a workspace catalog

The root `package.json` carried 34 `dependencies`, every one of them already declared by a
workspace - pure duplication that acted as an accidental version pin. The block is GONE. Ten
workspace ranges were bumped up to what root pinned first, so nothing downgrades.

Shared versions now live in `workspaces.catalog` (32 entries) and every workspace references
`"catalog:"` (163 declarations). `peerDependencies` are deliberately excluded - they are looser
compat statements, and `catalog-check` rejects `catalog:` there.

This depends on the pipeline publishing with `bun publish`: bun resolves `catalog:` while packing,
npm ships it verbatim. Publishing with npm broke `@venizia/ignis@0.1.1-9`,
`ignis-helpers@0.1.1-6` and `ignis-inversion@0.1.1-4`, which shipped `"lodash": "catalog:"` and
cannot be installed. Those three still need `npm deprecate` plus a republish.

Also fixed: `packages/helpers` imported `zod` (secrets/hashicorp/auth.ts) while declaring neither
`zod` nor a runtime dep guaranteeing it - `@hono/zod-openapi` is dev-only, so published helpers
resolved zod purely transitively through inversion. It now declares `zod`.

NOT run: `bun install`. The manifests are staged for the human to install on a clean tree so the
lockfile churn is reviewable in isolation.

## 2026-07-25 - mail peers were bundler-visible; module loading consolidated into `ModuleUtility`

`@venizia/ignis/mail` resolved BOTH `nodemailer` and `mailgun.js` at bundle time - measured with the
`no-bundler-peer-resolution` probe - so a consumer using one transport was forced to install or
externalize the other. Both transporters called a bare `require('<literal>')` from their client
factory. They now go through the new sync loader, and the sub-path probes clean.

`importOptionalModule` / `requireOptionalModuleSync` / `validateModule` / `validateModuleSync` are
GONE, replaced by one class: `ModuleUtility.load` (async), `ModuleUtility.loadSync` (constructor
paths that cannot await), `ModuleUtility.assertInstalled` (presence check, never executes the
module). `createRequire` is now an internal detail. BANA used none of the old names.

Measured but NOT changed: the core root barrel still resolves `casbin`, `@hono/node-server`,
`@hono/swagger-ui` and `@scalar/hono-api-reference`; `./mail` resolves `bullmq` through a STATIC
import in helpers' queue helper. Driver sub-paths resolving their own driver (`./postgres/*`,
`./typesense`, `./meilisearch`) is by design, not a leak.

## 2026-07-24 - error logs are summarized and rendered readable, not dumped raw

`AppErrorMiddleware` now renders the thrown error through the new `ErrorPrettier` class (helpers,
`logger/formatting`) instead of `%s` on the raw object. A `pg`/`drizzle` failure carries the full
query, its params and a stack that each repeat the same SQL; inspecting the raw object flooded the
log. `ErrorPrettier.summarize` keeps `name`, the full (untruncated) `message`, `code`, the `pg`
diagnostics, root frames and a flattened cycle-safe `cause` chain; `ErrorPrettier.format` renders that as
a block whose message keeps its REAL newlines (a plain string via `%s`, not escaped to `\n`).

The log line now also carries the resolved `statusCode` in its header, the `normalized.code` and the
caller's `extra` (redacted) - all three were previously absent. Frames appear only for an
`UNEXPECTED` failure, so an intentional `getError` is not buried in HTTP-framework plumbing;
`IResolvedApplicationError` gained a `type` field to carry that classification to the log call. Full
stack/cause still reach the HTTP response `details` in non-production, unchanged.

## 2026-07-24 - getError gains a `logLevel` option

`ApplicationError` now carries an optional `logLevel` (`TErrorLogLevel`, declared in inversion), and
`AppErrorMiddleware` logs the thrown error at that level instead of always `error` - default and
malformed values still log at `error`, so the 1500+ existing `getError` sites are unchanged. A
compile-time guard in helpers (`log-level-drift.test.ts`) pins `TErrorLogLevel` to helpers'
`TLogLevel`. Documented in the error-handling convention, the error-handling flow, and the helpers
error wiki page.

## 2026-07-21 - authorization docs re-synced; base-filtered connector fallback documented

Two prior doc passes on the authorization component had already drifted from source before this
sync. `docs/wiki/content/extensions/components/authorization/api.md` still named the query
`queryPrincipalPolicy` (singular) and listed four separate statements
(`queryPrincipalPolicy`/`queryResourceInherits`/`queryActionInherits`/`queryDomainInherits`); it now
matches the entry directly below - `queryPrincipalPolicies` (two recursive CTEs, `role_closure` +
`domain_closure`, four `kind` branches via the `PrincipalPolicyEdges` const class) and
`queryEdgePolicies` (`g4` + `g5` only, merged into one statement with two `UNION ALL` branches). Also
newly documented, in both the wiki and [Casbin authorization](/architecture/authorization-casbin.md):
`BaseFilteredAdapter`'s `connector` getter now resolves `dataSource.getConnector?.() ??
dataSource.connector` and throws a named `[BaseFilteredAdapter]` framework error instead of a bare
`TypeError` when a datasource is cold (neither present); `ICasbinPolicySource.connector` is optional
now, `getConnector?()` is the preferred lazy accessor. Guarded by
`base-filtered-connector.test.ts`. The 2026-07-20 single-wave-extraction changelog is left as a
frozen record of that day's shape (singular name, four statements) - the rename and the
domain/structural split happened afterward, documented below and in a new changelog entry.

## 2026-07-21 - g3 domain edges are principal-scoped, not load-all

`ScopedCasbinAdapter.queryPrincipalPolicies` gained a second recursive CTE, `domain_closure`,
alongside `role_closure`: it seeds from the principal's `join_domain` rows and walks up the
`domain_inherits` parent chain (`UNION`, not `UNION ALL`, so a cyclic domain graph still
terminates). A new `domainEdge` branch emits only the `domain_inherits` rows whose child is in that
closure, as `g3, <childToken>, <parentToken>` lines. `queryEdgePolicies` dropped its `DOMAIN_INHERITS`
branch - it now returns only the two code-fixed trees, `resource_inherits` (`g4`) and
`action_inherits` (`g5`). `g3` no longer loads the whole domain tree for every user; it scales with
the domains a principal belongs to (plus ancestors), not with the tenant count. `subjectId`/`targetId`
in `queryPrincipalPolicies`' other branches (`direct`, `roleEdge`, `roleGrant`) are now cast
`::text` in the SELECT list so all four branches type-check under one `UNION ALL` regardless of
whether `PolicyDefinition.subject_id` is `integer` or `text` (`idType` config).

## 2026-07-20 - single-wave extraction replaces the structural cache

`ScopedCasbinAdapter.loadFilteredPolicy` now issues four statements in one `Promise.all` -
`queryPrincipalPolicy` (a new recursive CTE) plus `queryResourceInherits`/`queryActionInherits`/
`queryDomainInherits` - instead of the previous two-wave shape (a first-wave query set, an
in-memory BFS role closure, then a second wave). The role closure is resolved in SQL: the CTE's
recursive term uses `UNION`, not `UNION ALL`, so cycle termination is de-duplication, not a
`visited` set. Only `role_inherits` edges reachable from the principal's roles are emitted now,
narrower than before and behavior-preserving. The permission join is `LEFT JOIN`, not
`INNER JOIN` - a grant whose target does not resolve is logged and skipped instead of vanishing.
`queryRoleAssignments`, `queryMemberships`, `queryRoleInherits`, `expandRoleClosure`,
`loadStructuralTrees`, and the old `queryGrants` are all gone, replaced by `queryPrincipalPolicy` +
`collectDirectRow` + the shared `buildGrantLines`. The structural cache introduced earlier the same
day (`structuralCache`, `invalidateStructuralCache()`, 60s TTL) is REMOVED, not deprecated - it was
never released. Extraction cost is addressed with indexes instead: `(variant, subject_type,
subject_id)` and `(variant, subject_id)` on `PolicyDefinition` for the CTE, `(variant)` or
per-variant partial indexes for the three structural queries - the framework does not create them
(the consumer owns its schema) but does own saying what the queries need, since an unindexed query
the framework itself writes is the seam that produced the production incident this work descends
from. Documented in
[Casbin authorization](/architecture/authorization-casbin.md#the-adapter-situation) and the
[changelog](/changelogs/2026-07-20-casbin-single-wave-extraction).

## 2026-07-20 - utilities/ folded into builders/, objectMatch became a static method

`authorize/utilities/` (the only role-less folder name in `authorize/`) is gone. `GrantUtility` ->
`GrantBuilder` and moved to `builders/grant.builder.ts`, alongside `AuthorizationPermissionBuilder`
(`builders/permission.builder.ts`, moved from `common/permission-builder.ts`) and
`AuthorizationPolicyBuilder` (`builders/policy.builder.ts`, moved from `common/policy-builder.ts`).
The free function `objectMatch` (`common/object-match.ts`) is now
`AuthorizationPermissionBuilder.objectMatch`, a `static` method with no `this` reference - it is
handed to Casbin by reference (`enforcer.addFunction('objectMatch', ...)`), so an instance method
would have lost its binding. Pure move + rename - no behavior change, no assertion changed in the
431-test authorize suite.

## 2026-07-20 - custom grants: an operation subset in one row

A `PolicyDefinition` grant row can carry `action = 'custom'` + `metadata: { ops: [...] }` against a
subject-level resource node; `ScopedCasbinAdapter.buildGrantLines` (`queryGrants` at the time this
landed, since folded into the single-wave extraction below) expands it into one `p` line per
operation, each carrying that operation's catalogued action - identical to per-operation rows, one
extra batched catalog query per extraction, none when no custom rows are present, and opt-in via
`entities.policyDefinition.metadata.columnName`. `GrantUtility.planGrant`
(`utilities/grant.utility.ts`) is the write-side planner: it collapses an `ops` selection into tier
grants wherever a tier is fully covered and falls back to a custom row only for what does not
collapse. Documented in
[Casbin authorization](/architecture/authorization-casbin.md#subset-grants-custom-rows).

## 2026-07-20 - grant-planner folded into GrantUtility

`common/grant-planner.ts` (`planGrant` + its tier helpers) is gone; the logic is now
`GrantUtility.planGrant` on `utilities/grant.utility.ts`, alongside the renamed
`CustomGrantUtility` (now `GrantUtility`) it already held. `TGrantIntent`/`TPlannedGrantRow` moved
to `common/types.ts`. Pure move - the tier-derivation-from-LATTICE and collapse rules are
unchanged; `scoped-casbin.adapter.ts`'s `customGrantUtility` field is now `grantUtility`.

## 2026-07-20 - g4 role manager, deny-overrides-allow, and a silent-drop fixed

`g4` (resource nesting) is now served by `ResourceRoleManager`, not `addNamedMatchingFunc` -
`addMatchingFunc` sets Casbin's `hasPattern`, which disables `DefaultRoleManager`'s O(1) fast path
on every link check. The manager seeds its walk from every stored prefix ancestor of a dotted code.
This is NOT exact parity with the matching function it replaced: the dot rule only applies to the
request object, a stored `'*'` node is reachable from any request object, and the old
`maxHierarchyLevel = 10` ceiling no longer applies - see the architecture concept for the full
contract. The policy effect
(`some(where (p.eft == allow)) && !some(where (p.eft == deny))`) was never documented: a deny row
overrides an allow, and consumers rely on it for carve-outs. `ScopedCasbinAdapter.queryGrants` used
to silently drop a grant row with a null `action`; it now logs an error and still drops it.

Same pass: the four structural queries (`role_inherits`, `resource_inherits`, `action_inherits`,
`domain_inherits`) were briefly cached per `ScopedCasbinAdapter` instance in this same pass -
default on, 60s TTL, `structuralCache: { use, expiresIn }`, `invalidateStructuralCache()`. That
cache was never released and is REMOVED as of the single-wave extraction entry below - do not
report it against current source.

## 2026-07-18 - @injectable removed

The decorator wrote `scope`/`tags` metadata that the container never read - `getInjectableMetadata`
had zero call sites, so it configured nothing. Gone with it: `IInjectableMetadata`,
`MetadataRegistry.set/getInjectableMetadata`, and `MetadataKeys.INJECTABLE`. Scope is set on the
BINDING, never on the class. Zero usage in IGNIS (outside its own tests) and in the known
downstream consumer.

## 2026-07-18 - optional PROPERTY injection was silently broken

The container read `metadata.optional` while `@inject` wrote `isOptional`, so
`@inject({ key, isOptional: true })` on a property always threw on a missing binding instead of
yielding `undefined` (constructor parameters were never affected). An index signature on
`IPropertyMetadata` made the misspelled read compile as `any` - it was removed, so the class of
typo is now a compile error. Regression suite: `__tests__/optional-property-injection.test.ts`.

## 2026-07-18 - leftover per-package CLAUDE.md deleted

The six hand-written `CLAUDE.md` files (`packages/{helpers,boot,core,dev-configs,inversion}/`,
`docs/wiki/`) are gone. They were untracked leftovers from before this bundle existed, still
documenting the pre-2026-07-17 error API and the pre-overhaul logger surface, and they auto-loaded
into agent context ahead of the bundle. Only the root `AGENTS.md` (plus each developer's symlinked
tool file) remains. Missing package facts belong in `packages/*.md` here - never in a new CLAUDE.md.

## 2026-07-18 - single logger provider + applicationLogger removed

Exactly ONE provider loads per app: delegates resolve lazily at the first log call; the winston
default is required behind a bundler-opaque `createRequire` boundary. winston packages became
OPTIONAL peers and every winston name moved out of the root barrel to `/winston` (root barrel is
provider-free; guard test `no-eager-winston-import.test.ts`). The scope-less `applicationLogger`
export is REMOVED - migrate to `ApplicationLogger.get(scope)`.

## 2026-07-18 - helpers dependency reclassification

`drizzle-orm` dropped from helpers (zero imports); `winston`/`winston-transport`/
`winston-daily-rotate-file`/`hono` moved dependencies -> NON-OPTIONAL peers + devDeps
(auto-installed by bun/npm, so out-of-box behavior is unchanged; apps handing winston pieces into
`defineCustomLogger` now share ONE winston copy). `ioredis`/`lodash`/`dayjs`/`reflect-metadata`
stay hard dependencies - each is eagerly reachable from the root barrel.

## 2026-07-18 - /winston sub-path export for provider symmetry

`@venizia/ignis-helpers/winston` now exists so both `LoggerFactory.use({ provider })` imports read
the same as `/pino`. Additive only: winston names stay in the root barrel (required dependency);
pino remains the only sub-path-only provider.

## 2026-07-18 - benchmark artifacts removed

`packages/helpers/benchmarks/` (and its tsconfig/typecheck wiring) plus the wiki Benchmarks page
are removed by user decision; the measured numbers stay inline in the logger docs, but there is no
tracked harness to reproduce them.

## 2026-07-18 - redaction kill-switch + applicationLogger deprecated

`APP_ENV_LOGGER_DO_REDACT=false` (literal string only, fail-closed, read per call) makes `redactSecrets`/`redactUrlCredentials` pass-throughs for local debugging;
default behavior unchanged. The lowercase `applicationLogger` export is `@deprecated` ahead of
removal - migration is `ApplicationLogger.get(scope)`.

## 2026-07-18 - level vocabulary trimmed to five

`alert`/`http`/`verbose`/`silly` are REMOVED from `LogLevels`/`ILogger`/every provider after
usage analysis found ZERO call sites in ignis and BANA and no infrastructure consuming them
(`alert` duplicated `emerg` at the same priority; `verbose`/`silly` were covered by `debug`).
The vocabulary is now exactly the five published direct methods: `debug/info/warn/error/emerg`.
Fallout simplifications: pino has ONE custom level (`emerg: 70`) - the renumbering machinery is
gone; winston priorities are five rows (`debug` = 3); HfLogger level byte is 0-4; the default
`debug` floor admits everything on both providers. `http` returns as the access-line level if
the parked request-correlation feature (2b) lands - re-adding a level is additive.

- [helpers](/packages/helpers.md): logger bullet already speaks in provider terms; level claims
  hold for the trimmed set.

## 2026-07-18 - pino provider + provider registration

`LoggerFactory.use({ provider })` selects the app's logger with swap-on-use delegation: the factory
hands out stable wrappers and re-points ALL of them at registration, so module-level loggers
captured at import time follow the provider and import order is irrelevant (wrapper cost measured
within noise). `ApplicationLogger` and lowercase `applicationLogger` are REDEFINED as
provider-following facades (BANA's 106 applicationLogger call sites - all info/error/warn/debug -
compile unchanged and gain provider-following; the raw winston singleton is internalized;
`instanceof ApplicationLogger` is now a loud compile error - use `AbstractLogger`). `PinoLogger`
lives ONLY at `@venizia/ignis-helpers/pino` (optional peers pino/pino-pretty/pino-roll, guarded by
a no-eager-import test): NDJSON stdout, pino-pretty text, pino-roll rotation mapping the existing
FILE_* envs; custom level numbers (http:26, verbose:23, silly:10) chosen so pino's ascending
severity reproduces the npm ordering - the default floor admits verbose/http and excludes only
silly, exactly like winston. Measured: pino ~481-633ns vs winston ~1250ns per line (~2.5x).

- [helpers](/packages/helpers.md): logger bullet extended with registration, facades, and the pino
  sub-path provider.

## 2026-07-18 - HfLogger reworked

`HfLogger` now conforms to `ILogger`: string-taking log methods backed by a bounded FIFO encode
cache (cap 4096), with args formatted through `formatLogMessage` (deep inspect + redaction) so
nothing is silently dropped; the legacy bytes hot path survives as an overloaded `log(level,
string | Uint8Array)`. The ring buffer moved to entry-layout v2 - per-entry length bytes replace
NUL-padded fixed slots, so reads never see stale tails from a shorter previous entry. The ring
itself is a plain, lazily-allocated `ArrayBuffer`: `SharedArrayBuffer` is dropped, making explicit
what was already true - this is a single-thread design, and the 16MB buffer is no longer allocated
at import time. Drop accounting is exact (`dropped` is reported per sink batch, not estimated).
`HfLogFlusher` takes `{ sink?, filePath?, batchSize? }`, drains in batches with yielding, exposes
`stop()`, and `start()` is unref'd so it never keeps the process alive; when entries were
overwritten before being read, the default sink emits a lap marker line. Measured: bytes-path 59.4ns, string-no-args 66ns, vs. pino sync 831ns (~14x), heap
flat under load. The
old 50-test does-not-throw suite was replaced by 17 tests that assert on content. The DEBUG gate
also moved to live in exactly one place, `logger/common/constants.ts` (`SHOULD_LOG_DEBUG`), shared
by `BaseLogger` and `HfLogger` instead of being duplicated per provider.

- [helpers](/packages/helpers.md): `hf/` clause rewritten to the `ILogger`-conformant pipeline,
  entry-layout v2, the lazy single-thread ring, and the lap-accounted flusher.

## 2026-07-18 - logger restructured to house architecture

`modules/logger/` moved from a flat file layout into IGNIS's house tiering: `common/` (the new
`ILogger` contract, `TLogLevel`, `LogLevels`, `LoggerFormats`), `base/` (`AbstractLogger`/
`BaseLogger` - provider-independent scope/prefix/DEBUG-gate/`.for()` plumbing), `formatting/`
(`formatLogMessage`), a self-contained `winston/` provider folder (`WinstonLogger`, `define.ts`,
its own `common/`/`formatters/`/`transports/`), and `hf/` (unaffected, separate pipeline).
`LoggerFactory.getLogger()` and `BaseHelper.logger` now return `ILogger` instead of the concrete
`Logger` class - `factory.ts` is the only place allowed to name a concrete provider. `Logger` and
`ApplicationLogger` stay as permanent aliases of `WinstonLogger`, so untyped call sites need no
change; the only break is typing-only, an explicit `: Logger` annotation widening to `: ILogger`
(10 sites fixed inside ignis; the known downstream consumer has 7 sites per the changelog's
migration note). `ICustomLoggerOptions` fields dropped their redundant prefixes: `logLevels` ->
`levels`, `logColors` -> `colors`, `loggerFormatter` -> `formatter` (no consumer passed them).
Zero runtime behavior change - full suite passes unchanged.

- [helpers](/packages/helpers.md): logger highlight rewritten to describe the tiered folder
  structure and the `ILogger`/`LoggerFactory` selection-point contract.

## 2026-07-18 - repository read retry

Opt-in `retry` (typed `until`) on `find`/`findOne`/`findById` across the postgres and search
connector tiers, smoothing over read-after-write replica lag behind a pooler. `retry` lives only on
read-verb option types, so write verbs reject it at compile time. `AbstractRepository` gained
`findUntil`/`findOneUntil`; helpers gained a public `executeWithRetryUntil` beside `executeWithRetry`.

- [helpers](/packages/helpers.md): `executeWithRetryUntil` documented beside `executeWithRetry`.
- [Repository hierarchy](/architecture/repository-hierarchy.md): the opt-in `retry` read-verb
  option, defaults, transaction-skip, and `findUntil`/`findOneUntil`.

Post-review hardening (same day): `maxTotalMs` no longer acts as a per-attempt timeout that could
abort an in-flight read - it now only bounds whether a NEW attempt may start, so the first read
always runs to completion and a non-positive budget means "no retries" rather than zero reads. Added
`signal?: AbortSignal` (rejects on abort, unlike exhaustion's "return the last result"). Split
`findUntil` into `findUntil`/`findRangeUntil` so each is checked against its own `find` overload.

## 2026-07-17 - logger correctness pass

The Winston pipeline formats in two stages now: shared prep (label/timestamp/errors/deepSplat) on
the logger, per-transport assembly - so the console colorizes while file and UDP output carries no
ANSI codes, and `json` mode emits valid JSON (the dead `colorize()`-after-`json()` and the no-op
`errors()`-after-`printf` are gone). `APP_ENV_LOGGER_LEVEL` (default `debug`) is the logger-level
floor; file transports are opt-in on `APP_ENV_LOGGER_FOLDER_PATH` (no more `./` scatter);
custom-backed `Logger` wrappers are fresh per call and `.for()` keeps its backing instance;
`DgramTransport` logs a failed send instead of emitting an unlistened `'error'` (process crash).
`HfLogger` stays: unused inside this repo and BANA, but external systems consume it - repo-internal
grep is NOT sufficient evidence for deleting a public helpers export.

- [helpers](/packages/helpers.md): logger highlight rewritten to the new facts.

## 2026-07-17 - secrets peers made bundler-invisible

`node-vault` / `@dotenvx/dotenvx` were reached via literal dynamic imports, which `Bun.build`
resolves at bundle time - every consumer compiling a binary had to list `node-vault` in `external`
(same problem class as the old `pg` leak). The imports now cross the `importOptionalModule`
function boundary, which survives `minify.syntax` constant folding; a bundler probe test (root
barrel + resolution spy + positive control) guards it, and a missing peer throws the standard
`getError` install hint from any entry path. Same-class literal imports remain OPEN in core
(casbin, @hono/swagger-ui, @scalar/hono-api-reference - root-barrel-reachable optional peers).

- [helpers](/packages/helpers.md): the bundler-facing rule for optional peers reached from the
  root barrel, and the compiled-binary trade-off for apps that do use a provider.

## 2026-07-16 - error layer rebuilt

The error layer moved to `packages/inversion/src/modules/error/` (helpers re-exports it), so a
browser raises the same errors the server does; inversion's second, divergent `ApplicationError` is
deleted. `getError` gained a catalogued form, every error carries `normalized = { code, args, text }`,
and the input type dropped its zod catchall - a mistyped field is now a compile error instead of a
silent trip into `extra`.

- [Error handling](/conventions/error-handling.md): catalogue versus free-form, `normalized`, the
  explicit `extra`, and the two traps the type system cannot catch.
- [Gotchas](/conventions/gotchas.md): a catalog `key` must be a literal - routing it through
  `MessageCode.build()` silently kills the registry's autocomplete.

## 2026-07-16 - bundle created

Initial IGNIS knowledge bundle, ported from the BANA `.agents/knowledge` reference implementation.

- Tooling at `.agents/knowledge-tools/` (`gen`, `check`, `coverage`, `viz`, `mcp`), zero runtime
  dependencies. All repo-specific configuration is isolated in `config.ts`.
- Ten defects in the BANA original were fixed during the port rather than carried over: YAML
  frontmatter parsing, link extraction inside code fences, concept counting, `--min 0`, managed
  region validation, MCP frontmatter reconstruction, freshness whitespace sensitivity, fabricated
  timestamps, divergent coverage/renderer heuristics, and code style.
- Generated reference layer: source map, components, helpers, binding keys, and Makefile targets,
  plus the `packages-table` managed region in [monorepo layout](/overview/monorepo-layout.md).
- Knowledge that previously lived only in gitignored `CLAUDE.md` files - and so was never shared
  with the team - now lives here, in the repository.
- `AGENTS.md` is now the single tracked instruction file. `.agents/plugin/setup.ts` links each
  developer's tool file (`CLAUDE.md`, `GEMINI.md`, ...) to it, so the repo stays agent-agnostic.
  The `update-wiki` skill moved from gitignored `.claude/skills/` into tracked
  `.agents/plugin/skills/` for the same reason.

Authoring this bundle from source found several long-standing claims in the old `CLAUDE.md` files to
be false. The concepts document what the source actually does today:

- The universal `AbstractRepository -> ReadableRepository -> PersistableRepository ->
DefaultCRUDRepository` chain does not exist. The hierarchy is per-connector, and
  `DefaultCRUDRepository` survives only as a back-compat alias of `DefaultRelationalRepository`.
- `FieldsVisibilityMixin` and `DefaultFilterMixin` no longer exist - both were folded into the
  repository base classes.
- The application lifecycle order was wrong: `registerDefaultMiddlewares()` runs early inside
  `initialize()`, and `setupMiddlewares()` is a separate hook called by `start()`.
- `build.sh` does not report false success - it has `set -e` and a `tsc --noEmit` gate. The real
  trap is `rebuild.sh` cleaning `dist/` before a build that a broken test can abort.
- The Casbin shared-model TOCTOU race is gone: each request evaluates on its own pooled enforcer.
- `Container.instantiate` no longer crashes on a sparse metadata array; it throws a named error.
- The legacy error duplicates are REMOVED: there is no flat `ApplicationError.messageCode` and
  `extra` no longer mirrors `messageArgs`. `normalized.code` / `normalized.args` are the only
  source. `messageCode`/`messageArgs` stay valid INPUTS to `getError`, and `transform` now receives
  `messageArgs` in its snapshot. Breaking for clients reading the flat pair (BANA: 188 `.messageCode`
  sites + 3 `extra?.messageArgs` OTP sites, not yet migrated).
- The error module now has ONE message shape: a `TErrorDefinition`, the `getError` input and
  `normalized` all speak `{ text, code, args }`. The definition's `key`/`message: string` are gone
  (`TRegisterErrors` indexes `['message']['code']`); `getError`'s `message` is `string | { text,
code?, args? }` so flat call sites still compile. `error` is refused on the free-form branch
  (`error?: never`) - wrap with `cause`. Spreading a definition is now safe. Breaking against the
  PUBLISHED inversion 0.1.1-0.
- `fromError({ error })` + `TResponsedError` added to inversion's error module: the inverse of the
  `AppErrorMiddleware` response, rebuilding an `ApplicationError` from a wire payload so a browser
  client gets one `catch` for server and local failures. Purely additive - reading
  `error.normalized.code` off the parsed body remains the shortest path and is unchanged. `TResponsedError`
  is NOT a duplicate of helpers' `ErrorSchema`/`TErrorResponse`: that one needs `@hono/zod-openapi`
  and cannot ship to a browser. `requestId` lands at `extra.requestId` via conditional spread;
  `details` is dropped.
