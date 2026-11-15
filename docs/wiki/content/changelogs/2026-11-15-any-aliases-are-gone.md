---
title: AnyType and AnyObject are gone
description: "The AnyType and AnyObject aliases are removed from the helpers and inversion packages: write the shape, or use unknown and narrow it."
packages: ['@venizia/ignis-helpers', '@venizia/ignis-inversion']
migration:
  - id: any-type-alias-removed
    symbols: [AnyType]
    codemod: any-aliases
    upgrade:
      before: |
        import type { AnyType } from '@venizia/ignis-helpers';

        // a bag of values read later
        const headers: Record<string, AnyType> = {};
        headers['x-id'].toUpperCase();

        // a generic default
        interface IResult<TData = AnyType> { data: TData }

        // a parameter
        const log = (value: AnyType) => console.log(value);
      after: |
        // no alias to import. A bag of values read later is Record<string, unknown>: narrow what you read
        const headers: Record<string, unknown> = {};
        const id = headers['x-id'];
        if (typeof id === 'string') {
          id.toUpperCase();
        }

        // a generic default is unknown, or the type you really mean
        interface IResult<TData = unknown> { data: TData }

        // a parameter that only passes the value on is unknown
        const log = (value: unknown) => console.log(value);
    downgrade:
      steps:
        - "Declare the alias in your own code: `export type AnyType = any;` and import it from there."
    data: "A bag that holds interface-typed values: Record<string, unknown> accepts them as values, but a variable typed with an interface is not assignable to Record<string, unknown> (an interface has no implicit index signature). Declare the shape as a type alias, or take `object`."
  - id: any-object-alias-removed
    symbols: [AnyObject]
    codemod: any-aliases
    upgrade:
      before: |
        import type { AnyObject } from '@venizia/ignis-helpers';

        // a parameter
        const pick = (source: AnyObject, key: string) => source[key];

        // a generic default
        interface IPage<TItem extends AnyObject = AnyObject> { items: TItem[] }

        interface IUser { id: number }
        declare const user: IUser;
        pick(user, 'id');
      after: |
        // AnyObject was Record<string | symbol | number, any>; it becomes Record<string, unknown>.
        // An interface-typed argument needs an index signature: declare the shape as a type alias, or take `object` and read with Reflect.get
        const pick = (source: object, key: string): unknown => Reflect.get(source, key);

        interface IPage<TItem extends Record<string, unknown> = Record<string, unknown>> { items: TItem[] }

        type TUser = { id: number };
        declare const user: TUser;
        pick(user, 'id');
    downgrade:
      steps:
        - "Declare the alias in your own code: `export type AnyObject = Record<string | symbol | number, any>;` and import it from there."
  - id: interface-values-and-record-unknown
    symbols: [AnyType, AnyObject]
    upgrade:
      before: |
        // after the alias is replaced one for one, an interface-typed value no longer fits a Record<string, unknown> parameter
        interface IUser { id: number; name: string }
        declare const user: IUser;

        const save = (data: Record<string, unknown>) => data;
        save(user); // TS2345: Index signature for type 'string' is missing in type 'IUser'

        const bag: Record<string, unknown> = user; // TS2322: the same reason
      after: |
        // declare the shape as a type alias (it has an implicit index signature), or spread the value,
        // or take object when the function only reads known keys through Reflect.get
        type TUser = { id: number; name: string };
        declare const typedUser: TUser;

        const save = (data: Record<string, unknown>) => data;
        save(typedUser);
        save({ ...user });

        const bag: Record<string, unknown> = typedUser;
    downgrade:
      steps:
        - "Declare the alias in your own code and use it for the parameter; an interface fits Record<string | symbol | number, any>."
  - id: inversion-any-type-removed
    symbols: [AnyType, inject]
    codemod: any-aliases
    upgrade:
      before: |
        import type { AnyType } from '@venizia/ignis-inversion';

        const decorate = (target: AnyType) => Reflect.getMetadata('design:type', target);
      after: |
        // the inversion package no longer exports AnyType; a decorator target is an object
        const decorate = (target: object) => Reflect.getMetadata('design:type', target);

        // @inject() returns a decorator whose target is typed object (it was any); a class and a prototype both fit
    downgrade:
      steps:
        - "Declare the alias in your own code: `export type AnyType = any;` and import it from there."
---

# Changelog - 2026-11-15

## AnyType and AnyObject are gone

<Badge type="warning" text="Breaking Change" />

**In one line.** `AnyType` and `AnyObject` are no longer exported: say what the value is, or use `unknown` and narrow it. Nothing changes at runtime.

## What changed

- **Helpers.** `@venizia/ignis-helpers` no longer exports `AnyType` and `AnyObject`.
- **Inversion.** `@venizia/ignis-inversion` no longer exports `AnyType`; the `@inject()` decorator's target is typed `object`.
- **The rest of the series.** The framework's own types, tests and docs stopped using the aliases in the earlier changes of this release; this entry is the removal itself.

## Who is affected

- **Code that imports `AnyType` or `AnyObject` from `@venizia/ignis-helpers`, `@venizia/ignis-inversion` or the `@venizia/ignis` root.** The import fails to compile. Run `devz codemod any-aliases --write <paths>` (from the `@venizia/dev-configs` release that carries this change): it rewrites `AnyType` to `unknown` and `AnyObject` to `Record<string, unknown>`, drops the names from the import, and lists what it leaves (a re-export, an `import()` type, a same-named local type). A value an alias used to accept may then fail the typecheck: an interface-typed value is not assignable to `Record<string, unknown>`; the last migration item says how to fix it by hand.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> These are type-level breaks. The typecheck names each line.

**Before:**

```typescript
import type { AnyType } from '@venizia/ignis-helpers';

const bag: Record<string, AnyType> = {};
```

**After:**

```typescript
const bag: Record<string, unknown> = {};
```
