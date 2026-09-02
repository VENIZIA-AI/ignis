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
| [`boot`](/packages/boot.md) | `@venizia/ignis-boot` | Build-time artifact index generator for IGNIS applications: scans decorated classes with the TypeScript AST and emits one static registration file per package, so bun build --compile sees plain imports. |
| [`connectors`](/packages/connectors.md) | `@venizia/ignis-connectors` | Datasource and repository connectors for the IGNIS framework: the engine-neutral relational and search tiers, plus Postgres, SQLite, PGlite, Typesense and Meilisearch behind sub-paths. |
| [`core-server`](/packages/core-server.md) | `@venizia/ignis` | High-performance TypeScript server infrastructure combining LoopBack 4 enterprise architecture (decorator-based DI, repository pattern, component system) with Hono speed (~140k req/s). |
| [`core-worker`](/packages/core-worker.md) | `@venizia/ignis-worker` | Browser Web Worker host for the IGNIS framework: the request/response envelope, the transport contract, and WorkerApplication - the layer that listens on `onmessage` instead of a socket, so a RestApplication can serve its controllers with no server anywhere. |
| [`dev-configs`](/packages/dev-configs.md) | `@venizia/dev-configs` | Shareable development configurations for TypeScript projects: ESLint v9 flat config (with unicorn plugin), Prettier formatting, and TypeScript compiler options with critical decorator support (experimentalDecorators, emitDecoratorMetadata, useDefineForClassFields). |
| [`filter`](/packages/filter.md) | `@venizia/ignis-filter` | Engine-neutral query filter vocabulary for TypeScript: the `{ where, order, limit, offset, skip, fields, include }` shape, comparison/pattern/null/array/logical operators, and sort direction constants. |
| [`helpers`](/packages/helpers.md) | `@venizia/ignis-helpers` | Production-ready TypeScript utility library: pluggable logging (winston or pino behind one ILogger contract), Redis single/cluster/sentinel with pub/sub, BullMQ/MQTT/Kafka message queues, MinIO/Disk/Bun-S3 object storage, AES-256/RSA/ECDH cryptography, Snowflake UID generation, cron scheduling, Socket.IO/WebSocket, TCP/TLS/UDP networking, HTTP clients, secrets/Vault, worker thread pools, and environment management. |
| [`inversion`](/packages/inversion.md) | `@venizia/ignis-inversion` | Lightweight, high-performance Dependency Injection and Inversion of Control container for TypeScript (~350 lines). |
| [`kernel`](/packages/kernel.md) | `@venizia/ignis-kernel` | Browser-pure kernel of the IGNIS framework: dependency injection, lifecycle, REST controllers, repository and datasource abstractions, and the authentication and authorization seams. |
<!-- okf:generated:packages-table end -->

Packages build in a fixed dependency order - see [build system](/process/build-system.md):

```
dev-configs -> inversion -> {filter, helpers} -> {boot, kernel} -> core
```

`filter` is isomorphic and depends on `inversion` only - it deliberately does not sit after
`helpers`. `kernel` is the browser-pure tree and sits beside `boot`, not after it, so it never picks
up boot's node-only glob discovery.

## Other top-level directories

| Path | What it holds |
|---|---|
| `examples/` | Runnable apps exercising the framework - see [examples](/examples/vert.md) |
| `docs/wiki/` | The human-facing VitePress site and its MCP server. Not part of this bundle. |
| `.agents/knowledge/` | This bundle - the agent-facing source of truth |
| `.agents/knowledge-tools/` | Generator, gate, MCP server, and graph explorer for the bundle |
| `scripts/` | Repo-wide gates run from the Makefile - `check-catalog.ts` behind `make catalog-check`, and `purity/` (the browser-purity bundler probe) behind `make purity` |
| `.githooks/` | Repo-managed git hooks, enabled via `make setup-hooks` |

## Dependency versions are pinned by the root catalog

A dependency shared by two or more workspaces is pinned ONCE in the root `workspaces.catalog`, and
each workspace references it as `"dep": "catalog:"`. Bump the root entry and every workspace moves
together.

**The release pipeline MUST publish with `bun publish`.** Only bun resolves `catalog:` while packing;
`npm publish` ships it verbatim and the manifest is unresolvable for every consumer. Releases
0.1.1-9 / -6 / -4 broke exactly this way, before the pipeline was switched. Two gates protect it in
`.github/workflows/package-release.yml`: `make catalog-check`, and a packed-manifest check that
asserts the publisher is still bun and that the tarball carries no unresolved protocol.

Rules:

- **`dependencies` / `devDependencies` use `catalog:`** for any dep the catalog owns.
- **`peerDependencies` stay hand-authored.** They are compatibility statements for consumers and are
  deliberately looser than the install range - dev-configs declares peer `typescript ^5 || ^6` while
  installing the single range the catalog pins. `catalog-check` rejects `catalog:` in a peer range.
- **A dep used by one workspace keeps its own range** - the catalog does not own it.
- **The root has no `dependencies` block.** It once duplicated 34 entries and acted as an accidental
  version pin; the catalog replaces that intentionally.

To bump a shared dependency, change the catalog entry - nothing else needs editing.

## Source map

Per-package subsystem breakdown with file counts is generated: [source map](/reference/source-map.md).

## Related

- [What is IGNIS](/overview/what-is-ignis.md)
- [Build, run, test](/overview/build-run-test.md)
- [Design decisions](/overview/design-decisions.md)
