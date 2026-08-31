---
title: TEntityId Makes a String Id Impossible to Confuse With a String
description: An opt-in branded string type so passing a name, code or email where an entity id belongs is a compile error instead of a silent lookup that returns nothing.
---

# Changelog - 2026-08-31

## TEntityId

<Badge type="tip" text="New Feature" />

**In one line.** `TEntityId` is a `string` a plain `string` will not assign to, so the compiler catches an id/name mix-up that today fails silently at runtime.

## The bug it catches

Every string id in a codebase has the same type as every other string. The compiler sees no difference between these two:

```typescript
const merchant = { id: 'M1', name: 'Cua hang A' };

await merchantRepository.findById({ id: merchant.name });
```

That compiles. It runs. It returns nothing, and the caller reads the empty result as "no such merchant" rather than "I passed the wrong field". The same shape covers passing a `storeId` where a `merchantId` belongs, or a slug where an id belongs - all of them are `string`, so nothing objects.

With `TEntityId` on the column, the second line is a compile error at the call site.

## How to use it

```typescript
import { toEntityId } from '@venizia/ignis-kernel';
import type { TEntityId } from '@venizia/ignis-kernel';

// Opt a column in
merchantId: text('merchant_id').$type<TEntityId>().notNull(),

// The only way to produce one
const id = toEntityId({ value: request.params.merchantId });
```

A `TEntityId` still behaves as a string everywhere a string is accepted - concatenation, `toUpperCase()`, template literals, `JSON.stringify`. Only the direction *into* the type is restricted.

## It validates nothing, and that is the point

> [!IMPORTANT]
> `toEntityId` is a cast with a non-empty check. It does not verify the row exists, match a format, or check a prefix.

The value is making the conversion **visible at each boundary**. Every place a raw string becomes an id is now a line you can grep for, rather than an implicit widening nobody wrote down. An empty string is refused because an id of `''` collapses a `where` clause to no condition - a filter that silently matches everything is worse than one that throws.

## The cost is real, and it is not optional

Drizzle derives both `$inferSelect` and `$inferInsert` from the same column type. Branding a column therefore rejects **every literal** written against it until each one converts:

```typescript
await merchantRepository.create({ data: { merchantId: 'M1' } });         // no longer compiles
await merchantRepository.create({ data: { merchantId: toEntityId({ value: 'M1' }) } });
```

Seeds, fixtures, test data and path params all pay this. That is why the type is **opt-in per column** rather than applied across the framework.

The obvious escape - `TEntityId | string` - was measured and does not work: a union restores the literals but makes a plain `string` assignable again, which erases the entire guarantee. There is no version of this that catches the bug without rejecting the literals.

## Who is affected

- **Nobody, unless they opt in.** No IGNIS type changes, no column is branded by default, and no existing code needs updating. This release only makes the type available.
- **A codebase adopting it** should brand one entity family first and convert its call sites, rather than branding everything at once.

| File | Package |
|------|---------|
| `src/base/models/common/types.ts` | kernel |
