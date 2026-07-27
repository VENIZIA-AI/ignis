---
title: Dependency Refresh & DI Cleanup
description: All dependencies bumped to latest (TypeScript held at 6); helpers drops unused dependencies; optional property injection is fixed and the inert @injectable decorator is removed.
---

# Changelog - 2026-07-18

## Dependency Refresh & DI Cleanup

<Badge type="info" text="Maintenance" /> <Badge type="warning" text="Breaking Change" /> <Badge type="info" text="Bug Fix" />

**In one line.** Every dependency moved to its latest version, except `typescript` (held at 6.0.3 - typescript-eslint has no TS7 support). Helpers also shed dependencies it never imported. Optional property injection now works, and the inert `@injectable` decorator is gone.

## Helpers dependency changes

- **`drizzle-orm` removed.** Zero imports in `packages/helpers/src` - the ORM belongs to the core package, which declares it itself.
- **`winston`, `winston-transport`, `winston-daily-rotate-file`, `hono` moved to OPTIONAL peers.** The winston trio pairs with single-provider loading ([Logger Overhaul](./2026-07-18-logger-overhaul)). `hono` is used only for a type-only `hono/jsx` re-export. An app relying on the winston default must install the trio itself.
- **Still hard dependencies** (each reachable at import time): `@venizia/ignis-inversion`, `dayjs`, `ioredis`, `lodash`, `reflect-metadata`.

## Notable version bumps

| Package | From | To |
|---|---|---|
| `@asteasolutions/zod-to-openapi` (core peer) | ^8.5.0 | ^9.0.0 |
| `eslint-plugin-unicorn` (dev-configs) | ^71.1.0 | ^72.0.0 |
| `casbin` | ^5.50.0 | ^5.51.1 |
| `bullmq` | ^5.80.1 | ^5.80.8 |
| `@hono/zod-openapi` | ^1.4.0 | ^1.5.1 |
| `@scalar/hono-api-reference` | ^0.11.9 | ^0.11.11 |
| `hono` | ^4.12.29 | ^4.12.30 |
| `typescript-eslint` | ^8.63.0 | ^8.64.0 |

Everything else moved by patch or minor. Builds, full test suites, and lint are green on the new set.

## Bug fix: optional property injection

`@inject({ key, isOptional: true })` on a **property** always threw when the binding was missing. The container read `metadata.optional`, while the decorator wrote `isOptional` - so the flag never arrived. It now yields `undefined`, matching optional constructor-parameter injection. The index signature on `IPropertyMetadata` that hid the typo from the compiler was removed.

Required property injection is unchanged: a missing binding still throws.

## Removed: the `@injectable` decorator

`@injectable` is gone from both `@venizia/ignis` and `@venizia/ignis-inversion`. It recorded `scope` and `tags` metadata that the container never read - `getInjectableMetadata` had no call sites anywhere. It configured nothing; it only looked like it did.

**Migration:** delete the decorator and its import. Nothing else changes; classes were never instantiated differently because of it. Binding scope is set where it always was - on the binding (`container.bind({ key }).toClass(X)` with a scope), not on the class.

Also removed: `IInjectableMetadata`, `MetadataRegistry.setInjectableMetadata` / `getInjectableMetadata`, and `MetadataKeys.INJECTABLE`.

## Who is affected

- **Apps relying on the winston logger default**: `bun add winston winston-transport winston-daily-rotate-file`.
- **Apps consuming `@venizia/ignis`**: the `@asteasolutions/zod-to-openapi` peer range now accepts v9 - update if you pin v8.
- **Anyone who tried optional property injection** and worked around the throw: the workaround can go.
- **Anyone with `@injectable` in their code**: delete the decorator and its import - see above.
- Everyone else: nothing to do.
