---
type: Convention
title: Gotchas
description: The traps that have already cost real debugging time in this codebase.
resource: packages/core/src
tags: [conventions, gotchas, debugging]
---

Traps worth knowing before you hit them yourself.

## A broken test leaves an empty dist, not a failed build message

The build is honest: every `scripts/build.sh` starts with `set -e` and runs `tsc --noEmit -p
tsconfig.json` as a gate, so a type error exits non-zero and never prints `DONE | Build completed
successfully!`. Trust the exit code.

The trap is what surrounds it. `make <package>` runs `rebuild.sh`, which is `bun run clean` (deletes
`dist/`) **and then** `bun run build`. That `tsc --noEmit` gate type-checks `src/__tests__` too. So a
single broken test - possibly someone else's untracked, in-progress one - aborts the build *after*
`dist/` is already gone. `dist/` is gitignored, so what you see is not "the test failed": it is every
import in the package resolving to an empty build, and a cascade of unrelated-looking errors.

When `bun test` explodes catastrophically, check whether `dist/` is empty before debugging the tests.
A fresh clone or worktree shows the identical symptom for the simpler reason that it has never been
built. See [testing conventions](/conventions/testing-conventions.md).

## RedisClusterHelper deliberately skips buildDefaultOpts

`RedisClusterHelper` (`packages/helpers/src/modules/redis/cluster/cluster.helper.ts`) does not call
`AbstractRedisHelper.buildDefaultOpts`, unlike the single and sentinel helpers. Intentional: ioredis's
`Cluster` ignores `redisOptions.retryStrategy` (it forces its own), and injecting
`maxRetriesPerRequest: null` would silently flip per-node command-failure semantics. Don't "DRY"
this back in - it was tried once and reverted as a real regression.

## Every constructor parameter needs @inject

Mixing a decorated and an undecorated constructor parameter is refused, not tolerated.
`Container.instantiate` (`packages/inversion/src/container/container.ts`) throws when an inject
metadata slot is missing, naming the class and parameter index:

```typescript
if (!meta) {
  throw getError({
    message: `[${cls.name}] Constructor parameter ${index} has no @inject | Every parameter of a container-instantiated class must be decorated - the container cannot supply an undecorated one`,
  });
}
```

This is why a controller that needs options puts them inside `super({ scope: X.name })` rather than
a raw `opts` parameter - see [options objects](/conventions/options-objects.md).

## An error catalog code must be a literal, not MessageCode.build()

Everywhere else, a `messageCode` should come from `MessageCode.build({ parts })` so a malformed code
fails at import. Inside a `TErrorDefinition`, that advice is backwards:

```typescript
// WRONG - code widens to `string`, and TRegisterErrors collapses to Record<string, true>.
// The registry still compiles; it just autocompletes nothing. Silent.
message: { text: '...', code: MessageCode.build({ parts: ['server', 'core', 'user', 'x'] }) },

// RIGHT
message: { text: '...', code: 'server.core.user.create.duplicate_email' },
```

`build()` returns `string`, which erases the literal type the registry is built on. The failure is
invisible - no error, just autocomplete that quietly stops working. Do not "fix" a catalog by
routing its keys through `build()`.

## Stale .tsbuildinfo replays phantom errors

After changing a package's `exports` field or `dist` layout, a consumer's `.tsbuildinfo` can replay
diagnostics cached against the old resolution - unchanged files suddenly report errors on valid
types. Purge every `tsconfig*.tsbuildinfo` outside `node_modules` before trusting `tsc`.

## bun install reformats the committed bun.lock

The local Bun re-serializes `bun.lock` on any install/update, producing roughly a thousand lines of
formatting churn even when resolved versions are unchanged. Revert the file rather than re-running
`bun install` - `node_modules` already works.

## Bun can silently drop @inject when tsconfig extends isn't resolved

If an app's `tsconfig.json` only does `extends: "@venizia/dev-configs/..."` and Bun fails to
resolve that chain at run time, `experimentalDecorators` effectively turns off and parameter
decorators are dropped silently - no error, just an injected value that is `undefined` at runtime.
Class/property decorators (`@controller`, `@model`) keep working, so boot looks fine until a
handler touches the missing dependency. Fix: declare `experimentalDecorators` /
`emitDecoratorMetadata` directly in the app's own `tsconfig.json`, not only via `extends`.

## Related

- [Options objects](/conventions/options-objects.md)
- [Testing conventions](/conventions/testing-conventions.md)
- [Coding style](/conventions/coding-style.md)
- [DI container](/architecture/di-container.md)
