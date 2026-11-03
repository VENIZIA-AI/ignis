---
title: The Build Stamp Is Baked at Compile and Resolved From Git at Start
description: "BuildInfoStamp bakes the commit, branch and build time into the binary and reads them from git when running from source, so the ignis-build-info CLI and its generated file are gone."
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

- **`BuildInfoStamp` in `@venizia/ignis-boot/build-info`.** `define()` returns the `define` record for a compile. `register()` uses the baked stamp when the compile defined it, else resolves it from git through `BuildInfoResolver`. It sets `commit`, `branch` and `builtAt`; `service` and `version` stay with `getAppInfo()`.
- **`BunCompiler.compile` takes `define`.** A `Record<string, string>` passed to `Bun.build`, so a compile script can bake any constant.
- **`ignis-build-info` is removed.** The bin, `BuildInfoEmitter`, `generateBuildInfo`, `BuildInfoFormats`, `IBuildInfoOptions`, `IBuildInfoResult` and `TBuildInfoFormat` are gone. `BuildInfoResolver` and `BuildInfoEnvironmentKeys` stay.
- **CI variables are unchanged.** The resolver reads the same variables as before (`APP_ENV_BUILD_*`, `APP_BUILD_*`, then provider names). Export them in the step that compiles.

## Who is affected

- **A service that runs `ignis-build-info generate` and imports `_build_info`.** Follow the steps below. The old recipe breaks as soon as you update `@venizia/ignis-boot`.
- **A frontend or shell build that used `--format json`.** Write the record from `BuildInfoResolver` in your build script.
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

See [Stamping a build](/guides/core-concepts/application/build-info) for the full how-to.
