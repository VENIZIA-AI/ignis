---
type: Package
title: boot
description: Build-time artifact index generator - scans decorated classes with the TypeScript AST and emits one static registration file per package; ships the ignis-artifacts CLI.
resource: packages/boot
tags: [packages, boot, artifacts, generator]
---

<!-- okf:generated:contents start -->
**Contents**

- [Layout](#layout)
- [Detection rules](#detection-rules)
- [Output contract](#output-contract)
- [Generated header names the command](#generated-header-names-the-command)
- [CLI](#cli)
- [Auto artifacts and groups (`src/bun/`)](#auto-artifacts-and-groups-srcbun)
- [Constraints the code cannot show](#constraints-the-code-cannot-show)
- [Removed](#removed)
- [Related](#related)
<!-- okf:generated:contents end -->

`@venizia/ignis-boot` is a build-time tool, not a runtime dependency. `ignis-artifacts generate`
walks a source root with the TypeScript compiler API, finds every named, non-abstract class that
carries an IGNIS stereotype decorator, and writes `src/generated/artifacts.ts`: plain static imports
plus one exported object in the `IArtifactIndex` shape. The application passes that object as
`configs.artifacts`; the kernel's `registerArtifacts` boot step binds it. The runtime half - how the
index becomes bindings - is [Artifact registration](/architecture/boot-lifecycle.md).

Position in the chain: `helpers -> boot`, a leaf beside `kernel`. Nothing in the framework depends
on it - `@venizia/ignis` dropped its `ignis-boot` dependency once the runtime boot API was gone -
so an application that runs `ignis-artifacts` declares `@venizia/ignis-boot` as its own
devDependency. Runtime dependency: `@venizia/ignis-helpers` only (the logger). `typescript` 5 or 6 (peer `^5.0.0 || ^6.0.0`; TypeScript 7 drops the JS API the scanner calls) is
a peer dependency because the scanner is an AST walk. Dual CJS + ESM build, sub-path exports
`./generator` and `./build-info`, and two bins with a `bun` shebang (the scanner uses `Bun.Glob`,
the build-info generator uses `Bun.$`): `ignis-artifacts -> dist/cjs/clis/artifacts.js` and
`ignis-build-info -> dist/cjs/clis/build-info.js`.

## Layout

- `src/clis/` - every CLI entrypoint lives here, one file per bin, each `parseArgs` + a `run()` that
  returns the exit code so the process exits in exactly one place: `artifacts.ts` (`ignis-artifacts`)
  and `build-info.ts` (`ignis-build-info`, whose `run()` is async because Bun Shell has no `.sync()`).
- `src/build-info/` - mirrors `generator/`: `resolver.ts` (`BuildInfoResolver.getInstance().resolve({ root })`,
  a `BaseHelper` singleton that logs every miss), `emitter.ts` (`BuildInfoEmitter.render`, `ts`/`json`),
  `index.ts` (`generateBuildInfo` + barrel), `common/` (`BuildInfoFormats`, `BuildInfoEnvironmentKeys`).
  Reads env first (`APP_ENV_*` > `APP_BUILD_*` > provider), then `git` through `Bun.$` with
  `.cwd(root)`, then `package.json`; never throws. The record type and the `unspecified` sentinel come
  from `@venizia/ignis-helpers/core` (`TBuildInfoRecord`, `BuildInfoRegistry.UNSPECIFIED`).
- `src/generator/scanner.ts` - `ArtifactScanner.getInstance().scan({ root, ignore })` -> `IScannedArtifact[]` (a `BaseHelper` singleton; the logger is the instance's).
- `src/generator/emitter.ts` - `ArtifactIndexEmitter.render({ artifacts, outFile, exportName })` -> text.
- `src/generator/index.ts` - `generateArtifactIndex`, `checkArtifactIndex`, `IGenerateOptions`.
- `src/generator/common/` - `ArtifactStereotypes` (`BY_DECORATOR`, `ROOT_DECORATOR`, `SOURCE_MODULES`,
  `DEFAULT_IGNORE`, `EMIT_ORDER`, with `SCHEME_SET`/`isValid`), `IScannedArtifact`, `IScanOptions`.

## Detection rules

A class is emitted when every rule holds; every miss is logged with its reason.

- Named export (`export class`), not `export default`, not module-private.
- Not `abstract`.
- Decorated with `configuration`, `component`, `controller`, `service`, `repository` or `datasource` **imported from
  `@venizia/ignis`, `@venizia/ignis-kernel` or a `--source-module`** (aliases resolved; a source module is
  matched as an exact specifier, for a package that re-exports the decorators), or with `injectable({ type })`
  where `type` is a string literal or `ArtifactTypes.<NAME>`.
- Not under an ignored glob: `**/__tests__/**`, `**/*.test.ts`, `**/*.spec.ts`, `**/generated/**`,
  plus `--ignore`. A decorated class under a USER pattern is still scanned and reported in
  `scanWithReport().ignored`; the CLI prints one `warning:` line per class on stderr (default patterns
  stay silent) so a stale `--ignore` cannot drop an artifact without a trace.

`model` is recognised and never emitted - a model is reached through its repository.

## Output contract

Deterministic text: header naming the regenerate command, imports sorted by path (relative to the
output file, POSIX separators, no extension), then one field per kind in `EMIT_ORDER`
(`configurations`, `dataSources`, `components`, `repositories`, `services`, `controllers`), names sorted, empty arrays
kept. A field wider than 100 columns wraps one name per line with trailing commas, so the file passes
the repo's `oxfmt --check` untouched. No IGNIS import in the file - the object is type-checked where
`registerArtifacts` receives it.

## Generated header names the command

The first line of a generated index is `ArtifactIndexEmitter.renderHeader(...)`, which wraps
`renderCommand({ root, out, ignore, exportName, sourceModules })`: the flags the CLI actually received,
`--ignore` only when non-empty, `--export` only when the name is not `GeneratedArtifacts`, one
`--source-module` per entry. `check`'s stale message prints the same `renderCommand`. `ignis-artifacts check` compares only the body below that line (`checkArtifactIndex`), so a flag
change alone never reads as drift; `generate` still rewrites the file when the header differs.

## CLI

| Flag | Default | Meaning |
|---|---|---|
| `--root` | `src` | Directory scanned recursively |
| `--out` | `src/generated/artifacts.ts` | Output path; import paths are relative to it |
| `--ignore` | `DEFAULT_IGNORE` (4 globs) | Comma-separated globs, merged with `DEFAULT_IGNORE` - never replaces it |
| `--export` | `GeneratedArtifacts` | Exported constant name |
| `--source-module` | none | Repeatable. Adds a module whose stereotype imports count (`sourceModules`), on top of `SOURCE_MODULES`. `check` needs the same set as `generate` |

`generate` writes only when the content changed (exit 0). `check` renders in memory and compares
(exit 0 fresh, 1 stale, with the `generate` command in the message). Anything else prints usage,
exit 2.

## Auto artifacts and groups (`src/bun/`)

- `IgnisArtifactsPlugin` (`/bun`) serves the virtual module `ignis:artifacts`: `render({ root })` = scan with `followReexports` + the emitter with `absoluteImports` (a virtual module has no directory). Run time: `registerRuntime()` -> `Bun.plugin` + `build.module` (runtime-only API; `Bun.build` throws on it). Build: `create()` -> `onResolve`/`onLoad`, plus two rewrites: `@venizia/ignis-boot/auto` becomes a static re-export of the built index, and every `ArtifactGroup.define({ folder })` in the app's workspace dependencies (pre-scanned files, exact-path filter) gets `content` inlined. A folder with no class fails the build.
- The auto root is the package of the entry module (`IgnisArtifactsPlugin.entryDirectory()` = `dirname(Bun.main)`, cwd only for `bun -e`): an IDE runner, `bun test` from the repo root or a binary started elsewhere no longer scan the wrong `src`. A missing `src` is a clear error. One auto module serves ONE application per process; a multi-app process uses `ArtifactGroup.application()` per app (folder undefined = the whole package `src`), which the build rewrite inlines like `define`. `application({ ignore })` takes globs relative to `src` (the generator's `--ignore` patterns), carried on the group (`IArtifactGroup.ignore`, kept by `pick`) and applied in `ArtifactSources.folderArtifacts`; the build rewrite reads them from the call and refuses anything but an array of string literals. Import the auto module in the application, not a shared library: any `Bun.build` that includes it needs the plugin (by design - a missing plugin fails the build rather than shipping no classes).
- The browser path is `auto-group.ts` alone (the plugin's replacement of the auto module imports only it), so it takes `getError` from `@venizia/ignis-inversion`, never the helpers barrel (which loads `node:net`); a browser-target `Bun.build` test pins it.
- `@venizia/ignis-boot/auto` default-exports `AutoArtifactGroup` (the kernel's group protocol, built structurally - boot does not depend on the kernel) and installs `GroupArtifactsResolver` into the kernel realm slot `artifact-group-resolver`. Its loader imports `ignis:artifacts` with a STATIC specifier on purpose: a build without the plugin must fail to resolve it (`src/bun/virtual.d.ts` types it). The plugin itself is imported through a non-static specifier so a bundle never pulls the scanner and TypeScript.
- `GroupArtifactsResolver` (source runs): defining package = nearest `package.json` above the group's `site` (the call site the kernel records); classes loaded by dynamic import of their real paths - the same module instance the package import resolves to.
- **Source files** are `ArtifactStereotypes.SOURCE_GLOB` (`**/*.{ts,tsx}`) everywhere - scanner, scan cache, plugin group files - and `SOURCE_EXTENSION` (`/\.tsx?$/`) is stripped for an import specifier or replaced by `.js` for the compiled copy. A `.ts`-only glob silently dropped a JSX controller.
- **Scan cache** (`ArtifactScanCache`, `bun/scan-cache.ts`, format `VERSION` 2): the scan for one `src` is stored at `<package>/node_modules/.cache/ignis-artifacts/<sha1(root)>.json` with a fingerprint of every `.ts`/`.tsx` under `src` (path, size, mtime) plus the package manifest and the nearest lockfile. `ArtifactSources` imports no scanner value: on a hit (memory, then disk) nothing loads TypeScript; on a miss `loadScanner()` imports `../generator` through a non-static specifier (the plugin registers its scanner in a static block). The auto loader's hit path imports the listed classes directly (`importIndex`, same order as the emitter) without the plugin. Measured on a real service: a warm start no longer loads TypeScript and saves ~140 ms (723 to 585 ms); the rest of `resolve` is loading the app's own modules, which the old generated index paid at import time. A corrupt cache is a miss; an unwritable cache returns `false`.
- **The build-time auto module is lazy for servers, eager for browsers** (`create({ lazyIndex })`, default `target !== 'browser'`). Lazy = `new AutoArtifactGroup({ resolve: () => import('ignis:artifacts') ... })`: a static import evaluated every app class when a library imported the module, inside the library's half-evaluated graph (a consumer binary crashed with "The superclass is not a constructor"). Eager in a browser bundle because Bun does not tree-shake a lazily evaluated graph: a measured frontend probe went 50 KB -> 100 KB minified (41 -> 76 classes, a framework barrel kept whole). So in a browser build, import the auto module from the application module, not from a shared library. A build without the plugin fails on the specifier either way.
- **Scan src, load the running tree** (`ArtifactSources.runningArtifacts`): when the entry (auto) or the call site (a group) is outside `src`, each `src/<p>.ts` maps to `<tree>/<p>.js`, the tree being the shortest prefix of the site's directory that holds the first class's compiled copy (`dist`, `dist/esm`). Bun does NOT apply external source maps to stack frames, so a site in a tsc dist reads as the dist path (measured). Loading `src` from a dist-running app gave a second copy of every class (a consumer measured 1 identical / 154 different) - silent, because DI keys are strings. No compiled copy -> stale-build error. The build rewrite accepts `ns.ArtifactGroup.define(` (tsc CommonJS) and emits `require("<abs>").Class` in a compiled file; `groupDefinitionFiles` also globs `**/*.js` in each workspace package's non-src top-level directories. `create()` takes the entry from the build's first entrypoint (run time: `Bun.main`).
- Build-time group rewrite rules: only `ArtifactGroup.define({ folder: '<literal>' })` (or `<namespace>.ArtifactGroup.define` in compiled CommonJS) with the class imported under its own name; an aliased `ArtifactGroup`, a non-literal folder or a non-object argument FAILS the build (never a silent skip that would fail at binary start); `content` is inserted after the last property (trailing commas are fine), a define that already has `content` is left alone. Group files are found in the app's own `src` and in each workspace dependency, walking the `node_modules` chain upward (hoisted installs) and keeping only realpaths outside `node_modules`. A group whose `site` lies outside its package `src` (a `dist` copy) is refused: it would load a second identity of the classes. `ArtifactSources` scans each package once per process (`clear()` for watch modes).
- `followReexports` follows only identifiers a class wears as a decorator, memoized per scan (resolutions, parsed files, answers); without that it hung for minutes on a large monorepo. `SOURCE_MODULES` accepts the kernel's sub-paths (`@venizia/ignis-kernel/metadata` is where a frontend framework re-exports from).

## Constraints the code cannot show

- **The generator never executes a module.** No decorator runs, no import side effect fires, so a
  datasource file that opens a pool at import stays inert. Detection is therefore syntactic, and a
  stereotype re-exported through a local wrapper module is not recognised - the import must name an
  IGNIS module.
- **The index is a lint gate, not a build step.** `check` belongs where lint runs; in this repo
  `bun scripts/examples.ts artifacts` (the first step of its `lint` and `check`) runs vert's
  `check:artifacts`.
- **Inside the monorepo the examples run the CLI from source** (`bun ../../packages/boot/src/clis/artifacts.ts`)
  so a fresh checkout without a built `dist` still generates; external applications use the bin.
- **Tests** in `src/__tests__/generator/` run against fixtures under
  `src/__tests__/fixtures/artifacts/**`. The fixtures import `@venizia/ignis`, so they are excluded
  from `tsconfig.json` and the linters - the boot build stays independent of core. Tests locate fixtures
  with `resolve(process.cwd(), ...)`; `import.meta` is unavailable in the CJS type-check.
- **Build:** `make build` (`packages/boot/Makefile`) type-checks `tsconfig.json` (tests included) with `bun check`, then
  emits from `.configs/tsconfig.build.json`, then `chmod +x` on `dist/cjs/clis/*.js`; `dist` carries `build-info`, `clis`, `common` and `generator`.

## Removed

`Bootstrapper`, `BaseArtifactBooter`, `ControllerBooter`, `ServiceBooter`, `RepositoryBooter`,
`DatasourceBooter`, `BootMixin`, `discoverFiles`, `loadClasses` and the `isClass` re-export left with
the runtime boot system on 2026-09-02. `isClass` still lives in `inversion`.

`src/common/` and its deprecated `IBootOptions`, `IArtifactOptions`, `TBootPhase`, `IBootPhaseReport`,
`IBootReport`, `IBootableApplication` and `BootPhases` left on 2026-09-03, with `BaseApplication.boot()`
and `IApplicationConfigs.bootOptions` in `core-server` and `kernel`. See the
[changelog](https://ignis.venizia.ai/changelogs/2026-09-03-deprecated-boot-api-removed.html).

## Related

- [Artifact registration](/architecture/boot-lifecycle.md)
- [Application lifecycle](/architecture/application-lifecycle.md)
- [inversion](/packages/inversion.md)
- [core](/packages/core-server.md)
