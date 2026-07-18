# Knowledge log

Append one entry per change to the bundle. Newest first. Keep entries short: what changed and why,
not how.

This file and `index.md` are reserved OKF filenames - they carry no `type:` frontmatter and are not
counted as concepts.

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
