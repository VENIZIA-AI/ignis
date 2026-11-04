---
title: Typesense sorts by _text_match and _eval through sortBy
description: "engineParams takes a typed sortBy for the sorts filter.order cannot name, and refuses it together with filter.order or sort_by."
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-11-04

## Typesense sorts by _text_match and _eval through sortBy

<Badge type="tip" text="New Feature" /> <Badge type="warning" text="Breaking Change" />

**In one line.** `engineParams: { sortBy }` sends Typesense's own `sort_by`, so `_text_match` and `_eval(...)` sorts work, and giving two sorts is now an error instead of one silently winning.

## What changed

- **`sortBy` in `ITypesenseTuning`.** Pass a Typesense `sort_by` string, such as `_text_match:desc,_eval([(status:=ACTIVATED):1]):desc,createdAt:desc`, as `sortBy` in `engineParams`. `search()`, `searchCount()`, `facets()` and `suggest()` take it.
- **Checked before the request.** It must be a non-empty string with at most three top-level entries. `_eval(...)` counts as one, however many commas it holds. Field names and the inside of `_eval` are left to Typesense.
- **One sort only.** `sortBy` together with `filter.order`, or with `sort_by`, throws.

## Who is affected

- **Callers that need `_text_match` or `_eval`.** Use `sortBy`; the raw `sort_by` workaround is no longer needed.
- **Callers that pass `sort_by` in `engineParams` and also set `filter.order`.** See Breaking changes.
- **Everyone else.** No action needed. Meilisearch and the neutral `order` are unchanged.

## Breaking changes

> [!WARNING]
> A `sort_by` in `engineParams` used to override `filter.order` silently. It now throws.

**Before:** `search({ ..., filter: { order: ['createdAt DESC'] }, engineParams: { ['sort_by']: 'name:asc' } })` sent `name:asc` and ignored `filter.order`.

**After:** the same call throws `'query.sortBy' and 'sort_by' both set 'sort_by' | Give it once` (`query.sortBy` is what `filter.order` compiles into). Drop one of them. A `sort_by` that is empty, not a string, unbalanced (a stray bracket or backtick), or has more than three top-level entries also throws now. `engineParams: { sortBy: undefined }` is skipped, not refused.

Two smaller changes ride along. A refusal for a tuning key given twice now names the one in the query as `query.<key>` (for example `query.numTypos`, where it said `numTypos`), so it is told apart from the same key in `engineParams`. And `order: []` no longer sends `sort_by: ''`; the search behaves the same, because Typesense treated an empty `sort_by` as no sort.

## Details

```typescript
await repository.search({
  mode: 'keyword',
  query: 'shoes',
  queryBy: ['name'],
  engineParams: {
    sortBy: '_text_match:desc,_eval([(status:=ACTIVATED):1]):desc,createdAt:desc',
  },
});
```

The [Typesense guide](/guides/core-concepts/persistent/search-typesense#sorts-filter-order-cannot-name) has the rules.
