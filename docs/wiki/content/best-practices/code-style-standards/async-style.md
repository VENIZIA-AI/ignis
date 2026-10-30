# Async Style

How to write `await`, `return`, promise chains, `catch` and async functions. Lint rules in `@venizia/dev-configs` check these; turn them on with the two config arrays shown at the end.

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

## Await or chain, never both

One expression uses one style: `await`, inside `try`/`catch` when it can fail, or a promise chain (`.then`, `.catch`, `.finally`) that is not awaited.

```typescript
// Not this
const user = await findUser({ id }).catch(() => null);
const names = await loadUsers().then((users) => users.map((user) => user.name));

// This
let user: IUser | null;
try {
  const found = await findUser({ id });
  user = found;
} catch (error) {
  logger.error('findUser failed: %s', error);
  user = null;
}

const users = await loadUsers();
const names = users.map((user) => user.name);
```

A chain that is not awaited is fine: `return load().then(parse)`, or `load().then(show).catch(report)` as a statement. So is `await Promise.all(items.map(save))`: the awaited call is not a chain. An `await` inside a callback of a chain is not reported either.

The rule reads the syntax only. `?.then(`, `['then'](`, `!` and `as` around the chain count, and so does a thenable such as a query builder (`await query.then(...)`).

The fix covers one shape, `const x = await f().catch(() => <value>)`, alone in its declaration. The value is a literal, an identifier, a read of the error (`(error) => error.message`), or an array or object literal of those. The `const` becomes a `let`; a type annotation stays. The fix is not made when:

- the call before `.catch` holds a `.then`, a `.finally` or an `await`;
- the handler has a block body, calls something, or is async;
- `x` is written again;
- `x` has no type annotation and is read inside a nested function, exported or used in a `typeof`;
- the value is `[]` with no annotation (a bare `let` would type it as `any[]`);
- a comment would be lost.

Every other awaited chain (`.then`, `.finally`, `return await f().catch(h)`, an `await` as a whole statement) is reported for you to rewrite. The try also catches a synchronous throw of `f()`, which the chain let through.

## Never swallow an error

A `catch` leaves a trace: it logs the error, rethrows it or wraps it. These are reported:

```typescript
load().catch(() => null);
load().catch(() => {});

try {
  await load();
} catch {
  // ignore
}
```

A handler or a `catch` block counts as silent when it does nothing, holds only a comment, or only returns or assigns a constant without reading the error. Any call (a log, a cleanup, a fallback), a `throw`, or a read of the error makes it handled. When a silent catch is what you want, keep it with `// eslint-disable-next-line venizia/no-silent-catch -- <the reason>`.

ESLint `no-empty` is different: it reports only an empty block, lets a block with a comment pass, and never sees `.catch(() => null)`. Both report `catch {}`.

The fix of the chain rule keeps behaviour, so `.catch(() => null)` becomes `catch (error) { x = null; }`, and this rule then reports it. That is on purpose: you decide what to log.

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

A React project spreads `reactHouseConfigs` and `reactAsyncStyleConfigs` the same way. Both arrays carry the chain rule (`venizia/no-await-promise-chain`) and the silent catch rule (`venizia/no-silent-catch`), so a project that already spreads them gets the two new rules with nothing to wire.

To fix an existing codebase, run the codemod. It applies the safe fixes of `no-inline-await`, `no-return-await` and `no-await-promise-chain`, and lists the rest with file, line and rule, including every silent catch, which it never fixes:

```bash
devz codemod async-style packages/my-package          # dry run
devz codemod async-style packages/my-package --write  # commit your work first
```

The ESLint setup these rules extend is in [Tooling](./tooling).
