# Async Style

How to write `await`, `return` and async functions. Lint rules in `@venizia/dev-configs` check these; turn them on with the two config arrays shown at the end.

## Await stands alone

`await` is a whole statement, or the whole initializer of a declaration. It is not inside another expression.

```typescript
// Not this
expect(await load()).toBe(1);
const name = (await load()).name;
send(await build(), await sign());

// This
const loaded = await load();
expect(loaded).toBe(1);

const { name } = await load();

const body = await build();
const signature = await sign();
send(body, signature);
```

Tests follow the same rule. An assignment (`value = await load()`) is also not allowed: declare the value first, then assign.

When a branch decides whether to wait, write the branch with statements:

```typescript
let value = fallback;

if (isCached) {
  const cached = await readCache();
  value = cached;
}
```

## Return the promise

A function that ends with a promise returns it: `return load()`, not `return await load()`.

Inside `try`, `catch` or `finally`, where the `await` decides which failures the `catch` sees, write the `await` on its own line:

```typescript
try {
  const loaded = await load();
  return loaded;
} catch (error) {
  return recover({ error });
}
```

## Hooks

- Never pass an async function to a `use...` call. Pass a sync callback and handle the promise inside it with `.then`, `.catch` and `.finally`.
- An effect callback (`useEffect`, `useLayoutEffect`, `useInsertionEffect`) returns nothing on every path, or a cleanup function on every path. An early exit returns a no-op cleanup when another path returns a real one.
- A hook method returns its promise only when a caller waits on it. Otherwise it just calls. No lint rule checks this one.

```typescript
// Not this
useEffect(async () => {
  const data = await load();
  setData(data);
}, []);

// This
useEffect(() => {
  load()
    .then((data) => setData(data))
    .catch((error) => report({ error }));
}, []);
```

## Turning the rules on

```javascript
// .configs/lints/eslint.config.mjs
import { asyncStyleConfigs, houseConfigs } from '@venizia/dev-configs/linters';

export default [...houseConfigs, ...asyncStyleConfigs];
```

A React project spreads `reactHouseConfigs` and `reactAsyncStyleConfigs` the same way. To fix an existing codebase, run the codemod, which applies the safe fixes and lists the rest:

```bash
devz codemod async-style packages/my-package          # dry run
devz codemod async-style packages/my-package --write  # commit your work first
```

The ESLint setup these rules extend is in [Tooling](./tooling).
