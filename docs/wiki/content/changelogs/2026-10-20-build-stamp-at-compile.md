---
title: The Build Stamp Is Baked at Compile and Resolved From Git at Start
description: "BuildInfoStamp bakes the commit, branch and build time into the binary, a run from source reads them from git, and the ignis-build-info CLI and its generated file are gone."
packages: ['@venizia/dev-configs', '@venizia/ignis-boot']
---

# Changelog - 2026-10-20

## The build stamp is baked at compile and resolved from git at start

<Badge type="tip" text="New Feature" /> <Badge type="warning" text="Breaking Change" />

**In one line.** Pass `define: await BuildInfoStamp.define()` to the compile and call `await BuildInfoStamp.register()` at the entrypoint; no `src/_build_info.ts` is generated, so a clean checkout typechecks, tests and boots.

```typescript
// scripts/compile.ts
import { BunCompiler } from '@venizia/dev-configs/compilers';
import { BuildInfoStamp } from '@venizia/ignis-boot/build-info';

await BunCompiler.compile({ entrypoint: './src/index.ts', define: await BuildInfoStamp.define() });
```

```typescript
// src/index.ts
import { BuildInfoStamp } from '@venizia/ignis-boot/build-info';

await BuildInfoStamp.register();
```

## What changed

- **`BuildInfoStamp` in `@venizia/ignis-boot/build-info`.** `define()` returns the `define` record for a compile. `register()` uses the baked stamp when the compile defined it, else resolves it from git through `BuildInfoResolver`, then calls `BuildInfoRegistry.set`. It sets `commit`, `branch` and `builtAt`; `service` and `version` stay with `getAppInfo()`.
- **`BunCompiler.compile` takes `define`.** It is a `Record<string, string>` passed to `Bun.build`, so a compile script can bake any constant.
- **`ignis-build-info` is removed.** The bin, `BuildInfoEmitter`, `generateBuildInfo`, `BuildInfoFormats`, `IBuildInfoOptions`, `IBuildInfoResult` and `TBuildInfoFormat` are gone. `BuildInfoResolver` and `BuildInfoEnvironmentKeys` stay.

## Who is affected

- **A service that runs `ignis-build-info generate` and imports `_build_info`.** Follow the steps below. The old recipe breaks as soon as you update `@venizia/ignis-boot`, because the bin no longer exists.
- **A frontend or shell build that used `--format json`.** Write the record from `BuildInfoResolver` in your build script. The guide shows it.
- **A service that never stamped its build.** No action needed.

## Breaking changes

> [!WARNING]
> The `ignis-build-info` binary and its file emitter are removed with no deprecation step. A build script or Dockerfile that calls `ignis-build-info generate` fails.

**Before:**

```bash
bunx ignis-build-info generate --out src/_build_info.ts
```

```typescript
// src/index.ts
import { BUILD_INFO } from './_build_info';
import { BuildInfoRegistry } from '@venizia/ignis-helpers/core';

BuildInfoRegistry.set({ buildInfo: BUILD_INFO });
```

**After:**

1. Delete the `ignis-build-info generate` line from the build, and `src/_build_info.ts` from `.gitignore`.
2. Pass `define: await BuildInfoStamp.define()` to `BunCompiler.compile` (or `Bun.build`).
3. Replace the `BuildInfoRegistry.set` lines in the entrypoint:

```typescript
import { BuildInfoStamp } from '@venizia/ignis-boot/build-info';

await BuildInfoStamp.register();
```

## Details

- **Why the file went.** The generated, gitignored file left a clean checkout unable to typecheck, test or boot until something generated it. The compile now carries the stamp, and a run from source asks git, so there is nothing to generate and nothing to forget.
- **The name is shared.** `define()` returns `{ IGNIS_BUILD_INFO: '<JSON>' }` and `register()` reads that name. `BuildInfoStamp.GLOBAL_NAME` holds it. A test bundles a real entrypoint and runs it to prove they agree.
- **No scanner in your binary.** `@venizia/ignis-boot/build-info` imports no TypeScript.
- **CI variables.** The resolver reads the same variables as before (`APP_ENV_BUILD_*`, `APP_BUILD_*`, then provider names). Export them in the step that compiles.

See [Stamping a build](/guides/core-concepts/application/build-info) for the full how-to.

| File | Package |
|------|---------|
| `src/build-info/stamp.ts` | boot |
| `src/compilers/bun.ts` | dev-configs |
