---
title: "Typed JSON-Path Keys in TWhere, and an Opt-In TOrderEntry"
description: "A JSON-path key like 'metadata.a.b' now type-checks against T's JSON columns with no cast, and a new TOrderEntry<T> type checks an order list the same way. Both additive, no runtime change."
---

# Changelog - 2026-09-26

## Typed JSON-Path Keys in `TWhere<T>`, and an Opt-In `TOrderEntry<T>`

<Badge type="tip" text="Enhancement" />

**In one line.** `TWhere<T>` now type-checks a JSON-path key (`'metadata.a.b'`) against `T`'s JSON columns, with no cast and no `TWhere<any>`. `TOrderEntry<T>` is a new opt-in type for checking an `order` list the same way.

## The problem it solves

`TWhere<T>` already typed a column's own value ([2026-08-30](/changelogs/2026-08-30-typed-where-clauses)), but a JSON-path key was still an excess property under `T`'s mapped type - the compiler had no notion of "this key belongs to a JSON column." Every dotted or bracketed key needed a widening cast or a `TWhere<any>` to compile:

```typescript
type Product = { id: number; metadata: unknown };

// Before: rejected as an excess property, unless widened.
const where = { 'metadata.a.b': 'value' } as TWhere<Product>;
```

Ordering had the same gap: `TFilter<T>.order` is `string[]`, so nothing caught a typo in an order entry before it reached the query.

## What changed

- **`TJsonColumnKey<T>`** - the columns of `T` whose value can hold JSON: `unknown`, `any`, or an object other than `Date` or `TIsoTimestamp`.
- **`TJsonPathKey<T>`** - a JSON-path key on one of those columns: `` `${TJsonColumnKey<T>}.${string}` | `${TJsonColumnKey<T>}[${string}` ``.
- **`TWhere<T>`** now accepts a `TJsonPathKey<T>` alongside its column keys, no cast needed:

  ```typescript
  import type { TWhere } from '@venizia/ignis-filter';

  type Product = { id: number; metadata: unknown };

  const where: TWhere<Product> = { 'metadata.a.b': 'value' }; // compiles
  ```

- **`TOrderEntry<T>`**, opt-in through `satisfies`:

  ```typescript
  import type { TOrderEntry } from '@venizia/ignis-filter';

  const order = ['name DESC', 'metadata.rank asc'] satisfies TOrderEntry<Product & { name: string }>[];
  ```

`TJsonColumnKey`, `TJsonPathKey` and `TOrderEntry` are exported from `@venizia/ignis-filter` and reachable through `@venizia/ignis-kernel` and `@venizia/ignis`.

## Who is affected

- **Code that cast a dotted where key to get past the compiler.** A cast like `{ 'metadata.a': 1 } as TWhere<T>` is no longer needed for a JSON column - the plain object now compiles. No action needed; the cast can stay or go.
- **Everyone else.** No runtime change in any dialect - the SQL a query runs today is unchanged. `TFilter<T>.order` stays `string[]`; `TOrderEntry<T>` is opt-in and does not touch it.
- **Code that types a where clause `Record<string, unknown>`.** Still assigns to `TWhere<T>` for a row with a JSON column, directly and inside `and`/`or` - this change does not narrow that.

## Known limits

- **The value on a JSON-path key is `unknown`.** Only the column part of the key is checked; a typo (`'metdata.a'`) or a path on a non-JSON column (`'score.a'` on a number column) is still a compile error, but any value on a valid JSON-path key compiles.
- **A relation-shaped object field counts as a JSON column at the type level.** A model type that carries a relation object (`{ creator?: { id; name } }`) makes `'creator.name'` type-check as a `TWhere<T>` key, even though `creator` is not a real column. The runtime still throws `Column 'creator' is not a JSON column` - the type and the runtime disagree only here.
- **A JSON-path order entry's direction is not type-checked.** `'metadata.rank sideways'` still satisfies `TOrderEntry<T>`; the runtime order parser rejects an invalid direction regardless.

## Details

| File | Package |
|------|---------|
| `src/common/types.ts` | filter |

See [JSON/JSONB Filtering](/references/base/filter-system/json-filtering#typed-json-path-keys) and [Fields, Ordering & Pagination](/references/base/filter-system/fields-order-pagination#typed-order-entries-opt-in) for the full reference.
