---
title: "@venizia/dev-configs/compilers"
description: "Every export of @venizia/dev-configs/compilers, from the built declarations (generated)."
---

# `@venizia/dev-configs/compilers`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

1 exports, 1 with TSDoc.

## `BunCompiler`

*class*

Bundles and compiles a single Bun executable: minified, linked sourcemaps, target read from `BUN_TARGET`.

```ts
export declare class BunCompiler {
    /**
     * `plugins` is a parameter, never resolved here - `dev-configs` sits below every other IGNIS
     * package (see the Makefile chain) and must not import a plugin factory such as
     * `PlatformaticKafkaPlugins.build()` from `helpers`, which would invert that chain.
     */
    static compile(opts?: {
        entrypoint?: string;
        /** Bun Worker files the entrypoint starts (`new Worker('./x.worker.ts')`): compiled into the same binary. */
        workers?: string[];
        outfile?: string;
        target?: string;
        plugins?: Bun.BunPlugin[];
        /** Compile-time constants: each key is replaced by its value, a JSON-encoded expression, wherever the bundle reads it. */
        define?: Record<string, string>;
        /** Type-check the bundle first; a type error stops the compile. */
        check?: boolean;
    }): Promise<void>;
}
```

Source: `packages/dev-configs/src/compilers/bun.ts`
