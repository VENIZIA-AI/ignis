---
title: Casbin Single-Wave Extraction - Recursive CTE Replaces the Second Query Wave
description: ScopedCasbinAdapter now loads a principal's policy in one round of four queries with no cache; drop the structuralCache option if you passed it, and add the documented indexes.
packages: ['@venizia/ignis']
---

# Changelog - 2026-07-20

## Casbin Single-Wave Extraction

<Badge type="tip" text="Enhancement" /> <Badge type="warning" text="Behavior Change" /> <Badge type="info" text="Bug Fix" />

**In one line.** `ScopedCasbinAdapter.loadFilteredPolicy` now issues four statements in one `Promise.all` instead of two sequential waves, and holds no cache.

## What changed

- **One wave, four statements.** A single recursive query, `queryPrincipalPolicy`, resolves the principal's role closure in SQL. It runs alongside `queryResourceInherits`, `queryActionInherits` and `queryDomainInherits`, which are unchanged.
- **Narrower `role_inherits` output.** Only edges reachable from the principal's assigned roles are emitted. Matching behaves the same, and each user's line payload is smaller.
- **A grant with a missing target is no longer silent.** The permission join is now a `LEFT JOIN`. A grant whose target `Permission` is missing or soft-deleted is returned, and `buildGrantLines` logs an error naming the subject before skipping it. The grant still does not apply.
- **The structural cache is gone.** The `structuralCache` constructor option, `invalidateStructuralCache()`, and the 60-second staleness window are removed.

## Who is affected

- **Every consumer of `ScopedCasbinAdapter`.** If you passed `structuralCache` to the constructor, drop the option.
- **Apps that called `invalidateStructuralCache()` after a migration.** Delete the call. Nothing is cached, so there is nothing to invalidate.
- **Operators of the `PolicyDefinition` table.** The framework does not create indexes, so create the ones below.

## Details

Required indexes on `PolicyDefinition`:

| Index | Serves |
|---|---|
| `(variant, subject_type, subject_id)` | `queryPrincipalPolicy`'s anchor term and direct-edge branch |
| `(variant, subject_id)` | `queryPrincipalPolicy`'s recursive-term join and role-grant branch |
| `(variant)`, or per-variant partial indexes | `queryResourceInherits`, `queryActionInherits`, `queryDomainInherits` |

Without them these queries fall back to a sequential scan.
