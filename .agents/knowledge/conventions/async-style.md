---
type: Convention
title: Async style
description: Await stands alone, a function returns its promise without await, a hook never gets an async function, and an effect returns a cleanup on every path or none.
resource: packages/dev-configs/src/linters/house/
tags: [conventions, async, lint]
---

How IGNIS, ARDOR and VULCAN write asynchronous code. The lint rules that enforce it are in
[dev-configs](/packages/dev-configs.md#the-async-style-rules-opt-in).

## Await stands alone

`await` is a whole statement or the whole initializer of a declaration. It is never inside another
expression: not in a call argument, a spread, an array or object, a ternary, a logical operator, a template
literal, a member access, an assignment or a `return`.

```typescript
// no
expect(await load()).toBe(1);
const name = (await load()).name;

// yes
const loaded = await load();
expect(loaded).toBe(1);
const { name } = await load();
```

Tests follow the same rule. When a branch decides whether to wait, write the branch with statements:

```typescript
let value = fallback;
if (isCached) {
  const cached = await readCache();
  value = cached;
}
```

## A function returns its promise

A function that ends with a promise returns that promise: `return load()`, not `return await load()`. Where the
`await` matters, inside `try`, `catch` or `finally` (the `catch` only sees a rejection that is awaited), write it
on its own line:

```typescript
try {
  const loaded = await load();
  return loaded;
} catch (error) {
  return recover({ error });
}
```

## Hooks

- A hook call (`use[A-Z]...`) never receives an async function. Pass a sync callback and handle the promise
  inside it with `.then`, `.catch` and `.finally`.
- An effect callback (`useEffect`, `useLayoutEffect`, `useInsertionEffect`) returns nothing on every path, or a
  cleanup function on every path. An early exit returns a no-op cleanup (`return () => {};`) when another path
  returns a real one.
- A hook method returns its promise only when a caller waits on it; otherwise it just calls. This is a
  convention: no lint rule checks it.

## Why

One reading order: a line with an `await` does one thing, and the next line uses the result. A `return await`
outside a `try` adds nothing, and inside a `try` it hides on a single line which failures the `catch` handles. A
hook that gets an async function hands React a promise where it expects a cleanup.
