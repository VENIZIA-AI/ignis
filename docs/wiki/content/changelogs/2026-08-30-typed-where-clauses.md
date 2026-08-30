---
title: "Where Clauses Now Type-Check the Value, Not Just the Column"
description: "TWhere<T> already rejected a column name that didn't exist on T. It did not check the value against that column's type at all - every value was any. It does now."
---

# Changelog - 2026-08-30

## Where Clauses Now Type-Check the Value, Not Just the Column

<Badge type="warning" text="Breaking Change" /> <Badge type="tip" text="Enhancement" />

**In one line.** `TWhere<T>` now checks that a where-clause value fits its column's type. A column name that doesn't exist on `T` was already rejected; a value of the wrong type for a real column was not.

## The problem it solves

`TWhere<T>` was defined as `{ [key in keyof T]?: any } & { and?; or? }`. The `[key in keyof T]` part did limit which columns you could name. It did not check what you put in them - every column's value was typed `any`.

```typescript
type Product = { id: number; status: string; price: number | null };

// `status` is a string column. This compiled clean.
const where: TWhere<Product> = { status: 123 };
```

Nothing logged the mismatch, and TypeScript had no way to catch it either - `any` accepts anything.

## What changed

- **`TWhereOperators<V>`** - the 25 field operators from `QueryOperators` (`eq`, `gt`, `like`, `in`, `between`, `contains`, ...), each typed against the column's own value type `V`.
- **`TWhereValue<V>`** - a column's condition is a bare scalar (`status: 'active'`), a bare `null` (`deletedAt: null`, the common way to write `IS NULL`), or an operator object (`price: { gte: 10 }`).
- **`TWhere<T>`** - now `{ [key in keyof T]?: TWhereValue<T[key]> }`, so a key must be a real column of `T` and its value must fit that column.

```typescript
import type { TWhere } from '@venizia/ignis-filter';

type Product = { id: number; status: string; price: number | null };

const valid: TWhere<Product> = { status: 'active', price: { gte: 10 } };

// @ts-expect-error - 123 is not a valid value for a string column.
const wrongType: TWhere<Product> = { status: 123 };
```

A column name that doesn't exist on `T` (`{ stat: 'active' }`) was already rejected before this
change - that part of the mapped type was never the problem. Only the value side was `any`.

| Type | Shape | Notes |
|---|---|---|
| `TWhereOperators<V>` | `{ eq?: V; gt?: V; in?: V[]; between?: [V, V]; ... }` | Mirrors `QueryOperators` field-by-field. |
| `TWhereValue<V>` | `V \| null \| TWhereOperators<V>` | `null` is mandatory - it is how a caller writes `IS NULL`. |
| `TWhere<T>` | `{ [K in keyof T]?: TWhereValue<T[K]> } & { and?; or? }` | Unchanged shape, tightened values. |

## Who is affected

- **Relational and search connectors, `core-server`, `core-worker`, `boot`.** All rebuilt clean against the new type. Three internal call sites in `packages/connectors` (`updateById`, `deleteById`, `restoreById`, `findById`) build `{ id: opts.id }` against a generic `DataObject` the compiler cannot fully resolve; each now carries an explicit `TWhere<DataObject>` cast with a one-line comment, since the generic's constraint is too deeply nested for `tsc` to verify on its own.
- **Every downstream caller with a wrong-typed value for a real column.** That code compiled before. It will not compile now, and the fix is to correct the where clause, not to widen the type back.
- **JSON and JSONB columns are not covered.** A `metadata` or `jValue` column is still declared `any` in application schemas, so `TWhereValue<any>` accepts anything under it. A typo inside a JSON path stays silent before and after this change - dot-path key typing needs the application to declare `$type<>()` on its jsonb columns first, and is separate future work.

## Details

- Operators come from `QueryOperators` in `packages/filter/src/common/operators.ts` - 25 field operators plus `and`/`or`/`not`. Every operator in that list has a matching field in `TWhereOperators<V>`; none were invented.
- `between`/`notBetween` are now typed as a `[V, V]` tuple. A test that intentionally sends the wrong arity to prove the *runtime* guard still fires (`postgres-query-operators-between.test.ts`) casts the literal `as any` - the type system and the runtime guard are answering different questions: what `tsc` can prove, versus what a wire caller can actually send.
- `examples/vert` compared a `string` column against a `Date` value; fixed at the call site with `.toISOString()` rather than widening the column's type to admit `Date`, which would have made the type lie about what the column reads back as.

| File | Package |
|------|---------|
| `src/common/types.ts` | filter |
| `src/relational/core/repositories/core/persistable.ts` | connectors |
| `src/relational/core/repositories/core/readable.ts` | connectors |
| `src/relational/core/repositories/core/soft-deletable.ts` | connectors |
| `src/__tests__/filter-builder/postgres-query-operators-between.test.ts` | core-server |
| `src/__tests__/filter-builder/where-type-safety.test.ts` | core-server |
| `src/services/tests/comprehensive-operator-test.service.ts` | examples/vert |
