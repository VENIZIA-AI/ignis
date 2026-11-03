---
title: The search repository counts a query, returns facets alone and suggests, with typed facets and tuning
description: ReadableSearchRepository gains searchCount, facets and suggest; facetCounts is typed and camelCase on Typesense and Meilisearch; Typesense tuning has typed camelCase names; hybrid hits carry rankFusionScore and vectorDistance.
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-03

## The search repository counts a query, returns facets alone and suggests, with typed facets and tuning

<Badge type="tip" text="New Feature" /> <Badge type="warning" text="Behavior Change" />

**In one line.** An app with a search box can now count a text search, read facets without hits and autocomplete through the repository, so it no longer needs the raw client for them.

## What changed

- **`searchCount({ query, queryBy?, where? })`.** It counts the documents a text query matches and answers `{ count, isFoundExact }`. `count({ where })` still counts by filter only, and is always exact. A text search can stop early, then `isFoundExact` is `false` and `count` is an estimate.
- **`facets({ facetBy, query?, queryBy?, where?, maxFacetValues?, facetQuery? })`.** It returns `{ facets, found, isFoundExact }` and no hits. An empty `facetBy`, or a `maxFacetValues` that is not a positive integer, throws before a request.
- **`suggest({ query, queryBy?, limit?, includeFields?, where? })`.** It answers the matching documents for a search box: keyword only, no highlighting, a page of 8 unless `limit` says otherwise. A blank `query` answers `[]` without calling the engine.
- **`facetCounts` has a real type.** `ISearchResult.facetCounts` is `ISearchFacetCount[]`: `fieldName`, `counts` as `{ value, count, highlighted? }`, `sampled` and `stats` where the engine returns them.
- **`highlight: false` on a keyword search.** It returns no highlight markup and wins over `highlightFields`.
- **Typed Typesense tuning.** `numTypos`, `dropTokensThreshold`, `typoTokensThreshold`, `infix`, `prioritizeExactMatch`, `prioritizeTokenPosition`, `prioritizeNumMatchingFields`, `textMatchType`, `rerankHybridMatches`, `useCache` and `cacheTtl` are typed by `ITypesenseTuning`, in camelCase, and are read from `engineParams` next to the wire names that still work. A numeric one that is not a non-negative integer throws before a request.
- **Hybrid scores on hits.** A Typesense hit carries `rankFusionScore` and `vectorDistance` when the engine reports them. `score` stays the keyword `text_match` in every mode.

## Who is affected

- **Apps with a search box.** Use the three methods instead of the raw client.
- **Code that reads `facetCounts`.** Its shape changes; see Behavior changes.
- **Everyone else.** No action needed.

## Behavior changes

> [!WARNING]
> `facetCounts` is no longer the engine's raw JSON. Code that casts it and reads `field_name` or `stats.total_values` gets `undefined`.

On Typesense, each entry used to be the engine's snake_case object. It is now camelCase, and an entry without a field name, or a count without a `value` and a `count`, is dropped.

| | Before | After |
| --- | --- | --- |
| Typesense field name | `field_name` | `fieldName` |
| Typesense value total in `stats` | `stats.total_values` | `stats.totalValues` |
| Meilisearch | `facetCounts[0]` was the whole `facetDistribution` record: `{ genre: { drama: 2 } }` | one entry per field: `{ fieldName: 'genre', counts: [{ value: 'drama', count: 2 }] }`, with `stats: { min, max }` from `facetStats` |

`counts[].value`, `count` and `highlighted` keep their names. `value` is always a string.

`search()`, `searchCount()`, `facets()` and `suggest()` also refuse a field the model hides (`hiddenProperties`) as `facetBy`, in `facetQuery` or as `queryBy`, with a 400. Before this change `search({ facetBy: ['hiddenField'] })` returned its value counts.

## Details

```typescript
const { facets } = await articleRepository.facets({ facetBy: ['category'], where: { published: true } });
const [category] = facets;
category?.counts.map((entry) => `${entry.value} (${entry.count})`);

const { count, isFoundExact } = await articleRepository.searchCount({
  query: 'renewable',
  queryBy: ['title'],
});

const suggestions = await articleRepository.suggest({
  query: 'renew',
  queryBy: ['title'],
  limit: 5,
  includeFields: ['id', 'title'],
});
```

See [Search & Typesense](/guides/core-concepts/persistent/search-typesense#count-a-search-with-searchcount) for the options, and [Search & Meilisearch](/guides/core-concepts/persistent/search-meilisearch) for what differs there.
