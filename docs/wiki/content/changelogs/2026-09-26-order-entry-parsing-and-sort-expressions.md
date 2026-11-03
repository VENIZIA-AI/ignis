---
title: Order Entries Get One Parser, and toOrderBy Can Sort by an Expression
description: "parseOrderEntry is now a public export every dialect shares, toOrderBy gains an expressions option for sorting by a joined column or a computed SQL expression, and a malformed order entry is now a 400 instead of a silent truncation."
packages: ['@venizia/ignis-connectors', '@venizia/ignis', '@venizia/ignis-filter', '@venizia/ignis-kernel']
---

# Changelog - 2026-09-26

## Order entries: one parser, and a 400 for malformed input

<Badge type="tip" text="Feature" /> <Badge type="warning" text="Behavior Change" />

**In one line.** Every `order` entry (relational, Typesense, Meilisearch) is read by one exported `parseOrderEntry`, and an entry it cannot make sense of is a `400` instead of a silent truncation.

```typescript
import { parseOrderEntry } from '@venizia/ignis-filter';

parseOrderEntry({ entry: 'createdAt DESC' }); // { field: 'createdAt', direction: 'desc' }
parseOrderEntry({ entry: 'name' }); // { field: 'name', direction: 'asc' }
```

## What changed

- **`parseOrderEntry` is a new export** of `@venizia/ignis-filter` (also from `@venizia/ignis-kernel` and `@venizia/ignis`), with the new `TSortDirection` and `TParsedOrderEntry` types.
- **An entry with more than two tokens is a 400.** `'createdAt DESC NULLS LAST'` used to sort on `createdAt DESC` and drop `NULLS LAST`. IGNIS never gave a `NULLS LAST` or `FIRST` clause any effect.
- **An empty entry (`''` or whitespace) is a 400.** It used to read as "column not found".
- **Direction error messages changed.** They now start with `[parseOrderEntry]`, for example `[parseOrderEntry] Invalid direction | entry: "name RANDOM" | Expected: 'ASC' or 'DESC'`, and the other cases read `[parseOrderEntry] Too many tokens ...` and `[parseOrderEntry] Order entry has no field ...`. Status codes are unchanged for cases that were already errors. Unknown-column messages (`Column NOT FOUND | key: '<key>'`) are unchanged.
- **The entry in a message is `JSON.stringify`-quoted**, so a newline or other ASCII control character is escaped. DEL, the C1 range, and `U+2028`/`U+2029` still pass through raw.
- **Only ASCII whitespace separates a field from its direction.** A non-breaking space or another Unicode space no longer splits `'name<NBSP>DESC'`; the whole string is read as one field name.

## `toOrderBy` can sort by a joined column or a computed expression

<Badge type="tip" text="Feature" />

**In one line.** `IRelationalQueryDialect.toOrderBy` takes a new `expressions` option: a map from the name an order entry uses to a Drizzle column or `SQL`.

```typescript
import { sql } from 'drizzle-orm';

const orderBy = queryDialect.toOrderBy({
  tableName: 'item',
  schema: itemTable,
  order: ['groupLabel ASC', 'displayName DESC'],
  expressions: {
    groupLabel: groupTable.label, // a column on a joined table
    displayName: sql`COALESCE(${itemTable.nickname}, ${itemTable.name})`, // a computed value
  },
});
// ORDER BY "group"."label" asc, COALESCE("item"."nickname", "item"."name") desc, "item"."id" asc
```

A key resolves as an own key of `expressions` first (an inherited name like `constructor` never matches), then as a JSON path, then as a schema column. The `id ASC` tie-breaker still closes the list unless an entry names `id`; an expression keyed `id` never counts as naming it. See [Fields, Order & Pagination](/references/base/filter-system/fields-order-pagination#sorting-by-a-joined-column-or-a-computed-expression).

## Who is affected

- **Well-formed entries (`'field'` or `'field ASC|DESC'`, ASCII whitespace).** No change.
- **An entry with more than two tokens, or an empty entry.** Now a `400`. Drop the extra tokens.
- **An entry using a non-ASCII space between field and direction.** Now one field name, likely an unknown column. Use a regular space or tab.
- **Code matching the old direction-error text** (`Invalid direction: '...' | Expected:`, `Invalid sort direction '...' for field '...'`). Match the new `[parseOrderEntry] Invalid direction` message.
- **There is no flag to keep the old parser.** Adopt `expressions` only if you want a joined or computed sort.
