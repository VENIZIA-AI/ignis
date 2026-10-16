---
type: Reference
title: Makefile targets
description: Every make target, its prerequisites, and what it does (generated).
resource: Makefile
tags: [reference, make, build]
---

> Generated from source - do not edit; run `make okf-gen`. Playbook: [build system](/process/build-system.md).

**75 targets.**

| Target | Depends on | Description |
|---|---|---|
| `make all` | `build` | - |
| `make install` | - | Installing dependencies (with force-update via postinstall) |
| `make clean` | - | Cleaning all packages |
| `make setup-hooks` | - | Setting up git hooks |
| `make build` | `build-all` | - |
| `make build-all` | `core core-worker boot atlas docs surface-check symbols-check wiki-links-check wiki-anchors-check` | All packages rebuilt successfully. |
| `make dev-configs` | - | Rebuilding @venizia/dev-configs |
| `make inversion` | `dev-configs` | Rebuilding @venizia/ignis-inversion |
| `make filter` | `inversion` | Rebuilding @venizia/ignis-filter |
| `make helpers` | `inversion` | Rebuilding @venizia/ignis-helpers |
| `make boot` | `helpers` | Rebuilding @venizia/ignis-boot |
| `make atlas` | `helpers` | Rebuilding @venizia/ignis-atlas |
| `make kernel` | `helpers filter` | Rebuilding @venizia/ignis-kernel |
| `make connectors` | `kernel` | Rebuilding @venizia/ignis-connectors |
| `make core-worker` | `kernel` | Rebuilding @venizia/ignis-worker |
| `make core-server` | `connectors` | Rebuilding @venizia/ignis (core-server) |
| `make core` | `core-server` | - |
| `make docs` | - | Rebuilding wiki (VitePress) |
| `make update` | `install` | - |
| `make update-all` | `install` | - |
| `make update-core-server` | - | Force updating @venizia/ignis (core-server) |
| `make update-core` | `update-core-server` | - |
| `make update-dev-configs` | - | Force updating @venizia/dev-configs |
| `make update-atlas` | - | Force updating @venizia/ignis-atlas |
| `make update-helpers` | - | Force updating @venizia/ignis-helpers |
| `make update-inversion` | - | Force updating @venizia/ignis-inversion |
| `make update-filter` | - | Force updating @venizia/ignis-filter |
| `make update-boot` | - | Force updating @venizia/ignis-boot |
| `make update-kernel` | - | Force updating @venizia/ignis-kernel |
| `make okf-check` | - | - |
| `make okf-gen` | - | - |
| `make okf-coverage` | - | - |
| `make okf-viz` | - | - |
| `make split-report` | - | - |
| `make surface-gen` | - | - |
| `make surface-check` | - | - |
| `make symbols-gen` | - | - |
| `make symbols-check` | - | - |
| `make releases-gen` | - | - |
| `make releases-check` | - | - |
| `make wiki-links-check` | - | - |
| `make wiki-anchors-check` | - | - |
| `make agent-setup` | - | - |
| `make catalog-check` | - | - |
| `make release-plan` | - | - |
| `make release` | - | - |
| `make lint` | `lint-packages` | Linting completed. |
| `make lint-all` | `lint-packages lint-scripts` | All linting completed. |
| `make lint-packages` | `$(LINT_PKG_TARGETS)` | - |
| `make fmt` | `fmt-packages` | - |
| `make fmt-packages` | `$(FMT_PKG_TARGETS)` | - |
| `make lint-core` | `lint-core-server` | - |
| `make lint-wiki` | - | Linting docs/wiki |
| `make lint-scripts` | - | Linting scripts/ |
| `make test-all` | `test-inversion test-helpers test-boot test-kernel test-connectors test-core-worker test-core-server test-atlas` | - |
| `make test-inversion` | - | - |
| `make test-helpers` | - | - |
| `make test-boot` | - | - |
| `make test-kernel` | - | - |
| `make test-connectors` | - | - |
| `make test-core-worker` | - | - |
| `make test-core-server` | - | - |
| `make test-atlas` | - | - |
| `make test-scripts` | - | Running the repository gate scripts' regression tests |
| `make purity` | - | Checking browser purity for all claimed entries |
| `make purity-test` | - | Running the purity probe's regression tests |
| `make purity-inversion` | - | Checking browser purity for @venizia/ignis-inversion |
| `make purity-filter` | - | Checking browser purity for @venizia/ignis-filter |
| `make purity-helpers` | - | Checking browser purity for @venizia/ignis-helpers |
| `make purity-kernel` | - | Checking browser purity for @venizia/ignis-kernel |
| `make purity-connectors` | - | Checking browser purity for @venizia/ignis-connectors |
| `make purity-core-worker` | - | Checking browser purity for @venizia/ignis-worker |
| `make clean-install` | - | Loading every published sub-path from a clean install |
| `make clean-install-core` | - | ️  No runtime sub-path to load for this package - skipping. |
| `make help` | - | Makefile for the @venizia/lib Monorepo |
