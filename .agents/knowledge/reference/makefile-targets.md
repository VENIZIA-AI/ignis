---
type: Reference
title: Makefile targets
description: Every make target, its prerequisites, and what it does (generated).
resource: Makefile
tags: [reference, make, build]
---

> Generated from source - do not edit; run `make okf-gen`. Playbook: [build system](/process/build-system.md).

**46 targets.**

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
| `make build` | `build-all` | - |
| `make build-all` | `core docs docs-mcp` | All packages rebuilt successfully. |
| `make dev-configs` | - | Rebuilding @venizia/dev-configs |
| `make inversion` | `dev-configs` | Rebuilding @venizia/ignis-inversion |
| `make filter` | `inversion` | Rebuilding @venizia/ignis-filter |
| `make helpers` | `inversion` | Rebuilding @venizia/ignis-helpers |
| `make boot` | `helpers` | Rebuilding @venizia/ignis-boot |
| `make core` | `boot filter` | Rebuilding @venizia/ignis (core) |
| `make docs` | - | Rebuilding wiki (VitePress) |
| `make docs-mcp` | `dev-configs` | Rebuilding @venizia/ignis-docs (MCP Server) |
| `make update` | `install` | - |
| `make update-all` | `install` | - |
| `make update-core` | - | Force updating @venizia/ignis (core) |
| `make update-dev-configs` | - | Force updating @venizia/dev-configs |
| `make update-docs-mcp` | - | Force updating @venizia/ignis-docs (MCP Server) |
| `make update-helpers` | - | Force updating @venizia/ignis-helpers |
| `make update-inversion` | - | Force updating @venizia/ignis-inversion |
| `make update-filter` | - | Force updating @venizia/ignis-filter |
| `make update-boot` | - | Force updating @venizia/ignis-boot |
| `make purity` | `purity-inversion purity-filter purity-helpers purity-core` | Browser purity gates passed. |
| `make purity-inversion` | - | Browser purity: @venizia/ignis-inversion |
| `make purity-filter` | `inversion` | Browser purity: @venizia/ignis-filter |
| `make purity-helpers` | `inversion` | Browser purity: @venizia/ignis-helpers (BaseHelper path) |
| `make purity-core` | `core` | Browser purity: @venizia/ignis (core repositories path) |
| `make lint` | `lint-packages` | Linting completed. |
| `make lint-all` | `lint-packages lint-examples` | All linting completed. |
| `make lint-packages` | - | Linting all packages |
| `make lint-examples` | - | Linting all examples |
| `make lint-dev-configs` | - | Linting @venizia/dev-configs |
| `make lint-inversion` | - | Linting @venizia/ignis-inversion |
| `make lint-filter` | - | Linting @venizia/ignis-filter |
| `make lint-helpers` | - | Linting @venizia/ignis-helpers |
| `make lint-boot` | - | Linting @venizia/ignis-boot |
| `make lint-core` | - | Linting @venizia/ignis (core) |
| `make lint-docs-mcp` | - | Linting @venizia/ignis-docs (MCP Server) |
| `make help` | - | Makefile for the @venizia/lib Monorepo |
