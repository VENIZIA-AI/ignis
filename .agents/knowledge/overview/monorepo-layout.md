---
type: Overview
title: Monorepo layout
description: What lives where in the IGNIS repository - packages, examples, docs, and the knowledge bundle.
resource: .
tags: [overview, monorepo, layout, packages]
---

IGNIS is a Bun workspace monorepo. Everything published lives under `packages/`; everything that
demonstrates the framework lives under `examples/`. `presets/` holds the VULCAN preset templates
(`presets/app` for an API, `presets/lib` for a shared library); a preset is app source linted inside the generated app, so no repo lint target reaches it.

## Packages

The table below is generated from each package manifest. It deliberately carries no version column:
versions churn on every release and would make the bundle stale for no gain.

<!-- okf:generated:packages-table start -->
| Package | npm name | Description |
|---|---|---|
| [`boot`](/packages/boot.md) | `@venizia/ignis-boot` | Build-time artifact index generator for IGNIS applications: scans decorated classes with the TypeScript AST and emits one static registration file per package, so bun build --compile sees plain imports. |
| [`connectors`](/packages/connectors.md) | `@venizia/ignis-connectors` | Datasource and repository connectors for the IGNIS framework: the engine-neutral relational and search tiers, plus Postgres, SQLite, PGlite, Typesense and Meilisearch behind sub-paths. |
| [`core-server`](/packages/core-server.md) | `@venizia/ignis` | TypeScript server framework with decorator-based DI, the repository pattern and a component system, on Hono. |
| [`core-worker`](/packages/core-worker.md) | `@venizia/ignis-worker` | Browser Web Worker host for the IGNIS framework: the request/response envelope, the transport contract, and WorkerApplication - the layer that listens on `onmessage` instead of a socket, so a RestApplication can serve its controllers with no server anywhere. |
| [`dev-configs`](/packages/dev-configs.md) | `@venizia/dev-configs` | Shareable development configurations for TypeScript projects: oxlint presets with per-rule builders, the ESLint naming-convention rule, the legacy ESLint flat config, and TypeScript compiler options with critical decorator support (experimentalDecorators, emitDecoratorMetadata, useDefineForClassFields). |
| [`filter`](/packages/filter.md) | `@venizia/ignis-filter` | Engine-neutral query filter vocabulary for TypeScript: the `{ where, order, limit, offset, skip, fields, include }` shape, comparison/pattern/null/array/logical operators, and sort direction constants. |
| [`helpers`](/packages/helpers.md) | `@venizia/ignis-helpers` | Production-ready TypeScript utility library: pluggable logging (winston or pino behind one ILogger contract), Redis single/cluster/sentinel with pub/sub, BullMQ/MQTT/Kafka message queues, MinIO/Disk/Bun-S3 object storage, AES-256/RSA/ECDH cryptography, Snowflake UID generation, cron scheduling, Socket.IO/WebSocket, TCP/TLS/UDP networking, HTTP clients, secrets/Vault, worker thread pools, and environment management. |
| [`inversion`](/packages/inversion.md) | `@venizia/ignis-inversion` | A small, standalone Dependency Injection and Inversion of Control container for TypeScript. |
| [`kernel`](/packages/kernel.md) | `@venizia/ignis-kernel` | Browser-pure kernel of the IGNIS framework: dependency injection, lifecycle, REST controllers, repository and datasource abstractions, and the authentication and authorization seams. |
<!-- okf:generated:packages-table end -->

Packages build in a fixed dependency order - see [build system](/process/build-system.md):

```
dev-configs -> inversion -> {filter, helpers} -> kernel -> connectors -> core
                                      helpers -> boot            (applications only)
                                       kernel -> core-worker     (applications only)
```

`filter` is isomorphic and depends on `inversion` only - it deliberately does not sit after
`helpers`. `kernel` is the browser-pure tree; `boot` and `core-worker` are leaves no
framework package depends on - `core-worker` hangs off `kernel` beside `connectors`, never off
`core`.

## Other top-level directories

| Path | What it holds |
|---|---|
| `examples/` | Runnable apps exercising the framework - see [examples](/examples/vert.md) |
| `docs/wiki/` | The human-facing VitePress site. Not part of this bundle. |
| `.agents/knowledge/` | This bundle - the agent-facing source of truth |
| `.configs/vulcan.config.mts` | The VULCAN config: the `V-W-01` slot, project hooks, the knowledge roots and `atlas.packages`. `vulcan sync` writes `.mcp.json` per machine (kept out of git); it runs VULCAN's atlas over this repo |
| `make/` | The root Makefile's pieces (`build`, `lint`, `test`, `release`, `knowledge`, `help`) and `project.mk`, which every package includes |
| `.agents/okf/` | IGNIS's okf renderer modules (the components and helpers catalogs). The docs skill is VULCAN's shipped `docs-update`, which applies the D rules in `.agents/rules.md`. The knowledge tooling (`vulcan x okf`), atlas (`vulcan x atlas`) and agent setup (`vulcan sync`) live in VULCAN, consumed as `@venizia/vulcan` from npm; its make targets come from `node_modules/@venizia/vulcan/base/make/vulcan.mk`. |
| `scripts/` | Grouped by job: `release/` (`release.ts`, `release-args.ts`, `sync-next-tag.ts`), `preset/` (`vulcan-preset.ts`, `preset-smoke.ts`), `checks/` (`purity/` for `make purity` (the claims only; the engine, the catalog check, `module-cycles` and `split-report` are `devz check` commands of `@venizia/dev-configs`), `clean-install/` for `make clean-install`), `build/` (`esm-marker.ts`, `force-update.sh`, `build-checks/` for `make build-checks`), The wiki link and anchor gates (`make wiki-links-check`, `make wiki-anchors-check`) are VULCAN's, set up in the Makefile; the anchor gate reads the built html, so it needs `make docs` first. Nothing runs the gate tests except `make test-scripts` (the four test directories `release`, `preset`, `checks` and `build`, each with its `__tests__/`), `make purity-test` (`checks/purity/__tests__`) and `make build-checks` (`build/build-checks`). |
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
