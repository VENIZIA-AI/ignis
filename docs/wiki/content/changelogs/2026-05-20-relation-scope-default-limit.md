---
title: Consistent Default Limit for To-Many Relations
description: To-many relations included in a query are now capped at DEFAULT_LIMIT (10) whether or not the scope has an order.
packages: ['@venizia/ignis']
---

# Changelog - 2026-05-20

## Consistent Default Limit for To-Many Relations

**In one line.** Included to-many relations now always return at most 10 rows unless you set a `limit`, so adding an `order` no longer changes how many rows you get.

## What changed

- **Top-level query.** `find()` still applies `DEFAULT_LIMIT` (10) when no `limit` is given.
- **To-many relations.** Every `hasMany` relation is capped at `DEFAULT_LIMIT` unless its scope sets a `limit`.
- **To-one relations.** `hasOne` and `belongsTo` are never limited.
- **Schema default removed.** `LimitSchema` no longer has a Zod `.default(10)`. That default only appeared when a `scope` object existed, so adding `order` to a scope used to cap the relation while omitting the scope returned all rows.

## Who is affected

- **Queries that include a to-many relation and expect more than 10 related rows.** Set an explicit `limit`.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> Code that relied on an included to-many relation returning all rows must now pass a `limit` in the relation scope.

**Before:**

```jsonc
// no scope -> all rows
{ "include": [{ "relation": "categories" }] }

// scope present -> capped at 10
{ "include": [{ "relation": "categories", "scope": { "order": ["createdAt DESC"] } }] }
```

**After:**

```jsonc
// both capped at 10
{ "include": [{ "relation": "categories" }] }
{ "include": [{ "relation": "categories", "scope": { "order": ["createdAt DESC"] } }] }

// change the cap with an explicit limit
{ "include": [{ "relation": "categories", "scope": { "limit": 1000 } }] }
```

To migrate, find queries that include to-many relations without a scope `limit` and add one where you need more than 10 rows:

```typescript
await repo.find({
  filter: {
    include: [{ relation: 'categories', scope: { limit: 1000, order: ['createdAt DESC'] } }],
  },
});
```
