---
title: Per-Model Default Limit via @model Settings
description: Configure a default query limit per model with settings.defaultLimit - applied to top-level find() and to-many relations, validated at boot time
---

# Changelog - 2026-05-25

## Per-Model Default Limit

<Badge type="tip" text="New Feature" />

**In one line.** Models can now declare their own default page size instead of sharing one framework-wide limit of 10 rows.

## What changed

- **New `settings.defaultLimit` model setting.** A per-model positive integer used whenever a query omits `limit`.
- **Resolution precedence.** `query.limit ?? settings.defaultLimit ?? DEFAULT_LIMIT (10)` - an explicit `limit` in the query always wins.
- **Applies everywhere a default limit applies.** Top-level `find()` and every to-many relation; each relation uses its own model's `defaultLimit`.
- **Boot-time validation.** `@model` throws if `defaultLimit` is not a positive integer.
- **Independent of `defaultFilter`.** Bypassing the default filter via `shouldSkipDefaultFilter` does not drop the default limit.

## Who is affected

- **Models that never set `defaultLimit`.** No action needed - behavior is unchanged, still capped at 10 rows.
- **Small lookup tables** (e.g. `Country`, `Role`). Can now set a higher `defaultLimit` once instead of passing `limit` on every query.
- **Large tables** (e.g. `AuditLog`). Can keep a conservative default without affecting other models.

## Details

```typescript
import { BaseEntity, model } from '@venizia/ignis';
import { pgTable } from 'drizzle-orm/pg-core';

@model({
  type: 'entity',
  settings: { defaultLimit: 200 }, // Default to 200 rows when no limit is given
})
export class Country extends BaseEntity<typeof Country.schema> {
  static override schema = pgTable('Country', {
    /* ... */
  });
}

await countryRepo.find({ filter: {} });            // LIMIT 200
await countryRepo.find({ filter: { limit: 10 } }); // LIMIT 10  (explicit wins)
```

For to-many relations, each relation uses **its own model's** `defaultLimit`:

```typescript
// `categories` relation targets a model with defaultLimit: 50
await productRepo.find({
  filter: { include: [{ relation: 'categories' }] }, // categories capped at 50
});
```

> [!NOTE]
> There is no "unbounded" sentinel. `defaultLimit` must be a positive integer; to fetch more rows than the default, pass an explicit `limit` in the query.

This builds on the [consistent default-limit work](/changelogs/2026-05-20-relation-scope-default-limit), which established a single resolution point for default limits, by making that default configurable per model.

| File | Package |
|------|---------|
| `src/helpers/inversion/common/types.ts` | core |
| `src/base/metadata/persistents.ts` | core |
| `src/base/repositories/mixins/default-filter.ts` | core |
| `src/base/repositories/core/readable.ts` | core |
| `src/base/repositories/operators/filter.ts` | core |
