---
title: "@venizia/ignis-boot/generator"
description: "Every export of @venizia/ignis-boot/generator, from the built declarations (generated)."
---

# `@venizia/ignis-boot/generator`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

16 exports, 16 with TSDoc.

## `ArtifactIndexEmitter`

*class*

Renders the generated index: deterministic text, plain static imports, no IGNIS import - the object is type-checked where `registerArtifacts` receives it.

```ts
export declare class ArtifactIndexEmitter {
    /** Mirrors `printWidth` in the root bunfig.toml `[fmt]` table. */
    static readonly PRINT_WIDTH = 100;
    static readonly DEFAULT_EXPORT_NAME = "GeneratedArtifacts";
    /** The `ignis-artifacts generate` command for these options - the header and the CLI's stale hint print the same one. */
    static renderCommand(opts: {
        root: string;
        out: string;
        ignore?: string[];
        exportName?: string;
        sourceModules?: string[];
    }): string;
    /** The exact command that regenerates the file, so the header never points at another path than the one the build used. */
    static renderHeader(opts: {
        root: string;
        out: string;
        ignore?: string[];
        exportName?: string;
        sourceModules?: string[];
    }): string;
    static render(opts: {
        artifacts: IScannedArtifact[];
        outFile: string;
        exportName: string;
        /** Absolute import paths - for a virtual module, which has no directory to resolve a relative one from. */
        absoluteImports?: boolean;
        /** The CLI arguments as given, for the header; `outFile` above is the resolved path used for import specifiers. */
        command: {
            root: string;
            out: string;
            ignore?: string[];
            sourceModules?: string[];
        };
    }): string;
    /** One line while it fits the print width, else one name per line - so `bun fmt --check` on the generated file stays quiet. */
    private static renderField;
    private static importPath;
}
```

Source: `packages/boot/src/generator/emitter.ts`

## `ArtifactIndexFields`

*class*

Mirrors the kernel's `ArtifactIndexFields` - the keys of the object the emitter writes and `registerArtifacts` reads.

```ts
export declare class ArtifactIndexFields {
    static readonly CONFIGURATIONS = "configurations";
    static readonly DATA_SOURCES = "dataSources";
    static readonly COMPONENTS = "components";
    static readonly REPOSITORIES = "repositories";
    static readonly SERVICES = "services";
    static readonly CONTROLLERS = "controllers";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/boot/src/generator/common/constants.ts`

## `ArtifactIndexGenerator`

*class*

Writes the artifact index, and checks that the committed one is still current.

```ts
export declare class ArtifactIndexGenerator {
    private static render;
    /** Everything below the first line: the header only records the command, so a flag change alone must not read as drift. */
    private static bodyOf;
    /** Writes the index only when its content changed, so an unchanged tree leaves the file's mtime alone. */
    static generate(opts: IGenerateOptions): {
        content: string;
        written: boolean;
    } & IScanReport;
    /** Renders in memory and compares the body with the committed file - the staleness gate for lint and CI. */
    static check(opts: IGenerateOptions): {
        isFresh: boolean;
        expected: string;
        actual: string | undefined;
        ignored: IScannedArtifact[];
    };
}
```

Source: `packages/boot/src/generator/generator.ts`

## `ArtifactScanner`

*class*

Finds exported classes carrying a stereotype decorator by reading the source, never by running it.

```ts
export declare class ArtifactScanner extends BaseHelper {
    private static instance?;
    private constructor();
    static getInstance(): ArtifactScanner;
    scan(opts: IScanOptions): IScannedArtifact[];
    /** `scan` plus the decorated classes a caller's own `ignore` pattern hid - the generator prints them so a stale pattern cannot drop an artifact in silence. */
    scanWithReport(opts: IScanOptions): IScanReport;
    /** A hidden file is only reported on, never a reason to fail: a scan error becomes one warning and the file contributes nothing. */
    private scanHiddenFile;
    private sortArtifacts;
    /** `kept` feeds the index; `hidden` is what only a user pattern excluded (a default pattern wins, so tests and generated files are never reported). */
    private partitionSourceFiles;
    private scanFile;
    /** local identifier -> stereotype name, for named imports from an IGNIS module or a caller-named source module (aliases resolved). */
    private collectStereotypeImports;
    /** The identifiers called as decorators on the file's top-level classes (`@service()`, `@kit.service()` is not followed). */
    private collectClassDecoratorNames;
    private collectExportClauseNames;
    private artifactTypesOf;
    private typeOfInjectableCall;
    private asArtifactType;
}
```

Source: `packages/boot/src/generator/scanner.ts`

## `ArtifactStereotypes`

*class*

How the scanner recognises a decorated class: the source glob, decorator-to-type map, default ignore patterns and the emit order.

```ts
export declare class ArtifactStereotypes {
    /** The source files the scanner reads: TypeScript, with or without JSX. */
    static readonly SOURCE_GLOB = "**/*.{ts,tsx}";
    /** The extension of a source file - stripped for an import specifier, replaced by `.js` for its compiled copy. */
    static readonly SOURCE_EXTENSION: RegExp;
    /** Decorator name as imported from `@venizia/ignis` or `@venizia/ignis-kernel` -> artifact type. */
    static readonly BY_DECORATOR: Readonly<Record<string, TArtifactType>>;
    static readonly ROOT_DECORATOR = "injectable";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
    static readonly SOURCE_MODULES: RegExp;
    static readonly DEFAULT_IGNORE: string[];
    /**
     * The kernel's `registerArtifacts` order; `model` is never emitted. Configurations come first:
     * `registerConfigurations` runs before the datasource and component sweeps, so a `@configuration`
     * can shape what they read. The kernel sorts them among themselves by their `after` declarations
     * at boot, so the order within the field does not matter here.
     */
    static readonly EMIT_ORDER: ReadonlyArray<{
        type: TArtifactType;
        field: TArtifactIndexField;
    }>;
}
```

Source: `packages/boot/src/generator/common/constants.ts`

## `ArtifactTypes`

*class*

Mirrors the kernel's `ArtifactTypes` values; boot must not depend on kernel (`{boot, kernel} -> core` in the build chain).

```ts
export declare class ArtifactTypes {
    static readonly CONFIGURATION = "configuration";
    static readonly COMPONENT = "component";
    static readonly CONTROLLER = "controller";
    static readonly SERVICE = "service";
    static readonly REPOSITORY = "repository";
    static readonly DATASOURCE = "datasource";
    static readonly MODEL = "model";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/boot/src/generator/common/constants.ts`

## `IGenerateOptions`

*interface*

Options for writing or checking the artifact index file.

```ts
export interface IGenerateOptions {
    root: string;
    out: string;
    ignore?: string[];
    /**
     * Name of the exported constant.
     *
     * @default 'GeneratedArtifacts'
     */
    exportName?: string;
    /** Extra module specifiers whose stereotype imports count; see `IScanOptions.sourceModules`. */
    sourceModules?: string[];
}
```

Source: `packages/boot/src/generator/generator.ts`

## `IScannedArtifact`

*interface*

A decorated class the scanner put in the index.

```ts
export interface IScannedArtifact {
    className: string;
    /** Absolute path of the declaring file. */
    filePath: string;
    type: TArtifactType;
}
```

Source: `packages/boot/src/generator/common/types.ts`

## `IScanOptions`

*interface*

Options for one scan of a source tree.

```ts
export interface IScanOptions {
    root: string;
    /**
     * Glob patterns relative to `root`, ignored in addition to `ArtifactStereotypes.DEFAULT_IGNORE`,
     * which always apply.
     *
     * @default []
     */
    ignore?: string[];
    /** Module specifiers, matched exactly, whose stereotype imports also count - a package that re-exports the decorators. Adds to `ArtifactStereotypes.SOURCE_MODULES`. */
    sourceModules?: string[];
    /** Recognise a stereotype imported from any module whose exports lead, through `export *` and renaming re-exports, to a source module - a framework that re-exports the kernel's decorators. */
    followReexports?: boolean;
}
```

Source: `packages/boot/src/generator/common/types.ts`

## `IScanReport`

*interface*

The index content plus what a caller's `ignore` silently left out: decorated classes under a user pattern, never under a default one.

```ts
export interface IScanReport {
    artifacts: IScannedArtifact[];
    ignored: IScannedArtifact[];
    /** Every decorated class left out - abstract, not a named export, or under a user ignore pattern. */
    skipped: IScanSkipped[];
}
```

Source: `packages/boot/src/generator/common/types.ts`

## `IScanSkipped`

*interface*

A decorated class the index leaves out, and why.

```ts
export interface IScanSkipped {
    className: string;
    filePath: string;
    reason: TScanSkipReason;
}
```

Source: `packages/boot/src/generator/common/types.ts`

## `ScanSkipReasons`

*class*

Why a decorated class was left out of the index - reported, never silent.

```ts
export declare class ScanSkipReasons {
    static readonly ABSTRACT = "abstract";
    static readonly NOT_EXPORTED = "not-exported";
    static readonly IGNORED = "ignored";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/boot/src/generator/common/constants.ts`

## `TArtifactIndexField`

*type*

One of the `ArtifactIndexFields` values.

```ts
export type TArtifactIndexField = TConstValue<typeof ArtifactIndexFields>;
```

Source: `packages/boot/src/generator/common/constants.ts`

## `TArtifactType`

*type*

One of the `ArtifactTypes` values.

```ts
export type TArtifactType = TConstValue<typeof ArtifactTypes>;
```

Source: `packages/boot/src/generator/common/constants.ts`

## `TGeneratedArtifactIndex`

*type*

The object a generated index exports - structurally the kernel's `IArtifactIndex` (boot does not depend on the kernel).

```ts
export type TGeneratedArtifactIndex = Partial<Record<TArtifactIndexField, ReadonlyArray<TClass<AnyType>>>>;
```

Source: `packages/boot/src/generator/common/types.ts`

## `TScanSkipReason`

*type*

One of the `ScanSkipReasons` values.

```ts
export type TScanSkipReason = TConstValue<typeof ScanSkipReasons>;
```

Source: `packages/boot/src/generator/common/constants.ts`
