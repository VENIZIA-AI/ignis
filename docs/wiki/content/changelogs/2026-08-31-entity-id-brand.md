---
title: TEntityId Makes a String Id Impossible to Confuse With a String
description: An opt-in branded string type, so passing a name, code or email where an entity id belongs is a compile error instead of a silent lookup that returns nothing.
packages: ['@venizia/ignis-kernel']
---

# Changelog - 2026-08-31

## TEntityId

<Badge type="tip" text="New Feature" />

**In one line.** `TEntityId` is a `string` that a plain `string` will not assign to, so the compiler catches an id mix-up that otherwise fails silently at runtime.

## What changed

- **Opt in per column.** Brand a column with `$type<TEntityId>()` and passing a name or slug where an id belongs becomes a compile error.
- **`toEntityId({ value })`** is the only way to produce one. It checks the value is non-empty and nothing else: it does not check that the row exists or match a format.
- **It still behaves as a string** for concatenation, `toUpperCase()`, template literals and `JSON.stringify`. Only assigning a plain `string` into it is restricted.

```typescript
import { toEntityId } from '@venizia/ignis-kernel';
import type { TEntityId } from '@venizia/ignis-kernel';

merchantId: text('merchant_id').$type<TEntityId>().notNull(),

const id = toEntityId({ value: request.params.merchantId });
```

## Who is affected

- **Nobody, unless they opt in.** No column is branded by default and no existing code needs updating.
- **A codebase adopting it.** Branding a column rejects every string literal written against it, in seeds, fixtures, test data and path params, until each is wrapped in `toEntityId`. Brand one entity family first. A `TEntityId | string` union does not work, because it makes a plain `string` assignable again.

```typescript
await merchantRepository.create({ data: { merchantId: 'M1' } });                         // no longer compiles
await merchantRepository.create({ data: { merchantId: toEntityId({ value: 'M1' }) } });
```
