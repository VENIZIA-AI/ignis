---
title: "Tree Utilities Join helpers, and RecursiveTreeSql Bounds Every Recursive Walk in kernel"
description: "TreeWalker and TreeBuilder bring pure in-memory tree walking and building to @venizia/ignis-helpers. RecursiveTreeSql builds a bounded, injection-safe WITH RECURSIVE query in @venizia/ignis-kernel, with maxDepth mandatory and validated at runtime."
---

# Changelog - 2026-08-30

## Tree Utilities Join helpers

<Badge type="tip" text="New Feature" />

**In one line.** `TreeWalker` and `TreeBuilder` bring pure, dependency-free tree walking and building to `@venizia/ignis-helpers`.

### The problem it solves

Two copies of the same tree algorithms existed side by side, and neither covered what the other did. One knew how to prune a walk at a boundary and measure height; the other knew how to build a tree from an async source and guard against cycles. Picking one meant giving up the other's capability.

### What changed

`modules/tree/` adds two focused classes instead of one do-everything one:

- **`TreeWalker`** - static methods over a tree you already have: `walk`, `walkAsync`, `height`, `heightWhere`, `count`, `collectLeaves`.
- **`TreeBuilder`** - static methods that build a tree, or read one back with the path attached: `build`, `leaves`, `nonLeaves`, `print`.

```typescript
import { TreeBuilder, TreeWalker } from '@venizia/ignis-helpers';

const tree = await TreeBuilder.build({
  rootValue: rootCategory,
  getChildren: category => fetchChildCategories(category.id),
  getKey: category => category.id,
});

TreeWalker.walk({
  root: tree,
  onVisit: (node, depth) => console.log(node.value.name, depth),
});
```

`walk` and `walkAsync` stay two methods, not one method with a mode flag - a synchronous walk returns `void`, an asynchronous one returns `Promise<void>`, and collapsing them would force every synchronous caller to `await` a value that was never a promise.

### Three behaviors carried over on purpose

Each of these looks like it could be "fixed" to match intuition. Don't - each was paid for in production.

| Behavior | What it means |
|---|---|
| `shouldPrune(node, depth)` returning `true` | `node` is still visited - `onVisit` still runs. Only its children are skipped. Measuring depth to a boundary needs the boundary node counted. |
| `build` sees a repeated `getKey` | Skips that branch. Does not throw. Real hierarchies contain legitimate diamonds - the same node reachable through two parents - and a diamond is not a cycle. |
| `leaves({ includePath: true })` | Returns the root-to-leaf chain alongside each leaf, so building something like a nested order-line view costs one traversal instead of two. |

### Who is affected

- **New code.** Import `TreeWalker`/`TreeBuilder` from `@venizia/ignis-helpers` instead of hand-writing tree traversal.
- **Everyone else.** No change - this is a new module, nothing existing moved or renamed.

### Details

- Pure: `Map`, `Set`, and arrays only. No Drizzle, no DI container, no I/O - that purity is why it lives in `helpers` and not `kernel`.
- `TreeBuilder.build`'s `getChildren` may return a plain array or a promise; the build is always asynchronous even when a given fetcher is not, because real callers fetch children from a repository.
- `RecursiveTreeSql`, the SQL-emitting counterpart for a database-backed tree walk, lives in `@venizia/ignis-kernel` - see the next section.

| File | Package |
|------|---------|
| `src/modules/tree/common/types.ts` | helpers |
| `src/modules/tree/walk.ts` | helpers |
| `src/modules/tree/builder.ts` | helpers |

## RecursiveTreeSql - A Bounded, Injection-Safe WITH RECURSIVE Builder

<Badge type="tip" text="New Feature" /> <Badge type="danger" text="Security" />

**In one line.** `RecursiveTreeSql.walk()` builds a `WITH RECURSIVE` fragment that walks an adjacency-list table up or down from a root row, with a mandatory depth bound and validated identifiers.

### The problem it solves

A recursive query that walks a parent chain needs its own depth guard, hand-written, every time. Fourteen call sites remembered. One did not - it walked a merchant's parent chain with no bound and no cycle guard, and hung a production process the moment the data contained `A -> B -> A`.

A rule that fifteen call sites must each remember correctly is a rule that will eventually be forgotten once. Making the depth bound a required parameter turns "remember to add one" into "the code will not compile without one."

### What changed

```typescript
import { RecursiveTreeDirections, RecursiveTreeSql } from '@venizia/ignis';

const walk = RecursiveTreeSql.walk({
  name: 'category_ancestors',
  table: categoriesTable,
  rootId: categoryId,
  direction: RecursiveTreeDirections.UP,
  maxDepth: 20,
});

// walk is a Drizzle SQL fragment - write your own SELECT around it:
const rows = await db.execute(sql`${walk} SELECT * FROM category_ancestors`);
```

| Option | Type | Default | Meaning |
|---|---|---|---|
| `name` | `string` | - | CTE name your own `SELECT` references afterward. |
| `table` | `unknown` | - | A Drizzle table. Checked at runtime with `is(table, Table)`, and also picks the SQL dialect - see below. |
| `rootId` | `string` | - | The row to start from. Bound as an ordinary parameter, never spliced into SQL text. |
| `direction` | `'UP' \| 'DOWN'` | - | `DOWN` follows `parentColumn -> idColumn` (descendants). `UP` follows the reverse (ancestors). |
| `maxDepth` | `number` | - (required) | Recursion bound, counted in **edges**. Must be a positive integer - `<= 0` throws. |
| `idColumn` | `string` | `'id'` | |
| `parentColumn` | `string` | `'parent_id'` | |
| `columns` | `string[]` | `[]` | Extra columns carried into every row of the walk. |
| `recursiveFilter` | `SQL` | - | ANDed into the recursive term's `WHERE` clause. Build it with Drizzle's own `sql` tag. |
| `trackPath` | `boolean` | `false` | Emits `path` and `is_cycle`; stops expanding a row once it re-visits an id already in its own path. **The two columns come back in different shapes per engine - see below.** |
| `startDepth` | `number` | `0` | Depth value assigned to the root row. |

### `maxDepth` is mandatory, and `0` is rejected too

`maxDepth` has no `?` and no default - a caller who forgets it gets a compile error. That alone is not enough: `0` type-checks as a valid `number` but produces a recursive term that runs zero times, so the query silently returns nothing. `RecursiveTreeSql.walk` checks this at runtime and throws for `maxDepth <= 0`, turning a query that looks like it ran but returned nothing into an error that says why.

**It counts edges, not rows.** The root sits at `depth 0`, so `maxDepth: N` returns up to **N+1** rows. Measured against a real Postgres on a five-node chain:

| `maxDepth` | Rows | Deepest `depth` |
|---|---|---|
| `1` | 2 | 1 |
| `2` | 3 | 2 |
| `4` | 5 | 4 |
| `5` | 5 | 4 (chain exhausted) |

Worth stating because "depth" and "how many levels I want back" are the same word to most callers and differ by one. Asking for `maxDepth: 1` to get the row and its parent is right; expecting one row is not.

### `table` stays `unknown`, checked at runtime

`table` is typed `unknown`, not a tightened Drizzle generic. `kernel` cannot see an application's own schema, and a type that pretends to know the shape of a table it has never seen is worse than `unknown` - it looks safe and is not. At runtime, `RecursiveTreeSql.walk` checks `is(table, Table)` and throws `getError` naming what actually arrived when the check fails.

`table` also picks the SQL dialect. `walk` checks `is(table, PgTable)` and `is(table, SQLiteTable)` and compiles the matching form - there is no separate `engine` option, so there is no way for an option to disagree with the schema you called it with. A table belonging to neither (MySQL, for example) throws the same way an invalid table does.

### Identifiers are the injection surface here, not values

`rootId`, `maxDepth`, and `startDepth` are ordinary bound parameters - Drizzle parameterizes them automatically. `name`, `idColumn`, `parentColumn`, and every entry of `columns` are different: they become SQL identifiers, and an identifier cannot be parameterized the way a value can. Each one is checked against a strict allowlist (letters, digits, and underscores, not starting with a digit) before it reaches a query template, and `sql.identifier` quotes it on top of that. A caller who passes `idColumn: 'id"; DROP TABLE users; --'` gets a thrown error naming the field and the value, not a query that runs.

### Cycle safety

```typescript
const walk = RecursiveTreeSql.walk({
  name: 'merchant_chain',
  table: merchantsTable,
  rootId: merchantId,
  direction: RecursiveTreeDirections.UP,
  maxDepth: 50,
  trackPath: true,
});
```

`maxDepth` alone already guarantees the walk terminates, with or without `trackPath` - it is an unconditional bound on the recursion. `trackPath: true` adds a cycle-detection idiom on top: a `path` value and an `is_cycle` flag, with `AND NOT r.is_cycle` in the recursive term so a row already flagged cyclic is never expanded again. On the exact production shape that used to hang - `A -> B -> A` - the walk now returns three rows, the third flagged `is_cycle: true`, instead of never returning.

Postgres and SQLite express `path` differently, because SQLite has no array type:

| Engine | `path` | Membership test |
|---|---|---|
| Postgres | native array (`ARRAY[...]`) | `= ANY(path)` |
| SQLite | text, each id wrapped in a `char(31)` delimiter | `instr(path, char(31) \|\| id \|\| char(31)) > 0` |

`char(31)` is the ASCII Unit Separator - a control character that does not occur in ordinary UUIDs, serial ids, slugs, or emails. Wrapping every id on both sides, rather than joining with a plain separator, stops a partial match: without it, an id of `1` would look like it appeared inside `12`. The SQLite form is exact as long as no id value ever contains that byte. `RecursiveTreeSql` does not validate or escape id values for this - it is a real, if narrow, gap: an id containing `char(31)` could produce a false-negative cycle match.

**Both emitted columns reach your code in a different shape per engine.** The generated SQL is correct on each, but the rows are not interchangeable:

| Column | Postgres | SQLite |
|---|---|---|
| `path` | `string[]` - a real array | `string` - ids joined and wrapped by `char(31)` |
| `is_cycle` | `boolean` (`true`/`false`) | `number` (`1`/`0`) - SQLite has no boolean literal |

So `row.path.length` and `row.is_cycle === true` both work on Postgres and both fail on SQLite - the first throws, the second is quietly always `false`. Read `is_cycle` truthily, and split `path` on `String.fromCharCode(31)` when the engine is SQLite. Stated here because nothing in the type signature shows it: `walk()` returns a `SQL`, and the row shape is whatever the driver hands back.

### Who is affected

- **New code walking a parent/child hierarchy in SQL.** Use `RecursiveTreeSql.walk` instead of hand-writing a `WITH RECURSIVE` query and its own depth guard.
- **Everyone else.** No change - this is a new export, nothing existing moved.

### Details

- Supports Postgres and SQLite, selected from `table` - no `engine` option to pass or get wrong. `trackPath`'s cycle guard differs by engine because SQLite has no array type - see Cycle safety above for the exact difference and its one semantic gap.
- `RecursiveTreeDirections` (`UP`/`DOWN`) follows the repo's const-class convention, not a bare object literal.
- `import { RecursiveTreeSql } from '@venizia/ignis'` resolves - `core-server` re-exports `kernel` wholesale, so no new dependency is needed to reach it from an application already on `@venizia/ignis`.
- The in-memory counterpart for a tree you build without a database - `TreeWalker`/`TreeBuilder` - lives in `@venizia/ignis-helpers`, see the section above.

| File | Package |
|------|---------|
| `src/base/repositories/sqls/recursive-tree.ts` | kernel |

## See also

- [Casbin Single-Wave Extraction - Recursive CTE Replaces the Second Query Wave](./2026-07-20-casbin-single-wave-extraction) - an earlier hand-written recursive CTE in the authorization path.
