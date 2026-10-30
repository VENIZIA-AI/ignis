---
title: A Read's Result Type Follows Its fields
description: "find, findOne and findById type the returned row from filter.fields, so an unselected column is a compile error; a repository that overrides them with the old <R = E> shape needs migrating."
packages: ['@venizia/ignis-filter', '@venizia/ignis-kernel', '@venizia/ignis-connectors']
---

# Changelog - 2026-10-24

## A read's result type follows its `fields`

<Badge type="tip" text="Enhancement" /> <Badge type="warning" text="Breaking Change" />

**In one line.** `find`, `findOne` and `findById` return only the columns `filter.fields` names, so reading a column you did not select, or naming one that does not exist, fails at compile time.

```typescript
const rows = await productRepository.find({ filter: { fields: ['id', 'name'] } });
// rows: Array<Pick<TProduct, 'id' | 'name'>>

rows[0].name; // ok
rows[0].price; // error: 'price' was not selected
await productRepository.find({ filter: { fields: ['id', 'nmae'] } }); // error: 'nmae' is not a column
```

## What changed

- **`fields` is typed.** `TFilter` takes the model and the selection (`TFilter<T, F>`); `fields` accepts `ReadonlyArray<keyof T>` or an object keyed by column. Only a `true` entry selects.
- **The row follows it.** A literal `fields` gives `Pick<T, ...>`. No `fields`, an empty selection or a non-literal array gives the whole row. Relations a model declares optional (`items?: ...`) stay readable, because an `include` adds them.
- **An explicit type wins.** `find<MyRow>(...)` returns `MyRow[]` whatever `fields` says.
- **New exports** from `@venizia/ignis-filter` and `@venizia/ignis-kernel`: `TRow`, `TSelectedRow`, `TByIdFilter`; `TFields` and `TFilter` gain the model parameter.
- **Same signatures everywhere.** The kernel contract and abstract repository, the relational and soft-deletable repositories, the search repository and `HttpRepository`.
- **Controllers.** The repository slot of `ControllerFactory.defineCrudController` accepts a repository whose extra options narrow `IExtraOptions` (a typed transaction).

## Who is affected

- **Everyone who reads with `fields`.** A read that uses a column it did not select now fails to compile. At run time that column is `undefined`.
- **A repository that overrides `find`, `findOne` or `findById`.** With the old `<R = E>` signature it stops compiling, and hooks that infer the row from the class degrade to `unknown`. Migrate the override (below).
- **A read with no `fields`.** No action needed; the row type is unchanged.

## Breaking changes

> [!WARNING]
> Type-level only; nothing changes at run time. A `fields` list kept in a constant, a generic repository base class, or an override of a read method must change.

**1. Field lists kept in constants need `as const`.** A plain array is widened to `string[]`, which is no longer accepted.

```typescript
// Before
const TICKET_FIELDS = ['id', 'status'];

// After
const TICKET_FIELDS = ['id', 'status'] as const;
```

**2. An override of a read method uses the new generics.**

```typescript
// Before
override async findOne<R = E>(opts?: IFindArgs<E>): Promise<R | null>;

// After
override async findOne<R = unknown, const F extends TFields<E> = TFields<E>>(
  opts?: IFindArgs<E> & { filter?: TFilter<E, F> },
): Promise<TRow<E, R, F> | null>;
```

`findById` takes `filter?: TByIdFilter<E, F>`; `find` returns `Array<TRow<E, R, F>>`.

**3. Generic code needs a cast where the row cannot be resolved.** Inside a class generic in the row type, `this.findById<DataObject>(...)` keeps its row unresolved, so a property read or a null check on it fails. Cast the result to the row type. The same applies to `fields: { slug: true }` on a generic `D`: cast it to `TFields<D>`.

**4. A filter parsed from a request is untyped.** A `fields` of `string[] | Record<string, boolean>` is not assignable to a typed `fields`; cast the filter (`as TFilter<T>`) after validating it.

**5. Test doubles of a read method** cast with `as unknown as typeof repository.findOne`.

## Details

- The search repository keeps `where` untyped, as before; only `fields` is typed.
