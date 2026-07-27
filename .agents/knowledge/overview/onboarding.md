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
[Monorepo layout](/overview/monorepo-layout.md) to know where the five packages
(`dev-configs`, `inversion`, `helpers`, `boot`, `core`) live and that they build in that fixed
dependency order.

## 2. Install and build

```bash
git clone https://github.com/venizia-ai/ignis.git
cd ignis
bun install
make setup-hooks   # enables the repo's pre-commit hook (git config core.hooksPath .githooks)
make build         # rebuilds every package, dev-configs -> inversion -> helpers -> boot -> core
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
cd packages/core && bun test
```

`core` and `helpers` run tests straight from `src/`; `boot` is the exception - it runs compiled
tests from `dist/cjs/__tests__` (see [Build, run, test](/overview/build-run-test.md) for why).

## 5. Know where knowledge lives

This bundle (`.agents/knowledge/`) is the agent-facing source of truth - prefer it over the
VitePress wiki (`docs/wiki/`) when the two disagree, since this bundle is checked against source.
Before proposing that something is missing or wrong, run:

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
- [Design decisions](/overview/design-decisions.md)
