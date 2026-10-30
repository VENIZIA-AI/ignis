---
title: "Where Clauses Now Type-Check the Value, Not Just the Column"
description: "TWhere<T> now rejects a value that does not fit its column's type; before, every value was typed any."
packages: ['@venizia/ignis-connectors', '@venizia/ignis', '@venizia/ignis-filter']
---

# Changelog - 2026-08-30

## Where Clauses Now Type-Check the Value, Not Just the Column

<Badge type="warning" text="Breaking Change" /> <Badge type="tip" text="Enhancement" />

**In one line.** `TWhere<T>` now checks that a where-clause value fits its column's type; a column name that does not exist on `T` was already rejected.

## What changed

- **Values are checked.** `{ status: 123 }` on a `string` column no longer compiles. Before, every value was `any`.
- **`TWhereOperators<V>`.** The 25 field operators from `QueryOperators` (`eq`, `gt`, `like`, `in`, `between`, `contains`, ...), typed against the column's value type.
- **`TWhereValue<V>`.** A column's condition is a bare scalar, a bare `null` (the way to write `IS NULL`), or an operator object.
- **`between` and `notBetween`** are typed as a `[V, V]` tuple.
- **`isoTimestamp` columns accept a `Date`** directly, bare or inside an operator (`gt`, `gte`, `lt`, `lte`, `between`). No `.toISOString()` is needed, and call sites that already use it keep working.

## Who is affected

- **Code that passes a wrongly typed value for a real column.** It compiled before and does not now. Correct the where clause; do not widen the type back.
- **Code using `isoTimestamp` columns.** No action needed.
- **JSON and JSONB columns are not covered.** They are still declared `any` in application schemas, so a typo inside a JSON path stays silent. Typing JSON paths needs `$type<>()` on your jsonb columns first.

## Breaking changes

> [!WARNING]
> Any caller that passed a value of the wrong type for a real column now gets a compile error.

**Before:**

```typescript
type Product = { id: number; status: string; price: number | null };

const where: TWhere<Product> = { status: 123 }; // compiled
```

**After:**

```typescript
import type { TWhere } from '@venizia/ignis-filter';

const valid: TWhere<Product> = { status: 'active', price: { gte: 10 } };

// @ts-expect-error - 123 is not a valid value for a string column.
const wrongType: TWhere<Product> = { status: 123 };
```

## Details

- The `Date` exception applies only to the branded `TIsoTimestamp` type. A plain `text` column still rejects a `Date`.
- Reading an `isoTimestamp` column back is unchanged: `TIsoTimestamp` is a subtype of `string`.
