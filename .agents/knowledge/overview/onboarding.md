---
type: Tutorial
title: Onboarding
description: A first-day path through IGNIS for a new engineer or agent.
resource: .
tags: [overview, onboarding, tutorial]
---

Follow this order. Each step depends on the one before it.

## 1. Read the philosophy first

Start with [What is IGNIS](/overview/what-is-ignis.md) - LoopBack 4's architecture on Hono's
speed, and why that combination exists. Then skim
[Monorepo layout](/overview/monorepo-layout.md) to know where the ten packages live - note
`connectors`, the datasource, driver and repository tier, which is where most data-access questions
end up. They build in a fixed dependency order; read the chain in
[build system](/process/build-system.md), which is its canonical copy.

## 2. Install and build

```bash
git clone https://github.com/venizia-ai/ignis.git
cd ignis
bun install
make setup-hooks   # enables the repo's pre-commit hook (git config core.hooksPath .githooks)
make build         # rebuilds every package in dependency order, then runs the repo gates
```

Do not skip `make build`. Every package's `dist/` is gitignored and every downstream package
resolves its dependencies through `dist/` - skip the build and the next steps fail with
module-resolution errors, not the error you're actually looking for. See
[Build, run, test](/overview/build-run-test.md) for the full gotcha list, including why the
build can look "successful" while a type check actually failed.

## 3. Run a first example

```bash
cd examples/vert
cp .env.example .env.development   # edit with real PostgreSQL credentials
bun install
bun run migrate:dev
bun run server:dev
```

`vert` is the full reference implementation - CRUD, auth, components, transactions, relations.
For the smallest possible surface area, read `examples/5-mins-qs` instead - a single-file
hello world.

## 4. Run the tests

```bash
make test-core-server   # or test-all, and one target per package
```

Every package runs its tests from the TypeScript sources under `src/__tests__/`. Use the make
targets, not a bare `bun test`: they are the one home of the test flags (`BUN_TEST_FLAGS`, default
`--parallel`, which implies `--isolate`), and CI calls the same targets. Build first - a suite
resolves its sibling packages through `dist`, not `src`.

## 5. Know where knowledge lives

An agent reads two homes, and neither restates the other. `.agents/rules.md` holds the behaviour
rules - W write boundaries, S security, P process, B build and quality, C code and writing -
numbered so they are cited by ID in reviews and reports. The two that cost the most when skipped are
P-09, every status message opens with the minimap, and B-05, a downstream test suite runs `dist`,
not `src`. `make agent-setup` links the per-tool files (`CLAUDE.md`, `GEMINI.md`, ...) to the one
`AGENTS.md` that routes to both homes.

This bundle (`.agents/knowledge/`) holds the facts, and is the agent-facing source of truth - prefer
it over the VitePress wiki (`docs/wiki/`) when the two disagree, since this bundle is checked
against source. Before proposing that something is missing or wrong, run:

```bash
make okf-check      # gate: frontmatter, links, structural coverage, freshness
make okf-coverage    # how much of the source this bundle actually documents
```

`okf-check` is not a commit gate - the pre-commit hook only runs lint. Run it yourself when you touch
the bundle. Keeping the curated concepts true to the code is done by running knowledge sync
periodically, since only re-reading the source can catch prose that quietly went stale.

## Related

- [What is IGNIS](/overview/what-is-ignis.md)
- [Build, run, test](/overview/build-run-test.md)
- [Monorepo layout](/overview/monorepo-layout.md)
- [Build system](/process/build-system.md)
- [Design decisions](/overview/design-decisions.md)
