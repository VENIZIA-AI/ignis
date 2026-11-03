---
title: searchCount, facets and suggest take the same tuning as search, and Typesense gains maxCandidates
description: searchCount, facets and suggest accept engineParams, checked and sent the way search() does, so they match what a tuned search matches; ITypesenseTuning gains maxCandidates.
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-03

## searchCount, facets and suggest take the same tuning as search, and Typesense gains maxCandidates

<Badge type="tip" text="New Feature" />

**In one line.** Pass `engineParams` to `searchCount()`, `facets()` and `suggest()` to tune them like `search()`, so a count, a facet or a suggestion matches the same documents as the search beside it.

## What changed

- **`engineParams` on the three methods.** It takes the same keys as in `search()`: the camelCase names of `ITypesenseTuning` and the engine's wire names. The same checks run before a request, and `useCache` and `cacheTtl` reach Typesense the same way. Before, an accented query such as `cafe` found `café` in `search()` but not in `suggest()` or `facets()`, because there was no way to pass `numTypos` or `dropTokensThreshold` to them.
- **`maxCandidates` in `ITypesenseTuning`.** It is sent as `max_candidates`, in either spelling, and must be a positive integer; `0`, a fraction or a string throws before a request.
- **Sorting is unchanged.** It is `filter.order` in the neutral input, sent as `sort_by`, and it already worked in `search()` and `suggest()`. It is not a tuning key.

## Who is affected

- **Apps with a search box.** Pass the tuning you use in `search()` to the other three. No action needed if you do not.
- **Scoped search controllers.** No change. Their routes call `search()` and `multiSearch()` only, and they still answer `400` to `engineParams`.
- **Everyone else.** No action needed.

## Details

```typescript
const tuning = { numTypos: 2, maxCandidates: 8 };

const suggestions = await articleRepository.suggest({
  query: 'cafe',
  queryBy: ['title'],
  engineParams: tuning,
});

const { facets } = await articleRepository.facets({
  facetBy: ['category'],
  query: 'cafe',
  queryBy: ['title'],
  engineParams: tuning,
});
```

See [Search & Typesense](/guides/core-concepts/persistent/search-typesense#searching-with-search-mode) for the tuning keys.
