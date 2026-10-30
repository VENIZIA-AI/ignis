---
type: Convention
title: Async style
description: Await stands alone, a function returns its promise without await, an await never takes a promise chain, a catch never swallows the error, a hook never gets an async function, and an effect returns a cleanup on every path or none.
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

## Await or chain, never both

One expression uses one style: `await` (inside try/catch when it can fail) or a promise chain that is not
awaited. `await f().catch(() => null)`, `await f().then(g)` and `await f().finally(h)` are reported once on the
`await`, however long the chain; `?.then(`, `['then'](`, `!`, `as`, `satisfies` and thenables count. Not
reported: `return f().then(...)`, a chain as a statement, `await Promise.all(xs.map(...))`,
`await new Promise(...)`, `await x.then` (no call), and an `await` inside a callback of a chain (owner's
answer: the rule is about one expression).

The fixer covers one shape: `const|let x[: T] = await f().catch(() => <value>)` (or `(error) => <value>`), alone
in a declaration in a statement list. It writes `let x[: T]; try { x = await f(); } catch (error) { x = <value>; }`
and, with `no-inline-await` also on, the assignment is then hoisted to `const result = await f(); x = result;`.
Conditions, all required:

- `x` is an identifier, never written again; with no annotation, every read is in the same function, not in an
  export or a `typeof` (a bare `let x;` takes its type from the assignments; TypeScript gives up when a hoisted
  function reads it: TS7034);
- the handler is a non-async arrow with an expression body and at most one plain, unannotated parameter;
- `<value>` is a literal, an identifier, a member read of the parameter, or an array or object literal of those
  (no call, no `await`, no assignment); `[]` alone needs an annotation (bare it would be an evolving `any[]`);
  `<value>` does not read `x`;
- the receiver has no `.then`, `.catch`, `.finally` on its spine and no `await`;
- no comment outside the receiver and the value would be dropped.

The catch variable is the handler's parameter name, else `error`; it is renamed (`error2`) when it equals `x`, a
name the value reads, or (for `error`) a name declared around. It is typed `any` when the value reads it, as the
handler's parameter was (the catch variable is `unknown` under `useUnknownInCatchVariables`). The try also
catches a synchronous throw of `f()`, which the chain let through. Tested: the fixed output compiles with the
TypeScript API (`strict`, `noImplicitAny`) for the annotated and the bare shapes.

## No silent catch

`venizia/no-silent-catch` makes V-C-06 a lint. Reported: a `.catch(h)` whose handler ignores its parameter and
is empty or gives back a constant (`() => null`, `() => undefined`, `() => ({})`, `() => []`, `() => {}`,
`function () {}`), and a `catch` block that is empty, holds only a comment, or only returns or assigns a
constant without reading the error. Handled: any call, a `throw`, a read of the error or of another variable.
Report-only; the escape is an `eslint-disable-next-line` with a reason. Unlike ESLint `no-empty` it sees a
comment-only block and `.catch(() => null)`; both report `catch {}`. The chain fixer's output for a constant
fallback is reported by it on purpose: the fix keeps behaviour, the person decides what to log.

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
outside a `try` adds nothing, and inside a `try` it hides on a single line which failures the `catch` handles. An
awaited chain mixes the two error models in one expression, and `.catch(() => null)` hides a failure. A
hook that gets an async function hands React a promise where it expects a cleanup.
