---
title: "Tree Utilities in helpers, and a Bounded RecursiveTreeSql in kernel"
description: "TreeWalker and TreeBuilder walk and build in-memory trees, and RecursiveTreeSql builds a depth-bounded, injection-safe WITH RECURSIVE query."
packages: ['@venizia/ignis-helpers', '@venizia/ignis-kernel']
---

# Changelog - 2026-08-30

## Tree utilities and RecursiveTreeSql

<Badge type="tip" text="New Feature" /> <Badge type="danger" text="Security" />

**In one line.** `TreeWalker` and `TreeBuilder` handle in-memory trees, and `RecursiveTreeSql.walk()` builds a `WITH RECURSIVE` query that always has a depth bound and validated identifiers.

## What changed

- **`TreeWalker`** (in `@venizia/ignis-helpers`). Static methods over a tree you already have: `walk`, `walkAsync`, `height`, `heightWhere`, `count`, `collectLeaves`.
- **`TreeBuilder`** (in `@venizia/ignis-helpers`). Static methods that build a tree or read one back: `build`, `leaves`, `nonLeaves`, `print`.
- **`RecursiveTreeSql.walk()`** (in `@venizia/ignis-kernel`, also reachable from `@venizia/ignis`). Walks a parent/child table up (ancestors) or down (descendants) from a root row, on Postgres or SQLite. The dialect comes from `table`, so there is no `engine` option.
- **`maxDepth` is required.** A call without it does not compile, and `maxDepth <= 0` throws at runtime.
- **Safe identifiers.** `name`, `idColumn`, `parentColumn` and every `columns` entry must be letters, digits and underscores (not starting with a digit), or the call throws. `rootId`, `maxDepth` and `startDepth` are bound parameters.

```typescript
import { TreeBuilder, TreeWalker } from '@venizia/ignis-helpers';
import { RecursiveTreeDirections, RecursiveTreeSql } from '@venizia/ignis';

const tree = await TreeBuilder.build({
  rootValue: rootCategory,
  getChildren: category => fetchChildCategories(category.id),
  getKey: category => category.id,
});
TreeWalker.walk({ root: tree, onVisit: (node, depth) => console.log(node.value.name, depth) });

const walk = RecursiveTreeSql.walk({
  name: 'category_ancestors',
  table: categoriesTable,
  rootId: categoryId,
  direction: RecursiveTreeDirections.UP,
  maxDepth: 20,
});
const rows = await db.execute(sql`${walk} SELECT * FROM category_ancestors`);
```

Other `RecursiveTreeSql.walk` options: `idColumn` (default `'id'`), `parentColumn` (default `'parent_id'`), `columns`, `recursiveFilter`, `trackPath` (default `false`), `startDepth` (default `0`).

## Who is affected

- **New code walking a hierarchy.** Use these instead of hand-written traversal or `WITH RECURSIVE` queries.
- **Everyone else.** No action needed - these are new exports.

## Details

- `TreeWalker.walk` and `walkAsync` are separate methods. When `shouldPrune(node, depth)` returns `true`, the node is still visited and only its children are skipped.
- `TreeBuilder.build` skips a branch when `getKey` repeats; it does not throw. `leaves({ includePath: true })` returns the root-to-leaf chain with each leaf.
- `maxDepth` counts edges, not rows. The root is at depth 0, so `maxDepth: N` returns up to N+1 rows.
- `table` is typed `unknown` and checked at runtime; a table that is neither Postgres nor SQLite (for example MySQL) throws.
- `maxDepth` alone guarantees the walk ends. `trackPath: true` adds `path` and `is_cycle` columns and stops expanding a row that re-visits an id in its own path.
- The `path` and `is_cycle` columns come back in a different shape per engine:

| Column | Postgres | SQLite |
|---|---|---|
| `path` | `string[]` | `string`, each id wrapped in `char(31)` |
| `is_cycle` | `boolean` | `number` (`1`/`0`) |

- On SQLite, read `is_cycle` truthily and split `path` on `String.fromCharCode(31)`. `row.is_cycle === true` is always `false` there.
- On SQLite, an id value that contains the `char(31)` byte can cause a missed cycle match. `RecursiveTreeSql` does not validate id values for this.
