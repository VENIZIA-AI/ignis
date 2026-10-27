---
title: RecursiveTreeSql Reads Tables in a Named Schema and Takes an Anchor Filter
description: "RecursiveTreeSql.walk now qualifies a Postgres table with its schema, and a new anchorFilter option filters the anchor term the way recursiveFilter filters the recursive one."
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-10-25

## RecursiveTreeSql reads tables in a named schema and takes an anchor filter

<Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" />

**In one line.** `RecursiveTreeSql.walk` now works on a table declared with `pgSchema('commerce').table(...)`, and `anchorFilter` lets you keep a row out of the walk at its starting point as well as along it.

## What changed

- **The schema is kept.** `walk` used to quote only the table name, so `"merchants"` was read instead of `"commerce"."merchants"` and the walk hit the wrong relation or none. A Postgres table in a named schema is now emitted as `"schema"."table"` in both terms. A table in the default schema stays unqualified, and SQLite is unchanged.
- **`anchorFilter` is new.** It is ANDed into the anchor term's `WHERE`, next to the `idColumn = rootId` match, the way `recursiveFilter` is ANDed into the recursive term.

```typescript
RecursiveTreeSql.walk({
  name: 'descendants',
  table: merchants,
  rootId,
  direction: RecursiveTreeDirections.DOWN,
  maxDepth: 10,
  anchorFilter: sql`deleted_at IS NULL`,
  recursiveFilter: sql`t.deleted_at IS NULL`,
});
```

- **`walk` still applies no soft delete by itself.** It takes a table, not a model, so it cannot know a model's soft-delete or `scopeFilter` settings. Pass both filters to exclude deleted rows.

## Who is affected

- **Code that walks a table in a named Postgres schema.** The walk now reads the right table. If you worked around the missing qualifier with a view or a search path, you can drop the workaround.
- **Code that walks a table in the default schema, or SQLite.** No action needed.
