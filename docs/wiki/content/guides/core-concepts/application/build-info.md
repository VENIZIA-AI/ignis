---
title: Stamping a build
description: Bake the commit, branch and build time into the binary at compile, resolve them from git when you run from source, and read them back from GET /health/stats
difficulty: beginner
---

# Stamping a build

A running service cannot say which commit it is. `BuildInfoStamp` fixes that with no generated file:
the compile bakes the stamp into the binary, and a run from source resolves it from git when the
application starts. `GET /health/stats` reports it.

```typescript
// .configs/builders/compile.ts - the compile bakes the stamp in
import { BunCompiler } from '@venizia/dev-configs/compilers';
import { BuildInfoStamp } from '@venizia/ignis-boot/build-info';

await BunCompiler.compile({
  entrypoint: './src/index.ts',
  outfile: './dist/service',
  define: await BuildInfoStamp.define(),
});
```

```typescript
// src/index.ts - the entrypoint registers it
import { BuildInfoStamp } from '@venizia/ignis-boot/build-info';

await BuildInfoStamp.register();
// start the application as you do today
```

That is all. A clean checkout typechecks, tests and boots with nothing generated, because nothing is
imported from a file that might not exist.

## Before you start

- `@venizia/ignis-boot` and `@venizia/dev-configs` in the application. `@venizia/ignis-boot/build-info`
  imports no TypeScript, so importing it at run time does not pull the scanner into the bundle.
- The resolver runs under **bun** and **Node**. It asks `git` with `execFile`, no shell.

## How it works

| Where it runs | `register()` uses |
|---|---|
| A compiled binary | The stamp `define()` baked in at compile. It never runs `git` |
| `bun run src/index.ts`, `bun --watch`, a test | `BuildInfoResolver`: CI variables, then `git`, then `package.json` |

`define()` returns one record, `{ IGNIS_BUILD_INFO: '<the stamp as JSON>' }`. The compiler replaces
that name in the bundle; `register()` reads it. `BuildInfoStamp.GLOBAL_NAME` holds the name, so you
never type it.

`register()` sets `commit`, `branch` and `builtAt`. It leaves `service` and `version` to your
application's `getAppInfo()`, so each application in a process keeps its own name and version.

The registry is a `globalThis` slot keyed by `Symbol.for`, so two copies of the package in one
process - an ESM import beside a CommonJS require - still see one stamp.

## 1. Bake it at compile

Call `BuildInfoStamp.define()` in the compile script and pass the result as `define`. `BunCompiler`
hands it to `Bun.build`, and a script that calls `Bun.build` itself passes the same record:

```typescript
import { BuildInfoStamp } from '@venizia/ignis-boot/build-info';

await Bun.build({
  entrypoints: ['./src/index.ts'],
  compile: { outfile: './dist/service' },
  define: await BuildInfoStamp.define(),
});
```

`define({ root })` resolves from another directory, for a build that does not run at the package
root. The stamp is read once, when the compile starts, so `builtAt` is the compile time.

## 2. Register it once, at the entrypoint

Call `await BuildInfoStamp.register()` before the application starts. The health check reads the
registry when a request arrives, so the call only has to come first.

## 3. Read it back

`GET /health/stats` reports the stamp with process and memory figures. The route is closed unless
you open it - see [Health check](/extensions/components/health-check).

```json
"build": {
  "service": "@nx/sale", "version": "1.4.2",
  "commit": "8f80b2a90d12", "branch": "develop",
  "builtAt": "2026-09-10T15:00:00.000Z"
}
```

## Wire the CI variables when `git` will not be there

The resolver reads environment variables **first**, then `git`, then `package.json`. A build from a
tarball has no `.git`, and that is the case the variables exist for. Export them in the step that
compiles, because `define()` reads them there.

| Your pipeline exports | Fills |
|---|---|
| `APP_ENV_BUILD_VERSION` or `APP_BUILD_VERSION` | `version` |
| `APP_ENV_BUILD_COMMIT_TAG` or `APP_BUILD_COMMIT` | `commit` |
| `APP_BUILD_BRANCH` | `branch` |
| `APP_ENV_BUILD_DATE` or `APP_BUILD_DATE` | `builtAt` |

GitLab and GitHub names (`CI_COMMIT_SHA`, `GITHUB_SHA`, and the rest) are read without any wiring -
the [reference table](/references/base/bootstrapping#build-stamp) lists the full order.

## A field reading `unspecified` is telling you something

Anything the resolver cannot find is the literal `unspecified`. That is deliberate: a variable your
pipeline forgot shows up as a word you can grep for, never as an absent key.

| You see | It means |
|---|---|
| `commit: "unspecified"` in a CI build | No `.git` and no commit variable at compile. Export one from the table above |
| Every field `unspecified` | `register()` never ran; `getAppInfo()` still supplies `service` and `version` |
| `branch: "unspecified"` in a fresh repository | A repository with no commit yet - `git` exits 128 and the resolver refuses its output |

## Do not read the stamp back from disk in production

A `bun build --compile` binary ships no `node_modules`, no `.git` and no readable `package.json`, and
a Distroless image has no `git` to spawn. That is why the compile bakes the stamp: the binary never
looks for any of them. The git fallback is for a run from source, where `.git` is there.

## Running under Node

The resolver asks `git` with `execFile` from `node:child_process`, so a Node run reads the commit and
branch the same way a Bun run does. When `git` is missing or the folder is not a repository, those
fields read `unspecified` and the start still succeeds. Export the CI variables above when a run has
to be exact. Releases `0.2.0` to `0.4.3` read git through `Bun.$`, so under Node both fields were
always `unspecified`.

## A frontend or a shell build

A Vite app or a Tauri shell cannot import the resolver. Write the record to a file in your build
script and fetch it:

```typescript
import { BuildInfoResolver } from '@venizia/ignis-boot/build-info';

const stamp = await BuildInfoResolver.getInstance().resolve();
await Bun.write('public/build-info.json', JSON.stringify(stamp, null, 2));
```

## Moving off `ignis-build-info`

The `ignis-build-info` binary and the generated `src/_build_info.ts` are gone. See the
[changelog](/changelogs/2026-10-20-build-stamp-at-compile) for the before and after.

## See also

- [Build stamp reference](/references/base/bootstrapping#build-stamp) - the API and the full precedence table
- [Registering artifacts](/guides/core-concepts/application/bootstrapping) - the other tool `@venizia/ignis-boot` ships
- [Health check](/extensions/components/health-check) - the route that reports the stamp
- [Changelog 2026-09-11](/changelogs/2026-09-11-build-info-and-health-stats) - why the stamp is pushed, never read back by the reporter

**Files:**

- [`packages/boot/src/build-info/stamp.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/boot/src/build-info/stamp.ts) - `BuildInfoStamp`
- [`packages/boot/src/build-info/resolver.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/boot/src/build-info/resolver.ts) - `BuildInfoResolver`
- [`packages/dev-configs/src/compilers/bun.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/dev-configs/src/compilers/bun.ts) - `BunCompiler`
- [`packages/helpers/src/utilities/build-info.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/build-info.utility.ts) - `BuildInfoRegistry`, `IBuildInfo`
