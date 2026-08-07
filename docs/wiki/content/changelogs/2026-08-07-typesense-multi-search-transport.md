---
title: One Transport for Every Typesense Search
description: Large filters no longer fail, pages over 250 hits work, and an arbitrary skip is finally expressible - because every search now goes through /multi_search.
---

# Changelog - 2026-08-07

## One Transport for Every Typesense Search

<Badge type="tip" text="New Feature" /> <Badge type="info" text="Bug Fix" /> <Badge type="warning" text="Behavior Change" />

**In one line.** Every Typesense search - one collection or many - now travels as a POST to `/multi_search`, which removes three limits that had nothing to do with what callers were asking for.

## What changed

- **A large `filter_by` no longer fails.** Single search was a GET, and Typesense caps a GET query string near 4000 characters. A filter built from an authorization scope - `` organizerId:=[`uuid`, …] `` - crossed that at roughly ninety ids, and the user could not search **at all**. The query now travels in the request body.
- **A page over 250 hits works.** Typesense refuses more than `--max-per-page` (250) per page. A larger limit is served as consecutive windows inside **one** call, so the round-trip count stays at one however large the page.
- **`skip` no longer has to land on a page boundary.** `skip: 15, limit: 10` was rejected because a skip was expressed as a page *number*. Typesense supports `offset` natively, and the relational branch never had this rule - it passes `skip` straight through to the query builder.
- **`isFoundExact` tells the truth.** It was hardcoded `true`. When Typesense hits its search-time budget it sets `search_cutoff` and reports a partial count; that now surfaces as `isFoundExact: false`. Across windows it is AND-folded - one cut-off window makes the whole total an estimate.

## Who is affected

- **Anyone whose users have many permitted scopes.** This is the fix. No action needed.
- **Anyone requesting more than 250 hits.** Previously an engine error; now it works. **Read the warning below.**
- **Anyone calling `connector.multiSearch()`.** No change: same signature, same raw envelope, error entries still passed through for you to inspect.
- **Anyone using `mode: 'raw'`.** No change. Params reach the engine untouched and the response shape is identical.
- **Anyone reading `searchTimeMs` or `isFoundExact`.** Both can now report values they never did before - see Behaviour changes.

## Behaviour changes

> [!WARNING]
> **An accidental guardrail is gone, and a deliberate one replaces it.** `limit: 5000` used to fail fast and cheap at the engine, because no page over 250 hits was servable at all. It now *can* be served - twenty windows of 250, five thousand documents, and whatever your consumer then does with them.
>
> Shipping that removal on its own would leave ignis less safe than before, so **the framework now imposes a maximum page size of 1000**, and a model raises it deliberately:
>
> ```typescript
> @model({ type: 'entity', settings: { maxLimit: 5000 } })
> class ExportDocument extends BaseSearchEntity { /* … */ }
> ```
>
> **This cannot break anything that works today.** No caller can currently succeed with a limit above 250 - the engine refuses it - so a ceiling of 1000 only bounds the capability this release adds. 1000 sits above any list screen and well below what the engine can serve, so reaching it means you are doing something unusual and should say so.

**There are two ceilings, at two layers, for two different reasons:**

| Layer | Limit | Kind |
|---|---|---|
| repository | 1000, overridable per model via `maxLimit` | **policy** - a number we chose |
| connector | 12,500 (50 multi-search entries x 250 hits) | **physics** - imposed by the engine |

The policy ceiling fires first, so callers normally never meet the physical one. Both refuse with `core.search_engine.page_too_large` - refused, never silently truncated to a short page that looks complete - and **every such message names the value you requested and the ceiling that applied**, because the code alone cannot tell you which of the three limits you met.

`mode: 'raw'` bypasses the policy ceiling. That is deliberate: raw is the documented escape hatch and its callers own the consequences. It cannot bypass the physical one - policy is opt-out-able, physics is not.

There is deliberately **no page-depth ceiling**. Deep pagination degrades gradually rather than exploding, and the relational branch imposes no depth limit either; adding one only to search would reopen a divergence this codebase has just spent a branch closing.

**Two fields can now report differently:**

- `isFoundExact` can be `false`. It was previously always `true`, so a truncated count was reported as authoritative. If you branch on it, you will now see the case it was always meant to describe.
- `searchTimeMs` on a windowed search is the **slowest window**, not the sum. The field is read as latency and the windows travel in one round trip, so summing would make a single request graph at several times its wall-clock. Total engine work across windows is genuinely higher than this number.

**Grouped searches cannot be windowed.** A `group_by` query asking for more than 250 hits is refused with the same code. Groups span windows, so concatenating would duplicate them and taking the first window would drop the rest; merging by key would mean re-deriving an ordering the engine never produced.

## Details

- `search()` and `multiSearch()` share one private transport and keep their own policy. A per-entry error arrives inside an HTTP 200 as `{ code, error }` next to siblings that succeeded. `search()` **throws** on one, because `ISearchResult` has nowhere to put an error and reporting it as an empty result would make a rejected filter indistinguishable from a genuine no-match. `multiSearch()` passes it through, because its contract is the raw envelope and its callers already inspect entries.
- Searching an unprovisioned collection still answers empty with a warning, exactly as before.
- `multiSearch()` does **not** window-split. Merging windows would mean synthesizing a response the engine never returned - with no honest value for `request_params` or `page` - and would break the 1:1 correspondence between `results[i]` and `searches[i]` that callers index on.
- **Pagination is now asymmetric between the two search engines, deliberately.** Typesense expresses an arbitrary skip; Meilisearch still requires a page boundary. Meilisearch's two pagination modes return *different response shapes* - `page`/`hitsPerPage` gives an exact `totalHits`, `offset`/`limit` gives `estimatedTotalHits`. Porting the fix there would buy arbitrary skip by making every total an estimate, which is a trade-off to decide rather than a change to copy.

### A limit this does not fix

`--filter-by-max-ops` (default 100) caps the number of operations in a `filter_by`, and it is independent of transport. Which wall you hit depends on the **shape** your `where` compiles to:

```typescript
// ONE filter operation - bounded only by body size, which is not a practical limit
where: { orgId: { inq: permittedOrgIds } }

// N clauses plus N-1 operators - hits --filter-by-max-ops long before any size limit
where: { or: permittedOrgIds.map(orgId => ({ orgId })) }
```

Both are semantically identical. Prefer the first for a large list. The framework deliberately does not rewrite one into the other: it would rescue only this one shape, and an `or:` across *different* fields is beyond any such rewrite. Raising the server flag is also a valid answer, and costs no code at all.

| File | Package |
|------|---------|
| `src/base/repositories/common/constants.ts` | core |
| `src/base/repositories/core/abstract.ts` | core |
| `src/base/metadata/persistents.ts` | core |
| `src/helpers/inversion/common/types.ts` | core |
| `src/connectors/search/repositories/core/base.ts` | core |
| `src/connectors/typesense/connector.ts` | core |
| `src/connectors/typesense/internal/connector-internal.ts` | core |
| `src/connectors/typesense/repositories/dialect/query-dialect.ts` | core |
| `src/connectors/typesense/repositories/common/types.ts` | core |
| `src/connectors/search/common/errors.ts` | core |
