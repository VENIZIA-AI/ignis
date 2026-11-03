---
title: The Container Names a Cycle and Caches Any Singleton
description: "A subclass property @inject no longer leaks into its parent, isOptional holds on the { target } form, a cycle throws with its path, the singleton cache holds falsy values, and two symbols with one description are two keys."
packages: ['@venizia/ignis-inversion']
---

# Changelog - 2026-10-06

## The container names a cycle and caches any singleton

<Badge type="danger" text="Bug Fix" /> <Badge type="warning" text="Behavior Change" />

**In one line.** Seven defects in `@venizia/ignis-inversion` are fixed, so the container behaves the same whatever the class names, the values or the key types.

## What changed

- **A subclass's property `@inject` no longer leaks.** It was written into its parent's metadata, so the parent and every sibling then required that binding. Property metadata is now copy-on-write per class.
- **`@inject({ target: X, isOptional: true })`** resolves to `undefined` when `X` was never registered, instead of throwing.
- **A cycle throws with its path.** `A -> B -> A` ended in `RangeError: Maximum call stack size exceeded`. It now throws `Circular dependency | services.A -> services.B -> services.A`. A cycle through an `await` is not detected.
- **Singletons cache any value.** A singleton that cached `null`, `false`, `0` or `''` survived `container.clear()`; `clear()` now clears every cached value. A singleton that answered `undefined` ran on every read; it now runs once.
- **Two symbols with one description are two keys.** `Symbol('x')` and another `Symbol('x')` shared one binding. `Symbol.for('x')` is still one key everywhere.
- **A missing `{ namespace, key }`** is reported as `namespace.key`, not `[object Object]`.
- **Metadata with both a class and a key** resolves by the class (the key its registration recorded), with the key as the fallback. `@inject` itself still takes one or the other.

## Who is affected

- **A `@provide` method or a singleton provider that returns `undefined` and expects to be asked again.** It is now asked once. Return the value when it exists, or bind it transient.
- **Code that caught the old `RangeError` from a cycle.** It now gets an `ApplicationError` naming the path.
- **Code that looks a symbol-keyed binding up by its string (`String(symbol)`).** The second symbol with a description is stored as `Symbol(x)#2`. Look it up by the symbol.
- **Everyone else.** No change, beyond errors that now name what failed.

## Details

A singleton promise that rejects stays cached until `clear()`. This is unchanged on purpose: dropping it would silence the unhandled-rejection report of a caller that never awaits it.
