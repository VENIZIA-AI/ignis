---
title: A search request cannot carry engineParams, unless the controller allows it
description: "Every generated search controller, scoped or not, refuses engineParams with 400 unless it lists the parameters a caller may send, and never a parameter that selects rows or fields."
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-07

## A search request cannot carry engineParams, unless the controller allows it

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" />

**In one line.** `engineParams` hands the engine its own wire parameters. An unscoped search controller accepted it, so a caller could replace the controller's own `filter_by` and name fields the model hides. Every search controller refuses it now.

## What changed

- **Refused on every search controller.** A search request with `engineParams`, scoped or not, answers `400 engineParams is not available on this search controller`, and the engine is not reached. The same holds for each entry of a `multi-search` request. An empty `engineParams: {}` is refused too.
- **A controller can allow some.** `engineParams: { allow: ['typo_tokens_threshold', 'num_typos'] }` on `defineSearchController` lets callers send those parameters. Names compare in one spelling (`num_typos` = `numTypos`). Any other parameter is a `400` that names it.
- **Row and field parameters can never be allowed.** `filter_by`, `include_fields`, `exclude_fields`, `query_by`, `facet_by`, `group_by`, `highlight_fields`, `sort_by`, `preset`, `pinned_hits`, `vector_query` and the Meilisearch counterparts (`filter`, `attributesToRetrieve`, `facets`, `sort`, ...) cannot be listed: `defineSearchController` throws when the list holds one, so a bad list never boots.
- **Server code is unchanged.** `repository.search({ ..., engineParams })` and the other repository methods take any parameter, as before.
- **Unchanged.** `mode: 'raw'` on an unscoped controller, and the rules of a scoped controller (`raw` refused, multi-search disabled).

## Who is affected

- **Clients that send `engineParams` to a search controller.** They get a `400`. If the parameter is a tuning knob, list it in `engineParams.allow`; if it selects rows or fields, use the neutral input (`filter`, `queryBy`, `fields`) instead, or call it from server code.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> A request to a search controller that carries `engineParams` answers `400`.

**Before:**

```typescript
// accepted on an unscoped controller
{ "mode": "keyword", "query": "lamp", "queryBy": ["title"], "engineParams": { "num_typos": 1 } }
```

**After:**

```typescript
// the controller names what callers may send
SearchControllerFactory.defineSearchController({
  entity: ProductDocument,
  repository: { name: ProductSearchRepository.name },
  controller: { name: 'ProductSearchController', basePath: '/products' },
  engineParams: { allow: ['num_typos'] },
});
```

## Details

| File | Package |
|------|---------|
| `src/search/core/controllers/engine-params.ts` | connectors |
| `src/search/core/controllers/abstract.ts` | connectors |
| `src/search/core/controllers/factory.ts` | connectors |
| `src/search/core/controllers/scope.ts` | connectors |
