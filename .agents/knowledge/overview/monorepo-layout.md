---
type: Overview
title: Monorepo layout
description: What lives where in the IGNIS repository - packages, examples, docs, and the knowledge bundle.
resource: .
tags: [overview, monorepo, layout, packages]
---

IGNIS is a Bun workspace monorepo. Everything published lives under `packages/`; everything that
demonstrates the framework lives under `examples/`.

## Packages

The table below is generated from each package manifest. It deliberately carries no version column:
versions churn on every release and would make the bundle stale for no gain.

<!-- okf:generated:packages-table start -->
| Package | npm name | Description |
|---|---|---|
| [`boot`](/packages/boot.md) | `@venizia/ignis-boot` | Convention-based auto-discovery and bootstrapping system for TypeScript applications. |
| [`core`](/packages/core.md) | `@venizia/ignis` | High-performance TypeScript server infrastructure combining LoopBack 4 enterprise architecture (decorator-based DI, repository pattern, component system) with Hono speed (~140k req/s). |
| [`dev-configs`](/packages/dev-configs.md) | `@venizia/dev-configs` | Shareable development configurations for TypeScript projects: ESLint v9 flat config (with unicorn plugin), Prettier formatting, and TypeScript compiler options with critical decorator support (experimentalDecorators, emitDecoratorMetadata, useDefineForClassFields). |
| [`helpers`](/packages/helpers.md) | `@venizia/ignis-helpers` | Production-ready TypeScript utility library: pluggable logging (winston or pino behind one ILogger contract), Redis single/cluster/sentinel with pub/sub, BullMQ/MQTT/Kafka message queues, MinIO/Disk/Bun-S3 object storage, AES-256/RSA/ECDH cryptography, Snowflake UID generation, cron scheduling, Socket.IO/WebSocket, TCP/TLS/UDP networking, HTTP clients, secrets/Vault, worker thread pools, and environment management. |
| [`inversion`](/packages/inversion.md) | `@venizia/ignis-inversion` | Lightweight, high-performance Dependency Injection and Inversion of Control container for TypeScript (~350 lines). |
<!-- okf:generated:packages-table end -->

Packages build in a fixed dependency order - see [build system](/process/build-system.md):

```
dev-configs -> inversion -> helpers -> boot -> core
```

## Other top-level directories

| Path | What it holds |
|---|---|
| `examples/` | Runnable apps exercising the framework - see [examples](/examples/vert.md) |
| `docs/wiki/` | The human-facing VitePress site and its MCP server. Not part of this bundle. |
| `.agents/knowledge/` | This bundle - the agent-facing source of truth |
| `.agents/knowledge-tools/` | Generator, gate, MCP server, and graph explorer for the bundle |
| `.githooks/` | Repo-managed git hooks, enabled via `make setup-hooks` |

## Dependency versions live in the root catalog

A dependency shared by two or more workspaces is pinned ONCE in the root `workspaces.catalog`, and
each workspace references it as `"dep": "catalog:"`. Bump the root entry and every workspace moves
together; drift becomes impossible rather than merely discouraged.

Rules:

- **`dependencies` / `devDependencies` use `catalog:`** for any dep the catalog owns.
- **`peerDependencies` stay hand-authored.** They are compatibility statements for consumers and are
  deliberately looser than the install range - core declares peer `pg ^8.21.0` while installing
  `^8.22.0`, and dev-configs declares peer `typescript ^5 || ^6` while installing `^6.0.3`.
  Cataloguing a peer would silently narrow what a consumer may use.
- **A dep used by one workspace keeps its literal range** - a catalog entry buys nothing.
- **The root has no `dependencies` block.** It once duplicated 34 entries and acted as an accidental
  version pin; the catalog replaces that intentionally.

`bun pm pack` substitutes the real range at publish time, so a consumer of `@venizia/ignis` never
sees the `catalog:` protocol. `make catalog-check` gates it: a catalogued dep declared with a literal
range, or a catalog entry nobody references, fails.

## Source map

Per-package subsystem breakdown with file counts is generated: [source map](/reference/source-map.md).

## Related

- [What is IGNIS](/overview/what-is-ignis.md)
- [Build, run, test](/overview/build-run-test.md)
- [Design decisions](/overview/design-decisions.md)
