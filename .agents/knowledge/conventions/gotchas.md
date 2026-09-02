---
type: Convention
title: Gotchas
description: The traps that have already cost real debugging time in this codebase.
resource: packages/core-server/src
tags: [conventions, gotchas, debugging]
---

Traps worth knowing before you hit them yourself.

## Run `bun test` from the package root, never the repo root

Several suites resolve paths relative to the current working directory, not to the test file.
`connectors`' barrel-purity and paradigm-seam tests `scandir('src/search/core')`; `helpers`'
optional-peer tests bundle relative entrypoints; `core-server`'s gRPC test resolves
`@connectrpc/connect` off the nearest `node_modules`.

Run from the repo root and they fail with `ENOENT` or `Cannot find module` - failures that look
like real regressions and are not. `cd packages/<name> && bun test` passes. The same suites that
report 32 failures from the root report zero from the package.

Reading a failure list without checking the working directory first has already cost a false alarm.

## An empty dist looks like a hundred unrelated import failures

The build is honest: every `scripts/build.sh` starts with `set -e` and runs `tsc --noEmit -p
tsconfig.json` as a gate, so a type error exits non-zero and never prints `DONE | Build completed
successfully!`. Trust the exit code.

`rebuild.sh` used to be the trap around it: `bun run clean` deleted `dist/` **before** the build's
type-check gate ran, and that gate type-checks `src/__tests__` too, so a single broken test - often
someone else's untracked, in-progress one - aborted the build with `dist/` already gone. That is
closed. `make <package>` now runs `tsc --noEmit -p tsconfig.json` first and cleans only once the
whole project compiles, so a broken test fails loudly with the last good `dist/` intact.
`packages/dev-configs/scripts/rebuild.sh` is the one exception - it still cleans first, having no
type-check gate to fail.

Guard **every** program `build.sh` runs, not just the first. `inversion`, `filter` and `boot` emit
CJS and ESM from two configs, and `tsconfig.esm.json` swaps `module`/`moduleResolution`, so it checks
the same files under different rules and can fail where the CJS pass passed. Guarding one left a
half-emitted `dist/` holding `cjs/` and no `esm/` - which every consumer resolving `main` hides until
something resolves the `import` condition.

The diagnostic habit survives the fix. `dist/` is gitignored, so when `bun test` explodes
catastrophically, check whether `dist/` is empty before debugging the tests: a fresh clone or
worktree shows the identical symptom for the simpler reason that it has never been built. See
[testing conventions](/conventions/testing-conventions.md).

## A node global in the kernel passes tsc and fails make purity

`@venizia/ignis-kernel` must bundle clean for `target: browser`, so a routine edit there breaks a
gate the type-checker cannot see. Import helpers only through `@venizia/ignis-helpers/core` and
`@venizia/ignis-helpers/common`, never the root barrel; never import `@venizia/ignis-boot`; keep
`drizzle-orm` to `import type`. No `process.`, `__dirname`, `__filename` or `createRequire(` either -
the probe matches the **bundled text**, not the import graph, so a node global survives a green
`tsc` and only `make purity-kernel` catches it. Node builtins are matched against `node:module`'s own
list, so the bare `'fs'` spelling is caught alongside `'node:fs'`.

Anything needing a filesystem, a real cwd, or the environment is a method the kernel leaves empty and
core's `ServerApplication` overrides - `getProjectRoot` and `getDefaultAsyncContextEnabled` (which
gates `hono/context-storage`, hence `node:async_hooks`). Add the override, do not reach for `process`
in the kernel. Address resolution is not a seam at all: `host`/`port` live on `ServerApplication`
only, since a host with no socket has no use for either.

## types: [] does not make process.env a compile error

`packages/core-worker` was split out partly to make impurity fail at author time. It does not, and no
tsconfig knob can make it. `types: []` disables only **automatic** `@types/*` inclusion; it cannot
cancel a `/// <reference types="node" />` that sits inside a `.d.ts` the program already reached, and
two first-party paths reach one:

| Path | Reaches |
|---|---|
| `@venizia/ignis-helpers/core` -> `modules/redis/common/types.d.ts` | `ioredis` |
| `@venizia/ignis-kernel` -> `base/auth/authorize/common/types.d.ts` | `casbin` |

Both are `import type` only, so `make purity` stays green and nothing flags it. `typeRoots: []` does
not close it either - the directive then resolves through node module resolution instead.

This reaches **any** consumer of those published types, not just `core-worker`.
`examples/browser-bff` reproduces it from its own import graph. So the author-time defence in both is
a `no-restricted-globals` and `no-restricted-imports` block in `eslint.config.mjs`, with the builtin
list derived from `node:module`'s `builtinModules` rather than hand-written. Scope the `files` glob to
`{ts,tsx,mts,cts}`: a package that sets `jsx` can have a `.tsx` production file, and a `.ts`-only glob
leaves it with no rule at all.

`setImmediate` and `clearImmediate` are the accident case. They ride the same `@types/node` leak, so
the editor offers them in autocomplete, ESLint is silent without the rule, and the bundle scan sees
nothing. In a browser Worker they are a `ReferenceError`.

What no static rule reaches: computed member access (`globalThis['process']`), a variable import
specifier, and an inline `eslint-disable`. `make purity` backstops the first two.

## make purity is red, and that is it telling the truth

`scripts/purity/manifest.ts` derives one row per published sub-path from each package's own
`package.json` `exports` map. Nothing is authored per entry, so a new sub-path is probed the day it
ships. The hand-written list it replaced carried 11 rows and reported `11/11` while
`@venizia/ignis-connectors/postgres` - the entry [browser-bff](/examples/browser-bff.md) imports -
killed a Worker at import.

24 rows now, and four are red:

| Entry | Reaches | What it means |
|---|---|---|
| `connectors/postgres/node-postgres`, `/postgres-js`, `connectors/sqlite/libsql`, `connectors/typesense` | `pg`, `postgres`, `@libsql/client`, `typesense` | Engine clients that were never browser-capable. The gate has no data saying so, so it reports them red rather than quietly excusing them. |

Six were red when the derivation landed. `connectors/postgres` and `connectors/sqlite` were the two
real defects: the model barrel re-exports `user-audit.enricher`, which statically imported
`hono/context-storage`, whose module body runs `new AsyncLocalStorage()`. Both enrichers now read
`RequestContextRegistry` from the kernel instead, and core installs the resolver over it - see
[connectors](/packages/connectors.md).

`helpers` is the one package whose claim covers part of its surface: the root barrel reaches ioredis,
winston and minio by design, which is why `./core` and `./common` exist. The manifest names those
two, and the derivation fails if either stops being published.

`external` narrows what a row measures, so it is printed next to every verdict. It may only exempt a
third party's packaging - `assertNoWorkspaceExternal` refuses any `@venizia/` specifier at manifest
load time.

Every claimed package dual-builds, and `assertBrowserImportCondition` refuses a claim whose sub-path
publishes no `import` condition. A CommonJS-only package cannot be consumed by a browser bundler
without a per-consumer workaround, so the claim would not be true. Both builds are probed, and they
genuinely differ: `@libsql/client` reaches `child_process` only on its CommonJS path, and
`drizzle-orm/supabase` resolves only on its CommonJS one.

Two traps come with the dual build. A `"sideEffects": false` package lets a bundler drop the
`import 'reflect-metadata'` at the entry, and every decorator then fails with
`Reflect.defineMetadata is not a function` - in the PRODUCTION build only, since dev serves modules
unbundled. The packages that import it therefore list their entry:
`"sideEffects": ["./dist/cjs/index.js", "./dist/esm/index.js"]`. And the ESM build needs
`"tsc-alias": { "resolveFullPaths": true }`: without the `.js` extension `bun build` cannot resolve
an extensionless FILE import (a directory with an `index.js` resolves either way, which is why this
looks like it works until it doesn't).

## Kernel state is realm-anchored, so never reach for `instanceof` across packages

`@venizia/ignis-kernel` is a plain `dependencies` entry of `connectors`, `core-server` and
`core-worker`, and that is deliberate - a `peerDependency` would push an explicit install onto every
consumer to buy a guarantee it only half provides. Two copies are made harmless instead of forbidden.

Two copies happen without anyone changing a package: each consumer pins a range, and the day those
ranges stop intersecting a package manager installs a nested second copy rather than failing. Nothing
throws - `@repository` writes into one copy's `datasourceModels` while `discoverSchema()` reads the
other's, `buildSchema()` returns `{}`, and every query fails for a reason that points nowhere near
the cause.

So every cross-package singleton resolves through `SingletonRealm.resolve`
(`packages/kernel/src/helpers/singleton-realm.ts`), which anchors it on `globalThis` under a
`Symbol.for('@venizia/ignis-kernel:<key>')` key. `Symbol.for` is realm-keyed, so both copies find the
same instance. Measured against two genuinely separate module graphs: class identity `false`, every
registry instance `true`.

**Add a new kernel singleton through that helper, never as a bare `private static instance`.**
Declare its key as a `static readonly SINGLETON_REAL_KEY` on the holder - a bare slug, since
`SingletonRealm` supplies the `@venizia/ignis-kernel:` namespace - rather than inline at the
`resolve` call - the key is then readable off the class, which is what lets
`singleton-realm-keys.test.ts` assert that no two holders share one. Two holders on one key is
silent: the second receives the first one's object and the symptom surfaces somewhere unrelated.
Anchored today: `MetadataRegistry`, `AuthenticationStrategyRegistry`,
`AuthorizationEnforcerRegistry`, `GrantBuilder`, and the `RequestContextRegistry` resolver slot.

Anchoring cannot save class identity - two copies are two classes, and `instanceof` between them is
`false`. `@repository`'s first-parameter check used to be exactly that, and rejected a valid
repository at import time. It now reads a `Symbol.for` brand through `isDataSourceClass`, the same
move `isApplicationError` already makes for `ApplicationError`, and `isRedisHelper` for the
`redisConnection` binding the socket.io and websocket components validate. A browser tab and its
Worker are separate realms and still get one registry each, which is correct - they run separate
applications.

The brand goes where the check looks: `static readonly [BRAND] = true` when the check receives a
CLASS (`isDataSourceClass`), an instance field when it receives an INSTANCE (`isRedisHelper`).

## The PGlite pin lives in the root package.json

The root `package.json` carries `"overrides": { "@electric-sql/pglite": "0.5.5" }`, an exact version,
repository-wide. It looks like something to relax or delete. It is not.

Pinning it in one package alone forks `drizzle-orm` into two Bun store entries, because Bun keys a
store entry by resolved peer set and PGlite is one of Drizzle's optional peers. Two entries break
Drizzle type identity across a package boundary. `examples/browser-bff` does not install without the
override.

## RedisClusterHelper deliberately skips buildDefaultOpts

`RedisClusterHelper` (`packages/helpers/src/modules/redis/cluster/cluster.helper.ts`) does not call
`AbstractRedisHelper.buildDefaultOpts`, unlike the single and sentinel helpers. Intentional: ioredis's
`Cluster` ignores `redisOptions.retryStrategy` (it forces its own), and injecting
`maxRetriesPerRequest: null` would silently flip per-node command-failure semantics. Don't "DRY"
this back in - it was tried once and reverted as a real regression.

## Every constructor parameter needs @inject

Mixing a decorated and an undecorated constructor parameter is refused, not tolerated.
`Container.instantiate` (`packages/inversion/src/modules/container/container.ts`) throws when an
inject metadata slot is missing, naming the class and parameter index:

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
handler touches the missing dependency. Method decorators fare worse: Bun falls back to TC39
decorators, which call the decorator with `(value, context)`, so `@provide` records nothing and a
provided key is never bound. Fix: declare `experimentalDecorators` directly in the app's own
`tsconfig.json`, not only via `extends` (kernel and every example do). Add `emitDecoratorMetadata`
only if something reads `design:*` metadata - IGNIS does not: under Bun it turns an interface-typed
constructor parameter (`IAuthService`) into a runtime import that fails to link, which is why
core-server's `tsconfig.core.json` declares `experimentalDecorators` alone.

## Under bun-runs-source, a type used on a decorated member must come from `import type`

`bun src/index.ts` transpiles each file alone. A decorated member whose type is imported by value -
`@provide` returning `IHealthCheckOptions`, a class-decorated constructor taking `IControllerOptions` -
keeps that import alive for `design:*` metadata, and linking then fails with `Export named 'X' not
found` against the CJS dist. `import type { ... }` fixes it. `tsc` output is unaffected (types are
elided), so an application that builds first and runs `bun dist/index.js` never sees it - which is
why `examples/vert` still has two value-imported `IControllerOptions` and only a source-run probe
notices.

## The artifact generator never executes a module

`ignis-artifacts` is an AST walk: no decorator runs, no import fires. A stereotype re-exported
through a local wrapper module is invisible to it - the decorator must be imported from
`@venizia/ignis` or `@venizia/ignis-kernel`. The flip side is safety: a datasource file that opens a
pool at import cannot leak into a build.

## A dynamic `import('./own-module')` in library code makes bun bundle the barrel with undefined exports

`secrets/factory.ts` used `await import('./hashicorp/index.js')`. bun turns the target and everything
it reaches (`BaseHelper`, the logger, `env`) into lazy `__esm` initializers, and the `export *`
barrel never calls the initializer for `env/app-env` - a bundle of
`import { Environment } from '@venizia/ignis-helpers'` printed `undefined` for `Environment`,
`applicationEnvironment` and `LoggerFactory`, and every compiled example crashed at import. Import
our own modules statically; keep optional peers behind `ModuleUtility.load`. Guard:
`packages/helpers/src/__tests__/env/bundle-safe-reads.test.ts` bundles the barrel with the
`bun build` CLI in a subprocess and reads the exports back.

## `bun build` folds `process.env.NODE_ENV` into the BUILD machine's value

Even under `--compile`: the dot form becomes the literal the build host had (`development` when
unset, `test` under `bun test`), and `--minify-syntax` folds the bracket form too. A destructured
read (`const { NODE_ENV } = process.env`) survives - that is `Environment.ambient` (`undefined` when
unset; `Environment.current` defaults to `development`). Framework reads go through it: the error
middleware's leak boundary, the request spy, the logger debug gate. Third-party code still gets the
literal, so compile with `--env=disable`. The positive control in the same test proves the folding.

## Compiled binaries: renamed classes, two module copies, no default logger

- bun renames a decorated class expression that shadows its own variable - tsc emits
  `let X = X_1 = class X` for every decorated class - so `X.name` becomes `X2` (plain build) or
  `X_1` (`--minify-syntax`); `--keep-names` does not help. Keys and scopes built from `Class.name`
  stay consistent with each other; a literal `'services.X'` does not. Build keys with
  `BindingKeys.build({ namespace, key: X.name })`, never from a string. `--minify` (identifiers)
  turns names into `Aw`/`Iw` - use `--minify-whitespace --minify-syntax`.
- The bundle carries helpers twice: the application's ESM import and core's CJS require.
  `LoggerFactory` keeps the provider in `globalThis[Symbol.for('ignis:logger-provider')]` so `use()`
  in one copy is seen by the other. Register a provider at the entrypoint
  (`LoggerFactory.use({ provider: WinstonLogger })`): the winston default is loaded with
  `createRequire('./winston')`, which cannot resolve inside a binary.
- Proof recipe: run the binary with `APP_ENV_POSTGRES_HOST=127.0.0.1 APP_ENV_POSTGRES_PORT=1`. It
  must reach `postConfigure` and fail with `ECONNREFUSED`, never at import.

## A self-refreshing cache must gate its retry on the last attempt, not the last success

If a background TTL refresh checks "how long since the last **successful** load", every call made while the dependency is down finds the check still stale and starts a brand-new load attempt - the system hits the failing dependency hardest exactly when it is weakest. Gate the check on the last **attempt** instead, recorded whether that attempt succeeded or failed: a downed dependency then costs one retry per interval, not one per caller.

A short-lived `DomainHierarchyStore` in `core-server`'s casbin enforcer shipped with this bug first, found in review before release; `refreshIfStale()` gated on `lastAttemptAt`, set at the start of every attempt regardless of outcome, never `lastLoadedAt`, which only advances on success. The store itself was later removed entirely - the process-wide shared tree it cached duplicated the per-principal `g3` policy-line path, which needs no separate TTL or staleness ceiling - but the retry-gating lesson generalizes to any other background-refreshed cache in the framework.

## An unannotated method return widens a TConstValue-derived literal back to string

`TConstValue<T> = Extract<ValueOf<T>, string | number>` reads a class's static readonly literals
through an indexed access type (`T[keyof T]`). That indirection makes the resulting literal union
"fresh" again, so when a method returns it through an object literal with no explicit return type
annotation, TypeScript's return-type inference widens it straight back to `string` - silently,
with no error at the declaration site. A plain hand-written union (`'a' | 'b' | 'c'`) does not have
this problem; only types derived through a generic conditional/indexed-access alias do.

This bit `AuthorizationPolicyBuilder.grant()`/`.customGrant()`: their `effect: TAuthorizationDecision`
parameter came back out as `effect: string` in the inferred return type, which stopped satisfying
`PolicyDefinition`'s `.$type<TAuthorizationDecision>()` column once that column was narrowed. Fixed
by giving both methods an explicit return type. Check any other builder whose return object carries
a `TConstValue`-derived field for the same gap - it only surfaces once something downstream assigns
the result into an equally-narrowed type, so it can sit latent for a long time.

## Related

- [Options objects](/conventions/options-objects.md)
- [Testing conventions](/conventions/testing-conventions.md)
- [Coding style](/conventions/coding-style.md)
- [DI container](/architecture/di-container.md)
