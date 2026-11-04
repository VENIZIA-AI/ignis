---
title: "@venizia/ignis-boot/build-info"
description: "Every export of @venizia/ignis-boot/build-info, from the built declarations (generated)."
---

# `@venizia/ignis-boot/build-info`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

3 exports, 3 with TSDoc.

## `BuildInfoEnvironmentKeys`

*class*

Each field is spelled differently by every CI provider, and `APP_ENV_*` is what this
organisation's pipelines export - so it is read before the generic `APP_BUILD_*` pair and before
anything provider-specific. The first key carrying a non-blank value wins.

```ts
export declare class BuildInfoEnvironmentKeys {
    static readonly VERSION: readonly string[];
    static readonly COMMIT: readonly string[];
    static readonly BRANCH: readonly string[];
    static readonly BUILT_AT: readonly string[];
}
```

Source: `packages/boot/src/build-info/common/constants.ts`

## `BuildInfoResolver`

*class*

Resolves the stamp: environment first (CI knows the release tag), then `git`, then the
manifest. Every miss is logged with its reason and degrades one field to
{@link BuildInfoRegistry.UNSPECIFIED} - a Distroless image has no `git` and an exported tarball
has no manifest, and a build must not die over a stamp.

```ts
export declare class BuildInfoResolver extends BaseHelper {
    private static instance?;
    private constructor();
    static getInstance(): BuildInfoResolver;
    resolve(opts?: {
        root?: string;
    }): Promise<TBuildInfoRecord>;
    private resolveEnvironmentValue;
    /**
     * `execFile` runs `git` without a shell, so no argument is ever parsed by one. A nonzero exit and
     * `git` being absent are both a miss, logged and degraded to one field.
     */
    private resolveGitValue;
    /** `JSON.parse` promises nothing about the shape, so a manifest holding `{ "name": 42 }` must not become a numeric `service`. */
    private resolveManifest;
}
```

Source: `packages/boot/src/build-info/resolver.ts`

## `BuildInfoStamp`

*class*

The build stamp, decided where it is cheap: a compile bakes it into the binary, a run from
source resolves it from git when the application starts.

`define()` is for the compile script, `register()` for the entrypoint. A binary that carries the
stamp never runs git; the resolver is the only code here, and it needs no TypeScript scanner.

```ts
export declare class BuildInfoStamp {
    /** The identifier `define()` replaces in the bundle and `register()` reads. */
    static readonly GLOBAL_NAME = "IGNIS_BUILD_INFO";
    /** The `define` record for a compile: resolves the stamp now and returns it under {@link BuildInfoStamp.GLOBAL_NAME}. */
    static define(opts?: {
        root?: string;
    }): Promise<Record<string, string>>;
    /**
     * Registers the stamp in {@link BuildInfoRegistry}: the baked value when the compile defined it,
     * else the resolver's. Only `commit`, `branch` and `builtAt` are set - `service` and `version`
     * stay with the application's `getAppInfo()`, which the health reporter reads when they are absent.
     */
    static register(): Promise<void>;
}
```

Source: `packages/boot/src/build-info/stamp.ts`
