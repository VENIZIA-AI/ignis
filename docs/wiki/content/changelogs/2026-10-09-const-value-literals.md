---
title: Const Values Stay Literal
description: "TConstValue, TStringConstValue and TNumberConstValue no longer widen to string or number in an object literal, a let or an inferred generic. A test that compares one of these values with a plain string needs a type argument."
---

# Changelog - 2026-10-09

## Const values stay literal

<Badge type="info" text="Bug Fix" /> <Badge type="warning" text="Breaking Change" />

**In one line.** A value typed with `TConstValue<typeof X>` keeps its literal union wherever it goes.

```typescript
class Periods {
  static readonly HALF_DAY = '12h';
  static readonly DAY = '24h';
}
type TPeriod = TConstValue<typeof Periods>; // '12h' | '24h'

const rows: { value: TPeriod }[] = [{ value: Periods.HALF_DAY }, { value: Periods.DAY }];
const mapped = rows.map(row => ({ value: row.value }));
const typed: { value: TPeriod }[] = mapped; // compiled only after this fix
```

## What changed

- **The three aliases end in `& {}`.** `TConstValue`, `TStringConstValue` and `TNumberConstValue` in `@venizia/ignis-helpers`, and `TConstValue` in `@venizia/ignis-inversion`, have the same members as before.
- **The members no longer widen.** Before, a value of these types became `string` or `number` inside an object literal, in a `let`, or in a method's inferred return type.
- **Nothing else moves.** Class members are still assignable (`Periods.DAY`). The union still works as `Record` keys, with `satisfies`, in overloads and in exhaustive `switch`es. In generic code it converts both ways with `Extract<ValueOf<T>, ...>`.

## Who is affected

- **Code that copied the value into an object or a `let`.** The type is now the literal union, as it always should have been. Casts or explicit return types added to work around the widening can go.
- **A generic inferred from one of these values, then given a plain `string`.** It no longer compiles. In practice this is a test: `expect(value).toBe(someString)`. See below.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> A generic inferred from a `TConstValue` value is now the literal union, so a plain `string` argument no longer fits it.

**Before:**

```typescript
for (const [unit, expected] of table) {
  // unit: TConstValue<typeof DurationUnits>, expected: string
  expect(unit).toBe(expected);
}
```

**After:**

```typescript
for (const [unit, expected] of table) {
  expect<string>(unit).toBe(expected);
}
```

Give the generic the wider type, as above, or type the expected value with the same alias.

## Details

- A `static readonly` initializer gives each member a widening literal type. `Extract<ValueOf<T>, ...>` passed that type through unchanged, so TypeScript widened it at the first mutable position. Intersecting with `{}` makes it a regular literal union with the same members.
- A method that returned one of these values in an object, with no return type, widened it too. An explicit return type added for that reason still compiles, and is no longer required.

**Files:** [`packages/helpers/src/common/types/const-value.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/types/const-value.ts), [`packages/inversion/src/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/common/types.ts)

See [Const value extraction types](/extensions/helpers/types/reference#const-value-extraction-types) for the reference.
