---
type: Reference
title: Makefile targets
description: Every make target, its prerequisites, and what it does (generated).
resource: Makefile
tags: [reference, make, build]
generated:
  by: process:okf-gen
---

> Generated from source - do not edit; run `make okf-gen`. Playbook: [build system](/process/build-system.md).

**112 targets.**

| Target | Depends on | Description |
|---|---|---|
| `make agent-setup` | `vulcan-sync` | Write the gitignored agent adapters (CLAUDE.md, .claude/) with VULCAN. |
| `make all` | `build` | Rebuilds all packages (alias for 'build-all'). |
| `make atlas-releases` | - | Print the releases atlas computes from the git tags. |
| `make atlas-symbols` | - | Print the symbols atlas reads from the built .d.ts. |
| `make boot` | `helpers` | Rebuild one package, after its dependencies. |
| `make build` | `build-all` | Rebuilds all packages (alias for 'build-all'). |
| `make build-all` | `core core-worker boot docs surface-check wiki-links-check wiki-anchors-check` | Rebuilds all packages in order, then the wiki and its checks. |
| `make catalog-check` | - | Gate: every catalogued dep is referenced as "catalog:", none drifted. |
| `make changelogs-migrate` | - | Write a packages: list into every changelog that declares none. |
| `make clean` | - | Clean build artifacts from all packages. |
| `make clean-install` | - | Load every published sub-path from packed tarballs in an empty project. |
| `make clean-install-boot` | - | Load one package's sub-paths from a clean install. Needs a build. |
| `make clean-install-connectors` | - | Load one package's sub-paths from a clean install. Needs a build. |
| `make clean-install-core` | `clean-install-core-server` | Load one package's sub-paths from a clean install. Needs a build. |
| `make clean-install-core-server` | - | Load one package's sub-paths from a clean install. Needs a build. |
| `make clean-install-core-worker` | - | Load one package's sub-paths from a clean install. Needs a build. |
| `make clean-install-dev-configs` | - | Load one package's sub-paths from a clean install. Needs a build. |
| `make clean-install-filter` | - | Load one package's sub-paths from a clean install. Needs a build. |
| `make clean-install-helpers` | - | Load one package's sub-paths from a clean install. Needs a build. |
| `make clean-install-inversion` | - | Load one package's sub-paths from a clean install. Needs a build. |
| `make clean-install-kernel` | - | Load one package's sub-paths from a clean install. Needs a build. |
| `make connectors` | `kernel` | Rebuild one package, after its dependencies. |
| `make core` | `core-server` | Rebuild one package, after its dependencies. |
| `make core-server` | `connectors` | Rebuild one package, after its dependencies. |
| `make core-worker` | `kernel` | Rebuild one package, after its dependencies. |
| `make dev-configs` | - | Rebuild one package, after its dependencies. |
| `make docs` | - | Rebuilds wiki (VitePress) for GitHub Pages. |
| `make filter` | `inversion` | Rebuild one package, after its dependencies. |
| `make fmt` | `fmt-packages` | fmt-<pkg> for every package. |
| `make fmt-boot` | - | Apply oxlint --fix, ESLint --fix and oxfmt to one package. |
| `make fmt-connectors` | - | Apply oxlint --fix, ESLint --fix and oxfmt to one package. |
| `make fmt-core` | `fmt-core-server` | Apply oxlint --fix, ESLint --fix and oxfmt to one package. |
| `make fmt-core-server` | - | Apply oxlint --fix, ESLint --fix and oxfmt to one package. |
| `make fmt-core-worker` | - | Apply oxlint --fix, ESLint --fix and oxfmt to one package. |
| `make fmt-dev-configs` | - | Apply oxlint --fix, ESLint --fix and oxfmt to one package. |
| `make fmt-filter` | - | Apply oxlint --fix, ESLint --fix and oxfmt to one package. |
| `make fmt-helpers` | - | Apply oxlint --fix, ESLint --fix and oxfmt to one package. |
| `make fmt-inversion` | - | Apply oxlint --fix, ESLint --fix and oxfmt to one package. |
| `make fmt-kernel` | - | Apply oxlint --fix, ESLint --fix and oxfmt to one package. |
| `make fmt-packages` | `fmt-dev-configs fmt-inversion fmt-filter fmt-helpers fmt-boot fmt-kernel fmt-connectors fmt-core-worker fmt-core-server` | fmt-<pkg> for every package. |
| `make help` | - | Show this help message (a bare 'make' does the same). |
| `make helpers` | `inversion` | Rebuild one package, after its dependencies. |
| `make install` | - | Install all dependencies with bun. |
| `make inversion` | `dev-configs` | Rebuild one package, after its dependencies. |
| `make kernel` | `helpers filter` | Rebuild one package, after its dependencies. |
| `make knowledge-symbols-check` | - | Fail when a symbol a concept names is gone or its signature changed |
| `make lint` | `lint-packages` | lint-<pkg> for every package. |
| `make lint-all` | `lint-packages lint-scripts` | lint-packages and lint-scripts. |
| `make lint-boot` | - | oxlint + ESLint (naming-convention) + oxfmt check of one package. |
| `make lint-connectors` | - | oxlint + ESLint (naming-convention) + oxfmt check of one package. |
| `make lint-core` | `lint-core-server` | oxlint + ESLint (naming-convention) + oxfmt check of one package. |
| `make lint-core-server` | - | oxlint + ESLint (naming-convention) + oxfmt check of one package. |
| `make lint-core-worker` | - | oxlint + ESLint (naming-convention) + oxfmt check of one package. |
| `make lint-dev-configs` | - | oxlint + ESLint (naming-convention) + oxfmt check of one package. |
| `make lint-filter` | - | oxlint + ESLint (naming-convention) + oxfmt check of one package. |
| `make lint-helpers` | - | oxlint + ESLint (naming-convention) + oxfmt check of one package. |
| `make lint-inversion` | - | oxlint + ESLint (naming-convention) + oxfmt check of one package. |
| `make lint-kernel` | - | oxlint + ESLint (naming-convention) + oxfmt check of one package. |
| `make lint-packages` | `lint-dev-configs lint-inversion lint-filter lint-helpers lint-boot lint-kernel lint-connectors lint-core-worker lint-core-server` | lint-<pkg> for every package. |
| `make lint-scripts` | - | Format check + bun check type-check of scripts/. |
| `make lint-wiki` | - | Lint docs/wiki scripts and check its format. |
| `make okf-check` | - | Gate: OKF v0.2 conformance. |
| `make okf-check-strict` | - | Gate: OKF v0.2 plus the house rules - links, style, coverage, freshness. |
| `make okf-coverage` | - | Report bundle coverage against the source inventory. |
| `make okf-gen` | - | Regenerate source-derived reference content. |
| `make okf-viz` | - | Build the offline knowledge-graph explorer. |
| `make purity` | - | Gate: every entry claimed browser-pure has no node builtin or global. |
| `make purity-boot` | - | Gate: one package's browser-pure entries. Needs a build. |
| `make purity-connectors` | - | Gate: one package's browser-pure entries. Needs a build. |
| `make purity-core` | `purity-core-server` | Gate: one package's browser-pure entries. Needs a build. |
| `make purity-core-server` | - | Gate: one package's browser-pure entries. Needs a build. |
| `make purity-core-worker` | - | Gate: one package's browser-pure entries. Needs a build. |
| `make purity-dev-configs` | - | Gate: one package's browser-pure entries. Needs a build. |
| `make purity-filter` | - | Gate: one package's browser-pure entries. Needs a build. |
| `make purity-helpers` | - | Gate: one package's browser-pure entries. Needs a build. |
| `make purity-inversion` | - | Gate: one package's browser-pure entries. Needs a build. |
| `make purity-kernel` | - | Gate: one package's browser-pure entries. Needs a build. |
| `make purity-test` | - | Run the purity probe's own regression tests. |
| `make release` | - | Dispatch the release workflow per package, e.g. ARGS="kernel --mode patch". |
| `make release-plan` | - | Print the release plan (dependency order), dispatch nothing. |
| `make setup-hooks` | - | Configure git to use .githooks directory. |
| `make split-report` | - | Report hub files, stray types, missing barrels, long files, cycles (informational). |
| `make surface-check` | - | Gate: the public surface equals the snapshot. |
| `make surface-gen` | - | Snapshot every exported symbol into .agents/knowledge/reference/public-surface.md. |
| `make test-all` | `test-inversion test-helpers test-boot test-kernel test-connectors test-core-worker test-core-server` | test-<pkg> for every package with a suite (BUN_TEST_FLAGS, default --parallel). |
| `make test-boot` | - | Run one package's suite with BUN_TEST_FLAGS. Needs a build. |
| `make test-connectors` | - | Run one package's suite with BUN_TEST_FLAGS. Needs a build. |
| `make test-core` | `test-core-server` | Run one package's suite with BUN_TEST_FLAGS. Needs a build. |
| `make test-core-server` | - | Run one package's suite with BUN_TEST_FLAGS. Needs a build. |
| `make test-core-worker` | - | Run one package's suite with BUN_TEST_FLAGS. Needs a build. |
| `make test-dev-configs` | - | Run one package's suite with BUN_TEST_FLAGS. Needs a build. |
| `make test-filter` | - | Run one package's suite with BUN_TEST_FLAGS. Needs a build. |
| `make test-helpers` | - | Run one package's suite with BUN_TEST_FLAGS. Needs a build. |
| `make test-inversion` | - | Run one package's suite with BUN_TEST_FLAGS. Needs a build. |
| `make test-kernel` | - | Run one package's suite with BUN_TEST_FLAGS. Needs a build. |
| `make test-scripts` | - | Run the repository gate scripts' own regression tests. |
| `make update` | `install` | Force update all packages from NPM registry. |
| `make update-all` | `install` | Force update all packages from NPM registry. |
| `make update-boot` | - | Force update one package's dependencies from NPM. |
| `make update-connectors` | - | Force update one package's dependencies from NPM. |
| `make update-core` | `update-core-server` | Force update one package's dependencies from NPM. |
| `make update-core-server` | - | Force update one package's dependencies from NPM. |
| `make update-core-worker` | - | Force update one package's dependencies from NPM. |
| `make update-dev-configs` | - | Force update one package's dependencies from NPM. |
| `make update-filter` | - | Force update one package's dependencies from NPM. |
| `make update-helpers` | - | Force update one package's dependencies from NPM. |
| `make update-inversion` | - | Force update one package's dependencies from NPM. |
| `make update-kernel` | - | Force update one package's dependencies from NPM. |
| `make vulcan-doctor` | - | Gate: the project follows VULCAN (config, Makefile include, rules, adapters). |
| `make vulcan-sync` | - | Write the gitignored agent adapters (CLAUDE.md, .claude/) with VULCAN. |
| `make wiki-anchors-check` | - | Gate: every wiki '#fragment' link resolves. Needs a build (make docs). |
| `make wiki-links-check` | - | Gate: every source path the wiki and knowledge bundle name exists. |
