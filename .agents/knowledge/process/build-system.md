---
type: Playbook
title: Build system
description: How to build IGNIS packages with the Makefile, in the right order.
resource: Makefile
tags: [process, build]
---

## Steps

1. On a fresh clone or worktree, build before doing anything else. `dist/` is gitignored in every
   package, and every package's `exports` field points at `dist/` - `packages/core-server` importing
   `@venizia/ignis-helpers` resolves to `packages/helpers/dist/...`. Skip this and you get a wall
   of module-resolution errors that have nothing to do with your change.
2. To rebuild everything: `make build` (alias `make build-all`). This runs
   `core core-worker boot docs surface-check symbols-check wiki-links-check
   wiki-anchors-check` - the `core`
   target pulls in the full dependency chain first, so this also rebuilds `dev-configs`,
   `inversion`, `helpers`, `filter`, and `kernel`.
3. To build one package plus its dependencies: `make <package>`, e.g. `make helpers` runs
   `dev-configs -> inversion -> helpers` in order (each Makefile target declares its dependencies
   as prerequisites). The chain is a DAG, not a line:
   `dev-configs -> inversion -> {filter, helpers} -> kernel -> connectors -> core`, with `boot`
   hanging off `helpers` and `core-worker` off `kernel` beside `connectors`, as leaves that
   `core` does not reach - only applications consume them, which is why `make build-all`
   names both explicitly. `filter` branches off `inversion` alone - it is isomorphic and
   deliberately does not sit after `helpers`. `kernel` needs both `helpers` and `filter`. This
   concept is the canonical copy of the chain - other concepts link here rather than restate it.
4. To build a single package without walking its dependency chain (they're already built):
   `make -C packages/<name> rebuild`, or `make rebuild` inside the package. The root `Makefile` only
   sets `PACKAGES` and includes one file per job: `make/build.mk`, `knowledge.mk`, `release.mk`,
   `lint.mk`, `test.mk` and `help.mk`. The root `Makefile` also includes
   `node_modules/@venizia/vulcan/base/make/vulcan.mk` (with `-include`, so a fresh clone can still
   `bun install`), which supplies `okf-*`, `surface-*`, `symbols-*`, `releases-*`, `agent-setup` and
   `vulcan-doctor` from the pinned `@venizia/vulcan` package. Every per-package target (`<pkg>`, `update-`, `lint-`, `fmt-`,
   `test-`, `purity-`, `clean-install-<pkg>`) is generated from `PACKAGES`, so a new package needs only
   that list and, for `make <pkg>`, its line in the dependency graph in `build.mk`. Every package has a
   `Makefile` that sets a few variables and includes `make/project.mk`, which defines `typecheck`,
   `build`, `clean`, `rebuild`, `lint` and `fmt`. `rebuild` is `typecheck`, then `clean`, then
   `build`. The type-check comes first on purpose - see step 6. The package `package.json` no
   longer has `build`, `clean`, `rebuild` or `typecheck` scripts; only `prepublishOnly` (`make
   rebuild`), `force-update` and, for `boot`, `test`. Examples keep their own scripts.
5. The Makefile variables are `FORMATS` (`cjs esm` by default, `cjs` or `plain`), `CJS_TSCONFIG`
   (default `.configs/tsconfig.build.json`), `CJS_OUT` (default `dist/cjs`; empty means the
   tsconfig's own `outDir`) and `POST_BUILD` (a package-only shell step after the emit).
   `dev-configs` is `plain`; `core-server` is `cjs` with `CJS_OUT := dist`; `filter` sets `CJS_TSCONFIG := tsconfig.json` and an empty
   `CJS_OUT`; `boot` sets `POST_BUILD := chmod +x dist/cjs/clis/*.js`. The rest build `cjs esm`.
   `build` runs `tsc --noEmit -p tsconfig.json` first (type-checks `src` AND `src/__tests__`), then
   the CJS pass: `tsc` on the CJS tsconfig (which excludes `__tests__`, `*.test.ts`, `*.spec.ts`)
   and `tsc-alias -p tsconfig.json` (the ROOT tsconfig, never a `.configs/` one) to rewrite path
   aliases. Every ESM pass runs `tsc -p .configs/tsconfig.esm.json`, then `tsc-alias` with
   `--resolve-full-paths` (so `dist/esm` imports carry `.js` and load under Node's ESM loader) and
   then `bun ../../scripts/esm-marker.ts`, which writes `dist/esm/package.json` with
   `"type": "module"` and the package's `sideEffects` re-rooted - without it Node parses every file
   as CommonJS first (measured on `connectors/http`: 38.0 -> 30.7 ms). Then `POST_BUILD`, then
   `DONE | Build completed successfully!`. Every tool is called by absolute path from the package's
   `node_modules/.bin`, so a recipe never depends on `PATH`. `clean` removes `dist`,
   `*.tsbuildinfo` and `.configs/*.tsbuildinfo`. A package that must skip paths in `lint`/`fmt`
   (generated files, bundles) sets `LINT_IGNORE := src/_build_info.ts dev-dist/**` before the include:
   `--ignore-pattern` for oxlint and ESLint, `"!<glob>"` for oxfmt, all resolved from the package root
   (`ignorePatterns` inside `.configs/` would resolve against `.configs/` and match nothing). No package ships its
   tests in `dist` - they stay sources under `src/__tests__/` that `bun test` runs directly. A
   package that emits them into `dist` makes a bare `bun test` execute every test once per copy -
   `inversion` reported 111 for 37 tests until its `.configs/tsconfig.build.json` excluded them.
6. Make stops a recipe at the first failing command, and every package's tsconfig inherits
   `noEmitOnError: true` from `packages/dev-configs/src/tsconfig/tsconfig.base.json`. A type error
   anywhere aborts the build and the closing `DONE | Build completed successfully!` never prints.
   `rebuild` runs `typecheck` *before* `clean`, and `typecheck` covers `tsconfig.json` plus every
   program `build` emits (the CJS and the ESM tsconfig). So a failure leaves the previous `dist/`
   intact instead of emptying it - that ordering is what closes the empty-`dist/` trap. There is
   no exception: `dev-configs` (`FORMATS := plain`) type-checks `tsconfig.json` first like every
   package. Do not trust a scrollback that got truncated; if a build's success is in doubt, rerun
   `tsc --noEmit -p tsconfig.json` directly in the package and check its exit code.
7. Gotcha: the type-check pass covers `src/__tests__/` too, even though those tests never ship in
   `dist`. A type error in a test file blocks the build of production code that never touches it -
   in both `rebuild` and `build`, for every package.
8. `make purity` bundles every entry in `scripts/purity/manifest.ts` with
   `bun build --target=browser` and fails on node builtins or node globals (`process.`,
   `__dirname`, `__filename`, `createRequire`). Six packages claim a browser-pure surface:
   `inversion`, `filter`, `helpers` (`/core` and `/common` only), `kernel`, `core-worker` and
   `connectors` (engine-client rows waived in the manifest); `make purity-<package>` for the others
   prints a no-op. It reads `dist/`, so run it after a build, never instead of one. Run it on
   Bun >= 1.4.1: `connectors/postgres/supabase [import]` is pure on 1.4.1 and red on 1.4.0, and the
   release workflow installs `bun-version: latest`.
9. Two details keep that gate honest - do not "simplify" them away. It inspects the `--metafile`
   module graph instead of grepping the bundle for a `node:` prefix, because
   `bun build --target=browser` silently stubs unpolyfillable builtins to an empty object, exits 0,
   and leaves no specifier in the output; builtins are matched against `node:module`'s
   `builtinModules`, so a bare `fs` import is caught as well as `node:fs`. And it passes
   `--env=disable`, because Bun otherwise inlines `process.env.NODE_ENV` at compile time and erases
   the exact read the gate exists to catch.
10. `make lint` / `make lint-all` (packages only vs. packages + scripts) do not build
    anything - run them after a build, not instead of one. `make lint-<package>` takes the directory
    name (`lint-kernel`): it `cd`s into the package and runs its own `node_modules/.bin/oxlint`,
    `eslint` and `oxfmt --check`, each with `-c .configs/<tool>.config.mts`. `make fmt` and
    `make fmt-<package>` do the same with fixes. `make lint-wiki` lints `docs/wiki/scripts` and
    format-checks the wiki. Packages carry no lint scripts in `package.json`; examples keep
    `lint` and `lint:fix` because they are templates a consumer copies. make does not drive the
    examples: `bun scripts/examples.ts check` runs the artifact index, lint and typecheck of every
    example, and `bun scripts/examples.ts smoke` the smoke tests that need no external service. Each project lists
    `eslint`, `oxlint`, `oxlint-tsgolint` and `oxfmt` in its own `devDependencies` (`catalog:`);
    the root declares only `oxfmt` and `@venizia/dev-configs`, for `scripts/`. Versions are pinned in
    the root `workspaces.catalog`. Type-aware oxlint on `packages/kernel` (253 files) took about
    0.8s against 8.16s for ESLint; oxfmt 0.06s against 2.16s for Prettier.
    `--report-unused-disable-directives` is not used: oxlint does not run the naming rule, so it
    would flag every naming-convention disable comment as unused.
11. Repository scripts under `scripts/` are TypeScript run by Bun with no build; `scripts/tsconfig.json`
    (bun types, bundler resolution, `noEmit`) is what the editor and `make lint-scripts` check - that
    target runs oxlint, oxfmt and `tsc -p scripts/tsconfig.json` and is part of `make lint-all`.
    `make test-scripts` runs their unit tests (`scripts/__tests__`, positive and negative case per gate).
12. `make clean-install` packs every package and installs each one alone into an empty project
    under `tmpdir()`, with its required peers plus the peers `scripts/clean-install/manifest.ts`
    grants a sub-path. It does not build, and it refuses to start when its result could be wrong:
    - a package's newest `src/` file (outside `__tests__`) is newer than its newest `dist/` file -
      run `make build` first. The stamp is the whole `dist/`, not `index.js`, because the build is
      incremental and re-emits only the files a change reaches;
    - a `node_modules` sits in any ancestor of the gate root, or `NODE_PATH`, `~/.node_modules` or
      `~/.node_libraries` exists - any of them would satisfy a missing peer;
    - a non-private package has no claim - a config-only package such as `dev-configs` carries an
      explicit `configOnly` claim and gets no row;
    - a browser-claimed ESM entry (from `scripts/purity/manifest.ts`) matches no row, which would
      skip its browser build. The CJS entries never match by design.

    After each install it also checks every `@venizia/*` entry in the sandbox `bun.lock` resolves to
    the packed tarball, not the registry. One blind spot remains: a granted peer brings its own
    required peers (granting `@hono/zod-openapi` also installs `hono`), so the gate cannot see a
    leak of such a transitive peer into the entry it was granted to.

## Related

- [Makefile targets](/reference/makefile-targets.md)
- [Gotchas](/conventions/gotchas.md)
- [Testing](/process/testing.md)
- [Debugging](/process/debugging.md)
- [Git workflow](/process/git-workflow.md)
