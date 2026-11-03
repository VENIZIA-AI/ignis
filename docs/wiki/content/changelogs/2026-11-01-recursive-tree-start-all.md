---
title: RecursiveTreeSql can start from every row
description: "RecursiveTreeSql.walk in @venizia/ignis-connectors has a new start option to treat every row of the table as a root."
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-11-01

## RecursiveTreeSql can start from every row

<Badge type="tip" text="New Feature" />

**In one line.** `RecursiveTreeSql.walk` has a new `start: 'all'` option to start the walk from every row of the table.

## What changed

- **`RecursiveTreeSql.walk` has a new option `start`.** The only value is `'all'`. Every row of the table is a root of the walk. `filter` and `anchorFilter` still narrow which rows count.
- **Validation rules.** It cannot be combined with `rootId`: the call throws an error that says so. Any other value for `start` throws an error that names the value.
- **Both directions work.** A DOWN walk returns every row with all of its descendants. An UP walk returns every row with all of its ancestors.
- **Output row count.** A row shows up once per root that reaches it. In a DOWN walk, a node three levels below the top is returned four times (as its own root and under each of its three ancestors), each time with its own `depth`. Add `depth = 0` to your SELECT to get each row once.

## Who is affected

- **Existing callers.** No action needed: a call without `start` produces the SQL it did before.

## Details

```typescript
const closure = RecursiveTreeSql.walk({
  name: 'closure',
  table: categories,
  start: 'all',
  direction: RecursiveTreeDirections.DOWN,
  maxDepth: 12,
  filter: sql`t.deleted_at IS NULL`,
});

// The fragment is the CTE only: write the SELECT around it, and join `closure` like any table.
const rows = await db.execute(
  sql`${closure} SELECT c.* FROM closure s JOIN categories c ON c.id = s.id ORDER BY s.depth`,
);
```
