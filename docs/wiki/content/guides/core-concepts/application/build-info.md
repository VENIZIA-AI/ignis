---
title: Stamping a build
description: Generate the stamp in the image build, push it into the registry at the entrypoint, and read it back from GET /health/stats
difficulty: beginner
---

# Stamping a build

A running service cannot say which commit it is. `ignis-build-info` resolves that at **build** time
and writes a static file your bundle bakes in; the entrypoint pushes it into a registry, and
`GET /health/stats` reports it.

```bash
# in the image build, before the bundler runs
bunx ignis-build-info generate --out src/_build_info.ts
```

```typescript
// src/index.ts - first lines of the entrypoint
import { BUILD_INFO } from './_build_info';
import { BuildInfoRegistry } from '@venizia/ignis-helpers/core';

BuildInfoRegistry.set({ buildInfo: BUILD_INFO });
```

This page is the how-to. The [reference](/references/base/bootstrapping#ignis-build-info-cli) has
every flag, the full environment-variable precedence and the programmatic API.

## Before you start

- `@venizia/ignis-boot` as a devDependency - it ships the `ignis-build-info` binary beside
  [`ignis-artifacts`](/guides/core-concepts/application/bootstrapping).
- The generator runs under **bun**. It asks `git` through Bun Shell.

## 1. Generate in the image build, not in the repository

Run it where the image is built, before the bundler. The output is a build artifact, so add it to
`.gitignore` rather than committing it.

```dockerfile
COPY . .
RUN bun install --frozen-lockfile
RUN bunx ignis-build-info generate --out src/_build_info.ts
RUN bun build --compile --minify-syntax --env=disable ./src/index.ts --outfile ./dist/service
```

```
# .gitignore
src/_build_info.ts
```

A local run without the generator simply has no file to import - keep a committed placeholder if
your dev loop needs one, or guard the import.

## 2. Register it once, at the entrypoint

`BuildInfoRegistry.set()` must run before anything reads the stamp, so it belongs at the top of the
entrypoint - above the application import, not inside a component.

```typescript
import { BUILD_INFO } from './_build_info';
import { BuildInfoRegistry } from '@venizia/ignis-helpers/core';

BuildInfoRegistry.set({ buildInfo: BUILD_INFO });

// everything else after
import { Application } from './application';
```

The registry is a `globalThis` slot keyed by `Symbol.for`, so two copies of the package in one
process - an ESM import beside a CommonJS require - still see one stamp.

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

The generator reads environment variables **first**, then `git`, then `package.json`. A build from a
tarball has no `.git`, and that is the case the variables exist for.

| Your pipeline exports | Fills |
|---|---|
| `APP_ENV_BUILD_VERSION` or `APP_BUILD_VERSION` | `version` |
| `APP_ENV_BUILD_COMMIT_TAG` or `APP_BUILD_COMMIT` | `commit` |
| `APP_BUILD_BRANCH` | `branch` |
| `APP_ENV_BUILD_DATE` or `APP_BUILD_DATE` | `builtAt` |

GitLab and GitHub names (`CI_COMMIT_SHA`, `GITHUB_SHA`, and the rest) are read without any wiring -
the [reference table](/references/base/bootstrapping#ignis-build-info-cli) lists the full order.

## A field reading `unspecified` is telling you something

Anything the generator cannot resolve is written as the literal `unspecified`. That is deliberate:
a variable your pipeline forgot shows up as a word you can grep for, never as an absent key.

| You see | It means |
|---|---|
| `commit: "unspecified"` in a CI build | No `.git` and no commit variable exported. Wire one from the table above |
| Every field `unspecified` | The generator never ran; `getAppInfo()` still supplies `service` and `version` |
| `branch: "unspecified"` in a fresh repository | A repository with no commit yet - `git` exits 128 and the generator refuses its output |

## Do not read the stamp back from disk

The whole design is that nothing reads anything at run time - no `readFileSync`, no
`spawn('git')`.

A `bun build --compile` binary ships no `node_modules`, no `.git` and no readable `package.json`, and
a Distroless image has no `git` to spawn. A resolver that looked for any of them would report blanks
in exactly the deployment where the stamp matters most. Generate at build time, push at startup.

## Running the built file under Node

Both binaries carry a `bun` shebang, so bun is the normal path. Run the built `dist/cjs` file under
plain **Node** and `Bun.$` is undefined: the `git`-derived fields read `unspecified` and the build
still succeeds rather than throwing. Export the CI variables above when a Node invocation has to be
exact.

## Frontend and shell builds

`--format json` writes the same record for a Vite app or a Tauri shell to fetch.

```bash
bunx ignis-build-info generate --out public/build-info.json --format json
```

## See also

- [`ignis-build-info` reference](/references/base/bootstrapping#ignis-build-info-cli) - every flag and the full precedence table
- [Registering artifacts](/guides/core-concepts/application/bootstrapping) - the other binary `@venizia/ignis-boot` ships
- [Health check](/extensions/components/health-check) - the route that reports the stamp
- [Changelog 2026-09-11](/changelogs/2026-09-11-build-info-and-health-stats) - why the stamp is pushed, never read back

**Files:**

- [`packages/boot/src/clis/build-info.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/boot/src/clis/build-info.ts) - the binary
- [`packages/boot/src/build-info/resolver.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/boot/src/build-info/resolver.ts) - `BuildInfoResolver`
- [`packages/helpers/src/utilities/build-info.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/build-info.utility.ts) - `BuildInfoRegistry`, `IBuildInfo`
