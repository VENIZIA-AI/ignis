---
title: The auto artifact group keeps the class types an application passes
description: "AutoArtifactGroup takes the index type as a type argument, the generated index lists TClass<never> by default, and TGeneratedArtifactIndexInput accepts any real classes."
packages: ['@venizia/ignis-boot']
migration:
  - id: generated-index-annotation
    symbols: [TGeneratedArtifactIndex, TGeneratedArtifactIndexInput]
    upgrade:
      before: |
        // TGeneratedArtifactIndex listed TClass<any>: any class fit
        const index: TGeneratedArtifactIndex = { services: [FooService] }; // TS2322 now
      after: |
        // the generated index lists TClass<never>, the bottom boot moves around without knowing your classes;
        // to write an index by hand, check it against the input type and keep its exact type
        const index = { services: [FooService] } satisfies TGeneratedArtifactIndexInput;
        const group: IArtifactGroup = new AutoArtifactGroup({ content: index });
    downgrade:
      steps:
        - "Annotate the variable with the older TGeneratedArtifactIndex (a list of TClass<any> per kind)."
  - id: auto-artifact-group-type-argument
    symbols: [AutoArtifactGroup]
    upgrade:
      before: |
        // a group typed without its content type: the classes read from content were TClass<any>
        declare const group: AutoArtifactGroup;
        const serviceClass = group.content?.services?.[0];
        if (serviceClass) {
          new serviceClass().run(); // TS2339 now: the instance type is never
        }
      after: |
        // build the group from a typed index and let TIndex be inferred, so content keeps your classes
        const group = new AutoArtifactGroup({ content: { services: [FooService] } });
        const serviceClass = group.content?.services?.[0];
        if (serviceClass) {
          new serviceClass().run();
        }
    downgrade:
      steps:
        - "Read the classes through the older untyped group again; every read compiled."
    data: "A group boot builds itself (the default export of @venizia/ignis-boot/auto and the modules the plugins emit) is still the kernel's IArtifactGroup; only reading its classes through the default type changed."
---

# Changelog - 2026-11-15

## The auto artifact group keeps the class types an application passes

<Badge type="warning" text="Breaking Change" />

**In one line.** `AutoArtifactGroup` carries the index type it was built from, instead of a list of `any` classes, and nothing changes at runtime.

## What changed

- **Group.** `AutoArtifactGroup<TIndex>` infers `TIndex` from the `content` or `resolve` you pass, and defaults to `TGeneratedArtifactIndex` when boot builds the group.
- **Index types.** `TGeneratedArtifactIndex` lists `TClass<never>` per kind: assignable to every class type the kernel names, so the group stays the kernel's `IArtifactGroup`. The new `TGeneratedArtifactIndexInput` lists `TClass<unknown>` and accepts any real class.

## Who is affected

- **Code that annotates a variable with `TGeneratedArtifactIndex` and puts real classes in it, or reads classes through an `AutoArtifactGroup` it typed without arguments.** See the migration above.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> These are type-level breaks. The typecheck names each line.

**Before:**

```typescript
const index: TGeneratedArtifactIndex = { services: [FooService] };
```

**After:**

```typescript
const index = { services: [FooService] } satisfies TGeneratedArtifactIndexInput;
```
