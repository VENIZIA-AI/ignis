---
title: "@venizia/ignis-boot/bun"
description: "Every export of @venizia/ignis-boot/bun, from the built declarations (generated)."
---

# `@venizia/ignis-boot/bun`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

6 exports, 6 with TSDoc.

## `ArtifactScanCache`

*class*

The scanner's answer for one `src`, kept under the package's `node_modules/.cache` and valid while no `.ts` file under `src`, the package manifest or the lockfile changed - a hit skips TypeScript entirely.

```ts
export declare class ArtifactScanCache {
    static readonly VERSION = 2;
    /**
     * A 128-bit hash of `text` as 32 hex characters (cyrb128: four 32-bit lanes, public domain). It names a cache file and
     * tells a changed tree from an unchanged one; nothing here is a secret, so it needs no cryptographic strength. It is
     * plain arithmetic on purpose: this file runs under Vite, which runs under Node, where `Bun` and `node:crypto`
     * (removed from the sources) are not available, and under Bun alike. The same text gives the same string on both.
     */
    static digest(opts: {
        text: string;
    }): string;
    static location(opts: {
        root: string;
    }): string;
    /** Path, size and mtime of every `.ts`/`.tsx` under `root`, plus the package manifest and the nearest lockfile (a dependency upgrade can change which decorators count). */
    static fingerprint(opts: {
        root: string;
    }): string;
    /** The cached scan, or `undefined` for a missing, stale or unreadable cache - never an error. */
    static read(opts: {
        root: string;
    }): IScannedArtifact[] | undefined;
    /** Stores a scan; `false` when the cache directory cannot be written (a read-only install), which only costs the next start a scan. */
    static write(opts: {
        root: string;
        artifacts: IScannedArtifact[];
    }): boolean;
}
```

Source: `packages/boot/src/bun/scan-cache.ts`

## `ArtifactSources`

*class*

Where a package's artifacts live: the `src` beside its nearest `package.json`, and the classes under one of its directories. One scan per package per process, served from `ArtifactScanCache` when no source file changed - so this module never loads the scanner (and TypeScript) itself.

```ts
export declare class ArtifactSources {
    private static readonly scans;
    private static scanner;
    /** Called by the modules that already hold the scanner (the build plugin). */
    static useScanner(opts: {
        scanner: IArtifactScanner;
    }): void;
    /** Loads the scanner - only on a cache miss. A non-static specifier, so a bundle never pulls TypeScript in. */
    static loadScanner(): Promise<void>;
    /** Whether `packageSource` can be listed without the scanner: scanned in this process, or a valid disk cache. */
    static isCached(opts: {
        packageSource: string;
    }): boolean;
    /** Every decorated class under `packageSource`: this process's scan, else the disk cache, else the scanner (which must be loaded), written back to the cache. */
    static scan(opts: {
        packageSource: string;
    }): IScannedArtifact[];
    /** The entry module (`Bun.main`), or `undefined` when there is no entry file (`bun -e`, a REPL). */
    static entry(): string | undefined;
    /** The `src` beside the nearest `package.json` at or above `from` (default: the working directory). */
    static packageSource(opts?: {
        from?: string;
    }): string;
    /** The decorated classes under a directory named `folder` in the package whose source holds `site`, less those under an `ignore` glob (relative to `src`), each pointing at the copy that runs beside `site` (see `runningArtifacts`). */
    static folderArtifacts(opts: {
        folder: string | undefined;
        site: string;
        ignore?: ReadonlyArray<string>;
    }): IScannedArtifact[];
    /** The scanned classes as the code at `from` runs them: unchanged when `from` is in `src`; otherwise each `src/<path>.ts` becomes `<tree>/<path>.js` in the compiled tree `from` sits in (`dist`, `dist/esm`), so an application registers the very class its code uses, never a second copy loaded from `src`. */
    static runningArtifacts(opts: {
        artifacts: IScannedArtifact[];
        from: string;
    }): IScannedArtifact[];
    /** Forgets every cached scan - for a long-lived process that rebuilds (a watch mode). */
    static clear(): void;
}

interface IArtifactScanner {
    scanWithReport(opts: {
        root: string;
        followReexports: boolean;
    }): {
        artifacts: IScannedArtifact[];
    };
}
```

Source: `packages/boot/src/bun/sources.ts`

## `AutoArtifactGroup`

*class*

The application's own artifacts as the kernel's group protocol (`isArtifactGroup`), built without depending on the kernel: inlined `content` in a binary, `resolve()` from source. Reading a kind throws, so a function that walks `configs.artifacts` cannot drop it as an empty index.

```ts
export declare class AutoArtifactGroup {
    readonly isArtifactGroup: true;
    readonly folder: undefined;
    readonly site: undefined;
    readonly content: TGeneratedArtifactIndex | undefined;
    private readonly resolver;
    constructor(opts: {
        content?: TGeneratedArtifactIndex;
        resolve?: () => Promise<TGeneratedArtifactIndex>;
    });
    resolve(): Promise<TGeneratedArtifactIndex>;
    private static unreadKind;
    get configurations(): never;
    get dataSources(): never;
    get components(): never;
    get repositories(): never;
    get services(): never;
    get controllers(): never;
}
```

Source: `packages/boot/src/bun/auto-group.ts`

## `AutoArtifactsLoader`

*class*

Loads the application's index for `@venizia/ignis-boot/auto` from source: registers the run-time plugin, then imports the virtual module. A binary never runs this - the build replaces the module.

```ts
export declare class AutoArtifactsLoader {
    static assertRuntime(opts: {
        hasBun: boolean;
    }): void;
    static load(): Promise<TGeneratedArtifactIndex>;
    /** The index the emitter would render for `artifacts`: modules imported in path order, each field sorted by class name. */
    static importIndex(opts: {
        artifacts: IScannedArtifact[];
    }): Promise<TGeneratedArtifactIndex>;
}
```

Source: `packages/boot/src/bun/auto-loader.ts`

## `GroupArtifactsResolver`

*class*

Fills an `ArtifactGroup` defined without content, from source: the defining package is the nearest `package.json` above the group's call site, and the group is every decorated class under a directory named `folder` in its `src`.

```ts
export declare class GroupArtifactsResolver {
    /** The kernel's `SingletonRealm` slot for the group resolver (`ArtifactGroup.SINGLETON_REALM_KEY`). */
    static readonly REALM_SLOT: unique symbol;
    static resolve(opts: {
        group: {
            folder: string | undefined;
            site: string | undefined;
            ignore?: ReadonlyArray<string>;
        };
    }): Promise<TGeneratedArtifactIndex>;
    /** Fills the kernel's realm slot; the holder may already exist (the kernel created it empty), so it is mutated, never replaced. */
    static install(): void;
}
```

Source: `packages/boot/src/bun/group-resolver.ts`

## `IgnisArtifactsPlugin`

*class*

Serves `ignis:artifacts` - the application's generated index, rendered in memory from the scanner. At run time it is a virtual module (`build.module`); in `Bun.build` it is resolved and loaded (`onResolve`/`onLoad`), so a binary carries the list and never scans.

```ts
export declare class IgnisArtifactsPlugin {
    static readonly NAME = "ignis-artifacts";
    static readonly VIRTUAL = "ignis:artifacts";
    static readonly EXPORT_NAME = "GeneratedArtifacts";
    /** `@venizia/ignis-boot/auto`, from source or from `dist/esm` - replaced at build time by a static re-export of the virtual module. */
    static readonly AUTO_MODULE: RegExp;
    /** A text test for a file worth parsing: `ArtifactGroup.define(`, with any spacing or line break around the dot. */
    static readonly DEFINE_CALL: RegExp;
    private static readonly RUNTIME_KEY;
    /** The `src` beside the nearest `package.json` at or above `from` (default: the entry module's directory). */
    static defaultRoot(opts?: {
        from?: string;
    }): string;
    /** The entry module's directory (`Bun.main`), so the root never depends on where the process was started; the working directory only when there is no entry file (`bun -e`, a REPL). */
    static entryDirectory(): string;
    /** The index as module source: every import absolute, since a virtual module has no directory to resolve from. With `entry` in a compiled tree, each class is imported from that tree (`ArtifactSources.runningArtifacts`). */
    static render(opts: {
        root: string;
        entry?: string;
    }): string;
    /** Rewrites every `ArtifactGroup.define({ folder: '<literal>' })` and `ArtifactGroup.application()` in a source file to carry its classes as `content`, imported by absolute path - a binary then holds each group's list and never scans. A group with no decorated class, or a call the plugin cannot read (an aliased `ArtifactGroup`, a folder that is not a string literal), fails the build. */
    static rewriteGroups(opts: {
        filePath: string;
        source: string;
    }): string;
    /** A text test for a file worth parsing for decorated classes: an IGNIS stereotype decorator call. */
    static readonly DECORATED: RegExp;
    /** The classes of a source file that carry an IGNIS stereotype decorator (`@service()`, `@repository(...)`, `@injectable(...)`...). */
    static decoratedClasses(opts: {
        filePath: string;
        source: string;
    }): string[];
    /** Opens each named class with `static { Object.defineProperty(this, 'name', ...) }`. Binding keys are built from `Class.name`, and a bundler renames classes - a minifier, or Bun's scope hoisting when a registered class shadows a same-name class it extends (`StockService` becomes `StockService2`). A string literal survives both, and a static block runs before the class's decorators. Only these classes are touched; the rest of the bundle is left alone. */
    static pinClassNames(opts: {
        filePath: string;
        source: string;
        classNames: ReadonlySet<string>;
    }): string;
    /** The classes whose names a build must pin, by the file the build loads: the app's own (from the tree `entry` runs, see `runningArtifacts`) and those of every package that defines a group the app can borrow (from the tree the group file sits in). */
    static pinnedClasses(opts: {
        root: string;
        groupFiles?: ReadonlyArray<string>;
        entry?: string;
    }): Map<string, Set<string>>;
    /** The source files that define groups: the application's own `src` and the `src` of each workspace dependency (a dependency whose real path is outside every `node_modules`), found by walking up the `node_modules` chain as Node resolution does. */
    static groupDefinitionFiles(opts: {
        root: string;
    }): string[];
    /** The source files of the application and of each workspace dependency (a dependency whose real path is outside every `node_modules`), found by walking up the `node_modules` chain as Node resolution does - plus the compiled trees beside each `src`, for a package that runs from `dist`. Tests excluded. */
    static workspaceSourceFiles(opts: {
        root: string;
    }): string[];
    /** For `Bun.build({ plugins: [IgnisArtifactsPlugin.create()] })`; `isRuntime` is set by `registerRuntime`, which serves a virtual module instead. `entry` (default: the build's first entrypoint, or `Bun.main` at run time) decides which tree the classes are imported from. */
    static create(opts?: {
        root?: string;
        entry?: string;
        isRuntime?: boolean;
        lazyIndex?: boolean;
    }): BunPlugin;
    /** Registers the run-time plugin once per process; a second call is a no-op. */
    static registerRuntime(opts?: {
        root?: string;
    }): Promise<void>;
}
```

Source: `packages/boot/src/bun/plugin.ts`
