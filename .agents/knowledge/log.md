# Knowledge log

Append one entry per change to the bundle. Newest first. Keep entries short: what changed and why,
not how.

This file and `index.md` are reserved OKF filenames - they carry no `type:` frontmatter and are not
counted as concepts.

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
