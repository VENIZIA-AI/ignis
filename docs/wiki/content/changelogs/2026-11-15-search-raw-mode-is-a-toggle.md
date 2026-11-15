---
title: "Raw search mode is switched on with modes.raw { use: true }"
description: "modes.raw takes { use: true } instead of { allow: true }, the same toggle shape as routes."
packages: ['@venizia/ignis-connectors']
migration:
  - id: search-modes-raw-is-a-toggle
    symbols: [SearchControllerFactory.build, ISearchControllerOptions]
    upgrade:
      before: |
        SearchControllerFactory.build({
          repository: ProductSearchRepository,
          authenticate: { skip: true },
          routes: { search: { use: true } },
          modes: { raw: { allow: true } },
        });
      after: |
        SearchControllerFactory.build({
          repository: ProductSearchRepository,
          authenticate: { skip: true },
          routes: { search: { use: true } },
          modes: { raw: { use: true } },
        });
    downgrade:
      steps:
        - "Write modes: { raw: { allow: true } } again."
---

# Changelog - 2026-11-15

## Raw search mode is switched on with modes.raw { use: true }

<Badge type="warning" text="Breaking Change" />

**In one line.** `modes.raw` is a toggle like `routes`: `{ use: true }` serves `mode: 'raw'` and multi-search over HTTP.

## What changed

- **`modes.raw.allow` is now `modes.raw.use`.** The meaning is the same: raw mode and multi-search answer `400` until a controller opts in, and a scoped controller cannot opt in.
- **No alias.** `{ allow: true }` fails to type-check.

## Who is affected

- **Apps that opened raw mode.** Rename `allow` to `use`. The typecheck names each call.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> `modes: { raw: { allow: true } }` no longer type-checks.

**Before:**

```typescript
SearchControllerFactory.build({
  repository: ProductSearchRepository,
  authenticate: { skip: true },
  routes: { search: { use: true } },
  modes: { raw: { allow: true } },
});
```

**After:**

```typescript
SearchControllerFactory.build({
  repository: ProductSearchRepository,
  authenticate: { skip: true },
  routes: { search: { use: true } },
  modes: { raw: { use: true } },
});
```

See [Raw mode and multi-search over HTTP](/guides/core-concepts/persistent/search-typesense#raw-mode-and-multi-search-over-http).
