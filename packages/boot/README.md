<div align="center">

<br />

# :fire: IGNIS - `@venizia/ignis-boot`

**Generates one static registration file from your decorated classes.**

[![Docs](https://img.shields.io/badge/Docs-ignis.venizia.ai-2563EB.svg?style=flat-square)](https://ignis.venizia.ai/references/base/bootstrapping)
[![npm](https://img.shields.io/npm/v/@venizia/ignis-boot.svg?style=flat-square&color=cb3837&label=@venizia/ignis-boot)](https://www.npmjs.com/package/@venizia/ignis-boot)
[![License: MIT](https://img.shields.io/badge/License-MIT-3DA639.svg?style=flat-square)](LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[Artifact registration reference](https://ignis.venizia.ai/references/base/bootstrapping) &#8226;
[Registering artifacts guide](https://ignis.venizia.ai/guides/core-concepts/application/bootstrapping) &#8226;
[Changelog](https://ignis.venizia.ai/changelogs/2026-09-03-deprecated-boot-api-removed)

</div>

---

`ignis-artifacts` walks a source root with the TypeScript compiler API, finds every named,
non-abstract class that carries an IGNIS stereotype decorator (`@service`, `@controller`, ...), and
writes one file of plain static imports: `src/generated/artifacts.ts`. The application passes that
file as `configs.artifacts`; `@venizia/ignis`'s `registerArtifacts` boot step binds it.

**This package runs at build time only.** No decorator runs and no class is imported while
scanning - detection reads source text, so a datasource that opens a pool at import stays inert.

## Install

```bash
bun add -d @venizia/ignis-boot
```

`ignis-artifacts` runs at build time; the generated file imports nothing from this package, so a
deployed application installs nothing extra for it at runtime.

## Use it

Decorate the classes you want registered:

```typescript
import { component, service } from '@venizia/ignis';

@service()
export class PricingService extends BaseService {}

@component()
export class MetricsComponent extends BaseComponent {}
```

Add the generator scripts and run one:

```json
{
  "scripts": {
    "generate:artifacts": "ignis-artifacts generate --root src --out src/generated/artifacts.ts",
    "check:artifacts": "ignis-artifacts check --root src --out src/generated/artifacts.ts"
  }
}
```

```bash
bun run generate:artifacts
```

Pass the generated index to your application:

```typescript
import { GeneratedArtifacts } from './generated/artifacts';

export const configs: IApplicationConfigs = {
  path: { base: '/api', isStrict: true },
  artifacts: GeneratedArtifacts,
};
```

Commit the generated file; never edit it by hand - the next `generate` overwrites it. Full
walkthrough: [Registering artifacts](https://ignis.venizia.ai/guides/core-concepts/application/bootstrapping).

## CLI

Shipped as the `ignis-artifacts` binary. Requires `typescript >= 5` (peer dependency) and runs
under bun.

```
ignis-artifacts <generate|check> [--root src] [--out src/generated/artifacts.ts] [--ignore a,b] [--export GeneratedArtifacts]
```

| Flag | Default | Meaning |
| :--- | :--- | :--- |
| `--root` | `src` | Directory to scan, recursively |
| `--out` | `src/generated/artifacts.ts` | Output path; import paths are relative to it |
| `--ignore` | `**/__tests__/**`, `**/*.test.ts`, `**/*.spec.ts`, `**/generated/**` | Comma-separated globs, merged with the default ignore list - never replaces it |
| `--export` | `GeneratedArtifacts` | Name of the exported constant |

| Command | Effect | Exit code |
| :--- | :--- | :--- |
| `generate` | Writes `--out` when its content changed | `0` |
| `check` | Renders in memory and compares with `--out`; fails a stale index | `0` fresh, `1` stale |

Default ignore list: `**/__tests__/**`, `**/*.test.ts`, `**/*.spec.ts`, `**/generated/**`.

## Detection rules

A class is emitted when every rule holds. Every miss is logged with its reason.

- Named export (`export class`), not `export default`, not module-private.
- Not `abstract`.
- Decorated with `component`, `controller`, `service`, `repository` or `datasource`, imported from
  `@venizia/ignis` or `@venizia/ignis-kernel` (import aliases resolved) - or with
  `injectable({ type })` where `type` is a string literal or `ArtifactTypes.<NAME>`.

`model` classes are recognised and never emitted - a model is reached through its repository.

## Programmatic API

`@venizia/ignis-boot/generator` exports the same machinery as functions, for a caller that is not
a shell script.

| Export | What it is |
| :--- | :--- |
| `generateArtifactIndex(opts)` | Renders and writes `opts.out` when the content changed |
| `checkArtifactIndex(opts)` | Renders in memory and compares with `opts.out`, without writing |
| `IGenerateOptions` | `{ root, out, ignore?, exportName? }` - shared options for both |
| `ArtifactScanner.getInstance().scan({ root, ignore? })` | The scan step alone, as `IScannedArtifact[]` |
| `ArtifactIndexEmitter.render({ artifacts, outFile, exportName })` | The render step alone, as text |
| `ArtifactStereotypes`, `ArtifactTypes`, `ArtifactIndexFields` | The decorator-to-type map and the emitted field names |

```typescript
import { checkArtifactIndex } from '@venizia/ignis-boot/generator';

const { isFresh } = checkArtifactIndex({ root: 'src', out: 'src/generated/artifacts.ts' });
```

## `ignis-build-info` - stamp the build

A second binary in the same package. It resolves what a running service should be able to say
about itself - service, version, commit, branch, build time - at BUILD time, and writes it as a
static file the bundle bakes in. Nothing is read back at run time: a `bun build --compile` binary
ships no `node_modules`, no `.git` and no readable `package.json`, and a Distroless image has no
`git` to spawn, so a runtime resolver would report blanks in exactly the deployment that matters.

```
ignis-build-info generate [--out src/_build_info.ts] [--root .] [--format ts|json] [--export BUILD_INFO]
```

| Flag | Default | Meaning |
| :--- | :--- | :--- |
| `--out` | `src/_build_info.ts` | Output path; always rewritten - `builtAt` changes every run |
| `--root` | `.` | Where `package.json` is read and where `git` is asked |
| `--format` | `ts` | `ts` - a static `export const`; `json` - the same record, for a Vite app or a Tauri shell |
| `--export` | `BUILD_INFO` | Name of the exported constant in `ts` format |

Each field is read from the environment first, then `git`, then `package.json`; anything left reads
`unspecified`, so a pipeline that forgot a variable is visible rather than silent.

| Field | Environment, first present wins | Fallback |
| :--- | :--- | :--- |
| `version` | `APP_ENV_BUILD_VERSION`, `APP_BUILD_VERSION`, `CI_COMMIT_TAG`, `GITHUB_REF_NAME` | `package.json#version` |
| `commit` | `APP_ENV_BUILD_COMMIT_TAG`, `APP_BUILD_COMMIT`, `CI_COMMIT_SHA`, `GITHUB_SHA`, `COMMIT_SHA` | `git rev-parse --short=12 HEAD` |
| `branch` | `APP_BUILD_BRANCH`, `CI_COMMIT_REF_NAME`, `GITHUB_REF_NAME`, `BRANCH_NAME` | `git rev-parse --abbrev-ref HEAD` |
| `builtAt` | `APP_ENV_BUILD_DATE`, `APP_BUILD_DATE` | the moment the generator ran |
| `service` | - | `package.json#name` |

Register the stamp once at the entrypoint, and `GET /health/stats` reports it:

```typescript
import { BUILD_INFO } from './_build_info';
import { BuildInfoRegistry } from '@venizia/ignis-helpers/core';

BuildInfoRegistry.set({ buildInfo: BUILD_INFO });
```

`git` runs through Bun Shell, so the binary needs bun (it carries a `bun` shebang). Under plain
Node the `git` fields degrade to `unspecified` and the build still succeeds; set the variables
above if a Node invocation has to be exact.

Programmatic: `@venizia/ignis-boot/build-info` exports `generateBuildInfo(opts)`,
`BuildInfoResolver.getInstance().resolve({ root })`, `BuildInfoEmitter.render({ buildInfo, format, exportName })`,
`BuildInfoFormats` and `BuildInfoEnvironmentKeys`.

## What you must know

- **Output is deterministic.** Imports sorted by path, class names sorted within each field, one
  field per kind, empty arrays kept. A field wider than 100 columns wraps one name per line, so the
  file passes the repo's `prettier -l` unchanged.
- **The scanner never executes a module.** No decorator runs and no import side effect fires while
  scanning, so a stereotype re-exported through a local wrapper module is not recognised - the
  import must name an IGNIS module directly.
- **`check` belongs where lint runs**, not only in CI - a stale index should fail locally before a
  push reaches the pipeline.

Full detail: [Artifact registration reference](https://ignis.venizia.ai/references/base/bootstrapping).

## Links

[Documentation](https://ignis.venizia.ai) &#8226;
[Quickstart](https://ignis.venizia.ai/guides/get-started/5-minute-quickstart) &#8226;
[Core API](https://ignis.venizia.ai/references/) &#8226;
[Best practices](https://ignis.venizia.ai/best-practices/) &#8226;
[Changelog](https://ignis.venizia.ai/changelogs/)

MIT licensed - see [LICENSE.md](LICENSE.md).
Questions: [GitHub Issues](https://github.com/VENIZIA-AI/ignis/issues) &#8226; developer@venizia.ai
