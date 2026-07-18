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

## Source map

Per-package subsystem breakdown with file counts is generated: [source map](/reference/source-map.md).

## Related

- [What is IGNIS](/overview/what-is-ignis.md)
- [Build, run, test](/overview/build-run-test.md)
- [Design decisions](/overview/design-decisions.md)
