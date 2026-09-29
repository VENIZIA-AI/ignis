---
title: A Where Can Restrict a Column by a SQL Subquery
description: "New inSql and ninSql operators take a Drizzle SQL subquery built in server code, so a list filtered by another table runs as one query with no id list in between."
---

# Changelog - 2026-09-29

## `inSql` and `ninSql`

<Badge type="tip" text="Feature" />

**In one line.** A `where` can now say "this column is among the rows a subquery returns" - `` { id: { inSql: sql`...` } } `` - so filtering by another table no longer needs a first query that collects ids.

## What is new

```typescript
import { sql } from 'drizzle-orm';

const taggedRed = sql`SELECT ${tagTable.orderId} FROM ${tagTable} WHERE ${tagTable.label} = ${label}`;

await orderRepository.find({ filter: { where: { id: { inSql: taggedRed } } } });
await orderRepository.count({ where: { id: { ninSql: taggedRed } } });
```

- `inSql` emits `"col" IN (<subquery>)`, `ninSql` emits `"col" NOT IN (<subquery>)`.
- Works in `find`, `findOne`, `count`, update and delete wheres, nested `and`/`or`, and together with the default filter and row scope.
- `TWhereOperators` gains `inSql?: TSqlFragment` and `ninSql?: TSqlFragment`. `TSqlFragment` is `{ getSQL(): unknown }` - a Drizzle `SQL` or `SQLWrapper` - named structurally so `@venizia/ignis-filter` stays free of Drizzle.

## Safety

The operand must be a SQL object built in server code. A string is refused with a 400, and a filter that arrives as JSON over HTTP cannot carry a SQL object, so the operators add no injection path. Values go into the subquery through Drizzle's `${}` bindings.

## Good to know

- An empty subquery matches nothing under `inSql` and everything under `ninSql`.
- If the subquery returns a NULL, `NOT IN` matches no row, as in SQL. Filter NULLs out inside the subquery when the column can hold them.
- Postgres and SQLite support both operators. Typesense and Meilisearch refuse them with a 400.

## Who is affected

Nobody has to change anything. Code that collects ids in a first query and then filters with `inq` can move to `inSql` and drop the round trip and any cap on the id list.

**Files:** [`packages/connectors/src/relational/core/repositories/dialect/internal/subquery.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/core/repositories/dialect/internal/subquery.ts)
