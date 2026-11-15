---
title: AnyType and AnyObject are gone
description: "The AnyType and AnyObject aliases are removed from the helpers and inversion packages. devz codemod any-aliases writes what they stood for, so no type in your code changes. To use the tighter types, run it with --strict instead of the default, or tighten by hand."
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
        // devz codemod any-aliases writes what AnyType stood for, so no type changes and nothing new fails
        const headers: Record<string, any> = {};
        headers['x-id'].toUpperCase();

        interface IResult<TData = any> { data: TData }

        const log = (value: any) => console.log(value);

        // To stop using any: run --strict instead of the default run, or write it by hand. unknown, and narrow what you read
        const strictHeaders: Record<string, unknown> = {};
        const id = strictHeaders['x-id'];
        if (typeof id === 'string') {
          id.toUpperCase();
        }

        interface IStrictResult<TData = unknown> { data: TData }

        const strictLog = (value: unknown) => console.log(value);
    downgrade:
      steps:
        - "Declare the alias in your own code: `export type AnyType = any;` and import it from there."
    data: "The codemod writes any, so a bag that holds interface-typed values keeps compiling. When you tighten (--strict instead of the default run, or by hand), a variable typed with an interface is not assignable to Record<string, unknown> (an interface has no implicit index signature): declare the shape as a type alias, or take `object`."
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
        // devz codemod any-aliases writes what AnyObject stood for: no type changes
        const pick = (source: Record<string | symbol | number, any>, key: string) => source[key];

        interface IPage<TItem extends Record<string | symbol | number, any> = Record<string | symbol | number, any>> { items: TItem[] }

        interface IUser { id: number }
        declare const user: IUser;
        pick(user, 'id');

        // To tighten (--strict instead of the default run, or by hand): take object and read with Reflect.get, or name the shape
        const strictPick = (source: object, key: string): unknown => Reflect.get(source, key);
        strictPick(user, 'id');
    downgrade:
      steps:
        - "Declare the alias in your own code: `export type AnyObject = Record<string | symbol | number, any>;` and import it from there. The codemod already wrote that type, so the downgrade is only needed for the import."
  - id: interface-values-and-record-unknown
    symbols: [AnyType, AnyObject]
    upgrade:
      before: |
        // when you tighten AnyObject to Record<string, unknown> (--strict instead of the default run, or by hand), an interface-typed value no longer fits it
        interface IUser { id: number; name: string }
        declare const user: IUser;

        const save = (data: Record<string, unknown>) => data;
        save(user); // TS2345: Index signature for type 'string' is missing in type 'IUser'

        const bag: Record<string, unknown> = user; // TS2322: the same reason
      after: |
        // declare the shape as a type alias (it has an implicit index signature), or spread the value,
        // or take object when the function only reads known keys through Reflect.get
        interface IUser { id: number; name: string }
        declare const user: IUser;

        type TUser = { id: number; name: string };
        declare const typedUser: TUser;

        const save = (data: Record<string, unknown>) => data;
        save(typedUser);
        save({ ...user });

        const bag: Record<string, unknown> = typedUser;
    downgrade:
      steps:
        - "Write Record<string | symbol | number, any> again (it is what the codemod writes by default); an interface fits it."
  - id: inversion-any-type-removed
    symbols: [AnyType]
    codemod: any-aliases
    upgrade:
      before: |
        import type { AnyType } from '@venizia/ignis-inversion';

        const decorate = (target: AnyType) => Reflect.getMetadata('design:type', target);
      after: |
        // the codemod writes any, so nothing changes; to tighten, a decorator target is an object
        const decorate = (target: object) => Reflect.getMetadata('design:type', target);
    downgrade:
      steps:
        - "Declare the alias in your own code: `export type AnyType = any;` and import it from there."
  - id: inject-target-is-object
    symbols: [inject]
    upgrade:
      before: |
        // a wrapper that forwards the decorator's target typed unknown (or an unconstrained generic)
        const injectKey =
          (key: string) => (target: unknown, name: string | symbol | undefined, index?: number) =>
            inject({ key })(target, name, index); // TS2345: Argument of type 'unknown' is not assignable to parameter of type 'object'
      after: |
        // inject() returns a decorator whose target is typed object (it was any); a class and a prototype both fit.
        // Type the wrapper's target object, or T extends object
        const injectKey =
          (key: string) => (target: object, name: string | symbol | undefined, index?: number) =>
            inject({ key })(target, name, index);
    downgrade:
      steps:
        - "Type the wrapper's target as unknown again; a decorator whose target is typed object fits the older any."
    data: "Every direct use of @inject() on a property or a constructor parameter compiles unchanged."
---

# Changelog - 2026-11-15

## AnyType and AnyObject are gone

<Badge type="warning" text="Breaking Change" />

**In one line.** `AnyType` and `AnyObject` are no longer exported. `devz codemod any-aliases` writes what they stood for, so no type in your code changes; tighten by hand at your own pace, or run `--strict` instead of the default run. Nothing changes at runtime.

## What changed

- **Helpers.** `@venizia/ignis-helpers` no longer exports `AnyType` and `AnyObject`.
- **Inversion.** `@venizia/ignis-inversion` no longer exports `AnyType`; the `@inject()` decorator's target is typed `object`.
- **The rest of the series.** The framework's own types, tests and docs stopped using the aliases in the earlier changes of this release; this entry is the removal itself.

## Who is affected

- **Code that imports `AnyType` or `AnyObject` from `@venizia/ignis-helpers`, `@venizia/ignis-inversion` or the `@venizia/ignis` root.** The import fails to compile. Run `devz codemod any-aliases --write <paths>` (from the `@venizia/dev-configs` release that carries this change): it rewrites `AnyType` to `any` and `AnyObject` to `Record<string | symbol | number, any>`, what they stood for, so a bump changes no type in your code. It drops the names from the import, and lists what it leaves (a re-export, an `import()` type, a heritage clause, a same-named local type). It also reads imports from `@venizia/ardor` and `@venizia/ardor-kernel`, which re-exported the two names, so one run covers both frameworks. To tighten while you migrate, run `--strict` instead of the default run, on a path at a time: it writes `unknown` and `Record<string, unknown>`, which surfaces errors that `any` hid. `--strict` acts only on the alias names, so a file the default run already rewrote to `any` is left alone: after a default run, tighten by hand. A symbol key on a former `AnyObject` fails under `Record<string, unknown>` (TS2538). An interface-typed value is not assignable to `Record<string, unknown>`; the migration item `interface-values-and-record-unknown` says how to fix it.
- **Code that wraps the decorator `@inject()` and forwards its target typed `unknown` or as an unconstrained type parameter.** The call fails with TS2345: type the target `object` (see `inject-target-is-object`).
- **Everyone else.** No action needed.

## What to change it to

When you want to stop using `any`, pick the first row that fits:

| The value is | Write |
|---|---|
| A shape you know | That type: an interface or a type alias |
| Read later, shape unknown | `unknown`, then narrow with `typeof` or a schema |
| An object whose keys you read | `object` and `Reflect.get(value, key)` |
| A bag of values of one type | `Record<string, TValue>` |
| A decorator target | `object` |

## Breaking changes

> [!WARNING]
> These are type-level breaks. The typecheck names each line.

**Before:**

```typescript
import type { AnyType } from '@venizia/ignis-helpers';

const bag: Record<string, AnyType> = {};
```

**After** (`devz codemod any-aliases`, no type changes):

```typescript
const bag: Record<string, any> = {};
```

**Tightened** (`--strict` instead of the default run, or by hand):

```typescript
const bag: Record<string, unknown> = {};
```
