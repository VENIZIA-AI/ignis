---
title: A Search Controller Can Be Scoped Per Request
description: "SearchControllerFactory.defineSearchController takes a scope option: a function of the request context returning a filter that the server ANDs into every search. The client cannot widen or remove it."
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-10-25

## A search controller can be scoped per request

<Badge type="tip" text="New Feature" />

**In one line.** `defineSearchController({ scope })` adds a server-side filter to every search on the generated `/search` route, so an application no longer hand-writes the route to apply a merchant scope or sharing rules.

## What changed

- **A new `scope` option.** It receives the request context and returns a `where`, `ScopeFilters.UNRESTRICTED` (no scope for this call), or `null`/`undefined`.
- **The scope is ANDed into `input.filter.where` on the server**, in `keyword`, `semantic` and `hybrid` modes. The client's own `where` sits inside the AND: it can narrow the scope and never widen or remove it.
- **It fails closed.** A scope that is `null`, `undefined` or throws refuses the request with `403`, and nothing is searched.
- **Inputs that carry the engine's own filter are refused.** A scoped controller returns `400` for `mode: 'raw'` and for `engineParams` (which could overwrite `filter_by`), and `defineSearchController` throws unless `routes.multiSearch.enabled` is `false`.

```typescript
SearchControllerFactory.defineSearchController({
  entity: ArticleDocument,
  repository: { name: ArticleRepository.name },
  controller: { name: 'ArticleSearchController', basePath: '/articles' },
  routes: { multiSearch: { enabled: false } },
  scope: ({ context }) => {
    const merchantId = context.get(Authentication.CURRENT_USER)?.merchantId;
    return merchantId ? { merchantId } : null;
  },
});
```

## Who is affected

- **Apps that hand-wrote a `/search` route to scope it.** You can switch to the factory and `scope`.
- **Everyone else.** No action needed: a controller defined without `scope` behaves exactly as before.
