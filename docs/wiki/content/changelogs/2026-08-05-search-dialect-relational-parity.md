---
title: Search Filters Now Mean What Relational Filters Mean
description: An empty `or` used to match everything instead of nothing. Search dialects gain a compiled where-result, query-time field checking, and a published operator table.
---

# Changelog - 2026-08-05

## Search Filters Now Mean What Relational Filters Mean

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" /> <Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" />

**In one line.** The same `where` sent to Postgres and to a search engine now means the same thing - most importantly `or: []`, which used to widen a query instead of narrowing it.

## What changed

- **An empty `or` matches nothing, not everything.** `where: { or: permittedOrgIds.map(...) }` on an empty permission list compiled to an empty filter string, which an engine reads as "no constraint". A scoped query returned the whole collection to an unpermitted caller. It now compiles to an absorbing "match nothing".
- **`deleteAll` can no longer truncate on an absorbing filter.** That same empty filter reached `deleteAll`'s "no effective where" branch, where `force: true` truncates - destroying everything the scope existed to protect. An absorbing where now deletes nothing.
- **Empty collections behave as they do in SQL.** `inq: []` and a bare `[]` match nothing; `nin: []` excludes nothing. Previously these emitted `field:=[]`, which engines reject as malformed.
- **A `where` on a field the collection never declared is a 400 naming the field**, rather than an engine failure surfacing as a 500. This mirrors relational's `Column NOT FOUND`.
- **Operators an engine cannot express are catalogued 400s naming the operator AND the engine.** Which engine backs a collection is what decides the answer, so a client has to be able to branch on it.
- **`notBetween` now works on both engines**, rewritten by De Morgan into `< min OR > max`.
- **Dialects publish `canExpress(operator)`** - a complete operator table, pinned by a conformance test against `QueryOperators.SCHEME_SET`, so no operator can go silently unclassified.

## Who is affected

- **Anyone building a `where` from a possibly-empty list** (permission scopes, tag filters, id batches). **This is the security fix** - re-read any code that maps a list into `or` or `inq`. Behaviour changes from "returns everything" to "returns nothing", which is the correct answer.
- **Anyone calling `ISearchQueryDialect.toWhere` directly.** See Breaking changes.
- **Anyone filtering on a field absent from `defineSearchCollection`.** Previously it reached the engine and failed there; it is now refused up front with `core.search_engine.unknown_field`. Declare the field, or stop filtering on it.
- **Everyone else.** No action needed. `find`, `findOne`, `count` and `search` keep their signatures, and an ordinary filter compiles byte-identically to before.

## Breaking changes

> [!WARNING]
> `ISearchQueryDialect.toWhere` now throws for a where that compiles to "match nothing". It is exported from `@venizia/ignis` and `@venizia/ignis/typesense`, so this is a public API change even though nothing inside core calls it.

`toWhere` returns a `string`, and a filter string cannot say "match nothing" - it returned `''`, which every caller reads as "no filter". That is the security bug above, so returning it was never a safe default to preserve.

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

- Repositories compile the caller's `where` and the model's `defaultFilter.where` **separately**, then combine them. Only the caller's clause is field-checked - a `defaultFilter` naming a field the collection does not declare would otherwise make every request fail against itself.
- A model with no `defineSearchCollection` is **unvalidated, not empty**: field checking is skipped entirely, so entities without a collection definition behave exactly as before.
- Where the two engines legitimately differ they now say so instead of guessing. Meilisearch expresses `exists`, `notExists` and `is: null` natively; Typesense has no null at all - an optional field is either present or absent, and `filter_by` cannot test which - so those four are one limitation, reported with one message.

| Operator | relational | typesense | meilisearch |
|---|---|---|---|
| `eq` `ne` `gt` `gte` `lt` `lte` `in` `inq` `nin` `between` `notBetween` | yes | yes | yes |
| `is` `isn` | yes | value only | yes, incl. `null` |
| `exists` `notExists` | yes | **no** | yes |
| `not` | yes | no | no |
| `like` `ilike` `regexp` and friends | yes | no | no |
| `contains` `containedBy` `overlaps` | yes | no | no |

- `not` is classified unsupported on both engines rather than partially implemented. `not: 'x'` is a trivial rewrite but `not: { and: [...] }` needs De Morgan through an arbitrary tree, and an operator that works until it doesn't is worse than one that never does.
- **Known asymmetry, deliberate.** These new rejections carry catalogued codes; the relational branch's equivalents (`Invalid query operator`, `Column NOT FOUND`) stay uncoded. Cataloguing those means touching the SQL branch, and is scoped separately.
- **Known gap, deliberate.** A caller who cannot read a hidden field can still probe its value through filter results. That exposure is identical on the relational branch, which does not consult `hiddenProperties` when resolving a `where` either, so it is cross-cutting hardening rather than something to fix on one side only.

| File | Package |
|------|---------|
| `src/connectors/search/repositories/common/types.ts` | core |
| `src/connectors/search/repositories/common/dialect-helpers.ts` | core |
| `src/connectors/search/repositories/core/base.ts` | core |
| `src/connectors/search/repositories/core/readable.ts` | core |
| `src/connectors/search/repositories/core/persistable.ts` | core |
| `src/connectors/search/common/errors.ts` | core |
| `src/connectors/typesense/repositories/dialect/query-dialect.ts` | core |
| `src/connectors/meilisearch/repositories/dialect/query-dialect.ts` | core |
