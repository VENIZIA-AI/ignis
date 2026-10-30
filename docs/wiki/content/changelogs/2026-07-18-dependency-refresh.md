---
title: Dependency Refresh & DI Cleanup
description: Dependencies are bumped (TypeScript held at 6), helpers drops unused dependencies, optional property injection works, and the inert @injectable decorator is removed.
packages: ['@venizia/ignis', '@venizia/ignis-inversion']
---

# Changelog - 2026-07-18

## Dependency Refresh & DI Cleanup

<Badge type="info" text="Maintenance" /> <Badge type="warning" text="Breaking Change" /> <Badge type="info" text="Bug Fix" />

**In one line.** Optional property injection now works, the `@injectable` decorator that did nothing is removed, and helpers installs fewer dependencies.

## What changed

- **Optional property injection fixed.** `@inject({ key, isOptional: true })` on a property always threw when the binding was missing, because the container read `metadata.optional` while the decorator wrote `isOptional`. It now yields `undefined`, like optional constructor parameters. Required property injection is unchanged: a missing binding still throws.
- **`@injectable` removed** from `@venizia/ignis` and `@venizia/ignis-inversion`. It recorded `scope` and `tags` metadata the container never read. Also removed: `IInjectableMetadata`, `MetadataRegistry.setInjectableMetadata` and `getInjectableMetadata`, and `MetadataKeys.INJECTABLE`.
- **Helpers dependencies.** `drizzle-orm` is removed (the core package declares it itself). `winston`, `winston-transport`, `winston-daily-rotate-file` and `hono` are now optional peers. See [Logger Overhaul](./2026-07-18-logger-overhaul).
- **Version bumps.** Every dependency moved to its latest version except `typescript`, held at 6.0.3 because typescript-eslint has no TS7 support. The `@asteasolutions/zod-to-openapi` peer range of `@venizia/ignis` is now `^9.0.0` (was `^8.5.0`).

## Who is affected

- **Apps relying on the winston logger default.** Run `bun add winston winston-transport winston-daily-rotate-file`.
- **Apps that pin `@asteasolutions/zod-to-openapi` v8.** The peer range now accepts v9; update your pin.
- **Apps that worked around the optional property injection throw.** The workaround can go.
- **Apps using `@injectable`.** Delete the decorator and its import. Nothing else changes: binding scope is set on the binding (`container.bind({ key }).toClass(X)`), not on the class.
- **Everyone else.** Nothing to do.
