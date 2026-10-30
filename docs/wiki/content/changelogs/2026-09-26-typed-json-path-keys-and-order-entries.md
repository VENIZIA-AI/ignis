---
title: "Typed JSON-Path Keys in TWhere, and an Opt-In TOrderEntry"
description: "A JSON-path key like 'metadata.a.b' now type-checks against T's JSON columns with no cast, and a new TOrderEntry<T> type checks an order list the same way."
packages: ['@venizia/ignis-filter']
---

# Changelog - 2026-09-26

## Typed JSON-Path Keys in `TWhere<T>`, and an Opt-In `TOrderEntry<T>`

<Badge type="tip" text="Enhancement" />

**In one line.** `TWhere<T>` now type-checks a JSON-path key (`'metadata.a.b'`) against `T`'s JSON columns with no cast, and `TOrderEntry<T>` is a new opt-in type for checking an `order` list the same way.

## What changed

- **`TWhere<T>` accepts a JSON-path key on a JSON column** without `as TWhere<T>` or `TWhere<any>`. Before, `{ 'metadata.a.b': 'value' } as TWhere<Product>` was needed.
- **`TOrderEntry<T>`** checks an order list, opt-in through `satisfies`.
- **New exported types:** `TJsonColumnKey<T>` (columns whose value can hold JSON: `unknown`, `any`, or an object other than `Date` or `TIsoTimestamp`), `TJsonPathKey<T>`, and `TOrderEntry<T>`, from `@venizia/ignis-filter`, `@venizia/ignis-kernel` and `@venizia/ignis`.

```typescript
import type { TOrderEntry, TWhere } from '@venizia/ignis-filter';

type Product = { id: number; metadata: unknown };

const where: TWhere<Product> = { 'metadata.a.b': 'value' }; // compiles

const order = ['name DESC', 'metadata.rank asc'] satisfies TOrderEntry<Product & { name: string }>[];
```

## Who is affected

- **Code that cast a dotted where key.** The cast is no longer needed for a JSON column; it can stay or go.
- **Everyone else.** No runtime change in any dialect. `TFilter<T>.order` stays `string[]`.
- **Code that types a where clause `Record<string, unknown>`** still assigns to `TWhere<T>` for a row with a JSON column.

## Details

Known limits:

- **The value on a JSON-path key is `unknown`.** Only the column part is checked. A typo (`'metdata.a'`) or a path on a non-JSON column (`'score.a'` on a number column) is a compile error, but any value on a valid JSON-path key compiles.
- **A relation-shaped object field counts as a JSON column at the type level.** `'creator.name'` type-checks even though `creator` is not a real column, and the runtime throws `Column 'creator' is not a JSON column`.
- **A JSON-path order entry's direction is not type-checked.** `'metadata.rank sideways'` still satisfies `TOrderEntry<T>`; the runtime parser rejects an invalid direction.

See [JSON/JSONB Filtering](/references/base/filter-system/json-filtering#typed-json-path-keys) and [Fields, Ordering & Pagination](/references/base/filter-system/fields-order-pagination#typed-order-entries-opt-in).
