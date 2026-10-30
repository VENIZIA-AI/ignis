---
title: One Transport for Every Typesense Search
description: Large filters no longer fail, pages over 250 hits work, and an arbitrary skip works, because every Typesense search now goes through /multi_search.
packages: ['@venizia/ignis']
---

# Changelog - 2026-08-07

## One Transport for Every Typesense Search

<Badge type="tip" text="New Feature" /> <Badge type="info" text="Bug Fix" /> <Badge type="warning" text="Behavior Change" />

**In one line.** Every Typesense search now travels as a POST to `/multi_search`, which removes three limits that had nothing to do with what callers were asking for.

## What changed

- **A large `filter_by` no longer fails.** Typesense refuses a GET query string over 4000 characters, so a filter built from an authorization scope (`` organizerId:=[`uuid`, …] ``) could stop a user from searching at all. The query now travels in the request body.
- **A page over 250 hits works.** A larger limit is served as consecutive windows inside one call.
- **`skip` no longer has to land on a page boundary.** `skip: 15, limit: 10` used to be rejected.
- **`isFoundExact` tells the truth.** It was always `true`. When Typesense hits its search-time budget and reports a partial count, it is now `false`. Across windows, one cut-off window makes the whole total an estimate.

## Who is affected

- **Anyone whose users have many permitted scopes.** This is the fix. No action needed.
- **Anyone requesting more than 250 hits.** It now works. Read the warning below.
- **Anyone calling `connector.multiSearch()` or using `mode: 'raw'`.** No change.
- **Anyone reading `searchTimeMs` or `isFoundExact`.** Both can report values they never did before.

## Behaviour changes

> [!WARNING]
> `limit: 5000` used to fail at the engine, because no page over 250 hits could be served. It now can be. The framework therefore imposes a maximum page size of 1000, and a model raises it deliberately:
>
> ```typescript
> @model({ type: 'entity', settings: { maxLimit: 5000 } })
> class ExportDocument extends BaseSearchEntity { /* … */ }
> ```
>
> This cannot break anything that works today, since no caller could succeed with a limit above 250.

| Layer | Limit | Kind |
|---|---|---|
| repository | 1000, overridable per model via `maxLimit` | policy |
| connector | 12,500 (50 multi-search entries x 250 hits) | imposed by the engine |

- Both refuse with `core.search_engine.page_too_large` and the message names the value you requested and the ceiling that applied. A page is refused, never silently truncated.
- `mode: 'raw'` bypasses the policy ceiling but not the engine one.
- There is no page-depth ceiling.
- `isFoundExact` can now be `false`.
- `searchTimeMs` on a windowed search is the slowest window, not the sum.
- A `group_by` query asking for more than 250 hits is refused with the same code, because groups span windows.

## Details

- `search()` throws on a per-entry error inside an HTTP 200, so a rejected filter is not mistaken for no match. `multiSearch()` passes the raw envelope through.
- Searching an unprovisioned collection still answers empty with a warning. It is now the only 404 tolerated. A misrouted URL or a proxy 404 now surfaces as a dependency error instead of an empty result.
- `multiSearch()` does not window-split.
- Pagination is now asymmetric between engines. Typesense expresses an arbitrary skip; Meilisearch still requires a page boundary.

### A limit this does not fix

`--filter-by-max-ops` (default 100) caps the operations in a `filter_by`, over POST as over GET. Prefer the first shape for a large list:

```typescript
// ONE operation, however many values - measured to 20,000 ids over /multi_search
where: { orgId: { inq: permittedOrgIds } }

// 2N-1 operations against a ceiling of 100 - so exactly 50 values pass and 51 fails
where: { or: permittedOrgIds.map(orgId => ({ orgId })) }
```

The second fails with `` `filter_by` has too many operations. Maximum allowed: 100 ``. `and:` behaves the same. The framework does not rewrite one into the other. Raising the server flag also works.
