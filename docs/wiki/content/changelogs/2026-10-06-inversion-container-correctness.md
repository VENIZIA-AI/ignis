---
title: The Container Names a Cycle and Caches Any Singleton
description: "A subclass property @inject no longer leaks into its parent, isOptional holds on the { target } form, a cycle throws with its path, the singleton cache holds falsy values, and two symbols with one description are two keys."
---

# Changelog - 2026-10-06

## The container names a cycle and caches any singleton

<Badge type="danger" text="Bug Fix" /> <Badge type="warning" text="Behavior Change" />

**In one line.** Seven defects in `@venizia/ignis-inversion` are fixed. The container now behaves the same whatever the class names, the values or the key types.

| Before | Now |
|---|---|
| A subclass's property `@inject` was written into its parent's metadata, so the parent and every sibling then required that binding | Property metadata is copy-on-write per class, like constructor metadata |
| `@inject({ target: X, isOptional: true })` threw when `X` was never registered | It resolves to `undefined`, as an optional key does |
| A cycle (`A -> B -> A`) ended in `RangeError: Maximum call stack size exceeded` | It throws `Circular dependency \| services.A -> services.B -> services.A` |
| A singleton that cached `null`, `false`, `0` or `''` survived `container.clear()` | `clear()` clears every cached value |
| A singleton that answered `undefined` ran again on every read | It runs once, like any singleton |
| `Symbol('x')` and another `Symbol('x')` shared one binding | They are two keys. `Symbol.for('x')` is still one key everywhere |
| A missing `{ namespace, key }` was reported as `[object Object]` | The message names `namespace.key` |
| Injection metadata carrying both a class and a key resolved by the key | The class wins - the key its registration recorded - and the key is the fallback for a class nothing recorded. `@inject` itself still takes one or the other; this serves metadata a framework writes |

The cycle check is not on the hot path. A cached singleton or a `toValue` binding builds nothing and skips it. Any other read counts its nesting depth, and tracks keys only past 64 levels - deeper than any real graph. Measured, median of 9 runs: singleton, transient and provider reads all within noise of before. A cycle through an `await` is not detected.

Unchanged on purpose: a singleton promise that rejects stays cached until `clear()`. Dropping it would need a handler on the promise, and that handler would silence the unhandled-rejection report of a caller that never awaits it.

## Who is affected

- **A `@provide` method or a singleton provider that returns `undefined`, and expects to be asked again later.** It is now asked once. Return the value when it exists, or bind it transient.
- **Code that caught the old `RangeError` from a cycle.** It now gets an `ApplicationError` naming the path.
- **Code that looks a symbol-keyed binding up by its string (`String(symbol)`).** The second symbol with a description is stored as `Symbol(x)#2`. Look it up by the symbol.
- **Everyone else.** No change, beyond the errors that now name what failed.

**Files:** [`packages/inversion/src/modules/container/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/container/base.ts), [`packages/inversion/src/modules/container/container.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/container/container.ts), [`packages/inversion/src/modules/binding/binding.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/binding/binding.ts), [`packages/inversion/src/modules/registry/registry.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/modules/registry/registry.ts)
