---
title: A search controller lists the tuning a client may send under query.allow.tuning
description: "engineParams.allow is gone: query.allow.tuning takes the camelCase tuning names of the repository's datasource, typed when the repository names it, and the request's engineParams is a strict object of exactly those names."
packages: ['@venizia/ignis-connectors']
migration:
  - id: search-engine-params-allow-removed
    symbols: [SearchControllerFactory.build, ISearchControllerOptions]
    upgrade:
      before: |
        SearchControllerFactory.build({
          repository: ProductSearchRepository,
          routes: { search: true },
          engineParams: { allow: ['typo_tokens_threshold', 'num_typos'] },
        });
      after: |
        // ProductSearchRepository extends DefaultSearchRepository<TProduct, TypesenseDataSource>
        SearchControllerFactory.build({
          repository: ProductSearchRepository,
          authenticate: { skip: true },
          routes: { search: { use: true } },
          query: { allow: { tuning: ['typoTokensThreshold', 'numTypos'] } },
        });
    downgrade:
      steps:
        - "Move query.allow.tuning back to engineParams: { allow: [...] } and write the names in the engine's wire spelling (typoTokensThreshold becomes typo_tokens_threshold)."
        - "Tell clients to send the wire spelling in engineParams again."
  - id: search-engine-params-body-camel-case
    symbols: [SearchControllerFactory.build]
    upgrade:
      steps:
        - "The body schema of the controller changed, not a type you import. A client that sent engineParams: { typo_tokens_threshold: 2 } sends engineParams: { typoTokensThreshold: 2 }. The body accepts exactly the names in query.allow.tuning, in camelCase: its wire spelling is a 400."
    downgrade:
      steps:
        - "Send the wire spelling again after you restore engineParams.allow."
  - id: search-allow-name-without-typed-entry
    symbols: [ITypesenseTuning]
    upgrade:
      steps:
        - "A name that ITypesenseTuning has no entry for (prefix, exhaustive_search) can no longer be allowed over HTTP. Set it in server code on a repository call: repository.search({ engineParams: { prefix: true } }). On Meilisearch, or on a repository declared without the datasource type argument, no name can be allowed over HTTP: move that tuning to server code too."
    downgrade:
      steps:
        - "List the name again in engineParams.allow."
---

# Changelog - 2026-11-15

## A search controller lists the tuning a client may send under query.allow.tuning

<Badge type="warning" text="Breaking Change" />

**In one line.** The tuning a client may send to a search route is named in `query.allow.tuning`, in camelCase. With a repository declared as `DefaultSearchRepository<TProduct, TypesenseDataSource>`, the compiler checks each name against the engine.

## What changed

- **`engineParams.allow` is removed.** Its names were the engine's wire names, typed as plain strings. `query.allow.tuning` takes the camelCase keys of the engine's tuning type (`ITypesenseTuning` for Typesense), so a misspelled name fails to compile. That type comes from the repository's datasource: write the repository as `DefaultSearchRepository<TProduct, TypesenseDataSource>`. A repository that leaves the second type argument out, and a Meilisearch repository, has no typed tuning, so `query.allow.tuning` takes no name and nothing can be allowed over HTTP.
- **The body's `engineParams` of `POST /search` is a strict object.** It holds exactly the listed names, so the OpenAPI document shows them and any other name is a `400`. Before, it was a free key-value bag checked at request time. Multi-search entries are unchanged: they stay a raw passthrough that needs `modes.raw`.
- **Names are camelCase.** A wire spelling in `query.allow.tuning` (`num_typos`) throws when the controller is built, and `sortBy` cannot be listed.
- **No alias.** The old option fails to type-check.

## Who is affected

- **Apps that set `engineParams.allow`.** Move the list to `query.allow.tuning`, in camelCase, and tell your clients to send camelCase names.
- **Apps that allowed a name with no typed entry, and Meilisearch apps.** Set the tuning in server code on a repository call. See the migration items.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> `engineParams.allow` no longer exists, and a request's `engineParams` takes the camelCase names only.

**Before:**

```typescript
SearchControllerFactory.build({
  repository: ProductSearchRepository,
  routes: { search: true },
  engineParams: { allow: ['typo_tokens_threshold', 'num_typos'] },
});
```

**After:**

```typescript
// ProductSearchRepository extends DefaultSearchRepository<TProduct, TypesenseDataSource>
SearchControllerFactory.build({
  repository: ProductSearchRepository,
  authenticate: { skip: true },
  routes: { search: { use: true } },
  query: { allow: { tuning: ['typoTokensThreshold', 'numTypos'] } },
});
```

See [Engine parameters over HTTP](/guides/core-concepts/persistent/search-typesense#engine-parameters-over-http).
