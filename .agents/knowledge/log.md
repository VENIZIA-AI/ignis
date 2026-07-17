# Knowledge log

Append one entry per change to the bundle. Newest first. Keep entries short: what changed and why,
not how.

This file and `index.md` are reserved OKF filenames - they carry no `type:` frontmatter and are not
counted as concepts.

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
