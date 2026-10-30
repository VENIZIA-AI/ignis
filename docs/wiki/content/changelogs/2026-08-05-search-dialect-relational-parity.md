---
title: Search Filters Now Mean What Relational Filters Mean
description: An empty `or` in a search filter now matches nothing instead of everything, and search dialects gain a compiled where-result, field checking, and a published operator table.
packages: ['@venizia/ignis']
---

# Changelog - 2026-08-05

## Search Filters Now Mean What Relational Filters Mean

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" /> <Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" />

**In one line.** The same `where` sent to Postgres and to a search engine now means the same thing - most importantly `or: []`, which used to widen a query instead of narrowing it.

## What changed

- **An empty `or` matches nothing, not everything.** `where: { or: permittedOrgIds.map(...) }` on an empty permission list used to compile to an empty filter string, so a scoped query returned the whole collection to an unpermitted caller.
- **`deleteAll` no longer truncates on that filter.** With `force: true`, the same empty filter used to reach `deleteAll`'s "no effective where" branch and truncate. An absorbing where now deletes nothing.
- **Empty collections behave as in SQL.** `inq: []` and a bare `[]` match nothing; `nin: []` excludes nothing. Before, these emitted `field:=[]`, which engines reject.
- **A `where` on an undeclared field is a 400 naming the field,** not a 500 from the engine. It uses `core.search_engine.unknown_field`.
- **Operators an engine cannot express are 400s naming the operator and the engine.**
- **`notBetween` now works on both engines.**
- **Dialects publish `canExpress(operator)`,** a complete operator table.

## Who is affected

- **Anyone building a `where` from a possibly-empty list** (permission scopes, tag filters, id batches). This is the security fix. Re-read any code that maps a list into `or` or `inq`. Behaviour changes from "returns everything" to "returns nothing".
- **Anyone calling `ISearchQueryDialect.toWhere` directly.** See Breaking changes.
- **Anyone filtering on a field absent from `defineSearchCollection`.** Declare the field, or stop filtering on it.
- **Everyone else.** No action needed. `find`, `findOne`, `count` and `search` keep their signatures, and an ordinary filter compiles the same as before.

## Breaking changes

> [!WARNING]
> `ISearchQueryDialect.toWhere` now throws for a where that compiles to "match nothing". It is exported from `@venizia/ignis` and `@venizia/ignis/typesense`, so this is a public API change.

**Before:**

```typescript
// Silently returns '' - the caller applies no filter and matches EVERYTHING
const filterBy = dialect.toWhere({ where: { or: [] } });
```

**After:**

```typescript
const compiled = dialect.compileWhere({ where: { or: [] } });

switch (compiled.outcome) {
  case SearchFilterOutcomes.FILTER:
    return search({ filterBy: compiled.filterBy });
  case SearchFilterOutcomes.MATCH_NONE:
    return { hits: [], found: 0 }; // never ask the engine
  case SearchFilterOutcomes.MATCH_ALL:
    return search({}); // no filter, deliberately
}
```

`toWhere` still returns a plain string for every non-absorbing where, so a caller that never builds a filter from a possibly-empty list needs no change. It is marked `@deprecated`.

## Details

- Only the caller's `where` is field-checked, not the model's `defaultFilter.where`.
- A model with no `defineSearchCollection` is unvalidated: field checking is skipped, and it behaves as before.
- Typesense has no null. An optional field is present or absent, and `filter_by` cannot test which, so `exists`, `notExists` and `is: null` are reported as one limitation.

| Operator | relational | typesense | meilisearch |
|---|---|---|---|
| `eq` `ne` `gt` `gte` `lt` `lte` `in` `inq` `nin` `between` `notBetween` | yes | yes | yes |
| `is` `isn` | yes | value only | yes, incl. `null` |
| `exists` `notExists` | yes | **no** | yes |
| `not` | yes | no | no |
| `like` `ilike` `regexp` and friends | yes | no | no |
| `contains` `containedBy` `overlaps` | yes | no | no |

- The new rejections carry catalogued codes. The relational equivalents (`Invalid query operator`, `Column NOT FOUND`) stay uncoded.
- A caller who cannot read a hidden field can still probe its value through filter results. This is identical on the relational branch, which does not consult `hiddenProperties` when resolving a `where` either.
