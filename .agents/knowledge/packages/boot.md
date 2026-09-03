---
type: Package
title: boot
description: Build-time artifact index generator - scans decorated classes with the TypeScript AST and emits one static registration file per package; ships the ignis-artifacts CLI.
resource: packages/boot
tags: [packages, boot, artifacts, generator]
---

`@venizia/ignis-boot` is a build-time tool, not a runtime dependency. `ignis-artifacts generate`
walks a source root with the TypeScript compiler API, finds every named, non-abstract class that
carries an IGNIS stereotype decorator, and writes `src/generated/artifacts.ts`: plain static imports
plus one exported object in the `IArtifactIndex` shape. The application passes that object as
`configs.artifacts`; the kernel's `registerArtifacts` boot step binds it. The runtime half - how the
index becomes bindings - is [Artifact registration](/architecture/boot-lifecycle.md).

Position in the chain is unchanged: `{boot, kernel} -> core`; `boot` and `kernel` do not depend on
each other. Runtime dependency: `@venizia/ignis-helpers` only (the logger). `typescript >= 5.0.0` is
a peer dependency because the scanner is an AST walk. Dual CJS + ESM build, sub-path export
`./generator`, bin `ignis-artifacts -> dist/cjs/cli.js` with a `bun` shebang (the scanner uses
`Bun.Glob`).

## Layout

- `src/cli.ts` - `parseArgs`; `run()` returns the exit code and `process.exit(run())` is the only exit.
- `src/generator/scanner.ts` - `ArtifactScanner.getInstance().scan({ root, ignore })` -> `IScannedArtifact[]` (a `BaseHelper` singleton; the logger is the instance's).
- `src/generator/emitter.ts` - `ArtifactIndexEmitter.render({ artifacts, outFile, exportName })` -> text.
- `src/generator/index.ts` - `generateArtifactIndex`, `checkArtifactIndex`, `IGenerateOptions`.
- `src/generator/common/` - `ArtifactStereotypes` (`BY_DECORATOR`, `ROOT_DECORATOR`, `SOURCE_MODULES`,
  `DEFAULT_IGNORE`, `EMIT_ORDER`, with `SCHEME_SET`/`isValid`), `IScannedArtifact`, `IScanOptions`.

## Detection rules

A class is emitted when every rule holds; every miss is logged with its reason.

- Named export (`export class`), not `export default`, not module-private.
- Not `abstract`.
- Decorated with `component`, `controller`, `service`, `repository` or `datasource` **imported from
  `@venizia/ignis` or `@venizia/ignis-kernel`** (aliases resolved), or with `injectable({ type })`
  where `type` is a string literal or `ArtifactTypes.<NAME>`.
- Not under an ignored glob: `**/__tests__/**`, `**/*.test.ts`, `**/*.spec.ts`, `**/generated/**`,
  plus `--ignore`.

`model` is recognised and never emitted - a model is reached through its repository.

## Output contract

Deterministic text: header naming the regenerate command, imports sorted by path (relative to the
output file, POSIX separators, no extension), then one field per kind in `EMIT_ORDER`
(`dataSources`, `components`, `repositories`, `services`, `controllers`), names sorted, empty arrays
kept. A field wider than 100 columns wraps one name per line with trailing commas, so the file passes
the repo's `prettier -l` untouched. No IGNIS import in the file - the object is type-checked where
`registerArtifacts` receives it.

## CLI

| Flag | Default | Meaning |
|---|---|---|
| `--root` | `src` | Directory scanned recursively |
| `--out` | `src/generated/artifacts.ts` | Output path; import paths are relative to it |
| `--ignore` | none | Comma-separated globs added to `DEFAULT_IGNORE` |
| `--export` | `GeneratedArtifacts` | Exported constant name |

`generate` writes only when the content changed (exit 0). `check` renders in memory and compares
(exit 0 fresh, 1 stale, with the `generate` command in the message). Anything else prints usage,
exit 2.

## Constraints the code cannot show

- **The generator never executes a module.** No decorator runs, no import side effect fires, so a
  datasource file that opens a pool at import stays inert. Detection is therefore syntactic, and a
  stereotype re-exported through a local wrapper module is not recognised - the import must name an
  IGNIS module.
- **The index is a lint gate, not a build step.** `check` belongs where lint runs; in this repo
  `make artifacts-check` (a prerequisite of `make lint-examples`) runs vert's `check:artifacts`.
- **Inside the monorepo the examples run the CLI from source** (`bun ../../packages/boot/src/cli.ts`)
  so a fresh checkout without a built `dist` still generates; external applications use the bin.
- **Tests** in `src/__tests__/generator/` run against fixtures under
  `src/__tests__/fixtures/artifacts/**`. The fixtures import `@venizia/ignis`, so they are excluded
  from `tsconfig.json` and eslint - the boot build stays independent of core. Tests locate fixtures
  with `resolve(process.cwd(), ...)`; `import.meta` is unavailable in the CJS type-check.
- **Build:** `scripts/build.sh` type-checks `tsconfig.json` (tests included) with `--noEmit`, then
  emits from `tsconfig.build.json`; `dist` carries `cli`, `common` and `generator` only.

## Removed

`Bootstrapper`, `BaseArtifactBooter`, `ControllerBooter`, `ServiceBooter`, `RepositoryBooter`,
`DatasourceBooter`, `BootMixin`, `discoverFiles`, `loadClasses` and the `isClass` re-export left with
the runtime boot system on 2026-09-02. `isClass` still lives in `inversion`.

`src/common/` and its deprecated `IBootOptions`, `IArtifactOptions`, `TBootPhase`, `IBootPhaseReport`,
`IBootReport`, `IBootableApplication` and `BootPhases` left on 2026-09-03, with `BaseApplication.boot()`
and `IApplicationConfigs.bootOptions` in `core-server` and `kernel`. See the
[changelog](/changelogs/2026-09-03-deprecated-boot-api-removed).

## Related

- [Artifact registration](/architecture/boot-lifecycle.md)
- [Application lifecycle](/architecture/application-lifecycle.md)
- [inversion](/packages/inversion.md)
- [core](/packages/core-server.md)
