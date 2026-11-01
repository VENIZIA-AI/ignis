---
title: RecursiveTreeSql takes several or no roots and one filter for both terms
description: "RecursiveTreeSql.walk in @venizia/ignis-connectors starts from several ids or from every root, and filter applies one condition to both terms of the walk."
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-11-01

## RecursiveTreeSql takes several or no roots and one filter for both terms

<Badge type="tip" text="New Feature" />

**In one line.** `RecursiveTreeSql.walk` can start from several roots, or from every root of the table, and keeps a soft-deleted row (or any row you choose) out of the walk with one `filter`.

## What changed

- **`rootId` is `string | string[] | undefined`.** A list starts the walk from each id; none starts a DOWN walk from every row whose parent column is NULL. An UP walk with no root, and an empty list, are refused: they would return the whole table or nothing.
- **`filter`** is ANDed into both terms of the walk, so a row it rejects is out and its subtree is cut off. Write it once with the alias `t`, which both terms use for the table: `sql\`t.deleted_at IS NULL\``. `anchorFilter` and `recursiveFilter` keep working and are ANDed with it.

## Who is affected

- **Existing callers.** No action needed: a single `rootId` produces the SQL it did before, and so does a call without `filter`.

## Details

```typescript
const subtree = RecursiveTreeSql.walk({
  name: 'subtree',
  table: categories,
  rootId: ['north', 'south'],
  direction: RecursiveTreeDirections.DOWN,
  maxDepth: 12,
  filter: sql`t.deleted_at IS NULL`,
});

// The fragment is the CTE only: write the SELECT around it, and join `subtree` like any table.
const rows = await db.execute(
  sql`${subtree} SELECT c.* FROM subtree s JOIN categories c ON c.id = s.id ORDER BY s.depth`,
);
```
