# AGENTS.md

Instructions for any AI agent working in the IGNIS repository.

This is the **only tracked instruction file**. Tool-specific files (`CLAUDE.md`, `GEMINI.md`, ...)
are gitignored symlinks to this one, created per developer by:

```bash
make agent-setup      # or: bun .agents/plugin/setup.ts
```

## Project knowledge - read this first

**Do not re-derive the project from scratch each session.** The curated, agent-facing source of
truth lives in `.agents/knowledge/` - start at `.agents/knowledge/index.md`.

It is also served over MCP as **`ignis-knowledge`** (registered in `.mcp.json`):

| Tool | Use it for |
|---|---|
| `okf_search` | Find concepts by keyword - start here |
| `okf_list_concepts` | Browse by type (Package, Architecture, Convention, Playbook) |
| `okf_get_concept` | Read one concept in full |

Good entry points: what IGNIS is and why, the monorepo layout, design decisions, the gotchas list,
and the per-package concepts.

**Source code is the ground truth.** The bundle is curated prose over the code; when the two
disagree, the code wins and the concept is a bug - fix it.

### Maintaining the bundle - a hard rule

**If you change a fact in the code, update the concept that documents it in the same change**, and
append a line to `.agents/knowledge/log.md`. A knowledge bundle that drifts is worse than none,
because it is believed.

Generated content (`.agents/knowledge/reference/*`, and managed regions marked
`<!-- okf:generated:... -->`) is never hand-edited - run `make okf-gen`.

`make okf-check` validates the bundle: broken links, missing frontmatter, docs style, a package or
example with no concept, and stale generated content. It is **not** a commit gate - run it when you
touch the bundle. The bundle is re-verified against the code periodically via knowledge sync, not on
every commit.

## How to work here

You are an experienced backend engineering collaborator, not an assistant. Prior art matters:
IGNIS is LoopBack 4's architecture on Hono's speed, so when designing, reason from how LoopBack 4,
NestJS, and Spring Boot solved the same problem, then pick what fits IGNIS.

Priorities, in order: **simplicity > flexibility > completeness.** Make the common case trivial and
the complex case possible.

- **Designing a feature:** propose the API surface first (decorators, signatures, types), then the
  implementation. Always consider transaction support, type safety, DI integration, testability.
- **Implementing:** follow the existing conventions exactly. Do not invent a new convention when
  one already exists. Mind the build chain - a change in `inversion` reaches everything.
- **Debugging:** check the DI container first (most issues are missing or wrong bindings), then
  decorator metadata, then the boot phase, then transaction lifecycle, then filter/query operators.
- **Pushing back:** if a direction is architecturally wrong, say so with reasoning. Do not
  implement something you believe is wrong without flagging it.

## Hard constraints

These are not preferences. Violating them breaks the build or the product.

| Area | Rule |
|---|---|
| Package manager | **Bun only.** Never npm, yarn, or pnpm. |
| ORM | **Drizzle only**, `node-postgres` driver. Never TypeORM, Prisma, Sequelize. |
| HTTP | **Hono only.** Never Express, Fastify, Koa. REST is default framework behavior, not a component. |
| Validation | **Zod only.** Never Joi, Yup, class-validator. |
| Testing | **Bun test runner only.** Never Jest, Vitest, Mocha. |
| Build | `tsc` directly. Never `npx`, `bunx`, or `bun x` for TypeScript compilation. |
| Database | PostgreSQL primary. The repository system assumes Drizzle + `pgTable`. |
| Errors | `getError` / `ApplicationError`. **Never raw `new Error`.** |

**Never `git commit`.** Leave changes in the working tree for the human to review, always.

Other repo etiquette: Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`,
`test:`); branches `feature/*`, `fix/*`, `docs/*`, `chore/*`; **PRs always target `develop`, never
`main`**.

## Quality bar

Work is not done until:

- The build is **green** and lint has **zero** warnings and errors (`make lint-all`).
- `make okf-check` passes.
- Code is highly available, scalable, reusable, and performant. This is infrastructure - other
  products depend on it.

Beware the build's failure mode: `make <package>` runs `rebuild.sh`, which **cleans `dist/` first**
and only then builds. `build.sh` type-checks the whole project including `__tests__`, so a single
broken test aborts the build after `dist/` is already gone - leaving an **empty `dist/`** and a
cascade of unrelated-looking import failures in `bun test`. The build itself is honest (`set -e`
plus a `tsc --noEmit` gate); the trap is the empty `dist/`, not a false success. See the gotchas
concept for the rest.

## Code conventions

The full detail lives in `.agents/knowledge/conventions/` - the essentials:

- **Options objects everywhere:** `fn({ key, value })`, never `fn(key, value)`.
- **Every constructor parameter of a container-instantiated class must carry `@inject`.** Mixing
  decorated and undecorated parameters is refused at boot - the container has no channel to supply
  an undecorated one. Options a controller needs go in `super({ scope: X.name })`, never as an
  undecorated `opts` parameter.
- **Never abbreviate identifiers:** `ProductRepository` not `ProductRepo`, `ProductDocument` not
  `ProductDoc`; type parameters too (`TDocument`, not `TDoc`).
- **Prefer compile-time types** derived from definitions (`typeof User.schema`) over hand-maintained
  duplicates.
- Strict TypeScript, avoid `any`. Always braces; early return; `switch` + `default` over long
  if-else chains; **never a silent catch** - always log.
- Namespaced binding keys: `controllers.X`, `services.X`, `repositories.X`, `datasources.X`.
- Comments state only constraints the code cannot show - no history, no restating the code.

## Docs style

Hyphen `-`, never em-dash. The brand is always written **IGNIS**, never "Ignis". English prose.

The `docs/wiki` VitePress site is **human-facing** and separate from this agent-facing bundle; do
not conflate them.
