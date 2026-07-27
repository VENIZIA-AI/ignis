---
title: Casbin Single-Wave Extraction - Recursive CTE Replaces the Second Query Wave
description: ScopedCasbinAdapter.loadFilteredPolicy now issues four statements in one Promise.all - a recursive CTE resolves the role closure in SQL - and holds no cache. Required indexes are documented in place of the removed structural cache.
---

# Changelog - 2026-07-20

## Casbin Single-Wave Extraction

<Badge type="tip" text="Enhancement" /> <Badge type="warning" text="Behavior Change" /> <Badge type="info" text="Bug Fix" />

**In one line.** `ScopedCasbinAdapter.loadFilteredPolicy` now issues four statements in one `Promise.all`, instead of two sequential waves with an in-process BFS between them. It holds no cache of any kind.

## The problem it solves

`loadFilteredPolicy` used to run in two waves. The first wave ran role, membership, and grant queries. An in-process BFS then computed the role closure. A second wave then queried role grants using that closure.

This change replaces the whole shape with one recursive CTE that resolves the closure in SQL. It runs alongside the other three queries in a single `Promise.all`.

## What changed

- **One wave, four statements.** `queryPrincipalPolicy` - a single recursive CTE - replaces the old first-wave role/membership/grant queries, the in-memory role-closure BFS, and the second-wave role-grant query.
- It returns every row scoped to the principal in one round trip: its own `assign_role` / `join_domain` / `grant` rows (`kind: 'direct'`).
- It also returns the `role_inherits` edges reachable from its roles (`kind: 'roleEdge'`), and the grants of that role closure (`kind: 'roleGrant'`).
- `queryResourceInherits`, `queryActionInherits`, and `queryDomainInherits` are unchanged, and now run alongside it in the same `Promise.all`.
- **The role closure is resolved in SQL, not in JavaScript.** The CTE's recursive term uses `UNION`, not `UNION ALL`.
- De-duplication is what terminates a cyclic role graph, in place of the old in-memory `visited` set.
- **Narrower `role_inherits` emission.** Only edges reachable from the principal's assigned roles are emitted now, not the whole role graph.
- This is behavior-preserving: an edge unreachable from `r.sub` could never be traversed by the matcher anyway. It also shrinks every user's line payload.
- **The permission join is now `LEFT JOIN`, not `INNER JOIN`.** Previously, a grant row whose target `Permission` did not resolve (missing or soft-deleted) vanished from the query result with no signal at all.
- It is now returned, and `buildGrantLines` logs an error naming the subject before skipping it.
- The end state - the grant does not apply - is unchanged, but it is no longer silent.
- **The structural cache is gone.** The `structuralCache` constructor option, `invalidateStructuralCache()`, and the 60-second staleness window are removed entirely. All three were introduced earlier on this same branch, and never released.
- Extraction cost is addressed with indexes (below), not a cache.

## Who is affected

- **Every consumer of `ScopedCasbinAdapter`.** There are no in-repo construction sites, so this reaches downstream apps directly. The constructor no longer accepts `structuralCache` - a construction site that passed it needs the option dropped.
- **Apps that called `invalidateStructuralCache()` after a migration.** The method is gone; there is nothing to invalidate, since nothing is cached. Delete the call.
- **Operators of the backing `PolicyDefinition` table.** The framework does not create indexes - the consumer owns its schema.
- A query the framework writes, paired with an index it never mentions, is the seam that produced the production incident this work descends from.
- Create the indexes below.

## Details

Required indexes on `PolicyDefinition`, verified against a real PostgreSQL database with `EXPLAIN (ANALYZE, BUFFERS)`:

| Index | Serves | Without it |
|---|---|---|
| `(variant, subject_type, subject_id)` | `queryPrincipalPolicy`'s CTE anchor term and its direct-edge branch | Sequential scan (uses the grant branch's existing `(subject_type, subject_id)` scan only for that one branch) |
| `(variant, subject_id)` | `queryPrincipalPolicy`'s recursive-term join and its role-grant branch | Sequential scan |
| `(variant)`, or per-variant partial indexes | `queryResourceInherits`, `queryActionInherits`, `queryDomainInherits` - each filters on `variant` alone | Sequential scan |

The grant branch's `(subject_type, subject_id)` scan and the permission join's primary-key lookup were already efficient. The recursive term's sequential scan was the gap, because nothing indexes `variant`.

| File | Package |
|------|---------|
| `src/components/auth/authorize/adapters/scoped-casbin.adapter.ts` | core |
