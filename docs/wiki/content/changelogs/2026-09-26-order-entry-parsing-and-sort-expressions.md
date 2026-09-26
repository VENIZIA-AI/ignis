---
title: Order Entries Get One Parser, and toOrderBy Can Sort by an Expression
description: "parseOrderEntry is now a public export every relational and search dialect shares, toOrderBy gains an expressions option for sorting by a joined column or a computed SQL expression, and a malformed order entry is now a 400 instead of a silent truncation."
packages: [connectors, core-server, filter, kernel]
---

# Changelog - 2026-09-26

## Order entries: one parser, and new failure modes for malformed input

<Badge type="tip" text="Feature" /> <Badge type="warning" text="Behavior Change" />

**In one line.** Every `order` entry - relational, Typesense, Meilisearch - is now read by one exported `parseOrderEntry` function, and an entry it cannot make sense of is a `400` instead of a silent truncation.

```typescript
import { parseOrderEntry } from '@venizia/ignis-filter';

parseOrderEntry({ entry: 'createdAt DESC' }); // { field: 'createdAt', direction: 'desc' }
parseOrderEntry({ entry: 'name' }); // { field: 'name', direction: 'asc' }
```

## What changed

- **`parseOrderEntry` is a new export** of `@venizia/ignis-filter` (also from `@venizia/ignis-kernel` and `@venizia/ignis`), alongside the new `TSortDirection` and `TParsedOrderEntry` types. It replaces three private copies of the same parsing logic in the relational, Typesense, and Meilisearch dialects.
- **An entry with more than two tokens is now a 400.** `'createdAt DESC NULLS LAST'` used to sort on `createdAt DESC` and silently drop `NULLS LAST` - IGNIS order entries never gave a `NULLS LAST`/`FIRST` clause any effect, so the tail was always dead weight, just quietly accepted. It now throws before the query runs.
- **An empty entry (`''`, or all whitespace) is now a 400.** It used to reach the relational dialect as an empty field name and read as "column not found"; it now fails at the parser with a clearer message.
- **Direction error messages changed.** They now come from `parseOrderEntry` and carry the whole entry text, not the table name or the field alone. See the table below.
- **The entry in a message is now `JSON.stringify`-quoted**, not interpolated raw - `entry: "name DESC NULLS LAST"` rather than `entry: 'name DESC NULLS LAST'`. A newline or other ASCII control character inside a malformed entry is escaped instead of reaching the log or the response as a literal character. DEL, the C1 range, and the Unicode line separators `U+2028`/`U+2029` still pass through raw - `JSON.stringify` does not escape them (tracked in #65).
- **Only ASCII whitespace separates a field from its direction.** A non-breaking space (`<NBSP>`) or another Unicode space no longer splits `'name<NBSP>DESC'` into two tokens - the old `split(/\s+/)` did split on it. The whole string is now read as one field name.
- **`toOrderBy` (relational dialects) gains an `expressions` option**, for sorting by a column on a joined table or a computed SQL expression - see the next section.

## Error messages, before and after

| Case | Relational, before | Relational, after |
|---|---|---|
| Invalid direction | `[FilterBuilder][toOrderBy] Table: <t> \| Invalid direction: 'RANDOM' \| Expected: 'ASC' or 'DESC'` | `[parseOrderEntry] Invalid direction \| entry: "name RANDOM" \| Expected: 'ASC' or 'DESC'` |
| Extra tokens | Silently accepted; the tail was dropped | `[parseOrderEntry] Too many tokens \| entry: "name DESC NULLS LAST" \| Expected: '<field>' or '<field> ASC\|DESC'` |
| Empty entry | Reached the dialect as an unknown column | `[parseOrderEntry] Order entry has no field \| entry: ""` |

| Case | Search (Typesense/Meilisearch), before | Search, after |
|---|---|---|
| Invalid direction | `Invalid sort direction '<direction>' for field '<field>'` | Same `[parseOrderEntry] Invalid direction` message as relational |
| Extra tokens | Silently accepted; the tail was dropped | Same `[parseOrderEntry] Too many tokens` message |
| Empty entry | Silently accepted as an empty field | Same `[parseOrderEntry] Order entry has no field` message |

Status codes: every case that was already an error was a `400` and still is; the "silently accepted" cases (extra tokens, an empty entry) are now `400` for the first time. Unknown-column messages (`Column NOT FOUND | key: '<key>'`) are unchanged and still name the key.

## `toOrderBy` can sort by a joined column or a computed expression

<Badge type="tip" text="Feature" />

**In one line.** `IRelationalQueryDialect.toOrderBy` takes a new `expressions` option: a map from the name an order entry uses to a Drizzle column or `SQL`, for sort targets the model's own schema cannot name.

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

A key resolves as an own key of `expressions` first (`Object.hasOwn`, so an inherited name like `constructor` never matches), then as a JSON path, then as a schema column. The `id ASC` tie-breaker still closes the list unless an entry names `id`; an expression keyed `id` never counts as naming it. Omitting `expressions` costs nothing extra. See [Fields, Order & Pagination](/references/base/filter-system/fields-order-pagination#sorting-by-a-joined-column-or-a-computed-expression) for the full reference.

## Who is affected

- **Everyone calling `order` with well-formed entries (`'field'` or `'field ASC|DESC'`, ASCII whitespace):** no change in behavior.
- **An order entry with more than two tokens, or an empty entry:** now a `400` instead of a silently accepted (relational and search dialects alike). Drop the extra tokens from the entry - IGNIS never honored them.
- **An order entry using a non-ASCII space to separate field and direction:** now reads as one field name and likely resolves to an unknown column. Use a regular space or tab.
- **Code matching the old relational or search direction-error text** (`Invalid direction: '...' | Expected:`, `Invalid sort direction '...' for field '...'`): match the new `[parseOrderEntry] Invalid direction` message instead. The status code is unchanged.
- **Nobody needs to opt in to keep the old parser** - there is no flag; every dialect calls `parseOrderEntry` unconditionally. Applications wanting a joined-column or computed sort should adopt `toOrderBy`'s new `expressions` option; nothing is required if none is passed.

## See also

- [Fields, Order & Pagination](/references/base/filter-system/fields-order-pagination) - `order`, `parseOrderEntry`, `toOrderBy`'s `expressions` option
- [Filter System Overview](/references/base/filter-system/) - the `filter` shape and every operator family
- [Quick Reference](/references/base/filter-system/quick-reference) - every filter property, one line each
