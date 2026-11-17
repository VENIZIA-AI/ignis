---
title: Raw search mode and multi-search are closed by default on search controllers
description: "A generated search controller answers 400 to mode raw and to multi-search unless the controller sets modes.raw.allow. Server code keeps both on the repository."
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-07

## Raw search mode and multi-search are closed by default on search controllers

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" />

**In one line.** `mode: 'raw'` and multi-search hand the engine their parameters as they are, without the model's default filter or its hidden-field handling. A search controller serves them only when it opts in.

## What changed

- **Closed by default.** A request with `mode: 'raw'`, and any request to the multi-search route, answers `400` on every generated search controller, and the engine is not reached.
- **Opt in with `modes.raw.allow: true`** in `defineSearchController`. The controller then serves both as before. Only a literal `true` opens it.
- **A scoped controller cannot opt in.** `defineSearchController` throws when `scope` and `modes.raw.allow` are both set. A scoped controller already refused `mode: 'raw'`.
- **Server code is unchanged.** `repository.search({ mode: 'raw' })` and `dataSource.multiSearch()` work as before.
- **Unchanged.** The keyword, semantic and hybrid modes, and the `engineParams` rule of the same release.

## Who is affected

- **Clients that send `mode: 'raw'` or call `/multi-search` on a search controller.** They get `400`. If the route is meant for trusted callers only, set `modes.raw.allow: true` on that controller; the guide explains what opting in exposes.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> `POST /search` with `mode: 'raw'` and `POST /multi-search` answer `400` unless the controller opts in.

**After:**

```typescript
SearchControllerFactory.defineSearchController({
  entity: ProductDocument,
  repository: { name: ProductSearchRepository.name },
  controller: { name: 'ProductSearchController', basePath: '/products' },
  modes: { raw: { allow: true } },
});
```

## Details

| File | Package |
|------|---------|
| `src/search/core/controllers/raw-access.ts` | connectors |
| `src/search/core/controllers/abstract.ts` | connectors |
| `src/search/core/controllers/factory.ts` | connectors |
