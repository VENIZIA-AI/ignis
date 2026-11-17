---
title: "@venizia/ignis-boot/vite"
description: "Every export of @venizia/ignis-boot/vite, from the built declarations (generated)."
---

# `@venizia/ignis-boot/vite`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

2 exports, 2 with TSDoc.

## `IgnisArtifactsVitePlugin`

*class*

`IgnisArtifactsPlugin` for Vite: serves `ignis:artifacts`, replaces `@venizia/ignis-boot/auto` with an eager import of it (a browser bundle is tree-shaken only when eager), inlines every `ArtifactGroup.define` / `application` call, and pins the name of every scanned class - binding keys are built from `Class.name`, and a minifier renames classes.

```ts
export declare class IgnisArtifactsVitePlugin {
    static readonly RESOLVED_VIRTUAL: string;
    /** `root`: the `src` to scan (default: the one beside the `package.json` of Vite's root). */
    /** The file a module id names: vite dev adds a query (`?v=<hash>`) to the id of a node_modules file. */
    static filePathOf(opts: {
        id: string;
    }): string;
    static create(opts?: {
        root?: string;
    }): IIgnisVitePlugin;
}
```

Source: `packages/boot/src/vite/plugin.ts`

## `IIgnisVitePlugin`

*interface*

The slice of Vite's plugin contract this plugin uses - typed here so `@venizia/ignis-boot` does not depend on `vite`.

```ts
export interface IIgnisVitePlugin {
    name: string;
    enforce: 'pre';
    config: () => {
        optimizeDeps: {
            exclude: string[];
        };
    };
    configResolved: (config: {
        root: string;
    }) => void;
    resolveId: (id: string) => string | undefined;
    load: (id: string) => string | undefined;
    transform: (code: string, id: string) => string | undefined;
}
```

Source: `packages/boot/src/vite/plugin.ts`
