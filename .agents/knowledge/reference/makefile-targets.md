---
type: Reference
title: Makefile targets
description: Every make target, its prerequisites, and what it does (generated).
resource: Makefile
tags: [reference, make, build]
---

> Generated from source - do not edit; run `make okf-gen`. Playbook: [build system](/process/build-system.md).

**61 targets.**

| Target | Depends on | Description |
|---|---|---|
| `make all` | `build` | - |
| `make install` | - | Installing dependencies (with force-update via postinstall) |
| `make clean` | - | Cleaning all packages |
| `make setup-hooks` | - | Setting up git hooks |
| `make okf-check` | - | - |
| `make okf-gen` | - | - |
| `make okf-coverage` | - | - |
| `make okf-viz` | - | - |
| `make agent-setup` | - | - |
| `make catalog-check` | - | - |
| `make release-plan` | - | - |
| `make release` | - | - |
| `make build` | `build-all` | - |
| `make build-all` | `core core-worker docs docs-mcp` | All packages rebuilt successfully. |
| `make dev-configs` | - | Rebuilding @venizia/dev-configs |
| `make inversion` | `dev-configs` | Rebuilding @venizia/ignis-inversion |
| `make filter` | `inversion` | Rebuilding @venizia/ignis-filter |
| `make helpers` | `inversion` | Rebuilding @venizia/ignis-helpers |
| `make boot` | `helpers` | Rebuilding @venizia/ignis-boot |
| `make kernel` | `helpers filter` | Rebuilding @venizia/ignis-kernel |
| `make connectors` | `kernel` | Rebuilding @venizia/ignis-connectors |
| `make core-worker` | `kernel` | Rebuilding @venizia/ignis-worker |
| `make core-server` | `boot connectors` | Rebuilding @venizia/ignis (core-server) |
| `make core` | `core-server` | - |
| `make docs` | - | Rebuilding wiki (VitePress) |
| `make docs-mcp` | `dev-configs` | Rebuilding @venizia/ignis-docs (MCP Server) |
| `make update` | `install` | - |
| `make update-all` | `install` | - |
| `make update-core-server` | - | Force updating @venizia/ignis (core-server) |
| `make update-core` | `update-core-server` | - |
| `make update-dev-configs` | - | Force updating @venizia/dev-configs |
| `make update-docs-mcp` | - | Force updating @venizia/ignis-docs (MCP Server) |
| `make update-helpers` | - | Force updating @venizia/ignis-helpers |
| `make update-inversion` | - | Force updating @venizia/ignis-inversion |
| `make update-filter` | - | Force updating @venizia/ignis-filter |
| `make update-boot` | - | Force updating @venizia/ignis-boot |
| `make update-kernel` | - | Force updating @venizia/ignis-kernel |
| `make lint` | `lint-packages` | Linting completed. |
| `make lint-all` | `lint-packages lint-examples lint-docs-mcp` | All linting completed. |
| `make lint-packages` | - | Linting all packages |
| `make lint-examples` | - | Linting all examples |
| `make lint-dev-configs` | - | Linting @venizia/dev-configs |
| `make lint-inversion` | - | Linting @venizia/ignis-inversion |
| `make lint-filter` | - | Linting @venizia/ignis-filter |
| `make lint-helpers` | - | Linting @venizia/ignis-helpers |
| `make lint-boot` | - | Linting @venizia/ignis-boot |
| `make lint-core-server` | - | Linting @venizia/ignis (core-server) |
| `make lint-core` | `lint-core-server` | - |
| `make lint-kernel` | - | Linting @venizia/ignis-kernel |
| `make lint-connectors` | - | Linting @venizia/ignis-connectors |
| `make lint-core-worker` | - | Linting @venizia/ignis-worker |
| `make lint-docs-mcp` | - | Linting @venizia/ignis-docs (MCP Server) |
| `make purity` | - | Checking browser purity for all claimed entries |
| `make purity-test` | - | Running the purity probe's regression tests |
| `make purity-inversion` | - | Checking browser purity for @venizia/ignis-inversion |
| `make purity-filter` | - | Checking browser purity for @venizia/ignis-filter |
| `make purity-helpers` | - | Checking browser purity for @venizia/ignis-helpers |
| `make purity-kernel` | - | Checking browser purity for @venizia/ignis-kernel |
| `make purity-connectors` | - | Checking browser purity for @venizia/ignis-connectors |
| `make purity-core-worker` | - | Checking browser purity for @venizia/ignis-worker |
| `make help` | - | Makefile for the @venizia/lib Monorepo |
