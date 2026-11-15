---
title: A search controller must say how it authenticates
description: "SearchControllerFactory.build requires authenticate: a route is open only by writing { skip: true }, never by leaving the option out."
packages: ['@venizia/ignis-connectors']
migration:
  - id: search-authenticate-is-required
    symbols: [SearchControllerFactory.build, ISearchControllerOptions]
    upgrade:
      before: |
        SearchControllerFactory.build({
          repository: ProductSearchRepository,
          routes: { search: { use: true } },
        });
      after: |
        // JWT callers only
        SearchControllerFactory.build({
          repository: ProductSearchRepository,
          routes: { search: { use: true } },
          authenticate: { strategies: [Authentication.STRATEGY_JWT] },
        });

        // or open the routes on purpose
        SearchControllerFactory.build({
          repository: ProductSearchRepository,
          routes: { search: { use: true } },
          authenticate: { skip: true },
        });
    downgrade:
      steps:
        - "Remove authenticate: { skip: true } where you want the routes open (the older build leaves them open when authenticate is missing). Keep a strategies list as it is."
---

# Changelog - 2026-11-15

## A search controller must say how it authenticates

<Badge type="warning" text="Breaking Change" />

**In one line.** A search route is never open by omission: `authenticate` is required, and opening a route means writing `{ skip: true }`.

## What changed

- **`authenticate` is required.** `{ strategies: [Authentication.STRATEGY_JWT] }` admits a JWT caller only. `{ skip: true }` serves the routes without authentication, as `TRouteAuthConfig` does for any other route.
- **An empty config is refused.** `{}` and `{ strategies: [] }` throw when the controller is built, because they would leave the routes open without saying so.
- **Why.** A controller built without `authenticate` served every caller. A forgotten option was an open search route.

## Who is affected

- **Apps that build a search controller without `authenticate`.** The compiler names each call. Add `authenticate: { strategies: [Authentication.STRATEGY_JWT] }`, or `{ skip: true }` if the route is meant to be public.
- **Apps that already set `strategies`.** No action needed.

## Breaking changes

> [!WARNING]
> A `SearchControllerFactory.build` call without `authenticate` no longer type-checks, and a config that names no strategy and no `skip` throws.

**Before:**

```typescript
SearchControllerFactory.build({
  repository: ProductSearchRepository,
  routes: { search: { use: true } },
});
```

**After:**

```typescript
SearchControllerFactory.build({
  repository: ProductSearchRepository,
  routes: { search: { use: true } },
  authenticate: { strategies: [Authentication.STRATEGY_JWT] },
});
```
