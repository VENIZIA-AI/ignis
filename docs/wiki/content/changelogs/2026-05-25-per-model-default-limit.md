---
title: Per-Model Default Limit via @model Settings
description: Set a default query limit per model with settings.defaultLimit, used by top-level find() and by to-many relations.
packages: ['@venizia/ignis']
---

# Changelog - 2026-05-25

## Per-Model Default Limit

<Badge type="tip" text="New Feature" />

**In one line.** Models can declare their own default page size instead of sharing one limit of 10 rows.

## What changed

- **New `settings.defaultLimit`.** A per-model positive integer used when a query omits `limit`.
- **Precedence.** `query.limit ?? settings.defaultLimit ?? DEFAULT_LIMIT (10)`. An explicit `limit` always wins.
- **Where it applies.** Top-level `find()` and every to-many relation. Each relation uses its own model's `defaultLimit`.
- **Boot-time check.** `@model` throws if `defaultLimit` is not a positive integer.
- **Default filter.** Bypassing it with `shouldSkipDefaultFilter` does not drop the default limit.

```typescript
@model({
  type: 'entity',
  settings: { defaultLimit: 200 },
})
export class Country extends BaseEntity<typeof Country.schema> {
  static override schema = pgTable('Country', {
    /* ... */
  });
}

await countryRepo.find({ filter: {} });            // LIMIT 200
await countryRepo.find({ filter: { limit: 10 } }); // LIMIT 10
```

## Who is affected

- **Models that never set `defaultLimit`.** No action needed. They stay capped at 10 rows.
- **Small lookup tables and large tables.** Each can now set its own default.

## Details

- There is no "unbounded" value. To fetch more rows than the default, pass an explicit `limit` in the query.
- This makes the [consistent default limit](/changelogs/2026-05-20-relation-scope-default-limit) configurable per model.
