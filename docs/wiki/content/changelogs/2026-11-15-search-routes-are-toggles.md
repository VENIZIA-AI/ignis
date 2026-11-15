---
title: "Search controller routes are switched on with { use: true }"
description: "routes.search and routes.multiSearch take { use: true } like every other toggle, so a route has an explicit off state."
packages: ['@venizia/ignis-connectors']
migration:
  - id: search-routes-are-toggles
    symbols: [SearchControllerFactory.build, ISearchRoutes]
    upgrade:
      before: |
        SearchControllerFactory.build({
          repository: ProductSearchRepository,
          authenticate: { skip: true },
          routes: { search: true, multiSearch: true },
        });
      after: |
        SearchControllerFactory.build({
          repository: ProductSearchRepository,
          authenticate: { skip: true },
          routes: { search: { use: true }, multiSearch: { use: true } },
        });
    downgrade:
      steps:
        - "Write routes: { search: true } again; a route that is not listed is not served."
---

# Changelog - 2026-11-15

## Search controller routes are switched on with { use: true }

<Badge type="warning" text="Breaking Change" />

**In one line.** A search route is `{ use: true }` or `{ use: false }`, the same shape as every other switch in IGNIS, instead of a bare `true`.

## What changed

- **`routes.search` and `routes.multiSearch` take a toggle.** `{ use: true }` serves the route. `{ use: false }`, or leaving the key out, does not.
- **The toggle type is shared.** `TToggle` and `ToggleUtility` now live in `@venizia/ignis-kernel`. The static-asset component re-exports them under its old names, so its API is unchanged.
- **No alias.** `routes: { search: true }` fails to type-check.

## Who is affected

- **Apps that call `SearchControllerFactory.build`.** Wrap each listed route in `{ use: true }`. The typecheck names every call.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> A route value of `true` no longer type-checks. Write `{ use: true }`.

**Before:**

```typescript
SearchControllerFactory.build({
  repository: ProductSearchRepository,
  authenticate: { skip: true },
  routes: { search: true, multiSearch: true },
});
```

**After:**

```typescript
SearchControllerFactory.build({
  repository: ProductSearchRepository,
  authenticate: { skip: true },
  routes: { search: { use: true }, multiSearch: { use: true } },
});
```
