# Knowledge log

Append one entry per change to the bundle. Newest first. Keep entries short: what changed and why,
not how.

This file and `index.md` are reserved OKF filenames - they carry no `type:` frontmatter and are not
counted as concepts.

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
