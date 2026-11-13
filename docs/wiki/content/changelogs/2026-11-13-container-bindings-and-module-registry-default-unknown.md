---
title: Container bindings and the module registry default to unknown, not any
description: "IBinding, Binding and findByTag default their type argument to unknown, and ModuleUtility.register takes unknown values, so a lookup you do not type is not trusted as any."
packages: ['@venizia/ignis-inversion', '@venizia/ignis-helpers']
migration:
  - id: binding-default-unknown
    symbols: [IBinding, Binding, Binding.bind, BaseContainer.findByTag]
    upgrade:
      before: |
        const bindings = container.findByTag({ tag: 'services' }); // Binding<any>[]
        const first = bindings[0]; // Binding<any>
      after: |
        // name what the tag holds
        const bindings = container.findByTag<IService>({ tag: 'services' });
        const first = bindings[0]; // Binding<IService>
    downgrade:
      steps:
        - "Drop the type argument of findByTag and Binding; the older default was any."
  - id: module-register-unknown
    symbols: [ModuleUtility.register]
    upgrade:
      steps:
        - "Nothing to change. register takes Record<string, unknown> where it took Record<string, AnyType>, so every call that compiled still compiles."
    downgrade:
      steps:
        - "Nothing to undo."
---

# Changelog - 2026-11-13

## Container bindings and the module registry default to unknown, not any

<Badge type="warning" text="Breaking Change" />

**In one line.** A binding or a `findByTag` result you do not type is `unknown` now, so you name it or narrow it.

## What changed

- **Bindings.** `IBinding`, `Binding`, `Binding.bind` and `findByTag` default their type argument to `unknown`. The container's own store keeps one documented `any`, because `Binding<T>` is invariant and the store holds every `T`.
- **Module registry.** `ModuleUtility.register` takes `Record<string, unknown>`. The registry keeps one documented `any`: a peer's shape is whatever the peer is, as `import()` and `require()` answer it.

## Who is affected

- **Apps that call `findByTag` or build a `Binding` with no type argument and read the result as any.** Name the type: see the migration below.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> These are type-level breaks: behaviour is unchanged. The typecheck names each line.

**Before:**

```typescript
const bindings = container.findByTag({ tag: 'services' });
```

**After:**

```typescript
const bindings = container.findByTag<IService>({ tag: 'services' });
```
